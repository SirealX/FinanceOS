"""
backend/app/notifications.py
─────────────────────────────────────────────────────────────────────────────
External notification dispatch — Telegram + PWA Push.

Both functions are fire-and-forget — a failed dispatch logs a warning but
does NOT roll back the alert record already written to the database.
─────────────────────────────────────────────────────────────────────────────
"""

import json
import logging
import os
from typing import Optional

import httpx

log = logging.getLogger(__name__)

TELEGRAM_BOT_TOKEN   = os.getenv("TELEGRAM_BOT_TOKEN", "")
VAPID_PUBLIC_KEY     = os.getenv("VAPID_PUBLIC_KEY", "")
VAPID_PRIVATE_KEY    = os.getenv("VAPID_PRIVATE_KEY", "")
VAPID_CONTACT_EMAIL  = os.getenv("VAPID_CONTACT_EMAIL", "")


# ─────────────────────────────────────────────────────────────────────────────
# Telegram
# ─────────────────────────────────────────────────────────────────────────────

def send_telegram(
    chat_id: str,
    message: str,
    buttons: Optional[list] = None,
) -> None:
    """
    Send a Telegram message to the user's personal chat.

    Parameters
    ----------
    chat_id  : stored in alert_preferences.telegram_chat_id
    message  : plain-text body (supports Telegram Markdown v2 if needed)
    buttons  : optional list of quick-reply button rows (active mode only)
               Format: [[{"text": "Label", "callback_data": "value"}, …], …]

    Note: Telegram bot messages are NOT end-to-end encrypted.
    The user must consent before this channel is activated (spec §6A).
    """
    if not TELEGRAM_BOT_TOKEN:
        log.warning("[notifications] TELEGRAM_BOT_TOKEN not set — skipping Telegram send")
        return

    payload: dict = {"chat_id": chat_id, "text": message, "parse_mode": "Markdown"}
    if buttons:
        payload["reply_markup"] = {"inline_keyboard": buttons}

    url = f"https://api.telegram.org/bot{TELEGRAM_BOT_TOKEN}/sendMessage"
    try:
        resp = httpx.post(url, json=payload, timeout=10)
        resp.raise_for_status()
        log.info("[notifications] Telegram sent to chat_id=%s", chat_id)
    except httpx.HTTPStatusError as exc:
        log.error(
            "[notifications] Telegram HTTP error %s: %s",
            exc.response.status_code,
            exc.response.text,
        )
    except httpx.RequestError as exc:
        log.error("[notifications] Telegram request failed: %s", exc)


# ─────────────────────────────────────────────────────────────────────────────
# PWA Push
# ─────────────────────────────────────────────────────────────────────────────

def send_push(
    subscription_json: dict,
    title: str,
    body: str,
    url: Optional[str] = None,
) -> None:
    """
    Send a Web Push notification using VAPID authentication.

    Parameters
    ----------
    subscription_json : the full push subscription object stored in
                        alert_preferences.pwa_push_subscription
    title             : notification title shown by the OS
    body              : notification body text
    url               : (optional) deep-link URL opened when user taps

    Data never leaves the user's device ecosystem (spec §6B).
    The browser's encrypted push service relays the message directly.
    """
    if not VAPID_PRIVATE_KEY:
        log.warning("[notifications] VAPID_PRIVATE_KEY not set — skipping PWA push send")
        return

    from pywebpush import webpush, WebPushException  # noqa: PLC0415

    payload = json.dumps({"title": title, "body": body, "url": url or "/"})
    try:
        webpush(
            subscription_info=subscription_json,
            data=payload,
            vapid_private_key=VAPID_PRIVATE_KEY,
            vapid_claims={"sub": f"mailto:{VAPID_CONTACT_EMAIL}"},
        )
        log.info("[notifications] PWA push sent to %s", subscription_json.get("endpoint", "?"))
    except WebPushException as exc:
        log.error("[notifications] PWA push failed: %s", exc)
        raise
