"""
backend/app/routers/budget.py
─────────────────────────────────────────────────────────────────────────────
AUTH UPDATE
  Categories query now returns:
    system rows  (user_id IS NULL)  — visible to every user
    user rows    (user_id = caller) — visible only to that user

  Actuals query filters transactions by user_id.
─────────────────────────────────────────────────────────────────────────────
"""

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import or_
from sqlalchemy.orm import Session
from sqlalchemy import func
from ..database import get_db
from ..models import Category, Transaction
from ..dependencies import get_current_user
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
    current_user: str = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Returns categories visible to the caller.  Priority rules:
      1. User-specific rows (user_id == current_user) take precedence.
      2. System rows (user_id IS NULL) fill in any (name, kind) pair the user
         has not yet overridden — they are NOT returned when a user row exists
         for the same (name, kind) combination.
    This prevents duplicate rows and ensures planned amounts are per-user.
    """
    user_rows = (
        db.query(Category)
        .filter(
            Category.user_id == current_user,
            Category.kind.in_(["expense", "income", "savings"]),
        )
        .all()
    )
    overridden = {(r.name, r.kind) for r in user_rows}

    system_rows = (
        db.query(Category)
        .filter(
            Category.user_id.is_(None),
            Category.kind.in_(["expense", "income", "savings"]),
        )
        .all()
    )
    # Only include system rows that the user has not overridden
    visible_system = [r for r in system_rows if (r.name, r.kind) not in overridden]

    all_rows = user_rows + visible_system

    if kind and kind in ("expense", "income", "savings"):
        all_rows = [r for r in all_rows if r.kind == kind]

    all_rows.sort(key=lambda r: (r.sort_order, r.name))
    return [_serialize_cat(r) for r in all_rows]


@router.put("/categories")
def update_budget_categories(
    data: BulkUpdateRequest,
    current_user: str = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Bulk update planned amounts — always writes to the caller's own rows.
    System rows (user_id IS NULL) are NEVER mutated; instead, a user-specific
    override row is created on first save so each user has isolated budget data.
    """
    import uuid as _uuid

    for i, cat_in in enumerate(data.categories):
        kind = cat_in.kind or "expense"

        # 1. Look for an existing user-specific row
        cat = db.query(Category).filter(
            Category.name == cat_in.name,
            Category.kind == kind,
            Category.user_id == current_user,
        ).first()

        if cat:
            # Update the user's own row
            cat.planned_amount = cat_in.planned
            cat.color          = cat_in.color
            cat.sort_order     = i
        else:
            # No user row yet — find the system template (if any) to inherit
            # color and system flag, then create a user-specific override.
            sys_cat = db.query(Category).filter(
                Category.name == cat_in.name,
                Category.kind == kind,
                Category.user_id.is_(None),
            ).first()

            new_cat = Category(
                id             = _uuid.uuid4(),
                user_id        = current_user,
                name           = cat_in.name,
                kind           = kind,
                color          = cat_in.color if cat_in.color else (sys_cat.color if sys_cat else "#475569"),
                planned_amount = cat_in.planned,
                sort_order     = i,
                system         = False,
            )
            db.add(new_cat)

    db.commit()

    # Return the same merged view as GET /categories
    return get_budget_categories(kind=None, current_user=current_user, db=db)


@router.get("/actuals")
def get_budget_actuals(
    period: str = Query("this_month"),
    kind:   Optional[str] = Query(None),
    current_user: str = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if period not in ("this_month", "last_month", "last_3_months"):
        raise HTTPException(status_code=400, detail=f"Invalid period '{period}'.")

    date_from, date_to = _period_bounds(period)

    # Build the aggregation query — sum amounts per category+type for this user
    q = (
        db.query(
            Transaction.category,
            Transaction.type,
            func.sum(Transaction.amount).label("spent"),
        )
        .filter(
            Transaction.user_id == current_user,
            Transaction.date    >= date_from,
            Transaction.date    <= date_to,
            Transaction.category.isnot(None),
            Transaction.type.isnot(None),
        )
    )

    # Optional kind filter — map kind → transaction type(s)
    # "expense" kind → expense type, "income" kind → income type,
    # "savings" kind → savings type
    if kind and kind in ("expense", "income", "savings"):
        q = q.filter(Transaction.type == kind)

    rows = (
        q.group_by(Transaction.category, Transaction.type)
         .all()
    )

    return [
        {
            "category": row.category,
            "type":     row.type,
            "spent":    float(row.spent or 0),
        }
        for row in rows
    ]