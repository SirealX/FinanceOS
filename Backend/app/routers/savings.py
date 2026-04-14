from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from ..database import get_db
from ..models import SavingsGoal, BudgetCategory, Transaction
from ..dependencies import get_current_user
from pydantic import BaseModel
from datetime import date as DateType
from typing import Optional
import uuid

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
        source="manual",
        is_draft=True,
        budget_category_id=hub.id,
    )
    db.add(tx)
    db.flush()

    hub.transaction_id = tx.id

    goal.current_amount = min(
        float(goal.current_amount) + data.amount,
        float(goal.target_amount),
    )

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

    db.delete(goal)
    db.commit()
    return {"message": "Goal deleted"}