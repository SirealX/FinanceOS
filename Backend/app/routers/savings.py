from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from ..database import get_db
from ..models import SavingsGoal, BudgetCategory, Transaction
from pydantic import BaseModel
from datetime import date as DateType
from typing import Optional

router = APIRouter(prefix="/savings", tags=["savings"])


class SavingsCreate(BaseModel):
    goal_name: str
    target_amount: float
    current_amount: float = 0.0
    deadline_date: Optional[DateType] = None


class SavingsUpdate(BaseModel):
    goal_name: Optional[str] = None
    target_amount: Optional[float] = None
    current_amount: Optional[float] = None
    deadline_date: Optional[DateType] = None


class ContributionUpdate(BaseModel):
    amount: float


@router.get("/")
def get_savings(db: Session = Depends(get_db)):
    return db.query(SavingsGoal).all()


@router.post("/")
def create_goal(data: SavingsCreate, db: Session = Depends(get_db)):
    goal = SavingsGoal(
        goal_name=data.goal_name,
        target_amount=data.target_amount,
        current_amount=data.current_amount,
        deadline_date=data.deadline_date,
    )
    db.add(goal)
    db.commit()
    db.refresh(goal)
    return goal


@router.put("/{goal_id}")
def update_goal(goal_id: str, data: SavingsUpdate, db: Session = Depends(get_db)):
    goal = db.query(SavingsGoal).filter(SavingsGoal.id == goal_id).first()
    if not goal:
        raise HTTPException(status_code=404, detail="Goal not found")
    for key, value in data.dict(exclude_unset=True).items():
        setattr(goal, key, value)
    db.commit()
    db.refresh(goal)
    return goal


@router.put("/{goal_id}/contribute")
def log_contribution(
    goal_id: str,
    data: ContributionUpdate,
    db: Session = Depends(get_db),
):
    goal = db.query(SavingsGoal).filter(SavingsGoal.id == goal_id).first()
    if not goal:
        raise HTTPException(status_code=404, detail="Goal not found")

    contribution_date = DateType.today()

    # ── Create backbone row first ─────────────────────────────────────────────
    hub = BudgetCategory(
        transaction_id=None,
        transaction_name=f"Contribution: {goal.goal_name}",
        transaction_payment_method=None,
        categories_name="Savings",          # soft ref to categories.name
        type=f"Savings: {goal.goal_name}",
        amount=data.amount,
        date=contribution_date,
    )
    db.add(hub)
    db.flush()

    # ── Create transaction linked to backbone ─────────────────────────────────
    tx = Transaction(
        date=contribution_date,
        description=f"Contribution: {goal.goal_name}",
        category="Savings",
        type="savings",
        amount=data.amount,
        payment_method=None,
        source="manual",
        is_draft=True,
        budget_category_id=hub.id,
    )
    db.add(tx)
    db.flush()

    hub.transaction_id = tx.id

    # ── Update goal current_amount ────────────────────────────────────────────
    goal.current_amount = min(
        float(goal.current_amount) + data.amount,
        float(goal.target_amount),
    )

    db.commit()
    db.refresh(goal)
    return goal


@router.delete("/{goal_id}")
def delete_goal(goal_id: str, db: Session = Depends(get_db)):
    goal = db.query(SavingsGoal).filter(SavingsGoal.id == goal_id).first()
    if not goal:
        raise HTTPException(status_code=404, detail="Goal not found")
    db.delete(goal)
    db.commit()
    return {"message": "Goal deleted"}