from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from ..database import get_db
from ..models import Transaction, BudgetCategory
from ..services.entity_sync import transaction_to_entity, reverse_transaction
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
def get_draft_count(db: Session = Depends(get_db)):
    count = db.query(Transaction).filter(Transaction.is_draft == True).count()
    return {"count": count}


@router.get("/")
def get_transactions(
    category:  Optional[str]      = Query(None),
    type:      Optional[str]      = Query(None),
    is_draft:  Optional[bool]     = Query(None),
    date_from: Optional[DataType] = Query(None),
    date_to:   Optional[DataType] = Query(None),
    db: Session = Depends(get_db),
):
    q = db.query(Transaction)
    if category:              q = q.filter(Transaction.category == category)
    if type:                  q = q.filter(Transaction.type == type)
    if is_draft is not None:  q = q.filter(Transaction.is_draft == is_draft)
    if date_from:             q = q.filter(Transaction.date >= date_from)
    if date_to:               q = q.filter(Transaction.date <= date_to)

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


@router.post("/", status_code=201)
def create_transaction(data: TransactionCreate, db: Session = Depends(get_db)):
    # Savings transactions can only be created from the Savings tab
    if data.type == "savings":
        raise HTTPException(
            status_code=400,
            detail="Savings transactions can only be created from the Savings tab.",
        )
    tx = Transaction(**data.dict(), source="manual")
    db.add(tx)
    db.commit()
    db.refresh(tx)
    return tx


@router.put("/{transaction_id}")
def update_transaction(
    transaction_id: str,
    data: TransactionUpdate,
    db: Session = Depends(get_db),
):
    try:
        parsed_id = uuid.UUID(transaction_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid ID format")

    tx = db.query(Transaction).filter(Transaction.id == parsed_id).first()
    if not tx:
        raise HTTPException(status_code=404, detail="Transaction not found")

    old_amount = float(tx.amount)

    for key, value in data.dict(exclude_unset=True).items():
        if key == "budget_category_id":
            continue
        # Lock category and type for debt and savings transactions
        if key in ("category", "type") and tx.budget_category_id:
            hub = db.query(BudgetCategory).filter(
                BudgetCategory.id == tx.budget_category_id
            ).first()
            if hub and (hub.type.startswith("Debt:") or hub.type.startswith("Savings:")):
                continue
        setattr(tx, key, value)

    # Auto-clear draft when payment method is confirmed
    if data.payment_method and data.payment_method.strip() and tx.is_draft:
        tx.is_draft = False

    # Sync payment method to backbone row
    if data.payment_method is not None and tx.budget_category_id:
        hub = db.query(BudgetCategory).filter(
            BudgetCategory.id == tx.budget_category_id
        ).first()
        if hub:
            hub.transaction_payment_method = data.payment_method

    db.commit()
    db.refresh(tx)

    # Push changes back to budget_categories and the linked entity
    transaction_to_entity(tx, old_amount, db)

    return tx


@router.delete("/{transaction_id}")
def delete_transaction(transaction_id: str, db: Session = Depends(get_db)):
    try:
        parsed_id = uuid.UUID(transaction_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid ID format")

    tx = db.query(Transaction).filter(Transaction.id == parsed_id).first()
    if not tx:
        raise HTTPException(status_code=404, detail="Transaction not found")

    # ── Reverse linked entity effects BEFORE deleting the transaction ─────────
    # Bill      → unmarks as paid, unlinks hub (hub row kept)
    # Debt      → adds amount back to balance, deletes hub row
    # Savings   → subtracts amount from goal, deletes hub row
    # Plain tx  → no entity to reverse, just delete
    reverse_transaction(tx, db)

    # Now safe to delete the transaction row itself
    # (reverse_transaction may have already deleted the hub row for debt/savings,
    # so we nullify the FK first to avoid constraint errors)
    tx.budget_category_id = None
    db.commit()

    db.delete(tx)
    db.commit()
    return {"message": "Transaction deleted"}