"""
backend/app/alert_engine.py
─────────────────────────────────────────────────────────────────────────────
Alert Engine — evaluates all rule conditions, writes to the alerts table,
and dispatches to enabled external channels.

DESIGN PRINCIPLES (from ALERTS_SPEC.md §1)
  • Event-driven, not polling — fires once when a condition is first met.
  • Source-aware — skips evaluation entirely for bill_payment and
    savings_contribution sources (user-initiated actions, never push).
  • Low noise — de-duplication via fired_immediate + digest_date fields.

ENTRY POINT
  evaluate_alerts(user_id, source, db)
    Called from:
      • routers/alerts.py  — after any manual data write
      • alert_scheduler.py — daily cron run (source='scheduler')
      • routers/sync.py    — after every bank API sync (source='api_sync')

CHANNELS
  External dispatch is wired in Step 9 (after Telegram bot + VAPID keys are
  created by the project owner per ALERTS_SPEC.md §12).  Until then, the
  notification stubs in notifications.py are no-ops so the engine runs safely.
─────────────────────────────────────────────────────────────────────────────
"""

from __future__ import annotations

import logging
from datetime import date, datetime, timedelta
from decimal import Decimal
from typing import Optional
from uuid import UUID

from sqlalchemy.orm import Session
from sqlalchemy import func

from .models import (
    Alert,
    AlertPreferences,
    Bill,
    BudgetCategory,
    Category,
    Debt,
    SavingsGoal,
    Transaction,
)

# Lazy import to avoid circular deps; notifications module is a thin wrapper
try:
    from . import notifications as _notif
    _NOTIF_AVAILABLE = True
except ImportError:
    _NOTIF_AVAILABLE = False

log = logging.getLogger(__name__)

# ── Sources the engine always skips (spec §3) ─────────────────────────────────
_SKIP_SOURCES = {"bill_payment", "savings_contribution"}

# Session-boundary threshold in hours (spec §5)
_SESSION_BOUNDARY_HOURS = 6

# ── Tier + severity mapping per alert type ────────────────────────────────────
_ALERT_META = {
    "bill_due":          {"tier": 1, "severity": "warning"},
    "large_transaction": {"tier": 1, "severity": "warning"},
    "low_balance":       {"tier": 1, "severity": "critical"},
    "debt_due":          {"tier": 1, "severity": "warning"},   # #21 — payment due soon
    "debt_overdue":      {"tier": 1, "severity": "critical"},
    "goal_reached":      {"tier": 1, "severity": "info"},     # queued to digest
    "budget_exceeded":   {"tier": 2, "severity": "warning"},
    "spending_spike":    {"tier": 2, "severity": "warning"},
    "import_reminder":     {"tier": 2, "severity": "info"},
    "balance_reminder":    {"tier": 2, "severity": "info"},
    "near_limit":          {"tier": 3, "severity": "info"},
}


# ─────────────────────────────────────────────────────────────────────────────
# Public entry point
# ─────────────────────────────────────────────────────────────────────────────

