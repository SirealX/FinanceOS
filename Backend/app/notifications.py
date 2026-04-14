"""
backend/app/notifications.py
─────────────────────────────────────────────────────────────────────────────
External notification dispatch — Telegram + PWA Push.

STATUS: STUB — functions are defined but no-ops until Step 8 (spec §12):
  🔑 A. Create the Telegram bot via @BotFather → add TELEGRAM_BOT_TOKEN to .env
  🔑 B. Generate VAPID keys → add VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY / VAPID_CONTACT_EMAIL

Once those env variables exist, un-stub by installing the dependencies and
uncomment the real implementations below.

Install when ready:
  pip install python-telegram-bot pywebpush

Both functions are fire-and-forget — a failed dispatch logs a warning but
does NOT roll back the alert record already written to the database.
─────────────────────────────────────────────────────────────────────────────
"""

import json
import logging
import os
from typing import Optional

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
        log.warning("[notifications] TELEGRAM_BOT_TOKEN not set — Telegram stub, skipping send")
        return

    # ── Real implementation (un-stub after Step 8A) ───────────────────────────
    # import httpx
    # payload = {"chat_id": chat_id, "text": message, "parse_mode": "Markdown"}
    # if buttons:
    #     payload["reply_markup"] = {"inline_keyboard": buttons}
    # url = f"https://api.telegram.org/bot{TELEGRAM_BOT_TOKEN}/sendMessage"
    # resp = httpx.post(url, json=payload, timeout=10)
    # resp.raise_for_status()
    # log.info("[notifications] Telegram sent to %s", chat_id)

    log.debug("[notifications] STUB send_telegram(chat_id=%s, len=%d)", chat_id, len(message))


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
        log.warning("[notifications] VAPID_PRIVATE_KEY not set — PWA push stub, skipping send")
        return

    # ── Real implementation (un-stub after Step 8B) ───────────────────────────
    # from pywebpush import webpush, WebPushException
    # payload = json.dumps({"title": title, "body": body, "url": url or "/"})
    # try:
    #     webpush(
    #         subscription_info = subscription_json,
    #         data              = payload,
    #         vapid_private_key = VAPID_PRIVATE_KEY,
    #         vapid_claims      = {
    #             "sub": f"mailto:{VAPID_CONTACT_EMAIL}",
    #         },
    #     )
    #     log.info("[notifications] PWA push sent to %s", subscription_json.get("endpoint", "?"))
    # except WebPushException as exc:
    #     log.error("[notifications] PWA push failed: %s", exc)
    #     raise

    log.debug("[notifications] STUB send_push(title=%s)", title)
