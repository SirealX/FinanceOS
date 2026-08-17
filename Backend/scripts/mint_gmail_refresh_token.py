"""
Backend/scripts/mint_gmail_refresh_token.py
─────────────────────────────────────────────────────────────────────────────
OBSOLETE (2026-08-12) — kept only so old references to this file don't 404.

The email ingestion pipeline no longer uses the Gmail API / OAuth. It was
migrated to plain IMAP + a Gmail App Password — see Tracker.md "Email
Ingestion Pipeline" for the full incident writeup. Short version: Google's
OAuth consent screen forces a choice between "Testing" status (refresh
tokens silently expire every 7 days) and "In production" (requires proving
domain ownership + a homepage describing the app + matching app name — a
review process meant for multi-user SaaS apps, not a personal single-user
tool, and one that can't even be completed on a shared vercel.app subdomain).

There is nothing to run here anymore. Current setup:
  1. Enable 2-Step Verification on financeos.ingest@gmail.com.
  2. Generate an app password at myaccount.google.com/apppasswords.
  3. Set GMAIL_ADDRESS and GMAIL_APP_PASSWORD in Backend/.env + Render
     (replaces the old GMAIL_CLIENT_ID / GMAIL_CLIENT_SECRET /
     GMAIL_REFRESH_TOKEN — those are no longer read by the backend).

This file can be deleted whenever it's convenient; nothing imports it.
─────────────────────────────────────────────────────────────────────────────
"""

raise SystemExit(
    "mint_gmail_refresh_token.py is obsolete — email ingestion now uses IMAP "
    "+ a Gmail App Password, not OAuth. See the docstring in this file, or "
    "Tracker.md 'Email Ingestion Pipeline', for current setup steps."
)
