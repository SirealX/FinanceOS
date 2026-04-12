from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from ..database import get_db
from ..models import Debt, BudgetCategory, Transaction
from pydantic import BaseModel
from typing import Optional
from datetime import date as DateType
import uuid

router = APIRouter(prefix="/debts", tags=["debts"])


class DebtCreate(BaseModel):
    name: str
    balance: float
    interest_rate: float
    min_payment: float
    priority_rank: Optional[int] = None


class DebtUpdate(BaseModel):
    name: Optional[str] = None
    balance: Optional[float] = None
    interest_rate: Optional[float] = None
    min_payment: Optional[float] = None
    priority_rank: Optional[int] = None


class DebtPaymentCreate(BaseModel):
    amount: float
    payment_method: str = "Bank Transfer"
    payment_date: Optional[DateType] = None


@router.get("/")
def get_debts(db: Session = Depends(get_db)):
    return db.query(Debt).all()


@router.post("/", status_code=201)
def create_debt(data: DebtCreate, db: Session = Depends(get_db)):
    debt = Debt(
        name=data.name,
        balance=data.balance,
        interest_rate=data.interest_rate,
        min_payment=data.min_payment,
        priority_rank=data.priority_rank,
    )
    db.add(debt)
    db.commit()
    db.refresh(debt)
    return debt


@router.put("/{debt_id}")
def update_debt(debt_id: str, data: DebtUpdate, db: Session = Depends(get_db)):
    try:
        parsed_id = uuid.UUID(debt_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid ID format")

    debt = db.query(Debt).filter(Debt.id == parsed_id).first()
    if not debt:
        raise HTTPException(status_code=404, detail="Debt not found")

    for key, value in data.dict(exclude_unset=True).items():
        setattr(debt, key, value)

    db.commit()
    db.refresh(debt)
    return debt


@router.post("/{debt_id}/pay", status_code=201)
def record_debt_payment(
    debt_id: str,
    data: DebtPaymentCreate,
    db: Session = Depends(get_db),
):
    try:
        parsed_id = uuid.UUID(debt_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid ID format")

    debt = db.query(Debt).filter(Debt.id == parsed_id).first()
    if not debt:
        raise HTTPException(status_code=404, detail="Debt not found")

    payment_date = data.payment_date or DateType.today()

    # ── Create backbone row first ─────────────────────────────────────────────
    hub = BudgetCategory(
        transaction_id=None,
        transaction_name=f"Debt: {debt.name}",
        transaction_payment_method=data.payment_method,
        categories_name="Debt Payments",   # soft ref to categories.name
        type=f"Debt: {debt.name}",
        amount=data.amount,
        date=payment_date,
    )
    db.add(hub)
    db.flush()

    # ── Create transaction linked to backbone ─────────────────────────────────
    tx = Transaction(
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

    # ── Reduce debt balance ───────────────────────────────────────────────────
    debt.balance = max(0.0, float(debt.balance) - data.amount)

    db.commit()
    db.refresh(debt)
    return debt


@router.delete("/{debt_id}")
def delete_debt(debt_id: str, db: Session = Depends(get_db)):
    try:
        parsed_id = uuid.UUID(debt_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid ID format")

    debt = db.query(Debt).filter(Debt.id == parsed_id).first()
    if not debt:
        raise HTTPException(status_code=404, detail="Debt not found")

    db.delete(debt)
    db.commit()
    return {"message": "Debt deleted"}