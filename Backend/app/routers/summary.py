"""
backend/app/routers/summary.py — AUTH UPDATE
All transaction queries now filter by current_user.
"""

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from sqlalchemy import func
from datetime import date, timedelta
from typing import List
import calendar

from ..database import get_db
from ..models import Transaction
from ..dependencies import get_current_user

router = APIRouter(tags=["summary"])

VALID_PERIODS = {"this_month", "last_month", "last_3_months"}


def _period_bounds(period: str):
    today = date.today()
    if period == "this_month":
        return today.replace(day=1), today
    if period == "last_month":
        first_this = today.replace(day=1)
        end = first_this - timedelta(days=1)
        return end.replace(day=1), end
    if period == "last_3_months":
        month = today.month - 2
        year  = today.year
        if month <= 0:
            month += 12
            year  -= 1
        return date(year, month, 1), today
    return today.replace(day=1), today


def _month_range(period: str) -> List[tuple]:
    today = date.today()
    if period == "this_month":
        return [(today.year, today.month)]
    if period == "last_month":
        first_this = today.replace(day=1)
        prev = first_this - timedelta(days=1)
        return [(prev.year, prev.month)]
    if period == "last_3_months":
        months = []
        for offset in range(2, -1, -1):
            m = today.month - offset
            y = today.year
            if m <= 0:
                m += 12
                y -= 1
            months.append((y, m))
        return months
    return [(today.year, today.month)]


def _month_label(year: int, month: int) -> str:
    return date(year, month, 1).strftime("%b")


def _validate_period(period: str):
    if period not in VALID_PERIODS:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid period '{period}'. Must be one of: {', '.join(sorted(VALID_PERIODS))}",
        )


# ── Query helpers (optimised) ─────────────────────────────────────────────────
#
# OLD approach: one SELECT per transaction type  → ~10 round-trips per /summary
# NEW approach: GROUP BY type in a single SELECT → 4 round-trips per /summary
#   _totals_by_type  — sums for a date range  (income / expense / savings)
#   _opening_totals  — sums for everything *before* a date (carry-over calc)
#   _net_from_totals — collapse a totals dict into a signed net balance


def _totals_by_type(db: Session, user_id: str, start: date, end: date) -> dict:
    """One query → {type: float} for income, expense, savings in [start, end]."""
    rows = (
        db.query(Transaction.type, func.sum(Transaction.amount))
        .filter(
            Transaction.user_id == user_id,
            Transaction.date    >= start,
            Transaction.date    <= end,
        )
        .group_by(Transaction.type)
        .all()
    )
    return {t: float(v or 0) for t, v in rows}


def _opening_totals(db: Session, user_id: str, before_date: date) -> dict:
    """One query → {type: float} for all transactions strictly before before_date."""
    rows = (
        db.query(Transaction.type, func.sum(Transaction.amount))
        .filter(
            Transaction.user_id == user_id,
            Transaction.date    <  before_date,
        )
        .group_by(Transaction.type)
        .all()
    )
    return {t: float(v or 0) for t, v in rows}


def _net_from_totals(totals: dict) -> float:
    """income − expense − savings from a totals dict."""
    return (
        totals.get("income",  0.0)
        - totals.get("expense", 0.0)
        - totals.get("savings", 0.0)
    )


# ── Legacy per-month helpers (used by /cashflow only) ─────────────────────────

def _total_for_month(db: Session, user_id: str, tx_type: str, year: int, month: int) -> float:
    start    = date(year, month, 1)
    last_day = calendar.monthrange(year, month)[1]
    end      = date(year, month, last_day)
    rows = (
        db.query(func.sum(Transaction.amount))
        .filter(
            Transaction.user_id == user_id,
            Transaction.type    == tx_type,
            Transaction.date    >= start,
            Transaction.date    <= end,
        )
        .scalar()
    )
    return float(rows or 0)


def _total_types_for_month(db: Session, user_id: str, tx_types: list, year: int, month: int) -> float:
    start    = date(year, month, 1)
    last_day = calendar.monthrange(year, month)[1]
    end      = date(year, month, last_day)
    rows = (
        db.query(func.sum(Transaction.amount))
        .filter(
            Transaction.user_id == user_id,
            Transaction.type.in_(tx_types),
            Transaction.date    >= start,
            Transaction.date    <= end,
        )
        .scalar()
    )
    return float(rows or 0)


