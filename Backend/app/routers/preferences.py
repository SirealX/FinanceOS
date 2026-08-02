"""
backend/app/routers/preferences.py
Each user gets their own preferences row, keyed by user_id.
GET auto-creates defaults on first call for a new user.
"""

import secrets
from datetime import date as date_type
from decimal import Decimal
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session
from typing import Optional
from pydantic import BaseModel, validator

from ..database import get_db
from ..models import Preferences
from ..dependencies import get_current_user

router = APIRouter(prefix="/preferences", tags=["preferences"])

# Item #6 (email ingestion). The dedicated ingestion inbox's local-part and
# domain, split so the per-user token can be inserted as a +alias:
#     <INGEST_LOCAL_PART>+<ingest_token>@<INGEST_DOMAIN>
# See Tracker.md "Email Ingestion Pipeline" for the inbox/OAuth setup this
# depends on -- must match whatever address that setup actually creates.
INGEST_LOCAL_PART = "financeos.ingest"
INGEST_DOMAIN = "gmail.com"

VALID_CURRENCIES = {"USD", "EUR", "GBP", "COP", "MXN", "BRL", "CAD", "ARS"}
VALID_DATE_FORMATS = {"MM/DD/YYYY", "DD/MM/YYYY", "YYYY-MM-DD", "MMM D, YYYY"}


class PreferencesUpdate(BaseModel):
    # Display
    display_name: Optional[str]  = None
    currency:     Optional[str]  = None
    date_format:  Optional[str]  = None
    month_start:  Optional[int]  = None

    # Bank balance reconciliation
    bank_balance:         Optional[Decimal]   = None
    bank_balance_date:    Optional[date_type] = None
    initial_balance:      Optional[Decimal]   = None
    tracking_start_date:  Optional[date_type] = None
    show_balance_gap:     Optional[bool]      = None
    balance_reminder_day: Optional[int]       = None   # 1-28 or None to disable
    # Snapshot of the app's own closing_balance at save time — used to project
    # the bank balance forward without the user re-entering it each time.
    balance_anchor_app:   Optional[Decimal]   = None

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

    @validator("balance_reminder_day")
    def validate_reminder_day(cls, v):
        if v is not None and not (1 <= v <= 28):
            raise ValueError("balance_reminder_day must be between 1 and 28.")
        return v


def _serialize(prefs: Preferences) -> dict:
    return {
        "id":           str(prefs.id),
        "display_name": prefs.display_name,
        "currency":     prefs.currency,
        "date_format":  prefs.date_format,
        "month_start":  prefs.month_start,
        "bank_balance":         float(prefs.bank_balance) if prefs.bank_balance is not None else None,
        "bank_balance_date":    prefs.bank_balance_date.isoformat() if prefs.bank_balance_date else None,
        "initial_balance":      float(prefs.initial_balance) if prefs.initial_balance is not None else None,
        "tracking_start_date":  prefs.tracking_start_date.isoformat() if prefs.tracking_start_date else None,
        "show_balance_gap":     bool(prefs.show_balance_gap),
        "balance_reminder_day": prefs.balance_reminder_day,
        "balance_anchor_app":   float(prefs.balance_anchor_app) if prefs.balance_anchor_app is not None else None,
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
            show_balance_gap=False,
        )
        db.add(prefs)
        db.commit()
        db.refresh(prefs)
    return prefs


def _ingest_email(prefs: Preferences) -> Optional[str]:
    if not prefs.ingest_token:
        return None
    return f"{INGEST_LOCAL_PART}+{prefs.ingest_token}@{INGEST_DOMAIN}"


@router.get("/")
def get_preferences(
    current_user: str = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    prefs = _get_or_create(current_user, db)
    data = _serialize(prefs)
    data["ingest_email"] = _ingest_email(prefs)
    return data


@router.post("/ingest-email")
def create_ingest_email(
    current_user: str = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Generates (or returns the existing) email-ingestion forwarding address for
    this user. Lazy on purpose -- most users will never opt into email
    ingestion, so nobody gets a token minted for them just by loading
    Settings. Idempotent: calling this again just returns the same address.
    """
    prefs = _get_or_create(current_user, db)
    if prefs.ingest_token:
        return {"ingest_email": _ingest_email(prefs)}

    # Retry on the (astronomically unlikely) chance of a token collision --
    # same defensive pattern as any other unique-random-value generation.
    for _ in range(5):
        candidate = secrets.token_hex(10)  # 20 hex chars, well under the 24-char column
        prefs.ingest_token = candidate
        try:
            db.commit()
            db.refresh(prefs)
            return {"ingest_email": _ingest_email(prefs)}
        except IntegrityError:
            db.rollback()
            continue

    raise HTTPException(status_code=500, detail="Could not generate a unique ingest_token — try again.")


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

    if data.bank_balance         is not None: prefs.bank_balance         = data.bank_balance
    if data.bank_balance_date    is not None: prefs.bank_balance_date    = data.bank_balance_date
    if data.initial_balance      is not None: prefs.initial_balance      = data.initial_balance
    if data.tracking_start_date  is not None: prefs.tracking_start_date  = data.tracking_start_date
    if data.show_balance_gap     is not None: prefs.show_balance_gap     = data.show_balance_gap
    if "balance_reminder_day" in data.dict(exclude_unset=True):
        prefs.balance_reminder_day = data.balance_reminder_day
    if data.balance_anchor_app   is not None: prefs.balance_anchor_app   = data.balance_anchor_app

    db.commit()
    db.refresh(prefs)
    return _serialize(prefs)
