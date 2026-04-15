"""
backend/app/routers/preferences.py — AUTH UPDATE
Each user gets their own preferences row, keyed by user_id.
GET auto-creates defaults on first call for a new user.
"""

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from typing import Optional
from pydantic import BaseModel, validator

from ..database import get_db
from ..models import Preferences
from ..dependencies import get_current_user

router = APIRouter(prefix="/preferences", tags=["preferences"])

VALID_CURRENCIES = {"USD", "EUR", "GBP", "COP", "MXN", "BRL", "CAD", "ARS"}
VALID_DATE_FORMATS = {"MM/DD/YYYY", "DD/MM/YYYY", "YYYY-MM-DD", "MMM D, YYYY"}


class PreferencesUpdate(BaseModel):
    display_name: Optional[str] = None
    currency:     Optional[str] = None
    date_format:  Optional[str] = None
    month_start:  Optional[int] = None

    @validator("currency")
    def validate_currency(cls, v):
        if v is not None and v not in VALID_CURRENCIES:
            raise ValueError(f"Invalid currency '{v}'.")
        return v

    @validator("date_format")
    def validate_date_format(cls, v):
        if v is not None and v not in VALID_DATE_FORMATS:
            raise ValueError(f"Invalid date format '{v}'.")
        return v

    @validator("month_start")
    def validate_month_start(cls, v):
        if v is not None and not (1 <= v <= 28):
            raise ValueError(f"month_start must be between 1 and 28.")
        return v


def _serialize(prefs: Preferences) -> dict:
    return {
        "id":           str(prefs.id),
        "display_name": prefs.display_name,   # None when not yet set
        "currency":     prefs.currency,
        "date_format":  prefs.date_format,
        "month_start":  prefs.month_start,
    }


def _get_or_create(user_id: str, db: Session) -> Preferences:
    """Returns this user's preferences row, creating defaults on first call."""
    prefs = db.query(Preferences).filter(Preferences.user_id == user_id).first()
    if not prefs:
        prefs = Preferences(
            user_id=user_id,
            currency="USD",
            date_format="MMM D, YYYY",
            month_start=1,
        )
        db.add(prefs)
        db.commit()
        db.refresh(prefs)
    return prefs


@router.get("/")
def get_preferences(
    current_user: str = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return _serialize(_get_or_create(current_user, db))


@router.put("/")
def update_preferences(
    data: PreferencesUpdate,
    current_user: str = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    prefs = _get_or_create(current_user, db)

    if data.display_name is not None: prefs.display_name = data.display_name.strip() or None
    if data.currency     is not None: prefs.currency     = data.currency
    if data.date_format  is not None: prefs.date_format  = data.date_format
    if data.month_start  is not None: prefs.month_start  = data.month_start

    db.commit()
    db.refresh(prefs)
    return _serialize(prefs)