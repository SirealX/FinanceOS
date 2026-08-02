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
from datetime import date as date_type, datetime
from typing import Optional

from fastapi import APIRouter, Header, HTTPException
from sqlalchemy.orm import Session

from .database import SessionLocal
from .models import Preferences, Transaction
from .services.payment_utils import infer_payment_method

log = logging.getLogger(__name__)


# ─────────────────────────────────────────────────────────────────────────────
# Piece #1 — pure parser (Bancolombia, built from 5 real fixture emails —
# see Backend/app/email_fixtures/ — 2026-08-02)
# ─────────────────────────────────────────────────────────────────────────────
#
# Bancolombia sends four DIFFERENT transaction-notification templates, each
# with its own phrasing, and — this bit is easy to miss and important — its
# own NUMBER FORMAT. Card purchases use Colombian-style formatting
# ("$30.777,69" — period thousands, comma decimal); QR/transfer/payroll use
# US-style ("$14,500.00" — comma thousands, period decimal). Same bank, same
# day, two different conventions depending on which system generated the
# email. _parse_amount() below normalizes both by treating whichever
# separator appears LAST as the decimal point, which handles both correctly
# without needing to hardcode which template uses which format (a 5th
# template someday using either convention would still parse right).
#
# A 5th sample email (marketing/bill-reminder, "Tenemos novedades") does NOT
# describe a completed transaction — it's a heads-up that a registered bill
# is ready to be paid, not money that has actually moved yet. It's excluded
# by construction: none of the 4 patterns below match its wording, so it
# falls through to the `return None` at the bottom, same as any other
# non-transaction email. Deliberately not special-cased — the specificity of
# the 4 real patterns is what filters it out, not name-matching this one
# subject line (a robustness bet: any other Bancolombia marketing email
# lands the same way).
#
# SENDER CHECK — baseline, not the full fix. Cesar's real notification
# address is alertasynotificaciones@an.notificacionesbancolombia.com
# (confirmed 2026-08-02). Requiring the domain match is a real improvement
# over not checking at all, but it's still just string-matching the From:
# header — a sending server could put arbitrary text in that header, this
# doesn't cryptographically prove the mail is genuine. The stronger version
# checks Gmail's own DKIM/SPF verification result (the "Authentication-
# Results" header, stamped by Gmail itself on receipt — can't be forged by
# the incoming message). Since the forward will go through Gmail's native
# Forwarding/Filter mechanism (not a manual "Forward" button, which would
# strip original headers), Gmail's ARC (Authenticated Received Chain) is
# designed for exactly this — relayed mail should carry its authentication
# provenance through. Worth confirming once the forward rule is live before
# relying on it. Domain check below is the shipped baseline; DKIM/ARC
# checking is tracked in Tracker.md "Known Bugs" as the still-open hardening
# step.
_SENDER_DOMAIN = "notificacionesbancolombia.com"

_QR_RE = re.compile(
    r'pagaste\s+\$?([\d.,]+)\s+por\s+c[oó]digo\s+QR\s+desde\s+tu\s+cuenta\s+\*?(\S+?)\s+'
    r'a\s+la\s+llave\s+(\S+?)\s+el\s+(\d{2}/\d{2}/\d{4})',
    re.IGNORECASE,
)

_TRANSFER_RE = re.compile(
    r'Transferiste\s+\$?([\d.,]+)\s+desde\s+tu\s+cuenta\s+\*?(\S+?)\s+'
    r'a\s+la\s+cuenta\s+\*?(\S+?)\s+el\s+(\d{2}/\d{2}/\d{4})',
    re.IGNORECASE,
)

_CARD_PURCHASE_RE = re.compile(
    r'Compraste\s+\$?([\d.,]+)\s+en\s+(.+?)\s+con\s+tu\s+T\.?\s?Deb\s+\*?(\S+?),?\s+'
    r'el\s+(\d{2}/\d{2}/\d{4})',
    re.IGNORECASE,
)

_PAYROLL_RE = re.compile(
    r'Recibiste\s+un\s+pago\s+de\s+N[oó]mina\s+de\s+(.+?)\s+por\s+\$?([\d.,]+)\s+'
    r'en\s+tu\s+cuenta.*?el\s+(\d{2}/\d{2}/\d{4})',
    re.IGNORECASE,
)


