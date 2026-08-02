"""
backend/app/email_ingest.py
─────────────────────────────────────────────────────────────────────────────
Email Ingestion Pipeline — item #6. Bridge for automatic transaction capture
without a bank API (Plaid/GoCardless/TrueLayer were evaluated and blocked —
see Tracker.md "Banking API Sync"). One dedicated Gmail inbox
(financeos.ingest@gmail.com) receives forwarded bank transaction emails from
every user, addressed to their own +alias
(financeos.ingest+<ingest_token>@gmail.com — see Preferences.ingest_token /
routers/preferences.py). This module resolves each message to a user and
turns it into a real transaction.

Deliberately split into two pieces, same separation the design doc called
for:

  1. parse_bank_email(sender, subject, body) -> dict | None
     Pure function, no network calls, no DB. Unit-testable against a saved
     fixture email captured once per bank. **STUB — see below.**

  2. poll_inbox(db) / the /email/poll HTTP endpoint
     Talks to the Gmail API, resolves each message's +alias to a user_id,
     hands the body to the parser, creates the transaction. Safe to build
     and test independently of #1 since it only depends on the parser's
     *contract*, not its internals.

STATUS (2026-08-02): piece #2 (poller) is real and wired up. Piece #1
(parser) is a deliberate NotImplementedError stub — building fake Bancolombia
parsing logic without a real sample email risks silently creating wrong
transactions once real mail arrives, which is worse than not building it yet.
Fill in parse_bank_email() from a real fixture before turning the GitHub
Actions poller cron on for real.

RUNNING LOCALLY FOR TESTING
  python -m app.email_ingest
─────────────────────────────────────────────────────────────────────────────
"""

import base64
import logging
import os
import re
import uuid
from datetime import date as date_type
from typing import Optional

from fastapi import APIRouter, Header, HTTPException
from sqlalchemy.orm import Session

from .database import SessionLocal
from .models import Preferences, Transaction
from .services.payment_utils import infer_payment_method

log = logging.getLogger(__name__)


# ─────────────────────────────────────────────────────────────────────────────
# Piece #1 — pure parser (STUB — blocked on a real fixture email)
# ─────────────────────────────────────────────────────────────────────────────

def parse_bank_email(sender: str, subject: str, body: str) -> Optional[dict]:
    """
    Parse a single bank transaction-notification email into transaction
    fields. Pure function — no network calls, no DB access — so it can be
    unit-tested against saved fixture emails (capture one real example per
    bank once, reuse forever; no need to trigger real transactions to test).

    Returns None if the email doesn't look like a transaction notification
    at all (e.g. a marketing email that slipped through the forward rule) —
    the poller treats None as "skip, not an error."

    Expected return shape once implemented:
        {
            "date":            date,                    # transaction date
            "amount":          float,                    # always positive
            "description":     str,                       # merchant / narration
            "type":            "income" | "expense",
            "category":        str | None,                 # best-effort guess, None if unsure
            "payment_method":  str | None,                  # None -> poller infers it
        }

    Args:
        sender:  the email's From header (used to confirm it's really from
                 the bank, not just a message that landed in the inbox)
        subject: the email's Subject header
        body:    the email's plain-text body

    STATUS: not yet implemented. Needs a real, redacted Bancolombia
    transaction-notification email to build the actual regex/parsing logic
    against — see Tracker.md "Email Ingestion Pipeline" for where this is
    tracked. Raises deliberately instead of guessing a format, since a wrong
    guess would silently create incorrect real transactions.
    """
    raise NotImplementedError(
        "parse_bank_email() is a stub — needs a real Bancolombia fixture "
        "email before it can be written for real. See Tracker.md item #6."
    )


# ─────────────────────────────────────────────────────────────────────────────
# Piece #2 — Gmail poller
# ─────────────────────────────────────────────────────────────────────────────

PROCESSED_LABEL = "FinanceOS/Processed"

# Matches the local-part of an address like
# "financeos.ingest+8f3a1c2b9e4d5f60712a@gmail.com" -> "8f3a1c2b9e4d5f60712a"
_ALIAS_TOKEN_RE = re.compile(r'\+([^@]+)@')


