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
     fixture email captured once per bank.

  2. poll_inbox(db) / the /email/poll HTTP endpoint
     Talks to the inbox over IMAP, resolves each message's +alias to a
     user_id, hands the body to the parser, creates the transaction. Safe to
     build and test independently of #1 since it only depends on the
     parser's *contract*, not its internals.

MIGRATED FROM THE GMAIL API TO PLAIN IMAP (2026-08-12) — see Tracker.md
"Email Ingestion Pipeline" for the full incident writeup. Short version: the
Gmail API's OAuth flow requires the app to be either in "Testing" publishing
status (refresh tokens silently expire every 7 days, discovered the hard way
2026-08-09) or "In production" (triggers Google's brand-verification review —
domain ownership proof, a homepage describing the app, name matching — dead
weight for a tool only Cesar uses, and the domain-ownership check can't even
pass on a shared `vercel.app` subdomain). IMAP + a Gmail App Password sidesteps
all of it: no Cloud Console project, no consent screen, no expiry, no review.
Only requires GMAIL_ADDRESS + GMAIL_APP_PASSWORD (2-Step Verification must be
on for financeos.ingest@gmail.com to generate one).

RUNNING LOCALLY FOR TESTING
  python -m app.email_ingest
─────────────────────────────────────────────────────────────────────────────
"""

import imaplib
import email
import email.policy
import logging
import os
import re
import uuid
from datetime import date as date_type, datetime
from email.message import EmailMessage
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

# Shared date fragment — Bancolombia mostly uses DD/MM/YYYY but the
# correspondent-deposit template uses DD/MM/YY (found live 2026-08-02).
# IMPORTANT: \d{4} must come BEFORE \d{2} in the alternation. Regex
# alternation tries options left-to-right and stops at the first one that
# lets the overall match succeed — it does NOT prefer the longer match.
# With \d{2} listed first, "2026" would match just "20" (2 digits) and stop
# right there, since nothing after this group forces a re-try — silently
# truncating every 4-digit year to its first 2 digits. Caught this the hard
# way: an early version with the order reversed parsed "29/07/2026" as
# "29/07/20" -> year 2020, 6 years off, no error raised anywhere. Order
# matters here, not a style choice.
_DATE = r'\d{2}/\d{2}/(?:\d{4}|\d{2})'

_QR_RE = re.compile(
    r'pagaste\s+\$?([\d.,]+)\s+por\s+c[oó]digo\s+QR\s+desde\s+tu\s+cuenta\s+\*?(\S+?)\s+'
    rf'a\s+la\s+llave\s+(\S+?)\s+el\s+({_DATE})',
    re.IGNORECASE,
)

_TRANSFER_RE = re.compile(
    r'Transferiste\s+\$?([\d.,]+)\s+desde\s+tu\s+cuenta\s+\*?(\S+?)\s+'
    rf'a\s+la\s+cuenta\s+\*?(\S+?)\s+el\s+({_DATE})',
    re.IGNORECASE,
)

_CARD_PURCHASE_RE = re.compile(
    r'Compraste\s+\$?([\d.,]+)\s+en\s+(.+?)\s+con\s+tu\s+T\.?\s?Deb\s+\*?(\S+?),?\s+'
    rf'el\s+({_DATE})',
    re.IGNORECASE,
)

_PAYROLL_RE = re.compile(
    r'Recibiste\s+un\s+pago\s+de\s+N[oó]mina\s+de\s+(.+?)\s+por\s+\$?([\d.,]+)\s+'
    rf'en\s+tu\s+cuenta.*?el\s+({_DATE})',
    re.IGNORECASE,
)

# Cash deposit made at a banking correspondent/agent ("corresponsal
# bancario" — a physical third-party location, e.g. a corner store, that
# acts as a bank agent for deposits/withdrawals). Found live 2026-08-02 —
# a real transaction (someone paying Cesar this way) hit the inbox, didn't
# match any of the 4 patterns above, and silently fell through as "not
# recognized" (logged, no error, just no transaction created). Also the
# template that surfaced the 2-digit-year quirk documented above — there's
# no "a las" before the time either, but the regex doesn't need the time.
_CORRESPONDENT_DEPOSIT_RE = re.compile(
    r'Recibiste\s+una\s+consignaci[oó]n\s+por\s+\$?([\d.,]+)\s+desde\s+el\s+corresponsal\s+'
    rf'(.+?)\s+en\s+(.+?),\s+el\s+({_DATE})',
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
    """
    Bancolombia dates are DD/MM/YYYY — same convention as import_router.py's
    default — except the correspondent-deposit template uses a 2-digit year
    (DD/MM/YY, found live 2026-08-02). Tries both; %y's century pivot
    (00-68 -> 2000s) is correct for any date this app will ever see.
    """
    for fmt in ("%d/%m/%Y", "%d/%m/%y"):
        try:
            return datetime.strptime(raw, fmt).date()
        except ValueError:
            continue
    raise ValueError(f"Unrecognized Bancolombia date format: {raw!r}")


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

    if m := _CORRESPONDENT_DEPOSIT_RE.search(body):
        amount, correspondent, city, when = m.groups()
        return {
            "date":           _parse_date(when),
            "amount":         _parse_amount(amount),
            "description":    f"Consignación — {correspondent.strip()} ({city.strip()})",
            "type":           "income",
            "category":       None,
            "payment_method": "Cash",
        }

    return None


# ─────────────────────────────────────────────────────────────────────────────
# Piece #2 — IMAP poller
# ─────────────────────────────────────────────────────────────────────────────

_IMAP_HOST = "imap.gmail.com"

# Matches the local-part of an address like
# "financeos.ingest+8f3a1c2b9e4d5f60712a@gmail.com" -> "8f3a1c2b9e4d5f60712a"
_ALIAS_TOKEN_RE = re.compile(r'\+([^@]+)@')


def _imap_connect() -> imaplib.IMAP4_SSL:
    """
    Logs into the shared ingestion inbox over IMAP using a Gmail App
    Password — no OAuth, no Cloud Console project, no consent screen. See
    Tracker.md "Email Ingestion Pipeline" for why this replaced the Gmail
    API approach (2026-08-12) and the one-time setup steps (enable 2-Step
    Verification on financeos.ingest@gmail.com, generate an app password at
    myaccount.google.com/apppasswords).

    App Passwords are a Google-supported mechanism for exactly this case —
    a client that speaks plain IMAP/SMTP and can't do an OAuth handshake —
    and unlike OAuth refresh tokens for an app in "Testing" status, they
    don't expire on a timer; they're valid until revoked.
    """
    address = os.getenv("GMAIL_ADDRESS", "")
    app_password = os.getenv("GMAIL_APP_PASSWORD", "")

    if not (address and app_password):
        raise RuntimeError(
            "GMAIL_ADDRESS / GMAIL_APP_PASSWORD must both be set — see "
            "Tracker.md 'Email Ingestion Pipeline' setup checklist."
        )

    imap = imaplib.IMAP4_SSL(_IMAP_HOST)
    imap.login(address, app_password)
    imap.select("INBOX")
    return imap


def _decode_body(msg: EmailMessage) -> str:
    """
    Walks the message looking for the best text/plain part (falls back to
    text/html stripped of tags if that's all there is — some banks only
    send HTML notifications). `email.policy.default` gives an EmailMessage
    with charset-aware decoding built in via get_content().
    """
    body_part = msg.get_body(preferencelist=("plain",))
    if body_part is not None:
        return body_part.get_content()

    html_part = msg.get_body(preferencelist=("html",))
    if html_part is not None:
        return re.sub(r"<[^>]+>", " ", html_part.get_content())

    return ""


def _resolve_user_id(delivered_to: str, db: Session) -> Optional[str]:
    """
    Extracts the +alias token from the message's actual delivery address and
    looks up the owning user.

    Deliberately takes the Delivered-To header, not To. Confirmed live
    2026-08-02: Gmail's filter "Forward it to" preserves the original To:
    header (the bank's own address to the user's personal inbox) and only
    changes where the message is actually delivered — the +alias only shows
    up in Delivered-To, which the receiving Gmail server (the shared
    financeos.ingest@gmail.com inbox) stamps with the real envelope
    recipient at final delivery, regardless of what To: says. Using To: here
    silently resolved to nothing for every real forwarded email.
    """
    match = _ALIAS_TOKEN_RE.search(delivered_to or "")
    if not match:
        return None
    token = match.group(1)
    prefs = db.query(Preferences).filter(Preferences.ingest_token == token).first()
    return str(prefs.user_id) if prefs else None


def poll_inbox() -> dict:
    """
    Main entry point. Searches the shared ingestion inbox for UNSEEN
    messages, resolves each to a user via its +alias, parses it, and
    creates a transaction. Always marks a message \\Seen after handling it —
    including unresolvable/unparseable ones — so nothing is retried
    forever; only a mid-flight exception (DB down, etc.) leaves a message
    unread for a safe retry next run.

    Using the \\Seen flag instead of a Gmail label (as the old Gmail-API
    version did) is a deliberate improvement, not just a side effect of the
    IMAP migration: it fixes a real bug found live 2026-08-02, where
    Gmail's search index treated a custom label's presence as a property of
    the whole *conversation*, not the individual message — a genuinely new
    message in an already-labeled thread was silently invisible to the
    poller forever ("chained" emails). IMAP flags are set per-message by
    the protocol itself, so the same class of bug isn't possible here.

    Field semantics (see Tracker.md "Known Gotchas"): email-imported
    transactions are real and complete the moment they're created —
    is_draft=False (the money already left the account; the email is the
    bank's own confirmation) — with reviewed=False so the existing
    import_reminder alert (already built for csv_import) picks them up
    without any new alert logic.
    """
    summary = {
        "processed": 0, "created": 0, "skipped": 0, "unresolved": 0, "errors": [],
    }

    imap = _imap_connect()
    try:
        status, data = imap.uid("search", None, "UNSEEN")
        if status != "OK":
            raise RuntimeError(f"IMAP search failed: {status}")
        uids = data[0].split()

        if not uids:
            return summary

        db = SessionLocal()
        try:
            for uid in uids:
                try:
                    status, msg_data = imap.uid("fetch", uid, "(RFC822)")
                    if status != "OK" or not msg_data or msg_data[0] is None:
                        raise RuntimeError(f"IMAP fetch failed for uid {uid!r}: {status}")

                    raw = msg_data[0][1]
                    msg: EmailMessage = email.message_from_bytes(raw, policy=email.policy.default)

                    sender       = msg.get("From", "")
                    delivered_to = msg.get("Delivered-To", "") or msg.get("To", "")
                    subject      = msg.get("Subject", "")
                    body         = _decode_body(msg)

                    user_id = _resolve_user_id(delivered_to, db)
                    if not user_id:
                        log.warning(
                            "[email_ingest] Unresolvable alias on message uid %s (Delivered-To: %s)",
                            uid, delivered_to,
                        )
                        summary["unresolved"] += 1
                        _mark_processed(imap, uid)
                        summary["processed"] += 1
                        continue

                    parsed = parse_bank_email(sender, subject, body)
                    if not parsed:
                        summary["skipped"] += 1
                        _mark_processed(imap, uid)
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

                    _mark_processed(imap, uid)
                    summary["processed"] += 1

                except NotImplementedError:
                    # Parser stub not filled in yet — don't mark processed,
                    # don't spin through every message pretending to succeed.
                    raise
                except Exception as exc:
                    db.rollback()
                    log.error("[email_ingest] Error processing message uid %s: %s", uid, exc)
                    summary["errors"].append({"message_id": uid.decode(), "error": str(exc)})
                    # Deliberately NOT marked \Seen — safe to retry next poll.

        finally:
            db.close()
    finally:
        try:
            imap.close()
        except Exception:
            pass
        imap.logout()

    log.info("[email_ingest] Done. %s", summary)
    return summary


def _mark_processed(imap: imaplib.IMAP4_SSL, uid: bytes) -> None:
    status, _ = imap.uid("store", uid, "+FLAGS", "\\Seen")
    if status != "OK":
        raise RuntimeError(f"IMAP store (\\Seen) failed for uid {uid!r}: {status}")


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
    a bare 500 with no way to tell GMAIL_* env vars missing from an IMAP
    error from a DB error without digging through Render's log dashboard.
    This makes future failures self-diagnosing from the Actions run alone.
    """
    if _CRON_SECRET and x_cron_secret != _CRON_SECRET:
        raise HTTPException(status_code=403, detail="Forbidden")

    try:
        return poll_inbox()
    except NotImplementedError as exc:
        raise HTTPException(status_code=501, detail=str(exc))
    except imaplib.IMAP4.error as exc:
        # Almost always an auth failure — wrong/revoked GMAIL_APP_PASSWORD,
        # or 2-Step Verification got turned off on financeos.ingest@gmail.com
        # (required for app passwords to keep working). Distinguishing this
        # from a generic 500 so it's diagnosable from the GitHub Actions run
        # alone, same reasoning as the comment above.
        log.exception("[email_ingest] /email/poll failed — IMAP login/command error")
        raise HTTPException(
            status_code=502,
            detail=(
                f"{type(exc).__name__}: {exc} — GMAIL_ADDRESS/GMAIL_APP_PASSWORD "
                "rejected by imap.gmail.com. Re-generate the app password at "
                "myaccount.google.com/apppasswords (requires 2-Step Verification "
                "still enabled on the account) and update GMAIL_APP_PASSWORD in "
                "Backend/.env + Render. See Tracker.md 'Email Ingestion Pipeline' "
                "for the full setup."
            ),
        )
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
