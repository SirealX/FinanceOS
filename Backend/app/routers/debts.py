"""
backend/app/routers/debts.py — Debt Management
─────────────────────────────────────────────────────────────────────────────
Supports three debt types:
  credit_card  — revolving; purchases auto-increase balance via /charge
  loan         — fixed amount, fixed term; optional amortization schedule
  bnpl         — tied to a specific purchase transaction; fixed installments

Payment modes:
  manual            — user records each payment themselves
  auto_bank_debit   — linked to a RecurringTransaction; balance decrements
                      automatically when the recurring logs
  payroll_deduction — balance decrements silently on schedule; no tx created

Transaction type for payments: 'debt_payment'
  Excluded from expense reports and budget expense totals.
  Only creatable via this router — never from the manual transaction form.
─────────────────────────────────────────────────────────────────────────────
"""

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from ..database import get_db
from ..models import Category, Debt, BudgetCategory, Transaction, RecurringTransaction
from ..dependencies import get_current_user
from pydantic import BaseModel
from typing import Optional
from datetime import date as DateType
import uuid

router = APIRouter(prefix="/debts", tags=["debts"])


# ─────────────────────────────────────────────────────────────────────────────
# Budget sync helper — keeps "Debt Payments" category in sync with minimums
# ─────────────────────────────────────────────────────────────────────────────

_DEBT_CATEGORY_NAME  = "Debt Payments"
_DEBT_CATEGORY_COLOR = "#f59e0b"   # amber — distinct from expense red


def sync_debt_minimums_to_budget(user_id: str, db: Session) -> None:
    """
    Recalculate total minimum payments across active debts and write that
    amount into the user's 'Debt Payments' budget Category row.

    Uses kind='debt_payment' so it groups separately from expenses in the
    budget view and does NOT inflate expense totals.

    Migration safety: deletes any legacy expense-kind rows with the same name
    so users who had "Debt Payments" as an expense category before the debt
    restructure don't end up with duplicate rows showing in both sections.
    """
    total_min = (
        db.query(Debt)
        .filter(Debt.user_id == user_id, Debt.balance > 0, Debt.is_paid_off == False)
        .with_entities(Debt.min_payment)
        .all()
    )
    planned = sum(float(r.min_payment or 0) for r in total_min)

    # ── Migration cleanup ─────────────────────────────────────────────────────
    # Delete any expense-kind rows named "Debt Payments" for this user.
    # These are pre-restructure artifacts; the debt_payment-kind row below
    # now owns this category. Doing this here ensures the fix fires for all
    # users the first time they interact with any debt (create/edit/pay/delete).
    db.query(Category).filter(
        Category.user_id == user_id,
        Category.name    == _DEBT_CATEGORY_NAME,
        Category.kind    == "expense",
    ).delete(synchronize_session=False)

    # ── Upsert the debt_payment-kind row ──────────────────────────────────────
    cat = db.query(Category).filter(
        Category.user_id == user_id,
        Category.name    == _DEBT_CATEGORY_NAME,
        Category.kind    == "debt_payment",
    ).first()

    if cat:
        cat.planned_amount = planned
        cat.is_active      = True
    else:
        cat = Category(
            id             = uuid.uuid4(),
            user_id        = user_id,
            name           = _DEBT_CATEGORY_NAME,
            kind           = "debt_payment",
            color          = _DEBT_CATEGORY_COLOR,
            planned_amount = planned,
            sort_order     = 999,
            system         = False,
            is_active      = True,
        )
        db.add(cat)

    db.flush()


# ─────────────────────────────────────────────────────────────────────────────
# Amortization helper
# ─────────────────────────────────────────────────────────────────────────────