def evaluate_alerts(
    user_id: str,
    source: str,
    db: Session,
    *,
    transaction_id: Optional[str] = None,
    amount: Optional[Decimal] = None,
) -> list[dict]:
    """
    Evaluate all applicable alert rules for a given user and trigger source.

    Parameters
    ----------
    user_id        : Supabase user UUID (string)
    source         : one of manual | csv_import | api_sync | scheduler
    db             : active SQLAlchemy session
    transaction_id : (optional) UUID of a freshly-created transaction — used
                     to evaluate the large_transaction rule immediately
    amount         : (optional) amount of that transaction

    Returns a list of serialised alert dicts for any newly-created alerts.
    """
    if source in _SKIP_SOURCES:
        log.debug("[alert_engine] source=%s — skipping (bill/savings payment)", source)
        return []

    prefs = _get_or_create_prefs(user_id, db)
    now   = datetime.utcnow()
    today = now.date()

    new_alerts: list[Alert] = []

    # ── Tier 1 checks ─────────────────────────────────────────────────────────

    # 1a. Large transaction (bank API sync only, per spec §2)
    if source == "api_sync" and transaction_id and amount is not None:
        if prefs.large_tx_threshold and amount >= prefs.large_tx_threshold:
            if not _already_fired(user_id, "large_transaction", transaction_id, db):
                a = _make_alert(
                    user_id    = user_id,
                    type_      = "large_transaction",
                    title      = "Large Transaction Detected",
                    body       = f"A transaction of {_fmt(amount)} was just synced — above your {_fmt(prefs.large_tx_threshold)} threshold.",
                    source     = source,
                    entity_type = "transaction",
                    entity_id  = transaction_id,
                )
                new_alerts.append(a)

    # 1b. Bill due soon (scheduler)
    if source == "scheduler":
        new_alerts += _check_bill_due(user_id, prefs, today, db)

    # 1c. Low balance (scheduler)
    if source == "scheduler" and prefs.low_balance_floor is not None:
        new_alerts += _check_low_balance(user_id, prefs, db)

    # 1d. Debt due soon + overdue (scheduler)
    if source == "scheduler":
        new_alerts += _check_debt_overdue(user_id, prefs, today, db)

    # ── Tier 1 — Savings goal reached (any source except skip list) ───────────
    new_alerts += _check_goal_reached(user_id, source, db)

    # ── Tier 2 checks ─────────────────────────────────────────────────────────

    # 2a. Budget category exceeded (any source)
    new_alerts += _check_budget_exceeded(user_id, source, today, db)

    # 2b. Spending spike (scheduler)
    if source == "scheduler":
        new_alerts += _check_spending_spike(user_id, today, db)

    # 2c. Import reminder (scheduler, session-boundary-aware)
    if source == "scheduler":
        new_alerts += _check_import_reminder(user_id, today, db)

    # 2d. Balance sanity check reminder (scheduler, user-configured day of month)
    if source == "scheduler":
        new_alerts += _check_balance_reminder(user_id, today, db)

    # ── Persist all new alerts ────────────────────────────────────────────────
    if new_alerts:
        for alert in new_alerts:
            db.add(alert)
        db.commit()
        for alert in new_alerts:
            db.refresh(alert)

        # ── Dispatch immediate (Tier 1) external notifications ────────────────
        if prefs.immediate_enabled:
            for alert in new_alerts:
                if alert.tier == 1 and alert.type != "goal_reached":
                    _dispatch_immediate(alert, prefs)

    return [_serialize(a) for a in new_alerts]


# ─────────────────────────────────────────────────────────────────────────────
# Individual rule checkers
# ─────────────────────────────────────────────────────────────────────────────

def _check_bill_due(
    user_id: str,
    prefs: AlertPreferences,
    today: date,
    db: Session,
) -> list[Alert]:
    """Fire once per bill when its due date is within bill_due_days."""
    horizon = today + timedelta(days=prefs.bill_due_days)
    bills = (
        db.query(Bill)
        .filter(
            Bill.user_id == user_id,
            Bill.status  == "unpaid",
            Bill.due_date >= today,
            Bill.due_date <= horizon,
        )
        .all()
    )
    result = []
    for bill in bills:
        key = str(bill.id)
        if _already_fired(user_id, "bill_due", key, db):
            continue
        days_left = (bill.due_date - today).days
        result.append(_make_alert(
            user_id     = user_id,
            type_       = "bill_due",
            title       = f"Bill Due — {bill.name}",
            body        = f"Due in {days_left} day{'s' if days_left != 1 else ''} · {_fmt(bill.amount)} unpaid",
            source      = "scheduler",
            entity_type = "bill",
            entity_id   = key,
        ))
    return result


def _check_low_balance(
    user_id: str,
    prefs: AlertPreferences,
    db: Session,
) -> list[Alert]:
    """Fire when estimated spendable balance drops below the user's floor."""
    balance = _estimate_spendable_balance(user_id, db)
    if balance is None:
        return []

    if balance < prefs.low_balance_floor:
        # De-duplicate: only one low-balance alert per calendar day
        today_str = date.today().isoformat()
        if _already_fired(user_id, "low_balance", today_str, db):
            return []
        return [_make_alert(
            user_id     = user_id,
            type_       = "low_balance",
            title       = "Spendable Balance Low",
            body        = (
                f"Your estimated spendable balance is {_fmt(balance)}, "
                f"below your {_fmt(prefs.low_balance_floor)} floor."
            ),
            source      = "scheduler",
            entity_type = None,
            entity_id   = today_str,
        )]
    return []


