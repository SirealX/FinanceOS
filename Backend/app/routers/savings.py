from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from ..database import get_db
from ..models import SavingsGoal, BudgetCategory, Transaction, Category
from ..dependencies import get_current_user
from pydantic import BaseModel, validator
from datetime import date as DateType
from typing import Optional
import uuid

router = APIRouter(prefix="/savings", tags=["savings"])


# ─────────────────────────────────────────────────────────────────────────────
# Budget sync helper — keeps the single "Savings" category in sync with what
# active goals actually need per month. Mirrors debts.py's
# sync_debt_minimums_to_budget() (same trigger points: goal create / update /
# contribute / delete; same one-row-per-user target), so the "Savings"
# planned amount is never something the user hand-types anymore.
# ─────────────────────────────────────────────────────────────────────────────

_SAVINGS_CATEGORY_NAME = "Savings"


def sync_savings_to_budget(user_id: str, db: Session) -> None:
    """
    Recalculate the total monthly contribution needed across every active
    savings goal and write that single number into the user's "Savings"
    budget Category row (kind='savings').

    Per-goal math ports Saving.js's goalStatus()/monthlyNeeded exactly, so
    this total always agrees with what each goal card already tells the user
    it needs per month:

      - goal already reached (current >= target) -> contributes 0
      - no deadline_date set                      -> contributes 0 (no pace
                                                       to compute against)
      - deadline already passed, or <1 calendar
        month left                                -> contributes the full
                                                       remaining amount (a
                                                       monthly rate would be
                                                       meaningless over <1mo,
                                                       same reasoning as the
                                                       frontend)
      - otherwise                                 -> remaining / monthsLeft
    """
    today = DateType.today()

    goals = db.query(SavingsGoal).filter(SavingsGoal.user_id == user_id).all()

    total_needed = 0.0
    for g in goals:
        target = float(g.target_amount or 0)
        current = float(g.current_amount or 0)
        remaining = max(target - current, 0.0)

        if remaining <= 0 or not g.deadline_date:
            continue

        days_left = (g.deadline_date - today).days
        months_left = days_left / 30.44

        if months_left <= 1:
            total_needed += remaining
        else:
            total_needed += remaining / months_left

    # Inherit color/sort_order from the shared system "Savings" row (seeded by
    # POST /categories/seed) so a first-time sync doesn't clobber the look of
    # the category the user already sees in Settings.
    sys_cat = db.query(Category).filter(
        Category.user_id.is_(None),
        Category.name    == _SAVINGS_CATEGORY_NAME,
        Category.kind    == "savings",
    ).first()

    cat = db.query(Category).filter(
        Category.user_id == user_id,
        Category.name    == _SAVINGS_CATEGORY_NAME,
        Category.kind    == "savings",
    ).first()

    if cat:
        cat.planned_amount = total_needed
        cat.is_active      = True
    else:
        cat = Category(
            id             = uuid.uuid4(),
            user_id        = user_id,
            name           = _SAVINGS_CATEGORY_NAME,
            kind           = "savings",
            color          = sys_cat.color if sys_cat else "#A78BFA",
            planned_amount = total_needed,
            sort_order     = sys_cat.sort_order if sys_cat else 998,
            system         = False,
            is_active      = True,
        )
        db.add(cat)

    db.flush()


class SavingsCreate(BaseModel):
    goal_name: str
    target_amount: float
    current_amount: float = 0.0
    deadline_date: Optional[DateType] = None


class SavingsUpdate(BaseModel):
    goal_name: Optional[str] = None
    target_amount: Optional[float] = None
    # BUG-07 fix: current_amount removed — it must only change via /contribute
    # so every change is backed by a ledger transaction.
    deadline_date: Optional[DateType] = None


class ContributionUpdate(BaseModel):
    amount: float

    @validator("amount")
    def amount_must_be_positive(cls, v):  # ARCH-03
        if v <= 0:
            raise ValueError("Contribution amount must be greater than zero.")
        return v