def calculate_amortization(principal: float, annual_rate: float, term_months: int) -> list:
    """
    Standard fixed-rate amortization schedule.
    Returns a list of {month, payment, principal_portion, interest_portion, remaining_balance}.
    """
    if term_months <= 0:
        return []

    schedule = []
    balance = principal

    if annual_rate == 0:
        payment = principal / term_months
        for m in range(1, term_months + 1):
            balance = max(0.0, balance - payment)
            schedule.append({
                "month": m,
                "payment": round(payment, 2),
                "principal_portion": round(payment, 2),
                "interest_portion": 0.0,
                "remaining_balance": round(balance, 2),
            })
        return schedule

    monthly_rate = annual_rate / 100 / 12
    n = term_months
    payment = principal * (monthly_rate * (1 + monthly_rate) ** n) / ((1 + monthly_rate) ** n - 1)

    for m in range(1, term_months + 1):
        interest_portion  = balance * monthly_rate
        principal_portion = payment - interest_portion
        balance           = max(0.0, balance - principal_portion)
        schedule.append({
            "month":              m,
            "payment":            round(payment, 2),
            "principal_portion":  round(principal_portion, 2),
            "interest_portion":   round(interest_portion, 2),
            "remaining_balance":  round(balance, 2),
        })

    return schedule


# ─────────────────────────────────────────────────────────────────────────────
# Pydantic schemas
# ─────────────────────────────────────────────────────────────────────────────

class DebtCreate(BaseModel):
    name: str
    balance: float
    original_balance: Optional[float] = None
    interest_rate: float
    min_payment: float
    priority_rank: Optional[int] = None
    due_day: Optional[int] = None                   # day of month payment is due (1–31)

    # Type & payment
    type: str = "loan"                              # 'credit_card' | 'loan' | 'bnpl'
    bank_name: Optional[str] = None
    payment_type: str = "manual"                    # 'manual' | 'auto_bank_debit' | 'payroll_deduction'
    payment_frequency: Optional[str] = None         # 'weekly' | 'biweekly' | 'monthly' | 'quarterly'
    payment_amount: Optional[float] = None
    start_date: Optional[DateType] = None
    end_date: Optional[DateType] = None

    # Credit card
    credit_limit: Optional[float] = None
    billing_cycle_end_day: Optional[int] = None
    card_network: Optional[str] = None             # 'Visa' | 'Mastercard' | 'Amex' | 'Other'

    # Loan amortization
    show_amortization: bool = False
    term_months: Optional[int] = None

    # BNPL
    linked_transaction_id: Optional[str] = None
    total_installments: Optional[int] = None
    installment_amount: Optional[float] = None


class DebtUpdate(BaseModel):
    name: Optional[str] = None
    balance: Optional[float] = None
    original_balance: Optional[float] = None
    interest_rate: Optional[float] = None
    min_payment: Optional[float] = None
    priority_rank: Optional[int] = None
    due_day: Optional[int] = None
    type: Optional[str] = None
    bank_name: Optional[str] = None
    is_paid_off: Optional[bool] = None
    payment_type: Optional[str] = None
    payment_frequency: Optional[str] = None
    payment_amount: Optional[float] = None
    start_date: Optional[DateType] = None
    end_date: Optional[DateType] = None
    credit_limit: Optional[float] = None
    billing_cycle_end_day: Optional[int] = None
    card_network: Optional[str] = None
    show_amortization: Optional[bool] = None
    term_months: Optional[int] = None
    linked_transaction_id: Optional[str] = None
    total_installments: Optional[int] = None
    installments_paid: Optional[int] = None
    installment_amount: Optional[float] = None


class DebtPaymentCreate(BaseModel):
    amount: float
    payment_method: str = "Bank Transfer"
    payment_date: Optional[DateType] = None


class ChargeCreate(BaseModel):
    amount: float
    description: str = "Credit Card Purchase"
    category: str = "Other"
    charge_date: Optional[DateType] = None


# ─────────────────────────────────────────────────────────────────────────────
# Serialiser — explicit dict so the response always includes new fields
# ─────────────────────────────────────────────────────────────────────────────

