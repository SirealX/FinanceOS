"""add missing user_id columns (safe catch-up)

Revision ID: f7a3b2c1d4e5
Revises: e3f1a2b4c5d6
Create Date: 2026-04-14 01:00:00.000000

This migration is a safe catch-up that adds user_id (and related columns) to
any table that is missing them.  Using raw SQL with IF NOT EXISTS makes every
op idempotent — it is safe to run on a database that already has the columns
as well as one that doesn't.
"""
from typing import Sequence, Union
from alembic import op


revision: str = 'f7a3b2c1d4e5'
down_revision: Union[str, Sequence[str], None] = 'e3f1a2b4c5d6'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # ── transactions ──────────────────────────────────────────────────────────
    op.execute("""
        ALTER TABLE transactions
            ADD COLUMN IF NOT EXISTS user_id UUID;
    """)
    op.execute("""
        CREATE INDEX IF NOT EXISTS ix_transactions_user_id
            ON transactions (user_id);
    """)

    # ── budget_categories ─────────────────────────────────────────────────────
    op.execute("""
        ALTER TABLE budget_categories
            ADD COLUMN IF NOT EXISTS user_id UUID;
    """)
    op.execute("""
        CREATE INDEX IF NOT EXISTS ix_budget_categories_user_id
            ON budget_categories (user_id);
    """)

    # ── bills ─────────────────────────────────────────────────────────────────
    op.execute("""
        ALTER TABLE bills
            ADD COLUMN IF NOT EXISTS user_id UUID;
    """)
    op.execute("""
        CREATE INDEX IF NOT EXISTS ix_bills_user_id
            ON bills (user_id);
    """)

    # ── debts ─────────────────────────────────────────────────────────────────
    op.execute("""
        ALTER TABLE debts
            ADD COLUMN IF NOT EXISTS user_id UUID;
    """)
    op.execute("""
        ALTER TABLE debts
            ADD COLUMN IF NOT EXISTS original_balance NUMERIC(10, 2);
    """)
    op.execute("""
        CREATE INDEX IF NOT EXISTS ix_debts_user_id
            ON debts (user_id);
    """)

    # ── savings_goals ─────────────────────────────────────────────────────────
    op.execute("""
        ALTER TABLE savings_goals
            ADD COLUMN IF NOT EXISTS user_id UUID;
    """)
    op.execute("""
        CREATE INDEX IF NOT EXISTS ix_savings_goals_user_id
            ON savings_goals (user_id);
    """)

    # ── categories ────────────────────────────────────────────────────────────
    op.execute("""
        ALTER TABLE categories
            ADD COLUMN IF NOT EXISTS user_id UUID;
    """)
    op.execute("""
        CREATE INDEX IF NOT EXISTS ix_categories_user_id
            ON categories (user_id);
    """)

    # ── preferences ───────────────────────────────────────────────────────────
    op.execute("""
        ALTER TABLE preferences
            ADD COLUMN IF NOT EXISTS user_id UUID;
    """)
    op.execute("""
        CREATE INDEX IF NOT EXISTS ix_preferences_user_id
            ON preferences (user_id);
    """)
    op.execute("""
        DO $$
        BEGIN
            IF NOT EXISTS (
                SELECT 1 FROM pg_constraint
                WHERE conname = 'uq_preferences_user_id'
                  AND conrelid = 'preferences'::regclass
            ) THEN
                ALTER TABLE preferences
                    ADD CONSTRAINT uq_preferences_user_id UNIQUE (user_id);
            END IF;
        END
        $$;
    """)


def downgrade() -> None:
    # Intentionally left as no-op — dropping user_id columns would destroy data
    pass