def _gmail_service():
    """
    Builds an authenticated Gmail API client from the refresh token minted
    during the one-time OAuth setup (see Tracker.md "Email Ingestion
    Pipeline" for the setup checklist). Imports are local so the rest of the
    module (and its tests) don't require the Gmail packages to be installed.
    """
    from google.oauth2.credentials import Credentials
    from googleapiclient.discovery import build

    client_id     = os.getenv("GMAIL_CLIENT_ID", "")
    client_secret = os.getenv("GMAIL_CLIENT_SECRET", "")
    refresh_token = os.getenv("GMAIL_REFRESH_TOKEN", "")

    if not (client_id and client_secret and refresh_token):
        raise RuntimeError(
            "GMAIL_CLIENT_ID / GMAIL_CLIENT_SECRET / GMAIL_REFRESH_TOKEN "
            "must all be set — see Tracker.md 'Email Ingestion Pipeline' "
            "setup checklist."
        )

    creds = Credentials(
        token=None,
        refresh_token=refresh_token,
        client_id=client_id,
        client_secret=client_secret,
        token_uri="https://oauth2.googleapis.com/token",
        scopes=["https://www.googleapis.com/auth/gmail.readonly"],
    )
    return build("gmail", "v1", credentials=creds, cache_discovery=False)


def _get_or_create_label(service, name: str) -> str:
    """Returns the label ID for `name`, creating it on the inbox if missing."""
    labels = service.users().labels().list(userId="me").execute().get("labels", [])
    for label in labels:
        if label["name"] == name:
            return label["id"]

    created = service.users().labels().create(
        userId="me",
        body={
            "name": name,
            "labelListVisibility": "labelHide",
            "messageListVisibility": "hide",
        },
    ).execute()
    return created["id"]


def _header(headers: list, name: str) -> str:
    for h in headers:
        if h["name"].lower() == name.lower():
            return h["value"]
    return ""


def _decode_body(payload: dict) -> str:
    """
    Gmail messages are a MIME tree. Walks it looking for the first
    text/plain part (falls back to text/html stripped of tags if that's all
    there is — some banks only send HTML notifications).
    """
    def _b64(data: str) -> str:
        return base64.urlsafe_b64decode(data.encode("utf-8") + b"===").decode("utf-8", errors="replace")

    def _walk(part: dict) -> Optional[str]:
        mime = part.get("mimeType", "")
        body_data = part.get("body", {}).get("data")
        if mime == "text/plain" and body_data:
            return _b64(body_data)
        for sub in part.get("parts", []) or []:
            found = _walk(sub)
            if found:
                return found
        return None

    text = _walk(payload)
    if text:
        return text

    # Fallback: strip tags out of text/html if no plain-text part exists.
    def _walk_html(part: dict) -> Optional[str]:
        mime = part.get("mimeType", "")
        body_data = part.get("body", {}).get("data")
        if mime == "text/html" and body_data:
            return re.sub(r"<[^>]+>", " ", _b64(body_data))
        for sub in part.get("parts", []) or []:
            found = _walk_html(sub)
            if found:
                return found
        return None

    return _walk_html(payload) or ""


def _resolve_user_id(to_address: str, db: Session) -> Optional[str]:
    """Extracts the +alias token from the To header and looks up the owning user."""
    match = _ALIAS_TOKEN_RE.search(to_address or "")
    if not match:
        return None
    token = match.group(1)
    prefs = db.query(Preferences).filter(Preferences.ingest_token == token).first()
    return str(prefs.user_id) if prefs else None


