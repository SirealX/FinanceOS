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


def _total(db: Session, user_id: str, tx_type: str, start: date, end: date) -> float:
    result = (
        db.query(func.sum(Transaction.amount))
        .filter(
            Transaction.user_id == user_id,
            Transaction.type == tx_type,
            Transaction.date >= start,
            Transaction.date <= end,
        )
        .scalar()
    )
    return float(result or 0)


def _total_types(db: Session, user_id: str, tx_types: list, start: date, end: date) -> float:
    result = (
        db.query(func.sum(Transaction.amount))
        .filter(
            Transaction.user_id == user_id,
            Transaction.type.in_(tx_types),
            Transaction.date >= start,
            Transaction.date <= end,
        )
        .scalar()
    )
    return float(result or 0)


def _total_for_month(db: Session, user_id: str, tx_type: str, year: int, month: int) -> float:
    start    = date(year, month, 1)
    last_day = calendar.monthrange(year, month)[1]
    end      = date(year, month, last_day)
    return _total(db, user_id, tx_type, start, end)


def _total_types_for_month(db: Session, user_id: str, tx_types: list, year: int, month: int) -> float:
    start    = date(year, month, 1)
    last_day = calendar.monthrange(year, month)[1]
    end      = date(year, month, last_day)
    return _total_types(db, user_id, tx_types, start, end)


@router.get("/summary")
def get_summary(
    period: str = Query("this_month"),
    current_user: str = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    _validate_period(period)

    start, end = _period_bounds(period)
    income   = _total(db, current_user, "income",  start, end)
    expenses = _total(db, current_user, "expense", start, end)
    savings  = _total(db, current_user, "savings", start, end)

    net_balance  = income - expenses - savings
    savings_rate = round(((income - expenses) / income * 100), 1) if income > 0 else 0.0

    span_days  = (end - start).days + 1
    prev_end   = start - timedelta(days=1)
    prev_start = prev_end - timedelta(days=span_days - 1)

    prev_income   = _total(db, current_user, "income",  prev_start, prev_end)
    prev_expenses = _total(db, current_user, "expense", prev_start, prev_end)
    prev_savings  = _total(db, current_user, "savings", prev_start, prev_end)
    prev_net      = prev_income - prev_expenses - prev_savings
    prev_rate     = round(((prev_income - prev_expenses) / prev_income * 100), 1) if prev_income > 0 else 0.0

    def _delta(current: float, previous: float) -> dict:
        if previous == 0:
            return {"dir": "up", "pct": "0.0"}
        change = ((current - previous) / previous) * 100
        return {"dir": "up" if change >= 0 else "down", "pct": str(round(abs(change), 1))}

    return {
        "income":         round(income,      2),
        "expenses":       round(expenses,    2),
        "savings":        round(savings,     2),
        "net_balance":    round(net_balance, 2),
        "savings_rate":   savings_rate,
        "income_delta":   _delta(income,       prev_income),
        "expenses_delta": _delta(expenses,     prev_expenses),
        "net_delta":      _delta(net_balance,  prev_net),
        "savings_delta":  _delta(savings_rate, prev_rate),
    }


@router.get("/cashflow")
def get_cashflow(
    period: str = Query("this_month"),
    current_user: str = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    _validate_period(period)

    months = _month_range(period)
    labels   = []
    income   = []
    expenses = []

    for year, month in months:
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