def _check_debt_overdue(
    user_id: str,
    prefs: AlertPreferences,
    today: date,
    db: Session,
) -> list[Alert]:
    """
    Issue #21 — Debt payment alerts now fire at the right time.

    Two behaviours, depending on whether the debt has a due_day set:

    A) due_day is set (e.g. 15):
       • debt_due      — fires bill_due_days before the due day (same advance
                         window the user configured for bill reminders).
       • debt_overdue  — fires the day after the due day if still unpaid.

    B) due_day is null (legacy / user hasn't set it):
       • Falls back to the old behaviour: fires debt_overdue on the 28th so
         existing users lose nothing while they gradually fill in due days.
    """
    debts = (
        db.query(Debt)
        .filter(Debt.user_id == user_id, Debt.balance > 0)
        .all()
    )
    result = []
    month_key = today.strftime("%Y-%m")

    for debt in debts:
        debt_id = str(debt.id)

        # ── Check if already paid this month ──────────────────────────────────
        paid_this_month = (
            db.query(Transaction)
            .filter(
                Transaction.user_id  == user_id,
                Transaction.type     == "expense",
                Transaction.source.in_(["bill_payment", "manual", "debt_payment"]),
                func.to_char(Transaction.date, "YYYY-MM") == month_key,
                Transaction.description.ilike(f"%{debt.name}%"),
            )
            .first()
        )
        if paid_this_month:
            continue

        # ── Path A: due_day is known ───────────────────────────────────────────
        if debt.due_day:
            # Resolve this month's due date, clamping to last day of month
            import calendar
            last_day = calendar.monthrange(today.year, today.month)[1]
            due_day_clamped = min(debt.due_day, last_day)
            due_date = today.replace(day=due_day_clamped)

            advance_days = prefs.bill_due_days or 5  # default 5 days ahead
            warn_from = due_date - timedelta(days=advance_days)

            if warn_from <= today < due_date:
                # Upcoming — fire "payment due soon"
                key = f"{debt_id}:{month_key}:due"
                if not _already_fired(user_id, "debt_due", key, db):
                    days_left = (due_date - today).days
                    result.append(_make_alert(
                        user_id     = user_id,
                        type_       = "debt_due",
                        title       = f"Debt Payment Due Soon — {debt.name}",
                        body        = (
                            f"Payment due in {days_left} day{'s' if days_left != 1 else ''} "
                            f"(day {debt.due_day}). Minimum: {_fmt(debt.min_payment)}."
                        ),
                        source      = "scheduler",
                        entity_type = "debt",
                        entity_id   = debt_id,
                    ))

            elif today > due_date:
                # Past due — fire "overdue"
                key = f"{debt_id}:{month_key}:overdue"
                if not _already_fired(user_id, "debt_overdue", key, db):
                    result.append(_make_alert(
                        user_id     = user_id,
                        type_       = "debt_overdue",
                        title       = f"Debt Payment Overdue — {debt.name}",
                        body        = (
                            f"No payment recorded for {debt.name} this month. "
                            f"Minimum payment: {_fmt(debt.min_payment)}."
                        ),
                        source      = "scheduler",
                        entity_type = "debt",
                        entity_id   = debt_id,
                    ))

        # ── Path B: no due_day set — legacy fallback (fire on the 28th) ───────
        else:
            if today.day < 28:
                continue
            key = f"{debt_id}:{month_key}"
            if _already_fired(user_id, "debt_overdue", key, db):
                continue
            result.append(_make_alert(
                user_id     = user_id,
                type_       = "debt_overdue",
                title       = f"Debt Payment Overdue — {debt.name}",
                body        = (
                    f"No payment recorded for {debt.name} this month. "
                    f"Tip: set a payment due day on this debt for earlier reminders. "
                    f"Minimum payment: {_fmt(debt.min_payment)}."
                ),
                source      = "scheduler",
                entity_type = "debt",
                entity_id   = debt_id,
            ))

    return result


