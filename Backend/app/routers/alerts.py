"""
backend/app/routers/alerts.py
─────────────────────────────────────────────────────────────────────────────
Alert CRUD and preferences endpoints.

Routes
  GET    /alerts                  — list unread + recent alerts
  PUT    /alerts/{id}/read        — mark a single alert as read
  DELETE /alerts/{id}             — delete an alert
  GET    /alerts/unread-count     — count of unread Tier 1+2 alerts (for badge)
  GET    /alerts/preferences      — get delivery settings
  PUT    /alerts/preferences      — update delivery settings
  POST   /alerts/telegram/connect — store chat_id after user starts the bot
  POST   /alerts/pwa/subscribe    — store push subscription object
─────────────────────────────────────────────────────────────────────────────
"""

from datetime import datetime, time
from decimal import Decimal
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, validator
from sqlalchemy.orm import Session

from ..database import get_db
from ..dependencies import get_current_user
from ..models import Alert, AlertPreferences, Preferences
from ..alert_engine import evaluate_alerts, _get_or_create_prefs

router = APIRouter(prefix="/alerts", tags=["alerts"])


# ─────────────────────────────────────────────────────────────────────────────
# Serialisers
# ─────────────────────────────────────────────────────────────────────────────

def _ser_alert(a: Alert) -> dict:
    return {
        "id":             str(a.id),
        "type":           a.type,
        "tier":           a.tier,
        "title":          a.title,
        "body":           a.body,
        "severity":       a.severity,
        "entity_type":    a.entity_type,
        "entity_id":      a.entity_id,
        "source":         a.source,
        "created_at":     a.created_at.isoformat() if a.created_at else None,
        "read_at":        a.read_at.isoformat() if a.read_at else None,
        "fired_immediate": a.fired_immediate,
    }


def _ser_prefs(p: AlertPreferences) -> dict:
    return {
        "telegram_chat_id":      p.telegram_chat_id,
        "telegram_enabled":      p.telegram_enabled,
        "telegram_consented":    p.telegram_consented,
        "telegram_active_mode":  p.telegram_active_mode,
        "pwa_push_enabled":      p.pwa_push_enabled,
        "pwa_push_subscription": p.pwa_push_subscription,
        "digest_enabled":        p.digest_enabled,
        "digest_time":           str(p.digest_time) if p.digest_time else "09:00:00",
        "immediate_enabled":     p.immediate_enabled,
        "bill_due_days":         p.bill_due_days,
        "large_tx_threshold":    float(p.large_tx_threshold) if p.large_tx_threshold else None,
        "low_balance_floor":     float(p.low_balance_floor) if p.low_balance_floor else None,
        "alert_mode":            getattr(p, "alert_mode", "informative") or "informative",
        "periodic_review_freq":  getattr(p, "periodic_review_freq", None),
    }


# ─────────────────────────────────────────────────────────────────────────────
# Schemas
# ─────────────────────────────────────────────────────────────────────────────

class AlertPreferencesUpdate(BaseModel):
    telegram_enabled:     Optional[bool]    = None
    telegram_consented:   Optional[bool]    = None
    telegram_active_mode: Optional[bool]    = None
    pwa_push_enabled:     Optional[bool]    = None
    digest_enabled:       Optional[bool]    = None
    digest_time:          Optional[str]     = None   # "HH:MM" string
    immediate_enabled:    Optional[bool]    = None
    bill_due_days:        Optional[int]     = None
    large_tx_threshold:   Optional[float]   = None   # null disables feature
    low_balance_floor:    Optional[float]   = None   # null disables feature
    alert_mode:           Optional[str]     = None   # informative | interactive
    periodic_review_freq: Optional[str]     = None   # monthly | quarterly | semester | "" (disable)

    @validator("alert_mode")
    def validate_alert_mode(cls, v):
        if v is not None and v not in ("informative", "interactive", ""):
            raise ValueError("alert_mode must be informative or interactive")
        return v

    @validator("periodic_review_freq")
    def validate_periodic_review_freq(cls, v):
        if v is not None and v not in ("monthly", "quarterly", "semester", ""):
            raise ValueError("periodic_review_freq must be monthly, quarterly, semester, or empty")
        return v

    @validator("bill_due_days")
    def validate_bill_due_days(cls, v):
        if v is not None and not (1 <= v <= 30):
            raise ValueError("bill_due_days must be between 1 and 30")
        return v

    @validator("digest_time")
    def validate_digest_time(cls, v):
        if v is not None:
            try:
                parts = v.split(":")
                hour, minute = int(parts[0]), int(parts[1])
                if not (0 <= hour <= 23 and 0 <= minute <= 59):
                    raise ValueError()
            except Exception:
                raise ValueError("digest_time must be HH:MM")
        return v


