from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from ..database import get_db
from ..models import Bill, BudgetCategory, Category, Debt, Transaction
from ..services.entity_sync import entity_to_transaction
from ..dependencies import get_current_user
from pydantic import BaseModel
from datetime import date as DateType
from typing import Optional
from dateutil.relativedelta import relativedelta
import uuid

router = APIRouter(prefix="/bills", tags=["bills"])


# ─────────────────────────────────────────────────────────────────────────────
# Issue #12 — Sinking fund: sync monthly provision for non-monthly bills
# ─────────────────────────────────────────────────────────────────────────────

_SINKING_CATEGORY_NAME  = "Sinking Fund"
_SINKING_CATEGORY_COLOR = "#8b5cf6"   # purple — distinct from regular expenses


def _to_monthly_provision(amount: float, frequency: str) -> float:
    """Convert a bill's full amount to its monthly set-aside equivalent."""
    freq = (frequency or "Monthly").strip()
    if freq == "Annual":    return amount / 12
    if freq == "Quarterly": return amount / 3
    if freq == "Weekly":    return (amount * 52) / 12
    return 0.0   # Monthly bills don't need a provision — they're already monthly


def sync_bill_provisions_to_budget(user_id: str, db: Session) -> None:
    """
    Sum the monthly provision amounts for all non-monthly bills and keep a
    'Sinking Fund' budget Category row up to date.

    Annual bill of $360  → $30/mo provision
    Quarterly bill of $120 → $40/mo provision

    - Creates the category if it doesn't exist yet.
    - Sets planned_amount = 0 when no non-monthly bills remain.
    - Called automatically on every bill create / update / delete.
    """
    non_monthly = (
        db.query(Bill)
        .filter(
            Bill.user_id  == user_id,
            Bill.frequency.notin_(["Monthly", "monthly"]),
        )
        .all()
    )
    total_provision = sum(
        _to_monthly_provision(float(b.amount or 0), b.frequency)
        for b in non_monthly
    )

    cat = db.query(Category).filter(
        Category.user_id == user_id,
        Category.name    == _SINKING_CATEGORY_NAME,
        Category.kind    == "expense",
    ).first()

    if cat:
        cat.planned_amount = round(total_provision, 2)
    else:
        if total_provision == 0:
            return   # no non-monthly bills yet, nothing to create
        cat = Category(
            id             = uuid.uuid4(),
            user_id        = user_id,
            name           = _SINKING_CATEGORY_NAME,
            kind           = "expense",
            color          = _SINKING_CATEGORY_COLOR,
            planned_amount = round(total_provision, 2),
            sort_order     = 998,   # just above debt payments
            system         = False,
            is_active      = True,
        )
        db.add(cat)

    db.flush()


# ─────────────────────────────────────────────────────────────────────────────
# Issue #8 — Bills auto-reset
# ─────────────────────────────────────────────────────────────────────────────

def _next_due_date(current_due: DateType, frequency: str) -> DateType:
    """Advance a due date by exactly one billing cycle."""
    freq = (frequency or "monthly").lower()
    if freq in ("weekly",):         return current_due + relativedelta(weeks=1)
    if freq in ("monthly",):        return current_due + relativedelta(months=1)
    if freq in ("quarterly",):      return current_due + relativedelta(months=3)
    if freq in ("annual", "yearly"): return current_due + relativedelta(years=1)
    # Unknown frequency — default to monthly so the bill stays live
    return current_due + relativedelta(months=1)