def _check_goal_reached(
    user_id: str,
    source: str,
    db: Session,
) -> list[Alert]:
    """Fire (queued to digest) when a savings goal hits 100%."""
    goals = (
        db.query(SavingsGoal)
        .filter(
            SavingsGoal.user_id        == user_id,
            SavingsGoal.current_amount >= SavingsGoal.target_amount,
            SavingsGoal.target_amount  >  0,
        )
        .all()
    )
    result = []
    for goal in goals:
        key = str(goal.id)
        if _already_fired(user_id, "goal_reached", key, db):
            continue
        # Tier 1 but queued to next digest (spec §2)
        alert = _make_alert(
            user_id     = user_id,
            type_       = "goal_reached",
            title       = f"Goal Reached — {goal.goal_name}",
            body        = f"You hit your {_fmt(goal.target_amount)} savings target. 🎉",
            source      = source,
            entity_type = "savings_goal",
            entity_id   = key,
        )
        # goal_reached is never fired as immediate (per spec); digest handles it
        result.append(alert)
    return result


def _check_budget_exceeded(
    user_id: str,
    source: str,
    today: date,
    db: Session,
) -> list[Alert]:
    """Fire once per category per month when actual spending exceeds planned."""
    month_key = today.strftime("%Y-%m")

    # Aggregate actual spend by category this month
    rows = (
        db.query(
            Transaction.category,
            func.sum(Transaction.amount).label("actual"),
        )
        .filter(
            Transaction.user_id == user_id,
            Transaction.type    == "expense",
            Transaction.is_draft == False,
            func.to_char(Transaction.date, "YYYY-MM") == month_key,
        )
        .group_by(Transaction.category)
        .all()
    )

    # BUG-02 fix: planned amounts live in Category.planned_amount, not BudgetCategory.
    # BudgetCategory stores actual bill/debt/savings amounts — using it as the
    # "planned" source was comparing actual vs actual, not actual vs planned.
    planned_rows = (
        db.query(Category.name, Category.planned_amount)
        .filter(
            Category.user_id  == user_id,
            Category.kind     == "expense",
            Category.is_active == True,
        )
        .all()
    )
    planned_map = {r.name: r.planned_amount for r in planned_rows}

    result = []
    for row in rows:
        cat     = row.category
        actual  = row.actual or Decimal("0")
        planned = planned_map.get(cat, Decimal("0"))
        if planned <= 0 or actual <= planned:
            continue

        key = f"{cat}:{month_key}"
        if _already_fired(user_id, "budget_exceeded", key, db):
            continue

        pct = int((actual / planned) * 100)
        result.append(_make_alert(
            user_id     = user_id,
            type_       = "budget_exceeded",
            title       = f"Budget Exceeded — {cat}",
            body        = (
                f"{cat} is at {pct}% of budget "
                f"({_fmt(actual)} / {_fmt(planned)})."
            ),
            source      = source,
            entity_type = "transaction",
            entity_id   = key,
        ))
    return result


def _check_spending_spike(
    user_id: str,
    today: date,
    db: Session,
) -> list[Alert]:
    """
    Fire once per category per month when spending is 30%+ higher than
    the same period last month (spec §2 Tier 2: 30% spike threshold).
    """
    month_key      = today.strftime("%Y-%m")
    last_month_key = (today.replace(day=1) - timedelta(days=1)).strftime("%Y-%m")

    def _actuals(month: str) -> dict[str, Decimal]:
        rows = (
            db.query(
                Transaction.category,
                func.sum(Transaction.amount).label("total"),
            )
            .filter(
                Transaction.user_id == user_id,
                Transaction.type    == "expense",
                Transaction.is_draft == False,
                func.to_char(Transaction.date, "YYYY-MM") == month,
            )
            .group_by(Transaction.category)
            .all()
        )
        return {r.category: (r.total or Decimal("0")) for r in rows}

    current  = _actuals(month_key)
    previous = _actuals(last_month_key)

    result = []
    for cat, cur_amt in current.items():
        prev_amt = previous.get(cat, Decimal("0"))
        if prev_amt <= 0:
            continue

        pct_change = ((cur_amt - prev_amt) / prev_amt) * 100
        if pct_change < 30:
            continue

        key = f"spike:{cat}:{month_key}"
        if _already_fired(user_id, "spending_spike", key, db):
            continue

        result.append(_make_alert(
            user_id     = user_id,
            type_       = "spending_spike",
            title       = f"Spending Spike — {cat}",
            body        = (
                f"{cat} is {int(pct_change)}% higher than last month "
                f"({_fmt(cur_amt)} vs {_fmt(prev_amt)})."
            ),
            source      = "scheduler",
            entity_type = "transaction",
            entity_id   = key,
        ))
    return result


