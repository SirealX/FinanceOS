"""Extend transaction_type and category_kind enums for debt_payment;
extend source_type enum for cc_charge and debt_payment.

Revision ID: m1_extend_enums_for_debt
Revises: l6m7n8o9p0q1
Create Date: 2026-05-05 00:00:00.000000

SAFETY NOTES
  • ALTER TYPE … ADD VALUE is additive-only — no existing rows are affected.
  • IF NOT EXISTS makes this idempotent (safe to re-run).
  • PostgreSQL requires these statements to run OUTSIDE a transaction block,
    so transaction=False is set at the module level.
"""
from typing import Sequence, Union
from alembic import op

revision: str = "m1_extend_enums_for_debt"
down_revision: Union[str, Sequence[str], None] = "l6m7n8o9p0q1"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # ── transaction_type ──────────────────────────────────────────────────────
    op.execute("ALTER TYPE transaction_type ADD VALUE IF NOT EXISTS 'debt_payment'")

    # ── category_kind ─────────────────────────────────────────────────────────
    op.execute("ALTER TYPE category_kind ADD VALUE IF NOT EXISTS 'debt_payment'")

    # ── source_type ───────────────────────────────────────────────────────────
    # cc_charge  : expense paid via credit card (no cash debit — CC balance rises)
    # debt_payment: paying off a debt balance
    op.execute("ALTER TYPE source_type ADD VALUE IF NOT EXISTS 'cc_charge'")
    op.execute("ALTER TYPE source_type ADD VALUE IF NOT EXISTS 'debt_payment'")


def downgrade() -> None:
    # PostgreSQL does not support removing enum values — downgrade is a no-op.
    # To fully revert, drop and recreate the types (requires data migration).
    pass