def _parse_amount(raw: str) -> float:
    """
    Normalizes a Bancolombia amount string to a float regardless of which of
    the two number formats it uses. Rule: whichever separator (comma or
    period) appears LAST in the string is the decimal point; the other, if
    present, is a thousands separator and gets stripped.
        "14,500.00" -> 14500.00   (period last -> period is decimal)
        "30.777,69" -> 30777.69   (comma last -> comma is decimal)
        "500"       -> 500.0      (no separators)
    """
    raw = raw.strip().replace(" ", "")
    has_comma, has_period = "," in raw, "." in raw

    if has_comma and has_period:
        if raw.rfind(",") > raw.rfind("."):
            raw = raw.replace(".", "").replace(",", ".")
        else:
            raw = raw.replace(",", "")
    elif has_comma:
        head, _, tail = raw.rpartition(",")
        raw = f"{head}.{tail}" if len(tail) == 2 else head + tail
    elif has_period:
        head, _, tail = raw.rpartition(".")
        raw = f"{head}.{tail}" if len(tail) == 2 else head + tail

    return float(raw)


def _parse_date(raw: str) -> date_type:
    """Bancolombia dates are DD/MM/YYYY — same convention as import_router.py's default."""
    return datetime.strptime(raw, "%d/%m/%Y").date()


def parse_bank_email(sender: str, subject: str, body: str) -> Optional[dict]:
    """
    Parse a single Bancolombia transaction-notification email into
    transaction fields. Pure function — no network calls, no DB access — so
    it's unit-tested against the saved fixtures in Backend/app/email_fixtures/
    (test_email_ingest_parser.py) rather than against real mail.

    Returns None if the email doesn't match any known transaction pattern
    (e.g. the marketing/bill-reminder template) — the poller treats None as
    "skip, not an error," same as any transaction it doesn't recognize.

    Args:
        sender:  the email's From header — must come from Bancolombia's
                 notification domain (see the SENDER CHECK note above the
                 regexes for what this does and doesn't prove)
        subject: the email's Subject header (unused for Bancolombia — all
                 four real transaction templates share one subject line, the
                 body is what actually distinguishes them)
        body:    the email's plain-text body
    """
    if _SENDER_DOMAIN not in (sender or "").lower():
        return None

    if m := _QR_RE.search(body):
        amount, account, llave, when = m.groups()
        return {
            "date":           _parse_date(when),
            "amount":         _parse_amount(amount),
            "description":    f"Pago QR — llave {llave}",
            "type":           "expense",
            "category":       None,
            "payment_method": "QR",
        }

    if m := _TRANSFER_RE.search(body):
        amount, from_acct, to_acct, when = m.groups()
        return {
            "date":           _parse_date(when),
            "amount":         _parse_amount(amount),
            "description":    f"Transferencia a cuenta *{to_acct}",
            "type":           "expense",
            "category":       None,
            "payment_method": "Transfer",
        }

    if m := _CARD_PURCHASE_RE.search(body):
        amount, merchant, card, when = m.groups()
        return {
            "date":           _parse_date(when),
            "amount":         _parse_amount(amount),
            "description":    merchant.strip(),
            "type":           "expense",
            "category":       None,
            "payment_method": "Debit Card",
        }

    if m := _PAYROLL_RE.search(body):
        employer, amount, when = m.groups()
        return {
            "date":           _parse_date(when),
            "amount":         _parse_amount(amount),
            "description":    f"Nómina — {employer.strip()}",
            "type":           "income",
            "category":       None,
            "payment_method": "Transfer",
        }

    return None


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

    Scope is gmail.modify, not gmail.readonly (confirmed the hard way,
    2026-08-02 — the first live run 403'd on labels.create/messages.modify
    with "Insufficient Permission"). readonly only covers reading; creating
    the PROCESSED_LABEL and tagging messages with it are both writes.
    gmail.modify is the narrowest scope that covers both without granting
    permanent delete or send — see the SCOPE note above PROCESSED_LABEL.
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
        scopes=["https://www.googleapis.com/auth/gmail.modify"],
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

    Catches broadly and returns the real error in the response body —
    deliberately, not just for style. GitHub Actions' curl (--fail-with-body)
    prints whatever the response body says, and Render's own generic 500
    page says nothing useful ("Internal Server Error", no detail) when an
    exception escapes uncaught. The first real run surfaced exactly that —
    a bare 500 with no way to tell GMAIL_* env vars missing from a Gmail API
    error from a DB error without digging through Render's log dashboard.
    This makes future failures self-diagnosing from the Actions run alone.
    """
    if _CRON_SECRET and x_cron_secret != _CRON_SECRET:
        raise HTTPException(status_code=403, detail="Forbidden")

    try:
        return poll_inbox()
    except NotImplementedError as exc:
        raise HTTPException(status_code=501, detail=str(exc))
    except Exception as exc:
        log.exception("[email_ingest] /email/poll failed")
        raise HTTPException(status_code=500, detail=f"{type(exc).__name__}: {exc}")


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
