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
    "bill_due":              {"tier": 1, "severity": "warning"},
    "large_transaction":     {"tier": 1, "severity": "warning"},
    "low_balance":           {"tier": 1, "severity": "critical"},
    "debt_due":              {"tier": 1, "severity": "warning"},
    "debt_overdue":          {"tier": 1, "severity": "critical"},
    "goal_reached":          {"tier": 1, "severity": "info"},
    "budget_exceeded":       {"tier": 2, "severity": "warning"},
    "spending_spike":        {"tier": 2, "severity": "warning"},
    "import_reminder":       {"tier": 2, "severity": "info"},
    "balance_reminder":      {"tier": 2, "severity": "info"},
    "near_limit":            {"tier": 3, "severity": "info"},
    "goal_behind_pace":      {"tier": 2, "severity": "warning"},
    "periodic_review":       {"tier": 2, "severity": "info"},
    # ── Debt restructure alerts ───────────────────────────────────────────────
    "cc_payment_due":        {"tier": 1, "severity": "warning"},
    "cc_interest_warning":   {"tier": 2, "severity": "info"},
    "bnpl_installment_due":  {"tier": 1, "severity": "warning"},
    "loan_paid_off":         {"tier": 1, "severity": "info"},
    "min_payment_warning":   {"tier": 2, "severity": "warning"},
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

    # ── Tier 1 — Savings goal behind pace (scheduler) ────────────────────────
    if source == "scheduler":
        new_alerts += _check_goal_behind_pace(user_id, today, db)

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

    # 2e. Periodic review nudge (scheduler)
    if source == "scheduler":
        new_alerts += _check_periodic_review(user_id, today, db)

    # ── Tier 1 — New debt alerts (scheduler) ─────────────────────────────────
    if source == "scheduler":
        new_alerts += _check_cc_payment_due(user_id, today, db)
        new_alerts += _check_bnpl_installment_due(user_id, today, db)
        new_alerts += _check_loan_paid_off(user_id, db)

    # ── Tier 2 — Debt advisory alerts (any source) ───────────────────────────
    new_alerts += _check_min_payment_warning(user_id, source, db)

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
                Transaction.type     == "debt_payment",   # BUG-01 fix: was "expense"
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
            Transaction.user_id  == user_id,
            Transaction.type     == "expense",
            Transaction.source   != "cc_charge",   # BUG-09 fix: exclude CC charges
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



def _check_goal_behind_pace(
    user_id: str,
    today: date,
    db: Session,
) -> list[Alert]:
    """
    Fire once per month per goal when a savings goal with a deadline is
    falling meaningfully behind its linear pace.

    Behind-pace definition:
      expected = target * (elapsed_days / total_days)
      gap      = expected - current_amount
      Fire if gap > 5% of target AND current < expected.

    Deduplicated per goal per calendar month so the user gets one
    reminder per month, not one per scheduler run.
    """
    month_key = today.strftime("%Y-%m")

    goals = (
        db.query(SavingsGoal)
        .filter(
            SavingsGoal.user_id       == user_id,
            SavingsGoal.deadline_date != None,
            SavingsGoal.target_amount >  0,
            SavingsGoal.current_amount < SavingsGoal.target_amount,
            SavingsGoal.deadline_date >= today,   # not already past deadline
        )
        .all()
    )

    result = []
    for goal in goals:
        total_days   = (goal.deadline_date - goal.created_at.date()
                        if hasattr(goal, "created_at") and goal.created_at
                        else (goal.deadline_date - today)).days
        if total_days <= 0:
            continue

        elapsed_days = (today - (goal.created_at.date()
                                 if hasattr(goal, "created_at") and goal.created_at
                                 else today)).days
        if elapsed_days <= 0:
            continue

        target  = float(goal.target_amount)
        current = float(goal.current_amount)
        expected = target * (elapsed_days / total_days)

        gap = expected - current
        if gap <= 0 or gap < target * 0.05:
            continue   # on track or only trivially behind

        key = f"behind:{goal.id}:{month_key}"
        if _already_fired(user_id, "goal_behind_pace", key, db):
            continue

        months_left = max(1, round((goal.deadline_date - today).days / 30.4))
        needed      = (target - current) / months_left
        pct_done    = int((current / target) * 100)

        result.append(_make_alert(
            user_id     = user_id,
            type_       = "goal_behind_pace",
            title       = f"Savings Goal Behind — {goal.goal_name}",
            body        = (
                f"{goal.goal_name} is {pct_done}% funded but should be "
                f"{int((expected / target) * 100)}% by now. "
                f"Save {_fmt(needed)} / month to still hit your deadline."
            ),
            source      = "scheduler",
            entity_type = "savings_goal",
            entity_id   = key,
        ))

    return result