@router.get("/")
def get_savings(
    current_user: str = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return db.query(SavingsGoal).filter(SavingsGoal.user_id == current_user).all()


@router.post("/")
def create_goal(
    data: SavingsCreate,
    current_user: str = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    goal = SavingsGoal(
        user_id=current_user,
        goal_name=data.goal_name,
        target_amount=data.target_amount,
        current_amount=data.current_amount,
        deadline_date=data.deadline_date,
    )
    db.add(goal)
    db.flush()

    # BUG-04 fix: if the user pre-filled an existing balance when creating the
    # goal, record it as a confirmed savings transaction so it is visible in
    # the ledger, budget actuals, and balance calculations.
    if data.current_amount and data.current_amount > 0:
        today = DateType.today()
        hub = BudgetCategory(
            user_id=current_user,
            transaction_id=None,
            savings_goal_id=goal.id,
            transaction_name=f"Contribution: {data.goal_name}",
            transaction_payment_method=None,
            categories_name="Savings",
            type=f"Savings: {data.goal_name}",
            amount=data.current_amount,
            date=today,
        )
        db.add(hub)
        db.flush()
        tx = Transaction(
            user_id=current_user,
            date=today,
            description=f"Contribution: {data.goal_name}",
            category="Savings",
            type="savings",
            amount=data.current_amount,
            payment_method=None,
            source="savings_contribution",
            is_draft=False,
            reviewed=True,
            budget_category_id=hub.id,
        )
        db.add(tx)
        db.flush()
        hub.transaction_id = tx.id

    sync_savings_to_budget(current_user, db)
    db.commit()
    db.refresh(goal)
    return goal


@router.put("/{goal_id}")
def update_goal(
    goal_id: str,
    data: SavingsUpdate,
    current_user: str = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    try:
        parsed_id = uuid.UUID(goal_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid ID format")

    # Ownership check
    goal = db.query(SavingsGoal).filter(
        SavingsGoal.id == parsed_id,
        SavingsGoal.user_id == current_user,
    ).first()
    if not goal:
        raise HTTPException(status_code=404, detail="Goal not found")

    for key, value in data.dict(exclude_unset=True).items():
        setattr(goal, key, value)

    sync_savings_to_budget(current_user, db)
    db.commit()
    db.refresh(goal)
    return goal


@router.put("/{goal_id}/contribute")
def log_contribution(
    goal_id: str,
    data: ContributionUpdate,
    current_user: str = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    try:
        parsed_id = uuid.UUID(goal_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid ID format")

    # Ownership check
    goal = db.query(SavingsGoal).filter(
        SavingsGoal.id == parsed_id,
        SavingsGoal.user_id == current_user,
    ).first()
    if not goal:
        raise HTTPException(status_code=404, detail="Goal not found")

    contribution_date = DateType.today()

    hub = BudgetCategory(
        user_id=current_user,
        transaction_id=None,
        savings_goal_id=goal.id,
        transaction_name=f"Contribution: {goal.goal_name}",
        transaction_payment_method=None,
        categories_name="Savings",
        type=f"Savings: {goal.goal_name}",
        amount=data.amount,
        date=contribution_date,
    )
    db.add(hub)
    db.flush()

    tx = Transaction(
        user_id=current_user,
        date=contribution_date,
        description=f"Contribution: {goal.goal_name}",
        category="Savings",
        type="savings",
        amount=data.amount,
        payment_method=None,
        source="savings_contribution",
        is_draft=False,
        reviewed=True,
        budget_category_id=hub.id,
    )
    db.add(tx)
    db.flush()

    hub.transaction_id = tx.id

    goal.current_amount = min(
        float(goal.current_amount) + data.amount,
        float(goal.target_amount),
    )

    sync_savings_to_budget(current_user, db)
    db.commit()
    db.refresh(goal)
    return goal


@router.delete("/{goal_id}")
def delete_goal(
    goal_id: str,
    current_user: str = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    try:
        parsed_id = uuid.UUID(goal_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid ID format")

    # Ownership check
    goal = db.query(SavingsGoal).filter(
        SavingsGoal.id == parsed_id,
        SavingsGoal.user_id == current_user,
    ).first()
    if not goal:
        raise HTTPException(status_code=404, detail="Goal not found")

    # BUG-06 fix: delete all BudgetCategory hub rows for this goal and their
    # linked transactions before removing the goal itself.  Without this, hub
    # rows and savings transactions were left as orphans when a goal was deleted.
    hubs = db.query(BudgetCategory).filter(
        BudgetCategory.user_id == current_user,
        BudgetCategory.type    == f"Savings: {goal.goal_name}",
    ).all()
    for hub in hubs:
        if hub.transaction_id:
            tx = db.query(Transaction).filter(
                Transaction.id == hub.transaction_id,
            ).first()
            if tx:
                db.delete(tx)
        db.delete(hub)

    db.flush()
    db.delete(goal)
    db.flush()
    sync_savings_to_budget(current_user, db)
    db.commit()
    return {"message": "Goal deleted"}