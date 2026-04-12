"""
backend/app/routers/budget.py
─────────────────────────────────────────────────────────────────────────────
Budget reads planned amounts from the categories table for all three kinds:
expense, income, and savings.

/budget/categories  → all three kinds with planned amounts and kind field
/budget/actuals     → actual spending/income/savings grouped by category
/budget/categories  PUT → bulk update planned amounts (expense + income + savings)
─────────────────────────────────────────────────────────────────────────────
"""

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from sqlalchemy import func
from ..database import get_db
from ..models import Category, Transaction
from pydantic import BaseModel
from datetime import date, timedelta
from typing import List, Optional

router = APIRouter(prefix="/budget", tags=["budget"])


# ── Pydantic schemas ──────────────────────────────────────────────────────────

class CategoryIn(BaseModel):
    name: str
    color: str
    planned: float
    sort_order: int = 0
    kind: Optional[str] = "expense"


class BulkUpdateRequest(BaseModel):
    categories: List[CategoryIn]


# ── Period helper ─────────────────────────────────────────────────────────────

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
        year = today.year
        if month <= 0:
            month += 12
            year -= 1
        return date(year, month, 1), today

    return today.replace(day=1), today


# ── Serializer ────────────────────────────────────────────────────────────────

def _serialize_cat(r: Category) -> dict:
    return {
        "id":         str(r.id),
        "name":       r.name,
        "color":      r.color,
        "kind":       r.kind,
        "planned":    float(r.planned_amount),
        "sort_order": r.sort_order,
    }


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.get("/categories")
def get_budget_categories(
    kind: Optional[str] = Query(None),
    db: Session = Depends(get_db),
):
    """
    Return all categories (expense + income + savings) with planned amounts.
    Optional ?kind= filter to narrow to one kind.
    """
    q = db.query(Category).filter(
        Category.kind.in_(["expense", "income", "savings"])
    )
    if kind and kind in ("expense", "income", "savings"):
        q = q.filter(Category.kind == kind)

    rows = q.order_by(Category.sort_order, Category.name).all()
    return [_serialize_cat(r) for r in rows]


@router.put("/categories")
def update_budget_categories(
    data: BulkUpdateRequest, db: Session = Depends(get_db)
):
    """
    Bulk update planned amounts. Handles all three kinds.
    """
    for i, cat_in in enumerate(data.categories):
        kind = cat_in.kind or "expense"
        cat = db.query(Category).filter(
            Category.name == cat_in.name,
            Category.kind == kind,
        ).first()
        if cat:
            cat.planned_amount = cat_in.planned
            cat.color          = cat_in.color
            cat.sort_order     = i

    db.commit()

    rows = (
        db.query(Category)
        .filter(Category.kind.in_(["expense", "income", "savings"]))
        .order_by(Category.sort_order, Category.name)
        .all()
    )
    return [_serialize_cat(r) for r in rows]


@router.get("/actuals")
def get_budget_actuals(
    period: str = Query("this_month"),
    kind:   Optional[str] = Query(None),
    db: Session = Depends(get_db),
):
    """
    Actual amounts per category for the given period.
    Returns all three types (expense, income, savings) unless ?kind= is set.

    expense + savings → summed as "spent"
    income            → summed as "earned"
    Both are returned under the same "spent" key so the frontend can compare
    against planned regardless of kind.
    """
    if period not in ("this_month", "last_month", "last_3_months"):
        raise HTTPException(
            status_code=400,
            detail="period must be one of: this_month, last_month, last_3_months",
        )

    start, end = _period_bounds(period)

    # Determine which transaction types to include
    if kind == "income":
        type_filter = ["income"]
    elif kind == "savings":
        type_filter = ["savings"]
    elif kind == "expense":
        type_filter = ["expense"]
    else:
        # All — include everything
        type_filter = ["expense", "income", "savings"]

    results = (
        db.query(
            Transaction.category,
            Transaction.type,
            func.sum(Transaction.amount).label("total"),
        )
        .filter(
            Transaction.type.in_(type_filter),
            Transaction.date >= start,
            Transaction.date <= end,
        )
        .group_by(Transaction.category, Transaction.type)
        .all()
    )

    return [
        {
            "category": row.category,
            "type":     row.type,
            "spent":    float(row.total),
        }
        for row in results
    ]


@router.post("/seed-missing")
def seed_missing_budget_categories(db: Session = Depends(get_db)):
    """
    Returns all budget-relevant categories. Safe to call multiple times.
    """
    cats = (
        db.query(Category)
        .filter(Category.kind.in_(["expense", "income", "savings"]))
        .all()
    )
    return {"synced": len(cats)}