def _serialize_debt(d: Debt) -> dict:
    return {
        "id":                       str(d.id),
        "user_id":                  str(d.user_id) if d.user_id else None,
        "name":                     d.name,
        "balance":                  float(d.balance or 0),
        "original_balance":         float(d.original_balance or d.balance or 0),
        "interest_rate":            float(d.interest_rate or 0),
        "min_payment":              float(d.min_payment or 0),
        "priority_rank":            d.priority_rank,
        "due_day":                  d.due_day,
        "type":                     d.type or "loan",
        "bank_name":                d.bank_name,
        "is_paid_off":              bool(d.is_paid_off),
        "payment_type":             d.payment_type or "manual",
        "payment_frequency":        d.payment_frequency,
        "payment_amount":           float(d.payment_amount) if d.payment_amount else None,
        "start_date":               d.start_date.isoformat() if d.start_date else None,
        "end_date":                 d.end_date.isoformat() if d.end_date else None,
        "show_amortization":        bool(d.show_amortization),
        "term_months":              d.term_months,
        "credit_limit":             float(d.credit_limit) if d.credit_limit else None,
        "billing_cycle_end_day":    d.billing_cycle_end_day,
        "card_network":             d.card_network,
        "linked_transaction_id":    str(d.linked_transaction_id) if d.linked_transaction_id else None,
        "total_installments":       d.total_installments,
        "installments_paid":        d.installments_paid or 0,
        "installment_amount":       float(d.installment_amount) if d.installment_amount else None,
        "recurring_transaction_id": str(d.recurring_transaction_id) if d.recurring_transaction_id else None,
    }


# ─────────────────────────────────────────────────────────────────────────────
# Endpoints
# ─────────────────────────────────────────────────────────────────────────────

