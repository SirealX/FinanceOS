from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from ..database import get_db
from ..models import Bill, BudgetCategory, Transaction
from ..services.entity_sync import entity_to_transaction
from ..dependencies import get_current_user
from pydantic import BaseModel
from datetime import date as DateType
from typing import Optional
import uuid

router = APIRouter(prefix="/bills", tags=["bills"])


class BillCreate(BaseModel):
    name: str
    amount: float
    due_date: DateType
    frequency: str
    category: Optional[str] = "Other"
    status: str = "unpaid"


class BillUpdate(BaseModel):
    name: Optional[str] = None
    amount: Optional[float] = None
    due_date: Optional[DateType] = None
    frequency: Optional[str] = None
    category: Optional[str] = None
    status: Optional[str] = None


@router.get("/")
def get_bills(
    status: Optional[str] = Query(None),
    category: Optional[str] = Query(None),
    current_user: str = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    q = db.query(Bill).filter(Bill.user_id == current_user)
    if status:
        q = q.filter(Bill.status == status.lower())
    if category:
        q = q.filter(Bill.category == category)
    return q.order_by(Bill.due_date.asc()).all()


@router.post("/", status_code=201)
def create_bill(
    data: BillCreate,
    current_user: str = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    budget_cat = BudgetCategory(
        user_id=current_user,
        transaction_id=None,
        transaction_name=data.name.strip(),
        transaction_payment_method=None,
        categories_name=data.category or "Other",
        type=f"Bill: {data.name.strip()}",
        amount=data.amount,
        date=DateType.today(),
    )
    db.add(budget_cat)
    db.flush()

    bill = Bill(
        user_id=current_user,
        name=data.name,
        amount=data.amount,
        due_date=data.due_date,
        frequency=data.frequency,
        category=data.category,
        status=data.status.lower(),
        auto_detected=False,
        budget_category_id=budget_cat.id,
    )
    db.add(bill)
    db.commit()
    db.refresh(bill)
    return bill


@router.put("/{bill_id}")
def update_bill(
    bill_id: str,
    data: BillUpdate,
    current_user: str = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    try:
        parsed_id = uuid.UUID(bill_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid ID format")

    # Ownership check
    bill = db.query(Bill).filter(
        Bill.id == parsed_id,
        Bill.user_id == current_user,
    ).first()
    if not bill:
        raise HTTPException(status_code=404, detail="Bill not found")

    update_data = data.dict(exclude_unset=True)
    if "status" in update_data and update_data["status"]:
        update_data["status"] = update_data["status"].lower()

    hub = db.query(BudgetCategory).filter(
        BudgetCategory.id == bill.budget_category_id
    ).first()

    # ── Handle paid → unpaid ──────────────────────────────────────────────────
    if (
        update_data.get("status") == "unpaid"
        and bill.status == "paid"
        and bill.transaction_id is not None
    ):
        tx = db.query(Transaction).filter(
            Transaction.id == bill.transaction_id
        ).first()
        if tx:
            db.delete(tx)
            db.flush()

        if hub:
            hub.transaction_id             = None
            hub.transaction_payment_method = None

        bill.transaction_id = None

    # ── Handle unpaid → paid ──────────────────────────────────────────────────
    elif (
        update_data.get("status") == "paid"
        and bill.status == "unpaid"
        and bill.transaction_id is None
    ):
        draft = Transaction(
            user_id=current_user,
            date=DateType.today(),
            description=bill.name,
            category=bill.category or "Other",
            type="expense",
            amount=bill.amount,
            payment_method=None,
            source="manual",
            is_draft=True,
            budget_category_id=hub.id if hub else None,
        )
        db.add(draft)
        db.flush()

        bill.transaction_id = draft.id
        if hub:
            hub.transaction_id = draft.id
            hub.date           = DateType.today()

    # ── Apply other field updates ─────────────────────────────────────────────
    for key, value in update_data.items():
        setattr(bill, key, value)

    # ── Sync non-status changes to backbone row ───────────────────────────────
    if hub:
        if "amount" in update_data:
            hub.amount = update_data["amount"]
        if "category" in update_data:
            hub.categories_name = update_data["category"]
        if "name" in update_data:
            hub.transaction_name = update_data["name"]
            hub.type             = f"Bill: {update_data['name']}"
        hub.date = DateType.today()

        entity_to_transaction(hub, db)

    db.commit()
    db.refresh(bill)
    return bill


@router.delete("/{bill_id}")
def delete_bill(
    bill_id: str,
    current_user: str = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    try:
        parsed_id = uuid.UUID(bill_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid ID format")

    # Ownership check
    bill = db.query(Bill).filter(
        Bill.id == parsed_id,
        Bill.user_id == current_user,
    ).first()
    if not bill:
        raise HTTPException(status_code=404, detail="Bill not found")

    budget_cat_id = bill.budget_category_id

    if bill.transaction_id:
        tx = db.query(Transaction).filter(
            Transaction.id == bill.transaction_id
        ).first()
        if tx:
            db.delete(tx)
            db.flush()

    db.delete(bill)
    db.flush()

    if budget_cat_id:
        hub = db.query(BudgetCategory).filter(
            BudgetCategory.id == budget_cat_id
        ).first()
        if hub:
            db.delete(hub)

    db.commit()
    return {"message": "Bill deleted"}