def _check_import_reminder(
    user_id: str,
    today: date,
    db: Session,
) -> list[Alert]:
    """
    Remind the user about unreviewed import transactions — but only if they
    were not active in the last SESSION_BOUNDARY_HOURS hours (spec §5).
    """
    from .models import Preferences
    prefs_row = db.query(Preferences).filter(Preferences.user_id == user_id).first()

    if prefs_row and prefs_row.last_seen_at:
        hours_ago = (datetime.utcnow() - prefs_row.last_seen_at).total_seconds() / 3600
        if hours_ago < _SESSION_BOUNDARY_HOURS:
            log.debug("[alert_engine] user active %0.1fh ago — holding import reminder", hours_ago)
            return []

    count = (
        db.query(func.count(Transaction.id))
        .filter(
            Transaction.user_id  == user_id,
            Transaction.source   == "csv_import",
            Transaction.reviewed == False,
        )
        .scalar()
    ) or 0

    if count == 0:
        return []

    key = f"import:{today.isoformat()}"
    if _already_fired(user_id, "import_reminder", key, db):
        return []

    return [_make_alert(
        user_id     = user_id,
        type_       = "import_reminder",
        title       = "Transactions Need Review",
        body        = (
            f"You have {count} transaction{'s' if count != 1 else ''} "
            "from your last import that still need review."
        ),
        source      = "scheduler",
        entity_type = "transaction",
        entity_id   = key,
    )]


def _check_balance_reminder(
    user_id: str,
    today: date,
    db: Session,
) -> list[Alert]:
    """
    Fire once per month on the user's chosen balance_reminder_day to prompt
    them to check their actual bank balance and update it in Settings.

    The reminder is skipped if:
      - The user hasn't set a reminder day (balance_reminder_day is None)
      - Today isn't the configured day of the month
      - The reminder already fired this month (deduplication via entity_id)
    """
    from .models import Preferences
    prefs_row = db.query(Preferences).filter(Preferences.user_id == user_id).first()

    if not prefs_row or prefs_row.balance_reminder_day is None:
        return []

    if today.day != prefs_row.balance_reminder_day:
        return []

    # Deduplicate per calendar month — key includes year+month
    key = f"balance_reminder:{today.year}-{today.month:02d}"
    if _already_fired(user_id, "balance_reminder", key, db):
        return []

    # Build a helpful body that mentions how long ago the balance was last set
    if prefs_row.bank_balance_date:
        days_ago = (today - prefs_row.bank_balance_date).days
        if days_ago == 0:
            since_str = "updated today"
        elif days_ago == 1:
            since_str = "last updated yesterday"
        else:
            since_str = f"last updated {days_ago} days ago"
        body = (
            f"Time to check your bank balance — it was {since_str}. "
            "Head to Settings → Bank Balance to update it and see if anything looks off."
        )
    else:
        body = (
            "Time to check your bank balance. "
            "Head to Settings → Bank Balance to enter your current balance "
            "and spot any transactions you may have missed."
        )

    return [_make_alert(
        user_id     = user_id,
        type_       = "balance_reminder",
        title       = "Balance Check Reminder",
        body        = body,
        source      = "scheduler",
        entity_type = "preferences",
        entity_id   = key,
    )]


# ─────────────────────────────────────────────────────────────────────────────
# Digest assembler
# ─────────────────────────────────────────────────────────────────────────────

def assemble_digest(user_id: str, today: date, db: Session) -> list[Alert]:
    """
    Collect all Tier 2 alerts (and the goal_reached Tier 1 special case)
    that have not yet been sent in a digest.  Marks them with today's date.
    Returns the list so alert_scheduler can format and send the message.
    """
    pending = (
        db.query(Alert)
        .filter(
            Alert.user_id     == user_id,
            Alert.digest_date == None,
            Alert.tier.in_([2]),
        )
        .all()
    )
    # Also pick up goal_reached (Tier 1 but queued to digest)
    goal_alerts = (
        db.query(Alert)
        .filter(
            Alert.user_id     == user_id,
            Alert.type        == "goal_reached",
            Alert.digest_date == None,
        )
        .all()
    )
    all_pending = pending + goal_alerts

    if all_pending:
        for a in all_pending:
            a.digest_date = today
        db.commit()

    return all_pending