@router.get("/summary")
def get_summary(
    period: str = Query("this_month"),
    current_user: str = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    _validate_period(period)

    start, end = _period_bounds(period)

    # ── 4 queries total (was 10) ───────────────────────────────────────────────
    span_days  = (end - start).days + 1
    prev_end   = start - timedelta(days=1)
    prev_start = prev_end - timedelta(days=span_days - 1)

    cur_totals  = _totals_by_type(db, current_user, start,      end)
    prev_totals = _totals_by_type(db, current_user, prev_start, prev_end)
    open_totals = _opening_totals(db, current_user, start)
    prev_open_totals = _opening_totals(db, current_user, prev_start)

    income   = cur_totals.get("income",  0.0)
    expenses = cur_totals.get("expense", 0.0)
    savings  = cur_totals.get("savings", 0.0)

    net_balance  = income - expenses - savings
    # liquid_net: cash flow this period excluding savings contributions.
    # Savings are still YOUR money (in a goal), so this separates "spent"
    # from "earmarked for a goal" — prevents saving from looking like losing.
    liquid_net   = income - expenses
    # savings_rate: % of income deliberately directed to savings goals.
    # Old formula (income-expenses)/income measured "unspent income", not
    # intentional saving. New formula counts only savings-type transactions.
    savings_rate = round((savings / income * 100), 1) if income > 0 else 0.0

    # ── Carry-over balances ────────────────────────────────────────────────────
    opening_balance = _net_from_totals(open_totals)
    closing_balance = opening_balance + net_balance

    prev_income   = prev_totals.get("income",  0.0)
    prev_expenses = prev_totals.get("expense", 0.0)
    prev_savings  = prev_totals.get("savings", 0.0)
    prev_net      = prev_income - prev_expenses - prev_savings
    prev_rate     = round((prev_savings / prev_income * 100), 1) if prev_income > 0 else 0.0

    prev_opening = _net_from_totals(prev_open_totals)
    prev_closing = prev_opening + prev_net


    def _delta(current: float, previous: float) -> dict:
        if previous == 0:
            return {"dir": "up", "pct": "0.0"}
        change = ((current - previous) / previous) * 100
        return {"dir": "up" if change >= 0 else "down", "pct": str(round(abs(change), 1))}

    current_opening_vs_prev = _delta(opening_balance, prev_opening)

    return {
        "income":           round(income,          2),
        "expenses":         round(expenses,        2),
        "savings":          round(savings,         2),
        "net_balance":      round(net_balance,     2),
        # liquid_net = income − expenses (savings excluded).
        # Use this on the balance card so saving money doesn't look like spending.
        "liquid_net":       round(liquid_net,      2),
        "opening_balance":  round(opening_balance, 2),
        "closing_balance":  round(closing_balance, 2),
        "savings_rate":     savings_rate,
        "income_delta":     _delta(income,          prev_income),
        "expenses_delta":   _delta(expenses,        prev_expenses),
        "net_delta":        _delta(net_balance,     prev_net),
        "savings_delta":    _delta(savings_rate,    prev_rate),
        "closing_delta":    _delta(closing_balance, prev_closing),
        "opening_delta":    current_opening_vs_prev,
    }


def _week_ranges_for_month(year: int, month: int) -> list:
    """
    Returns (label, start_date, end_date) tuples for the 4 weeks of a month.
    Week 1: days 1–7, Week 2: 8–14, Week 3: 15–21, Week 4: 22–end.
    A line chart with 4 points renders cleanly instead of the single-dot problem.
    """
    last_day = calendar.monthrange(year, month)[1]
    week_starts = [1,  8, 15, 22]
    week_ends   = [7, 14, 21, last_day]
    labels      = ["Week 1", "Week 2", "Week 3", "Week 4"]
    result = []
    for label, s, e in zip(labels, week_starts, week_ends):
        if s <= last_day:
            result.append((label, date(year, month, s), date(year, month, min(e, last_day))))
    return result


@router.get("/cashflow")
def get_cashflow(
    period: str = Query("this_month"),
    current_user: str = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Returns cash-flow labels + income/expense arrays for the requested period.

    Single-month periods (this_month, last_month) → 4 weekly buckets so the
    line chart has enough points to draw a visible line.
    Multi-month period (last_3_months)            → 1 bucket per month.
    """
    _validate_period(period)

    labels   = []
    income   = []
    expenses = []

    if period in ("this_month", "last_month"):
        # Weekly breakdown — gives 4 data points and makes the chart readable
        # Use _totals_by_type (1 query per week) instead of 2 separate queries.
        months = _month_range(period)
        year, month = months[0]
        for label, week_start, week_end in _week_ranges_for_month(year, month):
            week_totals = _totals_by_type(db, current_user, week_start, week_end)
            labels.append(label)
            income.append(round(week_totals.get("income", 0.0), 2))
            outflow = week_totals.get("expense", 0.0) + week_totals.get("savings", 0.0)
            expenses.append(round(outflow, 2))
    else:
        # Monthly breakdown for last_3_months
        for year, month in _month_range(period):
            labels.append(_month_label(year, month))
            income.append(round(_total_for_month(db, current_user, "income", year, month), 2))
            outflow = _total_types_for_month(db, current_user, ["expense", "savings"], year, month)
            expenses.append(round(outflow, 2))

    return {"labels": labels, "income": income, "expenses": expenses}


@router.get("/expenses/breakdown")
def get_expense_breakdown(
    period: str = Query("this_month"),
    current_user: str = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    _validate_period(period)

    start, end = _period_bounds(period)

    rows = (
        db.query(
            Transaction.category,
            func.sum(Transaction.amount).label("total"),
        )
        .filter(
            Transaction.user_id == current_user,
            Transaction.type.in_(["expense", "savings"]),
            Transaction.date >= start,
            Transaction.date <= end,
        )
        .group_by(Transaction.category)
        .order_by(func.sum(Transaction.amount).desc())
        .all()
    )

    if not rows:
        return {"labels": [], "values": [], "colors": []}

    from ..models import Category
    from sqlalchemy import or_
    cat_colors = {
        c.name: c.color
        for c in db.query(Category).filter(
            or_(Category.user_id == current_user, Category.user_id.is_(None))
        ).all()
    }

    labels = []
    values = []
    colors = []

    for row in rows:
        labels.append(row.category)
        values.append(round(float(row.total), 2))
        colors.append(cat_colors.get(row.category, "#475569"))
    return {"labels": labels, "values": values, "colors": colors}
