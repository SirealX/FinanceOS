from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from ..database import get_db
from ..models import Category, Debt, BudgetCategory, Transaction
from ..dependencies import get_current_user
from pydantic import BaseModel
from typing import Optional
from datetime import date as DateType
import uuid

router = APIRouter(prefix="/debts", tags=["debts"])


# ─────────────────────────────────────────────────────────────────────────────
# Issue #11 — Keep "Debt Payments" budget category in sync with debt minimums
# ─────────────────────────────────────────────────────────────────────────────

_DEBT_CATEGORY_NAME  = "Debt Payments"
_DEBT_CATEGORY_COLOR = "#f59e0b"   # amber — distinct from expense red


def sync_debt_minimums_to_budget(user_id: str, db: Session) -> None:
    """
    Recalculate the total minimum payments across all active debts and write
    that amount into the user's 'Debt Payments' budget Category row.

    - Creates the category if it doesn't exist yet.
    - Sets planned_amount = 0 when all debts are paid off (keeps the row so
      the user's sort_order / color preferences are preserved).
    - Called automatically on every debt create / update / delete so the
      budget is always current without manual intervention.
    """
    total_min = (
        db.query(Debt)
        .filter(Debt.user_id == user_id, Debt.balance > 0)
        .with_entities(Debt.min_payment)
        .all()
    )
    planned = sum(float(r.min_payment or 0) for r in total_min)

    cat = db.query(Category).filter(
        Category.user_id == user_id,
        Category.name    == _DEBT_CATEGORY_NAME,
        Category.kind    == "expense",
    ).first()

    if cat:
        cat.planned_amount = planned
    else:
        cat = Category(
            id             = uuid.uuid4(),
            user_id        = user_id,
            name           = _DEBT_CATEGORY_NAME,
            kind           = "expense",
            color          = _DEBT_CATEGORY_COLOR,
            planned_amount = planned,
            sort_order     = 999,   # appears last; user can reorder
            system         = False,
            is_active      = True,
        )
        db.add(cat)

    db.flush()


class DebtCreate(BaseModel):
    name: str
    balance: float
    original_balance: Optional[float] = None  # defaults to balance if omitted
    interest_rate: float
    min_payment: float
    priority_rank: Optional[int] = None
    due_day: Optional[int] = None             # #21 — day of month payment is due


class DebtUpdate(BaseModel):
    name: Optional[str] = None
    balance: Optional[float] = None
    original_balance: Optional[float] = None
    interest_rate: Optional[float] = None
    min_payment: Optional[float] = None
    priority_rank: Optional[int] = None
    due_day: Optional[int] = None             # #21


class DebtPaymentCreate(BaseModel):
    amount: float
    payment_method: str = "Bank Transfer"
    payment_date: Optional[DateType] = None


@router.get("/")
def get_debts(
    current_user: str = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return db.query(Debt).filter(Debt.user_id == current_user).all()


@router.post("/", status_code=201)
def create_debt(
    data: DebtCreate,
    current_user: str = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    debt = Debt(
        user_id=current_user,
        name=data.name,
        balance=data.balance,
        original_balance=data.original_balance or data.balance,
        interest_rate=data.interest_rate,
        min_payment=data.min_payment,
        priority_rank=data.priority_rank,
        due_day=data.due_day,
    )
    db.add(debt)
    db.flush()
    sync_debt_minimums_to_budget(current_user, db)  # #11
    db.commit()
    db.refresh(debt)
    return debt


@router.put("/{debt_id}")
def update_debt(
    debt_id: str,
    data: DebtUpdate,
    current_user: str = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    try:
        parsed_id = uuid.UUID(debt_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid ID format")

    # Ownership check
    debt = db.query(Debt).filter(
        Debt.id == parsed_id,
        Debt.user_id == current_user,
    ).first()
    if not debt:
        raise HTTPException(status_code=404, detail="Debt not found")

    for key, value in data.dict(exclude_unset=True).items():
        setattr(debt, key, value)

    sync_debt_minimums_to_budget(current_user, db)  # #11
    db.commit()
    db.refresh(debt)
    return debt


@router.post("/{debt_id}/pay", status_code=201)
def record_debt_payment(
    debt_id: str,
    data: DebtPaymentCreate,
    current_user: str = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    try:
        parsed_id = uuid.UUID(debt_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid ID format")

    # Ownership check
    debt = db.query(Debt).filter(
        Debt.id == parsed_id,
        Debt.user_id == current_user,
    ).first()
    if not debt:
        raise HTTPException(status_code=404, detail="Debt not found")

    payment_date = data.payment_date or DateType.today()

    hub = BudgetCategory(
        user_id=current_user,
        transaction_id=None,
        transaction_name=f"Debt: {debt.name}",
        transaction_payment_method=data.payment_method,
        categories_name="Debt Payments",
        type=f"Debt: {debt.name}",
        amount=data.amount,
        date=payment_date,
    )
    db.add(hub)
    db.flush()

    tx = Transaction(
        user_id=current_user,
        date=payment_date,
        description=f"Debt: {debt.name}",
        category="Debt Payments",
        type="expense",
        amount=data.amount,
        payment_method=data.payment_method,
        source="manual",
        is_draft=False,
        budget_category_id=hub.id,
    )
    db.add(tx)
    db.flush()

    hub.transaction_id = tx.id
    debt.balance = max(0.0, float(debt.balance) - data.amount)

    sync_debt_minimums_to_budget(current_user, db)  # #11 — balance changed
    db.commit()
    db.refresh(debt)
    return debt


@router.delete("/{debt_id}")
def delete_debt(
    debt_id: str,
    current_user: str = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    try:
        parsed_id = uuid.UUID(debt_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid ID format")

    # Ownership check
    debt = db.query(Debt).filter(
        Debt.id == parsed_id,
        Debt.user_id == current_user,
    ).first()
    if not debt:
        raise HTTPException(status_code=404, detail="Debt not found")

    db.delete(debt)
    db.flush()
    sync_debt_minimums_to_budget(current_user, db)  # #11 — debt removed
    db.commit()
    return {"message": "Debt deleted"}