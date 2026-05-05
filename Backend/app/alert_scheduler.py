"""
backend/app/alert_scheduler.py
─────────────────────────────────────────────────────────────────────────────
Daily Scheduler — runs once per day via Render cron.

Responsibilities (spec §9 alert_scheduler.py)
  • Check bill due dates against bill_due_days preference
  • Check spendable balance against low_balance_floor preference
  • Check debt due dates for overdue payments
  • Check last_seen_at to hold import reminders if user was recently active
  • Assemble and send the daily digest if any Tier 2 items are pending
  • Calls alert_engine.evaluate_alerts(source='scheduler') for each user

DEPLOYMENT
  On Render: set a cron job to POST /scheduler/run or call run_daily_checks()
  directly from a management command.

  Recommended schedule: once daily, a few minutes before each user's
  digest_time (or just run at a fixed UTC time that covers most time zones).

RUNNING LOCALLY FOR TESTING
  python -m app.alert_scheduler
─────────────────────────────────────────────────────────────────────────────
"""

import logging
from datetime import date, datetime

from sqlalchemy.orm import Session

from .database import SessionLocal
from .models import AlertPreferences, Preferences
from .alert_engine import evaluate_alerts, assemble_digest
from .routers.bills import roll_forward_bills

try:
    from . import notifications as _notif
    _NOTIF_AVAILABLE = True
except ImportError:
    _NOTIF_AVAILABLE = False

log = logging.getLogger(__name__)


# ─────────────────────────────────────────────────────────────────────────────
# Entry point — called by cron or HTTP trigger
# ─────────────────────────────────────────────────────────────────────────────

def run_daily_checks() -> dict:
    """
    Main entry point.  Opens its own DB session, iterates over all users
    that have alert_preferences rows, runs every scheduler check, and
    dispatches digests.

    Returns a summary dict for logging/monitoring.
    """
    db      = SessionLocal()
    today   = date.today()
    summary = {"users_processed": 0, "alerts_created": 0, "digests_sent": 0, "errors": []}

    try:
        # Only process users who have opted into at least one external channel
        # OR have the default digest_enabled=True (all users by default)
        user_prefs = db.query(AlertPreferences).all()
        log.info("[scheduler] Starting daily run for %d users", len(user_prefs))

        for prefs in user_prefs:
            user_id = str(prefs.user_id)
            try:
                new = _process_user(user_id, prefs, today, db)
                summary["alerts_created"] += len(new)

                # Assemble and send digest
                if prefs.digest_enabled:
                    sent = _send_digest(user_id, prefs, today, db)
                    if sent:
                        summary["digests_sent"] += 1

                summary["users_processed"] += 1

            except Exception as exc:
                log.error("[scheduler] Error processing user %s: %s", user_id, exc)
                summary["errors"].append({"user_id": user_id, "error": str(exc)})

    finally:
        db.close()

    log.info("[scheduler] Done. %s", summary)
    return summary


# ─────────────────────────────────────────────────────────────────────────────
# Per-user processing
# ─────────────────────────────────────────────────────────────────────────────

def _process_user(
    user_id: str,
    prefs: AlertPreferences,
    today: date,
    db: Session,
) -> list:
    """Run all scheduler-triggered checks for a single user."""
    # Issue #8 — roll forward paid bills whose cycle has ended
    roll_forward_bills(user_id, db)

    # Silently decrement payroll-deduction debt balances on their due day
    try:
        from .routers.debts import decrement_payroll_debts
        n = decrement_payroll_debts(user_id, db)
        if n:
            log.info("[scheduler] Decremented %d payroll-deduction debt(s) for %s", n, user_id)
    except Exception as exc:
        log.warning("[scheduler] Payroll deduction failed for %s: %s", user_id, exc)

    return evaluate_alerts(
        user_id = user_id,
        source  = "scheduler",
        db      = db,
    )


def _send_digest(
    user_id: str,
    prefs: AlertPreferences,
    today: date,
    db: Session,
) -> bool:
    """
    Assemble pending Tier 2 items + goal_reached into a digest message
    and dispatch it to all enabled external channels.

    Returns True if a digest was actually sent.
    """
    pending = assemble_digest(user_id, today, db)
    if not pending:
        return False

    message = _format_digest(pending, today)

    dispatched = False

    if _NOTIF_AVAILABLE:
        if prefs.telegram_enabled and prefs.telegram_chat_id:
            try:
                _notif.send_telegram(prefs.telegram_chat_id, message)
                dispatched = True
            except Exception as exc:
                log.warning("[scheduler] Telegram digest failed for %s: %s", user_id, exc)

        if prefs.pwa_push_enabled and prefs.pwa_push_subscription:
            try:
                _notif.send_push(
                    prefs.pwa_push_subscription,
                    title = f"📊 Daily Digest · {today.strftime('%b %d')}",
                    body  = f"{len(pending)} item{'s' if len(pending) != 1 else ''} need your attention",
                )
                dispatched = True
            except Exception as exc:
                log.warning("[scheduler] PWA digest failed for %s: %s", user_id, exc)
    else:
        # Notifications not yet wired in — still mark digest as sent in DB
        # so items don't pile up endlessly during dev
        log.debug("[scheduler] notifications.py not available — digest DB-only for user %s", user_id)
        dispatched = True  # treated as sent for dedup purposes

    return dispatched


# ─────────────────────────────────────────────────────────────────────────────
# Digest message formatter
# ─────────────────────────────────────────────────────────────────────────────

def _format_digest(alerts: list, today: date) -> str:
    """
    Format a list of alert objects into the digest message body.
    Matches the Telegram message format from spec §6A.

    Example output:
      📊 Daily Digest · Apr 14
      · Food & Dining: 112% of budget ($336 / $300)
      · 3 transactions from Monday's import need review
      → Open app
    """
    header = f"📊 Daily Digest · {today.strftime('%b %d')}"
    lines  = [header]

    for alert in alerts:
        if alert.type == "goal_reached":
            lines.append(f"✅ {alert.title}")
        elif alert.type == "import_reminder":
            lines.append(f"📋 {alert.body}")
        else:
            lines.append(f"· {alert.body}")

    lines.append("→ Open app")
    return "\n".join(lines)


# ─────────────────────────────────────────────────────────────────────────────
# FastAPI router for HTTP-triggered cron (Render cron or manual trigger)
# ─────────────────────────────────────────────────────────────────────────────

from fastapi import APIRouter, Header, HTTPException
import os

scheduler_router = APIRouter(prefix="/scheduler", tags=["scheduler"])

_CRON_SECRET = os.getenv("CRON_SECRET", "")


@scheduler_router.post("/run")
def trigger_scheduler(x_cron_secret: str = Header(default="")):
    """
    HTTP endpoint for Render cron to trigger the daily scheduler.
    Protect with CRON_SECRET env variable to prevent unauthorized triggers.
    """
    if _CRON_SECRET and x_cron_secret != _CRON_SECRET:
        raise HTTPException(status_code=403, detail="Forbidden")

    result = run_daily_checks()
    return result


# ─────────────────────────────────────────────────────────────────────────────
# CLI runner for local testing
# ─────────────────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    import sys
    logging.basicConfig(level=logging.DEBUG)
    result = run_daily_checks()
    print(result)
    sys.exit(0 if not result["errors"] else 1)
