"""
backend/app/routers/recurring.py — Recurring Transaction Templates  (#22)
─────────────────────────────────────────────────────────────────────────────
Defines repeating transactions (salary, subscriptions, groceries, etc.).
The frontend shows upcoming recurrences as reminders and can auto-log them.

Endpoints
  GET    /recurring           → list all recurring templates
  POST   /recurring           → create a template
  PUT    /recurring/{id}      → update a template (amount, next_due, etc.)
  DELETE /recurring/{id}      → delete a template
  POST   /recurring/{id}/log  → log the current occurrence as a real transaction
                                and advance next_due by one frequency interval
"""

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from ..database import get_db
from ..models import RecurringTransaction, Transaction, Debt
from ..dependencies import get_current_user
from pydantic import BaseModel
from typing import Optional
from datetime import date as DateType
from dateutil.relativedelta import relativedelta
import uuid

router = APIRouter(prefix="/recurring", tags=["recurring"])

VALID_FREQUENCIES = {"daily", "weekly", "monthly", "yearly"}
VALID_TYPES       = {"income", "expense", "savings", "transfer", "debt_payment"}


class RecurringCreate(BaseModel):
    description: str
    amount: float
    category: Optional[str] = None
    type: str
    frequency: str
    next_due: DateType
    is_active: bool = True


class RecurringUpdate(BaseModel):
    description: Optional[str] = None
    amount: Optional[float] = None
    category: Optional[str] = None
    type: Optional[str] = None
    frequency: Optional[str] = None
    next_due: Optional[DateType] = None
    is_active: Optional[bool] = None


def _serialize(r: RecurringTransaction) -> dict:
    return {
        "id":          str(r.id),
        "description": r.description,
        "amount":      float(r.amount),
        "category":    r.category,
        "type":        r.type,
        "frequency":   r.frequency,
        "next_due":    r.next_due.isoformat() if r.next_due else None,
        "is_active":   r.is_active,
        "created_at":  r.created_at.isoformat() if r.created_at else None,
    }


def _advance_due(current_due: DateType, frequency: str) -> DateType:
    """Advance next_due by exactly one frequency interval."""
    if frequency == "daily":   return current_due + relativedelta(days=1)
    if frequency == "weekly":  return current_due + relativedelta(weeks=1)
    if frequency == "monthly": return current_due + relativedelta(months=1)
    if frequency == "yearly":  return current_due + relativedelta(years=1)
    return current_due


@router.get("/")
def get_recurring(
    current_user: str = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    rows = (
        db.query(RecurringTransaction)
        .filter(RecurringTransaction.user_id == current_user)
        .order_by(RecurringTransaction.next_due.asc())
        .all()
    )
    return [_serialize(r) for r in rows]


@router.post("/", status_code=201)
def create_recurring(
    data: RecurringCreate,
    current_user: str = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if data.frequency not in VALID_FREQUENCIES:
        raise HTTPException(status_code=400, detail=f"frequency must be one of: {', '.join(VALID_FREQUENCIES)}")
    if data.type not in VALID_TYPES:
        raise HTTPException(status_code=400, detail=f"type must be one of: {', '.join(VALID_TYPES)}")

    row = RecurringTransaction(
        user_id     = current_user,
        description = data.description.strip(),
        amount      = data.amount,
        category    = data.category,
        type        = data.type,
        frequency   = data.frequency,
        next_due    = data.next_due,
        is_active   = data.is_active,
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return _serialize(row)


@router.put("/{recurring_id}")
def update_recurring(
    recurring_id: str,
    data: RecurringUpdate,
    current_user: str = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    try:
        parsed_id = uuid.UUID(recurring_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid ID format")

    row = db.query(RecurringTransaction).filter(
        RecurringTransaction.id == parsed_id,
        RecurringTransaction.user_id == current_user,
    ).first()
    if not row:
        raise HTTPException(status_code=404, detail="Recurring template not found")

    for key, value in data.dict(exclude_unset=True).items():
        setattr(row, key, value)

    db.commit()
    db.refresh(row)
    return _serialize(row)


@router.post("/{recurring_id}/log", status_code=201)
def log_recurring(
    recurring_id: str,
    current_user: str = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Log the current occurrence as a real transaction, then advance next_due.
    Transfer-type recurrences are logged but excluded from income/expense totals.
    """
    try:
        parsed_id = uuid.UUID(recurring_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid ID format")

    row = db.query(RecurringTransaction).filter(
        RecurringTransaction.id == parsed_id,
        RecurringTransaction.user_id == current_user,
    ).first()
    if not row:
        raise HTTPException(status_code=404, detail="Recurring template not found")

    # Create the transaction.
    # savings and debt_payment types are excluded from the manual transaction
    # endpoint but are valid here — this router is the controlled creation path.
    tx = Transaction(
        user_id        = current_user,
        date           = row.next_due,
        description    = row.description,
        category       = row.category or "Other",
        type           = row.type,
        amount         = float(row.amount),
        payment_method = None,
        source         = "manual",
        is_draft       = False,
        reviewed       = True,
    )
    db.add(tx)
    db.flush()

    # If this is a debt_payment recurring, find the linked debt and decrement.
    if row.type == "debt_payment":
        debt = db.query(Debt).filter(
            Debt.recurring_transaction_id == row.id,
            Debt.user_id                  == current_user,
        ).first()
        if debt and not debt.is_paid_off:
            debt.balance = max(0.0, float(debt.balance) - float(row.amount))
            if float(debt.balance) == 0.0:
                debt.is_paid_off = True
                row.is_active    = False  # stop future recurrences
            # Re-sync budget category planned amount
            from .debts import sync_debt_minimums_to_budget
            sync_debt_minimums_to_budget(current_user, db)

    # Advance next_due
    row.next_due = _advance_due(row.next_due, row.frequency)

    db.commit()
    db.refresh(row)
    return {"transaction_id": str(tx.id), "next_due": row.next_due.isoformat()}


@router.delete("/{recurring_id}")
def delete_recurring(
    recurring_id: str,
    current_user: str = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    try:
        parsed_id = uuid.UUID(recurring_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid ID format")

    row = db.query(RecurringTransaction).filter(
        RecurringTransaction.id == parsed_id,
        RecurringTransaction.user_id == current_user,
    ).first()
    if not row:
        raise HTTPException(status_code=404, detail="Recurring template not found")

    db.delete(row)
    db.commit()
    return {"message": "Recurring template deleted"}