def poll_inbox() -> dict:
    """
    Main entry point. Lists every message in the shared ingestion inbox not
    yet tagged PROCESSED_LABEL, resolves each to a user via its +alias,
    parses it, and creates a transaction. Always labels a message processed
    after handling it — including unresolvable/unparseable ones — so nothing
    is retried forever; only a mid-flight exception (DB down, etc.) leaves a
    message unlabeled for a safe retry next run.

    Field semantics (see Tracker.md "Known Gotchas"): email-imported
    transactions are real and complete the moment they're created —
    is_draft=False (the money already left the account; the email is the
    bank's own confirmation) — with reviewed=False so the existing
    import_reminder alert (already built for csv_import) picks them up
    without any new alert logic.
    """
    summary = {"processed": 0, "created": 0, "skipped": 0, "unresolved": 0, "errors": []}

    service = _gmail_service()
    label_id = _get_or_create_label(service, PROCESSED_LABEL)

    resp = service.users().messages().list(
        userId="me", q=f'-label:"{PROCESSED_LABEL}"',
    ).execute()
    message_refs = resp.get("messages", [])

    if not message_refs:
        return summary

    db = SessionLocal()
    try:
        for ref in message_refs:
            msg_id = ref["id"]
            try:
                full = service.users().messages().get(
                    userId="me", id=msg_id, format="full",
                ).execute()
                headers = full["payload"]["headers"]
                sender  = _header(headers, "From")
                to_addr = _header(headers, "To")
                subject = _header(headers, "Subject")
                body    = _decode_body(full["payload"])

                user_id = _resolve_user_id(to_addr, db)
                if not user_id:
                    log.warning("[email_ingest] Unresolvable alias on message %s (To: %s)", msg_id, to_addr)
                    summary["unresolved"] += 1
                    _mark_processed(service, msg_id, label_id)
                    summary["processed"] += 1
                    continue

                parsed = parse_bank_email(sender, subject, body)
                if not parsed:
                    summary["skipped"] += 1
                    _mark_processed(service, msg_id, label_id)
                    summary["processed"] += 1
                    continue

                payment_method = parsed.get("payment_method") or infer_payment_method(parsed.get("description", ""))
                tx = Transaction(
                    id=uuid.uuid4(),
                    user_id=user_id,
                    date=parsed["date"],
                    description=(parsed.get("description") or "").strip(),
                    category=parsed.get("category"),
                    type=parsed["type"],
                    amount=parsed["amount"],
                    payment_method=payment_method,
                    source="email_import",
                    is_draft=False,
                    reviewed=False,
                )
                db.add(tx)
                db.commit()
                summary["created"] += 1

                _mark_processed(service, msg_id, label_id)
                summary["processed"] += 1

            except NotImplementedError:
                # Parser stub not filled in yet — don't label as processed,
                # don't spin through every message pretending to succeed.
                raise
            except Exception as exc:
                db.rollback()
                log.error("[email_ingest] Error processing message %s: %s", msg_id, exc)
                summary["errors"].append({"message_id": msg_id, "error": str(exc)})
                # Deliberately NOT labeled processed — safe to retry next poll.

    finally:
        db.close()

    log.info("[email_ingest] Done. %s", summary)
    return summary


def _mark_processed(service, msg_id: str, label_id: str) -> None:
    service.users().messages().modify(
        userId="me", id=msg_id, body={"addLabelIds": [label_id]},
    ).execute()


# ─────────────────────────────────────────────────────────────────────────────
# FastAPI router for HTTP-triggered cron (same pattern as alert_scheduler.py)
# ─────────────────────────────────────────────────────────────────────────────

email_router = APIRouter(prefix="/email", tags=["email"])

_CRON_SECRET = os.getenv("CRON_SECRET", "")


@email_router.post("/poll")
def trigger_poll(x_cron_secret: str = Header(default="")):
    """
    HTTP endpoint for the GitHub Actions poller cron to trigger email
    ingestion. Same CRON_SECRET protection as /scheduler/run.
    """
    if _CRON_SECRET and x_cron_secret != _CRON_SECRET:
        raise HTTPException(status_code=403, detail="Forbidden")

    try:
        return poll_inbox()
    except NotImplementedError as exc:
        raise HTTPException(status_code=501, detail=str(exc))


# ─────────────────────────────────────────────────────────────────────────────
# CLI runner for local testing
# ─────────────────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    import sys
    logging.basicConfig(level=logging.DEBUG)
    try:
        result = poll_inbox()
        print(result)
        sys.exit(0 if not result["errors"] else 1)
    except NotImplementedError as exc:
        print(f"Not ready yet: {exc}")
        sys.exit(1)