# ─────────────────────────────────────────────────────────────────────────────
# Helpers
# ─────────────────────────────────────────────────────────────────────────────

def _get_or_create_prefs(user_id: str, db: Session) -> AlertPreferences:
    prefs = db.query(AlertPreferences).filter(AlertPreferences.user_id == user_id).first()
    if not prefs:
        prefs = AlertPreferences(user_id=user_id)
        db.add(prefs)
        db.commit()
        db.refresh(prefs)
    return prefs


def _already_fired(user_id: str, type_: str, entity_id: str, db: Session) -> bool:
    """
    Returns True if an alert of this type for this entity_id already exists.
    Prevents firing the same alert twice for the same event.
    """
    exists = (
        db.query(Alert.id)
        .filter(
            Alert.user_id    == user_id,
            Alert.type       == type_,
            Alert.entity_id  == entity_id,
        )
        .first()
    )
    return exists is not None


def _make_alert(
    *,
    user_id: str,
    type_: str,
    title: str,
    body: str,
    source: str,
    entity_type: Optional[str],
    entity_id: Optional[str],
) -> Alert:
    meta = _ALERT_META.get(type_, {"tier": 3, "severity": "info"})
    return Alert(
        user_id     = user_id,
        type        = type_,
        tier        = meta["tier"],
        title       = title,
        body        = body,
        severity    = meta["severity"],
        entity_type = entity_type,
        entity_id   = entity_id,
        source      = source,
    )


def _fmt(amount: Optional[Decimal]) -> str:
    if amount is None:
        return "$0.00"
    return f"${amount:,.2f}"


def _estimate_spendable_balance(user_id: str, db: Session) -> Optional[Decimal]:
    """
    Running (carry-over aware) balance estimate.

    Sums ALL non-draft income ever recorded, then subtracts ALL non-draft
    expenses and savings up to today.  This correctly reflects money carried
    over from previous months — if January had a £500 surplus that surplus
    is included in February's spendable balance.

    Returns None if the user has no income records at all (new account).
    """
    today = date.today()

    total_income = (
        db.query(func.sum(Transaction.amount))
        .filter(
            Transaction.user_id  == user_id,
            Transaction.type     == "income",
            Transaction.is_draft == False,
            Transaction.date     <= today,
        )
        .scalar()
    ) or Decimal("0")

    if total_income == 0:
        return None

    total_outflow = (
        db.query(func.sum(Transaction.amount))
        .filter(
            Transaction.user_id  == user_id,
            Transaction.type.in_(["expense", "savings"]),
            Transaction.is_draft == False,
            Transaction.date     <= today,
        )
        .scalar()
    ) or Decimal("0")

    return total_income - total_outflow


def _dispatch_immediate(alert: Alert, prefs: AlertPreferences) -> None:
    """
    Send an external notification for a Tier 1 immediate alert.
    Stubs out gracefully until Step 9 (notifications.py) is wired in.
    """
    if not _NOTIF_AVAILABLE:
        return

    message = f"{alert.title}\n{alert.body}"

    if prefs.telegram_enabled and prefs.telegram_chat_id:
        try:
            _notif.send_telegram(prefs.telegram_chat_id, message)
            alert.fired_immediate = True
        except Exception as exc:
            log.warning("[alert_engine] Telegram dispatch failed: %s", exc)

    if prefs.pwa_push_enabled and prefs.pwa_push_subscription:
        try:
            _notif.send_push(
                prefs.pwa_push_subscription,
                title = alert.title,
                body  = alert.body,
            )
            alert.fired_immediate = True
        except Exception as exc:
            log.warning("[alert_engine] PWA push dispatch failed: %s", exc)


def _serialize(alert: Alert) -> dict:
    return {
        "id":             str(alert.id),
        "type":           alert.type,
        "tier":           alert.tier,
        "title":          alert.title,
        "body":           alert.body,
        "severity":       alert.severity,
        "entity_type":    alert.entity_type,
        "entity_id":      alert.entity_id,
        "source":         alert.source,
        "created_at":     alert.created_at.isoformat() if alert.created_at else None,
        "read_at":        alert.read_at.isoformat() if alert.read_at else None,
        "fired_immediate": alert.fired_immediate,
    }