def roll_forward_bills(user_id: str, db: Session) -> int:
    """
    For every paid bill whose due_date is now in the past, advance the
    due_date by one frequency interval and reset status to unpaid.

    - The linked payment transaction is preserved (it's a historical record).
    - transaction_id on the bill is cleared so the next cycle starts fresh.
    - The budget_category hub row has its date advanced to match.

    Called from:
      • GET /bills          — so the page is always current on open
      • alert_scheduler     — daily background pass for all users

    Returns the number of bills rolled forward.
    """
    today = DateType.today()
    stale = (
        db.query(Bill)
        .filter(
            Bill.user_id == user_id,
            Bill.status  == "paid",
            Bill.due_date < today,
        )
        .all()
    )

    count = 0
    for bill in stale:
        # Advance until the next due date is in the future
        next_due = _next_due_date(bill.due_date, bill.frequency)
        while next_due < today:
            next_due = _next_due_date(next_due, bill.frequency)

        bill.due_date      = next_due
        bill.status        = "unpaid"
        bill.transaction_id = None   # clear link; old tx remains in history

        # Keep the budget_category hub date aligned with the new due_date
        if bill.budget_category_id:
            hub = db.query(BudgetCategory).filter(
                BudgetCategory.id == bill.budget_category_id
            ).first()
            if hub:
                hub.transaction_id             = None
                hub.transaction_payment_method = None
                hub.date                       = next_due

        count += 1

    if count:
        db.commit()

    return count


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
    payment_method: Optional[str] = None  # captured at mark-as-paid time


@router.get("/")
def get_bills(
    status: Optional[str] = Query(None),
    category: Optional[str] = Query(None),
    current_user: str = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    # Issue #8 — roll forward any paid bills whose cycle has ended
    roll_forward_bills(current_user, db)

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
    db.flush()
    sync_bill_provisions_to_budget(current_user, db)  # #12
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
        # payment_method is provided directly by the user when they click
        # "Mark as paid" — no draft needed, create confirmed immediately.
        payment_method = update_data.get("payment_method")

        # ── Credit card detection ─────────────────────────────────────────────
        # If the user selected one of their named credit cards as the payment
        # method (e.g. "AMEX Gold"), treat this the same way as a cc_charge:
        #   • source = "cc_charge"  → excluded from cash balance calculations
        #   • CC debt balance increases by the bill amount
        # This mirrors the same detection in transactions.py.
        tx_source = "bill_payment"
        if payment_method:
            cc_debt = db.query(Debt).filter(
                Debt.user_id     == current_user,
                Debt.type        == "credit_card",
                Debt.name        == payment_method,
                Debt.is_paid_off == False,
            ).first()
            if cc_debt:
                tx_source = "cc_charge"
                cc_debt.balance = float(cc_debt.balance or 0) + float(bill.amount)

        tx = Transaction(
            user_id=current_user,
            date=DateType.today(),
            description=bill.name,
            category=bill.category or "Other",
            type="expense",
            amount=bill.amount,
            payment_method=payment_method,
            source=tx_source,
            is_draft=False,
            reviewed=True,
            budget_category_id=hub.id if hub else None,
        )
        db.add(tx)
        db.flush()

        bill.transaction_id = tx.id
        if hub:
            hub.transaction_id             = tx.id
            hub.transaction_payment_method = payment_method
            hub.date                       = DateType.today()

    # ── Apply other field updates ─────────────────────────────────────────────
    # payment_method is consumed above (written to the linked transaction) and is
    # NOT a mapped column on Bill — skip it here to avoid a transient attribute.
    _BILL_WRITE_FIELDS = {"name", "amount", "due_date", "frequency", "category", "status"}
    for key, value in update_data.items():
        if key in _BILL_WRITE_FIELDS:
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
        # Only update the hub date when the bill's due_date itself changes —
        # do NOT reset it to today on every field edit.
        if "due_date" in update_data:
            hub.date = update_data["due_date"]

        entity_to_transaction(hub, db)

    sync_bill_provisions_to_budget(current_user, db)  # #12
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
    sync_bill_provisions_to_budget(current_user, db)  # #12

    if budget_cat_id:
        hub = db.query(BudgetCategory).filter(
            BudgetCategory.id == budget_cat_id
        ).first()
        if hub:
            db.delete(hub)

    db.commit()
    return {"message": "Bill deleted"}