class TelegramConnectBody(BaseModel):
    chat_id: str


class PushSubscribeBody(BaseModel):
    subscription: dict   # full WebPush subscription object from the browser


# ─────────────────────────────────────────────────────────────────────────────
# Routes
# ─────────────────────────────────────────────────────────────────────────────

@router.get("/")
def list_alerts(
    unread_only: bool = False,
    limit: int = 50,
    current_user: str = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Return the user's alert feed.
    By default returns the 50 most recent alerts (unread first, then read).
    Pass ?unread_only=true to filter to unread only.

    Also touches preferences.last_seen_at so the scheduler knows the user
    is active (session-boundary detection, spec §5).
    """
    _touch_last_seen(current_user, db)

    q = (
        db.query(Alert)
        .filter(Alert.user_id == current_user)
    )
    if unread_only:
        q = q.filter(Alert.read_at == None)

    alerts = (
        q
        .order_by(Alert.read_at.asc().nullsfirst(), Alert.created_at.desc())
        .limit(limit)
        .all()
    )
    return [_ser_alert(a) for a in alerts]


@router.get("/unread-count")
def unread_count(
    current_user: str = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Count of unread Tier 1 and Tier 2 alerts.
    Used by the sidebar badge in the frontend.
    Also touches last_seen_at.
    """
    _touch_last_seen(current_user, db)

    count = (
        db.query(Alert)
        .filter(
            Alert.user_id == current_user,
            Alert.tier.in_([1, 2]),
            Alert.read_at == None,
        )
        .count()
    )
    return {"count": count}


@router.put("/{alert_id}/read")
def mark_read(
    alert_id: str,
    current_user: str = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Mark a single alert as read (sets read_at to now)."""
    alert = _get_alert_or_404(alert_id, current_user, db)
    if alert.read_at is None:
        alert.read_at = datetime.utcnow()
        db.commit()
        db.refresh(alert)
    return _ser_alert(alert)


@router.put("/read-all")
def mark_all_read(
    current_user: str = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Mark all unread alerts as read."""
    now = datetime.utcnow()
    unread = (
        db.query(Alert)
        .filter(Alert.user_id == current_user, Alert.read_at == None)
        .all()
    )
    for a in unread:
        a.read_at = now
    db.commit()
    return {"marked": len(unread)}


@router.delete("/{alert_id}")
def delete_alert(
    alert_id: str,
    current_user: str = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Permanently delete an alert."""
    alert = _get_alert_or_404(alert_id, current_user, db)
    db.delete(alert)
    db.commit()
    return {"deleted": alert_id}


# ── Preferences ───────────────────────────────────────────────────────────────

@router.get("/preferences")
def get_preferences(
    current_user: str = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    prefs = _get_or_create_prefs(current_user, db)
    return _ser_prefs(prefs)


@router.put("/preferences")
def update_preferences(
    data: AlertPreferencesUpdate,
    current_user: str = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    prefs = _get_or_create_prefs(current_user, db)

    if data.telegram_enabled     is not None: prefs.telegram_enabled     = data.telegram_enabled
    if data.telegram_consented   is not None: prefs.telegram_consented   = data.telegram_consented
    if data.telegram_active_mode is not None: prefs.telegram_active_mode = data.telegram_active_mode
    if data.pwa_push_enabled     is not None: prefs.pwa_push_enabled     = data.pwa_push_enabled
    if data.digest_enabled       is not None: prefs.digest_enabled       = data.digest_enabled
    if data.immediate_enabled    is not None: prefs.immediate_enabled    = data.immediate_enabled
    if data.bill_due_days        is not None: prefs.bill_due_days        = data.bill_due_days

    if data.digest_time is not None:
        h, m = [int(x) for x in data.digest_time.split(":")]
        prefs.digest_time = time(h, m)

    # None means "disable the feature" — store null in DB
    if "large_tx_threshold" in data.__fields_set__:
        prefs.large_tx_threshold = Decimal(str(data.large_tx_threshold)) if data.large_tx_threshold else None
    if "low_balance_floor" in data.__fields_set__:
        prefs.low_balance_floor = Decimal(str(data.low_balance_floor)) if data.low_balance_floor else None
    if data.alert_mode is not None:
        prefs.alert_mode = data.alert_mode if data.alert_mode else "informative"
    if data.periodic_review_freq is not None:
        prefs.periodic_review_freq = data.periodic_review_freq if data.periodic_review_freq else None

    db.commit()
    db.refresh(prefs)
    return _ser_prefs(prefs)


# ── Telegram ──────────────────────────────────────────────────────────────────

@router.post("/telegram/connect")
def connect_telegram(
    body: TelegramConnectBody,
    current_user: str = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Store the user's Telegram chat_id after they have started the bot.
    The frontend must only call this after the user confirms the consent modal
    (telegram_consented should already be true at this point).
    """
    prefs = _get_or_create_prefs(current_user, db)
    prefs.telegram_chat_id = body.chat_id
    prefs.telegram_enabled = True
    db.commit()
    db.refresh(prefs)
    return _ser_prefs(prefs)


@router.post("/telegram/disconnect")
def disconnect_telegram(
    current_user: str = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Disconnect Telegram and clear consent so the modal appears again on reconnect.
    Per spec §6A: 'If the user later disconnects Telegram and reconnects, the modal shows again.'
    """
    prefs = _get_or_create_prefs(current_user, db)
    prefs.telegram_chat_id   = None
    prefs.telegram_enabled   = False
    prefs.telegram_consented = False
    prefs.telegram_active_mode = False
    db.commit()
    db.refresh(prefs)
    return _ser_prefs(prefs)


# ── PWA Push ──────────────────────────────────────────────────────────────────

@router.post("/pwa/subscribe")
def pwa_subscribe(
    body: PushSubscribeBody,
    current_user: str = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Store the browser push subscription object and enable PWA push."""
    prefs = _get_or_create_prefs(current_user, db)
    prefs.pwa_push_subscription = body.subscription
    prefs.pwa_push_enabled      = True
    db.commit()
    db.refresh(prefs)
    return _ser_prefs(prefs)


@router.post("/pwa/unsubscribe")
def pwa_unsubscribe(
    current_user: str = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Remove push subscription and disable PWA push."""
    prefs = _get_or_create_prefs(current_user, db)
    prefs.pwa_push_subscription = None
    prefs.pwa_push_enabled      = False
    db.commit()
    db.refresh(prefs)
    return _ser_prefs(prefs)


# ─────────────────────────────────────────────────────────────────────────────
# Internal helpers
# ─────────────────────────────────────────────────────────────────────────────

def _get_alert_or_404(alert_id: str, user_id: str, db: Session) -> Alert:
    alert = (
        db.query(Alert)
        .filter(Alert.id == alert_id, Alert.user_id == user_id)
        .first()
    )
    if not alert:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Alert not found")
    return alert


def _touch_last_seen(user_id: str, db: Session) -> None:
    """Update preferences.last_seen_at on every authenticated view call."""
    prefs = db.query(Preferences).filter(Preferences.user_id == user_id).first()
    if prefs:
        prefs.last_seen_at = datetime.utcnow()
        db.commit()