@router.get("/credit-cards")
def get_credit_cards(
    current_user: str = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Return all active (not paid-off) credit card debts.
    Used by Settings credit card tab and the Transactions payment method dropdown.
    MUST be defined before /{debt_id} to avoid route shadowing.
    """
    cards = db.query(Debt).filter(
        Debt.user_id    == current_user,
        Debt.type       == "credit_card",
        Debt.is_paid_off == False,
    ).all()
    return [_serialize_debt(c) for c in cards]


@router.get("/")
def get_debts(
    current_user: str = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    debts = db.query(Debt).filter(Debt.user_id == current_user).all()
    return [_serialize_debt(d) for d in debts]


@router.post("/", status_code=201)
def create_debt(
    data: DebtCreate,
    current_user: str = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    linked_tx_id = None
    if data.linked_transaction_id:
        try:
            linked_tx_id = uuid.UUID(data.linked_transaction_id)
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid linked_transaction_id format")

    debt = Debt(
        user_id               = current_user,
        name                  = data.name,
        balance               = data.balance,
        original_balance      = data.original_balance or data.balance,
        interest_rate         = data.interest_rate,
        min_payment           = data.min_payment,
        priority_rank         = data.priority_rank,
        due_day               = data.due_day,
        type                  = data.type,
        bank_name             = data.bank_name,
        is_paid_off           = False,
        payment_type          = data.payment_type,
        payment_frequency     = data.payment_frequency,
        payment_amount        = data.payment_amount,
        start_date            = data.start_date,
        end_date              = data.end_date,
        show_amortization     = data.show_amortization,
        term_months           = data.term_months,
        credit_limit          = data.credit_limit,
        billing_cycle_end_day = data.billing_cycle_end_day,
        card_network          = data.card_network,
        linked_transaction_id = linked_tx_id,
        total_installments    = data.total_installments,
        installments_paid     = 0,
        installment_amount    = data.installment_amount,
    )
    db.add(debt)
    db.flush()

    # Auto bank debit: create linked RecurringTransaction so balance
    # decrements automatically when the user logs the recurring payment.
    if data.payment_type == "auto_bank_debit" and data.payment_frequency and data.payment_amount:
        # Map biweekly → weekly for RecurringTransaction (closest supported freq)
        freq_map = {"weekly": "weekly", "monthly": "monthly",
                    "quarterly": "monthly", "biweekly": "weekly"}
        freq = freq_map.get(data.payment_frequency, "monthly")
        recurring = RecurringTransaction(
            user_id     = current_user,
            description = f"Loan payment: {data.name}",
            amount      = data.payment_amount,
            category    = "Debt Payments",
            type        = "debt_payment",
            frequency   = freq,
            next_due    = data.start_date or DateType.today(),
            is_active   = True,
        )
        db.add(recurring)
        db.flush()
        debt.recurring_transaction_id = recurring.id

    sync_debt_minimums_to_budget(current_user, db)
    db.commit()
    db.refresh(debt)
    return _serialize_debt(debt)


@router.get("/{debt_id}/amortization")
def get_amortization(
    debt_id: str,
    current_user: str = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Return a full amortization schedule for a loan or BNPL debt.
    Uses term_months if set; otherwise estimates from balance / payment_amount.
    """
    try:
        parsed_id = uuid.UUID(debt_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid ID format")

    debt = db.query(Debt).filter(
        Debt.id == parsed_id,
        Debt.user_id == current_user,
    ).first()
    if not debt:
        raise HTTPException(status_code=404, detail="Debt not found")

    principal = float(debt.balance or 0)
    rate      = float(debt.interest_rate or 0)

    term = debt.term_months
    if not term:
        pmt = float(debt.payment_amount or debt.min_payment or 0)
        if pmt > 0 and principal > 0:
            term = max(1, round(principal / pmt))
        else:
            raise HTTPException(
                status_code=400,
                detail="Cannot compute amortization: set term_months or payment_amount on the debt.",
            )

    schedule = calculate_amortization(principal, rate, term)
    return {"debt_id": debt_id, "schedule": schedule}


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

    debt = db.query(Debt).filter(
        Debt.id == parsed_id,
        Debt.user_id == current_user,
    ).first()
    if not debt:
        raise HTTPException(status_code=404, detail="Debt not found")

    update_data = data.dict(exclude_unset=True)

    if "linked_transaction_id" in update_data and update_data["linked_transaction_id"]:
        try:
            update_data["linked_transaction_id"] = uuid.UUID(update_data["linked_transaction_id"])
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid linked_transaction_id format")

    for key, value in update_data.items():
        setattr(debt, key, value)

    sync_debt_minimums_to_budget(current_user, db)
    db.commit()
    db.refresh(debt)
    return _serialize_debt(debt)


@router.post("/{debt_id}/pay", status_code=201)
def record_debt_payment(
    debt_id: str,
    data: DebtPaymentCreate,
    current_user: str = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Record a manual debt payment.
    Creates a 'debt_payment' transaction — excluded from expense totals.
    Decrements balance and marks debt paid off if balance reaches zero.
    """
    try:
        parsed_id = uuid.UUID(debt_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid ID format")

    debt = db.query(Debt).filter(
        Debt.id == parsed_id,
        Debt.user_id == current_user,
    ).first()
    if not debt:
        raise HTTPException(status_code=404, detail="Debt not found")

    payment_date = data.payment_date or DateType.today()

    hub = BudgetCategory(
        user_id                    = current_user,
        transaction_id             = None,
        transaction_name           = f"Debt: {debt.name}",
        transaction_payment_method = data.payment_method,
        categories_name            = "Debt Payments",
        type                       = f"Debt: {debt.name}",
        amount                     = data.amount,
        date                       = payment_date,
    )
    db.add(hub)
    db.flush()

    tx = Transaction(
        user_id            = current_user,
        date               = payment_date,
        description        = f"Debt: {debt.name}",
        category           = "Debt Payments",
        type               = "debt_payment",    # ← excluded from expense totals
        amount             = data.amount,
        payment_method     = data.payment_method,
        source             = "debt_payment",
        is_draft           = False,
        budget_category_id = hub.id,
    )
    db.add(tx)
    db.flush()

    hub.transaction_id = tx.id

    debt.balance = max(0.0, float(debt.balance) - data.amount)

    if float(debt.balance) == 0.0:
        debt.is_paid_off = True
        if debt.recurring_transaction_id:
            recurring = db.query(RecurringTransaction).filter(
                RecurringTransaction.id == debt.recurring_transaction_id
            ).first()
            if recurring:
                recurring.is_active = False

    # BNPL: track installment progress
    if debt.type == "bnpl" and debt.total_installments:
        debt.installments_paid = min(
            (debt.installments_paid or 0) + 1,
            debt.total_installments,
        )

    sync_debt_minimums_to_budget(current_user, db)
    db.commit()
    db.refresh(debt)
    return _serialize_debt(debt)


@router.post("/{debt_id}/charge", status_code=201)
def charge_credit_card(
    debt_id: str,
    data: ChargeCreate,
    current_user: str = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Record a purchase charged to a credit card.
    Increases the CC debt balance WITHOUT creating a cash outflow.
    The expense transaction uses source='cc_charge' so the dashboard balance
    calculation can exclude it from cash totals to avoid double-counting.
    """
    try:
        parsed_id = uuid.UUID(debt_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid ID format")

    debt = db.query(Debt).filter(
        Debt.id == parsed_id,
        Debt.user_id == current_user,
    ).first()
    if not debt:
        raise HTTPException(status_code=404, detail="Debt not found")

    if debt.type != "credit_card":
        raise HTTPException(status_code=400, detail="This endpoint is for credit card debts only.")
    if debt.is_paid_off:
        raise HTTPException(status_code=400, detail="Cannot charge a paid-off credit card.")

    charge_date = data.charge_date or DateType.today()

    hub = BudgetCategory(
        user_id                    = current_user,
        transaction_id             = None,
        transaction_name           = data.description,
        transaction_payment_method = debt.name,
        categories_name            = data.category,
        type                       = data.category,
        amount                     = data.amount,
        date                       = charge_date,
    )
    db.add(hub)
    db.flush()

    tx = Transaction(
        user_id            = current_user,
        date               = charge_date,
        description        = data.description,
        category           = data.category,
        type               = "expense",      # expense for category/budget tracking
        amount             = data.amount,
        payment_method     = debt.name,
        source             = "cc_charge",    # excluded from cash balance calc
        is_draft           = False,
        budget_category_id = hub.id,
    )
    db.add(tx)
    db.flush()

    hub.transaction_id = tx.id
    debt.balance = float(debt.balance) + data.amount

    db.commit()
    db.refresh(debt)
    return _serialize_debt(debt)


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

    debt = db.query(Debt).filter(
        Debt.id == parsed_id,
        Debt.user_id == current_user,
    ).first()
    if not debt:
        raise HTTPException(status_code=404, detail="Debt not found")

    # Deactivate linked recurring if present
    if debt.recurring_transaction_id:
        recurring = db.query(RecurringTransaction).filter(
            RecurringTransaction.id == debt.recurring_transaction_id
        ).first()
        if recurring:
            recurring.is_active = False

    db.delete(debt)
    db.flush()
    sync_debt_minimums_to_budget(current_user, db)
    db.commit()
    return {"message": "Debt deleted"}


# ─────────────────────────────────────────────────────────────────────────────
# Payroll deduction — silent balance decrement (called from alert_scheduler.py)
# ─────────────────────────────────────────────────────────────────────────────

def decrement_payroll_debts(user_id: str, db: Session) -> int:
    """
    Silently decrement balances for all payroll-deduction debts whose payment
    is due today (matched by due_day).  No transaction is created.
    Returns the number of debts decremented.
    """
    from datetime import date
    today = date.today()
    decremented = 0

    payroll_debts = db.query(Debt).filter(
        Debt.user_id      == user_id,
        Debt.payment_type == "payroll_deduction",
        Debt.is_paid_off  == False,
    ).all()

    for debt in payroll_debts:
        if not debt.payment_amount or not debt.due_day:
            continue
        if today.day != debt.due_day:
            continue

        debt.balance = max(0.0, float(debt.balance) - float(debt.payment_amount))
        decremented += 1

        if float(debt.balance) == 0.0:
            debt.is_paid_off = True

    if decremented:
        sync_debt_minimums_to_budget(user_id, db)
        db.commit()

    return decremented
