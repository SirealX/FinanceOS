from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from ..database import get_db
from ..models import Transaction, BudgetCategory
from ..services.entity_sync import transaction_to_entity, reverse_transaction
from ..services.payment_utils import infer_payment_method
from ..dependencies import get_current_user
from pydantic import BaseModel
from datetime import date as DataType
from typing import Optional
import uuid

router = APIRouter(prefix="/transactions", tags=["transactions"])


class TransactionCreate(BaseModel):
    date: DataType
    description: str
    category: str
    type: str
    amount: float
    payment_method: Optional[str] = None


class TransactionUpdate(BaseModel):
    date: Optional[DataType] = None
    description: Optional[str] = None
    category: Optional[str] = None
    type: Optional[str] = None
    amount: Optional[float] = None
    payment_method: Optional[str] = None
    is_draft: Optional[bool] = None


@router.get("/drafts/count")
def get_draft_count(
    current_user: str = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    count = (
        db.query(Transaction)
        .filter(
            Transaction.user_id == current_user,
            Transaction.is_draft == True,
        )
        .count()
    )
    return {"count": count}


@router.get("/")
def get_transactions(
    category:  Optional[str]      = Query(None),
    type:      Optional[str]      = Query(None),
    is_draft:  Optional[bool]     = Query(None),
    date_from: Optional[DataType] = Query(None),
    date_to:   Optional[DataType] = Query(None),
    search:    Optional[str]      = Query(None),
    current_user: str = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    q = db.query(Transaction).filter(Transaction.user_id == current_user)

    if category:              q = q.filter(Transaction.category == category)
    if type:                  q = q.filter(Transaction.type == type)
    if is_draft is not None:  q = q.filter(Transaction.is_draft == is_draft)
    if date_from:             q = q.filter(Transaction.date >= date_from)
    if date_to:               q = q.filter(Transaction.date <= date_to)
    if search:                q = q.filter(Transaction.description.ilike(f"%{search}%"))

    txs = q.order_by(Transaction.date.desc()).all()

    result = []
    for tx in txs:
        row                       = {c.name: getattr(tx, c.name) for c in tx.__table__.columns}
        row["id"]                 = str(tx.id)
        row["budget_category_id"] = str(tx.budget_category_id) if tx.budget_category_id else None

        hub_type        = None
        category_locked = False
        type_locked     = False

        if tx.budget_category_id:
            hub = db.query(BudgetCategory).filter(
                BudgetCategory.id == tx.budget_category_id
            ).first()
            if hub:
                hub_type        = hub.type
                is_debt         = hub.type.startswith("Debt:")
                is_savings      = hub.type.startswith("Savings:")
                category_locked = is_debt or is_savings
                type_locked     = is_debt or is_savings

        row["hub_type"]        = hub_type
        row["category_locked"] = category_locked
        row["type_locked"]     = type_locked
        result.append(row)

    return result


ALLOWED_MANUAL_TYPES = {"income", "expense", "transfer"}

@router.post("/", status_code=201)
def create_transaction(
    data: TransactionCreate,
    current_user: str = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if data.type == "savings":
        raise HTTPException(
            status_code=400,
            detail="Savings transactions can only be created from the Savings tab.",
        )
    if data.type not in ALLOWED_MANUAL_TYPES:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid type '{data.type}'. Must be one of: {', '.join(ALLOWED_MANUAL_TYPES)}.",
        )
    tx = Transaction(**data.dict(), source="manual", user_id=current_user)
    db.add(tx)
    db.commit()
    db.refresh(tx)
    return tx


@router.put("/{transaction_id}")
def update_transaction(
    transaction_id: str,
    data: TransactionUpdate,
    current_user: str = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    try:
        parsed_id = uuid.UUID(transaction_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid ID format")

    # Ownership check — user can only edit their own transactions
    tx = db.query(Transaction).filter(
        Transaction.id == parsed_id,
        Transaction.user_id == current_user,
    ).first()
    if not tx:
        raise HTTPException(status_code=404, detail="Transaction not found")

    old_amount = float(tx.amount)

    for key, value in data.dict(exclude_unset=True).items():
        if key == "budget_category_id":
            continue
        if key in ("category", "type") and tx.budget_category_id:
            hub = db.query(BudgetCategory).filter(
                BudgetCategory.id == tx.budget_category_id
            ).first()
            if hub and (hub.type.startswith("Debt:") or hub.type.startswith("Savings:")):
                continue
        setattr(tx, key, value)

    if data.payment_method and data.payment_method.strip() and tx.is_draft:
        tx.is_draft = False

    if data.payment_method is not None and tx.budget_category_id:
        hub = db.query(BudgetCategory).filter(
            BudgetCategory.id == tx.budget_category_id
        ).first()
        if hub:
            hub.transaction_payment_method = data.payment_method

    db.commit()
    db.refresh(tx)
    transaction_to_entity(tx, old_amount, db)
    return tx


@router.post("/backfill-payment-method")
def backfill_payment_method(
    current_user: str = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    One-shot fix for transactions that were imported without a payment method.

    Finds every transaction owned by the current user where payment_method is
    NULL, infers the correct value from the description using the same logic
    as the import wizard, saves it, and clears the is_draft flag.

    Safe to call multiple times — only rows with NULL payment_method are
    touched; already-set values are never overwritten.
    """
    transactions = (
        db.query(Transaction)
        .filter(
            Transaction.user_id == current_user,
            Transaction.payment_method.is_(None),
        )
        .all()
    )

    updated = 0
    for tx in transactions:
        inferred = infer_payment_method(tx.description or "")
        tx.payment_method = inferred
        tx.is_draft = False
        updated += 1

    if updated:
        db.commit()

    return {
        "updated_count": updated,
        "message": (
            f"{updated} transaction(s) updated with inferred payment methods."
            if updated
            else "No transactions needed updating — all already have a payment method."
        ),
    }


@router.delete("/{transaction_id}")
def delete_transaction(
    transaction_id: str,
    current_user: str = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    try:
        parsed_id = uuid.UUID(transaction_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid ID format")

    # Ownership check
    tx = db.query(Transaction).filter(
        Transaction.id == parsed_id,
        Transaction.user_id == current_user,
    ).first()
    if not tx:
        raise HTTPException(status_code=404, detail="Transaction not found")

    reverse_transaction(tx, db)

    tx.budget_category_id = None
    db.commit()
    db.delete(tx)
    db.commit()
    return {"message": "Transaction deleted"}