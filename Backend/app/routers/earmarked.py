"""
backend/app/routers/earmarked.py — Earmarked Funds  (#4)
─────────────────────────────────────────────────────────────────────────────
Money reserved for a known future expense.  Does NOT count as income or
expense — it just reduces "Free to Spend" on the dashboard.

Endpoints
  GET    /earmarked          → list all earmarks for the current user
  POST   /earmarked          → create a new earmark
  PUT    /earmarked/{id}     → update an earmark
  DELETE /earmarked/{id}     → delete an earmark
"""

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from ..database import get_db
from ..models import EarmarkedFund
from ..dependencies import get_current_user
from pydantic import BaseModel
from typing import Optional
from datetime import date as DateType
import uuid

router = APIRouter(prefix="/earmarked", tags=["earmarked"])


class EarmarkedCreate(BaseModel):
    name: str
    amount: float
    due_date: Optional[DateType] = None
    note: Optional[str] = None


class EarmarkedUpdate(BaseModel):
    name: Optional[str] = None
    amount: Optional[float] = None
    due_date: Optional[DateType] = None
    note: Optional[str] = None


def _serialize(r: EarmarkedFund) -> dict:
    return {
        "id":         str(r.id),
        "name":       r.name,
        "amount":     float(r.amount),
        "due_date":   r.due_date.isoformat() if r.due_date else None,
        "note":       r.note,
        "created_at": r.created_at.isoformat() if r.created_at else None,
    }


@router.get("/")
def get_earmarked(
    current_user: str = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    rows = (
        db.query(EarmarkedFund)
        .filter(EarmarkedFund.user_id == current_user)
        .order_by(EarmarkedFund.due_date.asc().nullsfirst(), EarmarkedFund.created_at.asc())
        .all()
    )
    return [_serialize(r) for r in rows]


@router.post("/", status_code=201)
def create_earmarked(
    data: EarmarkedCreate,
    current_user: str = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    row = EarmarkedFund(
        user_id  = current_user,
        name     = data.name.strip(),
        amount   = data.amount,
        due_date = data.due_date,
        note     = data.note,
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return _serialize(row)


@router.put("/{earmark_id}")
def update_earmarked(
    earmark_id: str,
    data: EarmarkedUpdate,
    current_user: str = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    try:
        parsed_id = uuid.UUID(earmark_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid ID format")

    row = db.query(EarmarkedFund).filter(
        EarmarkedFund.id == parsed_id,
        EarmarkedFund.user_id == current_user,
    ).first()
    if not row:
        raise HTTPException(status_code=404, detail="Earmark not found")

    for key, value in data.dict(exclude_unset=True).items():
        setattr(row, key, value)

    db.commit()
    db.refresh(row)
    return _serialize(row)


@router.delete("/{earmark_id}")
def delete_earmarked(
    earmark_id: str,
    current_user: str = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    try:
        parsed_id = uuid.UUID(earmark_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid ID format")

    row = db.query(EarmarkedFund).filter(
        EarmarkedFund.id == parsed_id,
        EarmarkedFund.user_id == current_user,
    ).first()
    if not row:
        raise HTTPException(status_code=404, detail="Earmark not found")

    db.delete(row)
    db.commit()
    return {"message": "Earmark deleted"}
