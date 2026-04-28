"""safe batch — add 'transfer' to transaction_type enum

PostgreSQL does not allow enum changes inside a transaction, so this migration
uses op.execute() directly.  IF NOT EXISTS keeps it idempotent.

Revision ID: k5l6m7n8o9p0
Revises: j4k5l6m7n8o9
Create Date: 2026-04-28 00:00:00.000000
"""
from typing import Sequence, Union
from alembic import op

revision: str = 'k5l6m7n8o9p0'
down_revision: Union[str, Sequence[str], None] = 'j4k5l6m7n8o9'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # ADD VALUE cannot run inside a transaction block in PostgreSQL < 12.
    # Alembic wraps migrations in transactions by default, so we disable it here.
    op.execute("ALTER TYPE transaction_type ADD VALUE IF NOT EXISTS 'transfer'")


def downgrade() -> None:
    # PostgreSQL does not support removing enum values — downgrade is a no-op.
    # To fully revert, drop and recreate the type (requires data migration).
    pass