def _check_periodic_review(
    user_id: str,
    today: date,
    db: Session,
) -> list[Alert]:
    """
    Fire a periodic financial review nudge on the schedule the user has chosen.

    Frequencies:
      monthly   — 1st of every month
      quarterly — 1st of Jan, Apr, Jul, Oct
      semester  — 1st of Jan, Jul

    Deduplicated by year+period so it fires exactly once per review window.
    The alert links to the budget screen for a full review.
    """
    prefs = db.query(AlertPreferences).filter(AlertPreferences.user_id == user_id).first()
    freq  = getattr(prefs, "periodic_review_freq", None) if prefs else None

    if not freq:
        return []

    # Decide whether today is a review day for the chosen frequency
    is_review_day = False
    period_label  = ""
    key           = ""   # BUG-18 fix: initialise before conditionals to avoid UnboundLocalError

    if freq == "monthly" and today.day == 1:
        import calendar
        month_name   = today.strftime("%B %Y")
        is_review_day = True
        period_label  = month_name
        key = f"review:monthly:{today.year}-{today.month:02d}"

    elif freq == "quarterly" and today.day == 1 and today.month in (1, 4, 7, 10):
        quarter_names = {1: "Q1", 4: "Q2", 7: "Q3", 10: "Q4"}
        is_review_day = True
        period_label  = f"{quarter_names[today.month]} {today.year}"
        key = f"review:quarterly:{today.year}-{today.month:02d}"

    elif freq == "semester" and today.day == 1 and today.month in (1, 7):
        semester_names = {1: "H1", 7: "H2"}
        is_review_day = True
        period_label  = f"{semester_names[today.month]} {today.year}"
        key = f"review:semester:{today.year}-{today.month:02d}"

    if not is_review_day:
        return []

    if _already_fired(user_id, "periodic_review", key, db):
        return []

    freq_labels = {"monthly": "monthly", "quarterly": "quarterly", "semester": "semester"}
    return [_make_alert(
        user_id     = user_id,
        type_       = "periodic_review",
        title       = f"Time for Your {freq_labels.get(freq, '')} Review",
        body        = (
            f"It's the start of {period_label}. Take a few minutes to review "
            "your budget, check savings progress, and plan your spending for the period ahead."
        ),
        source      = "scheduler",
        entity_type = "budget",
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
            Transaction.type.in_(["expense", "savings", "debt_payment"]),  # BUG-02 fix: include debt_payment
            Transaction.source   != "cc_charge",   # BUG-02 fix: exclude CC charges (not cash yet)
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


# ─────────────────────────────────────────────────────────────────────────────
# New debt alert rule checkers
# ─────────────────────────────────────────────────────────────────────────────

def _check_cc_payment_due(user_id: str, today: date, db: Session) -> list[Alert]:
    """
    Fire when the billing cycle closes within 7 days for any active credit card.
    Uses billing_cycle_end_day as the trigger day.
    """
    alerts: list[Alert] = []
    cc_debts = db.query(Debt).filter(
        Debt.user_id    == user_id,
        Debt.type       == "credit_card",
        Debt.is_paid_off == False,
        Debt.billing_cycle_end_day.isnot(None),
    ).all()

    for debt in cc_debts:
        end_day = debt.billing_cycle_end_day
        # Build the next billing cycle end date in the current or next month
        try:
            cycle_end = today.replace(day=end_day)
        except ValueError:
            import calendar
            cycle_end = today.replace(day=calendar.monthrange(today.year, today.month)[1])

        if cycle_end < today:
            # Already passed — look at next month
            from dateutil.relativedelta import relativedelta as _rdelta
            cycle_end = cycle_end + _rdelta(months=1)

        days_until = (cycle_end - today).days
        if 0 <= days_until <= 7:
            # BUG-03a fix: include month suffix so the alert re-fires each cycle
            entity_id = f"{debt.id}:{today.year}-{today.month:02d}"
            if not _already_fired(user_id, "cc_payment_due", entity_id, db):
                balance = Decimal(str(float(debt.balance or 0)))
                alerts.append(_make_alert(
                    user_id     = user_id,
                    type_       = "cc_payment_due",
                    title       = f"CC Payment Due — {debt.name}",
                    body        = (
                        f"Your {debt.name} billing cycle closes in {days_until} day(s). "
                        f"Current balance: {_fmt(balance)}."
                    ),
                    source      = "scheduler",
                    entity_type = "debt",
                    entity_id   = entity_id,
                ))

    return alerts


def _check_bnpl_installment_due(user_id: str, today: date, db: Session) -> list[Alert]:
    """
    Fire 3 days before the next BNPL installment, estimated from due_day.
    """
    alerts: list[Alert] = []
    bnpl_debts = db.query(Debt).filter(
        Debt.user_id    == user_id,
        Debt.type       == "bnpl",
        Debt.is_paid_off == False,
        Debt.due_day.isnot(None),
    ).all()

    for debt in bnpl_debts:
        try:
            next_due = today.replace(day=debt.due_day)
        except ValueError:
            continue

        if next_due < today:
            from dateutil.relativedelta import relativedelta as _rdelta
            next_due = next_due + _rdelta(months=1)

        days_until = (next_due - today).days
        if days_until == 3:
            # BUG-03b fix: include month suffix so the alert re-fires each cycle
            entity_id = f"{debt.id}:{today.year}-{today.month:02d}"
            if not _already_fired(user_id, "bnpl_installment_due", entity_id, db):
                amt = Decimal(str(float(debt.installment_amount or debt.min_payment or 0)))
                paid = debt.installments_paid or 0
                total = debt.total_installments or "?"
                alerts.append(_make_alert(
                    user_id     = user_id,
                    type_       = "bnpl_installment_due",
                    title       = f"BNPL Payment Due — {debt.name}",
                    body        = (
                        f"Installment {paid + 1}/{total} of {_fmt(amt)} is due in 3 days "
                        f"for {debt.name}."
                    ),
                    source      = "scheduler",
                    entity_type = "debt",
                    entity_id   = entity_id,
                ))

    return alerts


def _check_loan_paid_off(user_id: str, db: Session) -> list[Alert]:
    """
    Fire once when a loan or BNPL is paid off (balance = 0, is_paid_off = True).
    """
    alerts: list[Alert] = []
    paid_debts = db.query(Debt).filter(
        Debt.user_id    == user_id,
        Debt.is_paid_off == True,
        Debt.type.in_(["loan", "bnpl"]),
    ).all()

    for debt in paid_debts:
        entity_id = str(debt.id)
        if not _already_fired(user_id, "loan_paid_off", entity_id, db):
            alerts.append(_make_alert(
                user_id     = user_id,
                type_       = "loan_paid_off",
                title       = f"Paid Off — {debt.name}",
                body        = f"Congratulations! You've fully paid off {debt.name}.",
                source      = "scheduler",
                entity_type = "debt",
                entity_id   = entity_id,
            ))

    return alerts


def _check_min_payment_warning(user_id: str, source: str, db: Session) -> list[Alert]:
    """
    After a CC payment equal to min_payment, calculate the long-term interest
    cost and fire an advisory alert.
    Only fires once per billing cycle (de-duped by entity_id = debt.id).
    """
    alerts: list[Alert] = []
    cc_debts = db.query(Debt).filter(
        Debt.user_id    == user_id,
        Debt.type       == "credit_card",
        Debt.is_paid_off == False,
        Debt.min_payment > 0,
        Debt.interest_rate > 0,
    ).all()

    for debt in cc_debts:
        balance    = float(debt.balance or 0)
        min_pmt    = float(debt.min_payment or 0)
        annual_apr = float(debt.interest_rate or 0)

        if balance <= 0 or min_pmt <= 0:
            continue

        monthly_rate = annual_apr / 100 / 12
        if monthly_rate <= 0:
            continue

        # Estimate months to pay off at minimum payment
        # months ≈ -log(1 - balance*rate/min_pmt) / log(1 + rate)
        import math
        ratio = balance * monthly_rate / min_pmt
        if ratio >= 1:
            continue  # minimum payment doesn't cover interest — infinite loop

        try:
            months = -math.log(1 - ratio) / math.log(1 + monthly_rate)
        except (ValueError, ZeroDivisionError):
            continue

        total_paid   = min_pmt * months
        total_interest = max(0.0, total_paid - balance)

        entity_id = f"min_pmt_{debt.id}"
        if not _already_fired(user_id, "min_payment_warning", entity_id, db):
            alerts.append(_make_alert(
                user_id     = user_id,
                type_       = "min_payment_warning",
                title       = f"Minimum Payment Warning — {debt.name}",
                body        = (
                    f"Paying only the minimum on {debt.name} will cost "
                    f"~{_fmt(Decimal(str(round(total_interest, 2))))} in interest "
                    f"over {round(months)} months."
                ),
                source      = source,
                entity_type = "debt",
                entity_id   = entity_id,
            ))

    return alerts


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
