"""add alerts schema step 1 — source enum values, reviewed, last_seen_at

Revision ID: a1b2c3d4e5f6
Revises: f7a3b2c1d4e5
Create Date: 2026-04-14

Adds the three new source enum values required by the alerts spec:
  bill_payment, savings_contribution, csv_import

Adds two new columns:
  transactions.reviewed    — tracks whether an imported/synced row was reviewed
  preferences.last_seen_at — session-boundary detection for digest timing
"""
from typing import Sequence, Union
from alembic import op


revision: str = 'a1b2c3d4e5f6'
down_revision: Union[str, Sequence[str], None] = 'f7a3b2c1d4e5'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # ── Extend source_type enum with new values ───────────────────────────────
    # ADD VALUE IF NOT EXISTS is safe to re-run and works in PG 9.3+
    # In PG 12+ this is allowed inside a transaction; Supabase uses PG 15.
    op.execute("ALTER TYPE source_type ADD VALUE IF NOT EXISTS 'bill_payment'")
    op.execute("ALTER TYPE source_type ADD VALUE IF NOT EXISTS 'savings_contribution'")
    op.execute("ALTER TYPE source_type ADD VALUE IF NOT EXISTS 'csv_import'")

    # ── transactions.reviewed ─────────────────────────────────────────────────
    # False for imports/sync so they show up in the unreviewed queue.
    # True for manual entries (no review needed).
    op.execute("""
        ALTER TABLE transactions
            ADD COLUMN IF NOT EXISTS reviewed BOOLEAN NOT NULL DEFAULT FALSE;
    """)
    # Backfill: all existing manual rows are already "reviewed"
    op.execute("""
        UPDATE transactions
           SET reviewed = TRUE
         WHERE source = 'manual' OR source IS NULL;
    """)

    # ── preferences.last_seen_at ──────────────────────────────────────────────
    # Updated on every authenticated API request via a middleware touch.
    # NULL means the user has never been seen (new account).
    op.execute("""
        ALTER TABLE preferences
            ADD COLUMN IF NOT EXISTS last_seen_at TIMESTAMP WITHOUT TIME ZONE;
    """)


def downgrade() -> None:
    # Intentionally no-op — removing enum values requires recreating the type
    # which is destructive. Drop columns only.
    op.execute("""
        ALTER TABLE preferences
            DROP COLUMN IF EXISTS last_seen_at;
    """)
    op.execute("""
        ALTER TABLE transactions
            DROP COLUMN IF EXISTS reviewed;
    """)
