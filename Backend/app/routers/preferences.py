"""
backend/app/routers/preferences.py
─────────────────────────────────────────────────────────────────────────────
Preferences endpoints.

  GET  /preferences      → Return current preferences (creates defaults
                           on first call if no row exists yet)
  PUT  /preferences      → Update one or more preference fields

Design notes:
  • Single global row for now. When auth lands, add user_id to the model
    and filter every query by the current user — no other change needed.
  • GET is safe to call on a fresh DB — it seeds the default row
    automatically so the frontend never receives a 404.
─────────────────────────────────────────────────────────────────────────────
"""

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import Optional
from pydantic import BaseModel, validator

from ..database import get_db
from ..models import Preferences

router = APIRouter(prefix="/preferences", tags=["preferences"])


# ── Valid option sets (mirrors MockData.js constants) ─────────────────────────

VALID_CURRENCIES = {
    "USD", "EUR", "GBP", "COP", "MXN", "BRL", "CAD", "ARS"
}

VALID_DATE_FORMATS = {
    "MM/DD/YYYY",
    "DD/MM/YYYY",
    "YYYY-MM-DD",
    "MMM D, YYYY",
}


# ── Pydantic schemas ──────────────────────────────────────────────────────────

class PreferencesUpdate(BaseModel):
    currency:     Optional[str] = None
    date_format:  Optional[str] = None
    month_start:  Optional[int] = None

    @validator("currency")
    def validate_currency(cls, v):
        if v is not None and v not in VALID_CURRENCIES:
            raise ValueError(
                f"Invalid currency '{v}'. "
                f"Must be one of: {', '.join(sorted(VALID_CURRENCIES))}"
            )
        return v

    @validator("date_format")
    def validate_date_format(cls, v):
        if v is not None and v not in VALID_DATE_FORMATS:
            raise ValueError(
                f"Invalid date format '{v}'. "
                f"Must be one of: {', '.join(sorted(VALID_DATE_FORMATS))}"
            )
        return v

    @validator("month_start")
    def validate_month_start(cls, v):
        if v is not None and not (1 <= v <= 28):
            raise ValueError(
                f"month_start must be between 1 and 28, got {v}"
            )
        return v


# ── Helpers ───────────────────────────────────────────────────────────────────

def _serialize(prefs: Preferences) -> dict:
    return {
        "id":          str(prefs.id),
        "currency":    prefs.currency,
        "date_format": prefs.date_format,
        "month_start": prefs.month_start,
    }


def _get_or_create(db: Session) -> Preferences:
    """
    Returns the single preferences row, creating it with defaults
    if it does not exist yet. Safe to call on every GET request.
    """
    prefs = db.query(Preferences).first()
    if not prefs:
        prefs = Preferences(
            currency="USD",
            date_format="MMM D, YYYY",
            month_start=1,
        )
        db.add(prefs)
        db.commit()
        db.refresh(prefs)
    return prefs


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.get("/")
def get_preferences(db: Session = Depends(get_db)):
    """
    Return the current preferences.
    Creates a default row on first call — the frontend never receives a 404.
    """
    return _serialize(_get_or_create(db))


@router.put("/")
def update_preferences(data: PreferencesUpdate, db: Session = Depends(get_db)):
    """
    Update one or more preference fields.
    Omitted fields are left unchanged.
    """
    prefs = _get_or_create(db)

    if data.currency is not None:
        prefs.currency = data.currency

    if data.date_format is not None:
        prefs.date_format = data.date_format

    if data.month_start is not None:
        prefs.month_start = data.month_start

    db.commit()
    db.refresh(prefs)
    return _serialize(prefs)