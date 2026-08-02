"""make user_id not null on user-scoped data tables

Revision ID: 2f3494829eaf
Revises: ac7cd8b89b5d
Create Date: 2026-08-02 09:36:46.410059

RISK-01 from the legacy AUDIT_REPORT.md, folded into item #5. Every one of
these 8 tables is fully user-scoped in practice (auth has been complete
since Phase 4 -- see Tracker.md), so a NULL user_id here would only ever
be leftover bad data, never a legitimate state.

`categories.user_id` is deliberately EXCLUDED -- NULL there means "system
category, shared across all users" per its own docstring. That's a real,
intentional use of NULL, not the same gap as the other 8.

SAFETY: a plain ALTER COLUMN SET NOT NULL against a table that actually
has NULL rows fails loudly on its own, but the failure lands mid-migration
with a generic Postgres error and no indication of which table or how many
rows. Pre-checking each table first and raising a clear, specific error
before touching any schema is safer to operate against a live production
database -- if this step ever fires, stop and go find out why those rows
have no owner before deciding how to fix them; don't just force it through.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '2f3494829eaf'
down_revision: Union[str, Sequence[str], None] = 'ac7cd8b89b5d'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

TABLES = [
    'transactions',
    'budget_categories',
    'bills',
    'debts',
    'savings_goals',
    'preferences',
    'earmarked_funds',
    'recurring_transactions',
]


def upgrade() -> None:
    """Upgrade schema."""
    conn = op.get_bind()

    problems = []
    for table in TABLES:
        count = conn.execute(
            sa.text(f"SELECT COUNT(*) FROM {table} WHERE user_id IS NULL")
        ).scalar()
        if count:
            problems.append(f"  - {table}: {count} row(s) with NULL user_id")

    if problems:
        raise RuntimeError(
            "Cannot make user_id NOT NULL -- found existing rows with no "
            "owner:\n" + "\n".join(problems) +
            "\nInvestigate these rows manually (assign a user_id or delete "
            "them) before re-running this migration."
        )

    op.alter_column('bills', 'user_id', existing_type=sa.UUID(), nullable=False)
    op.alter_column('budget_categories', 'user_id', existing_type=sa.UUID(), nullable=False)
    op.alter_column('debts', 'user_id', existing_type=sa.UUID(), nullable=False)
    op.alter_column('earmarked_funds', 'user_id', existing_type=sa.UUID(), nullable=False)
    op.alter_column('preferences', 'user_id', existing_type=sa.UUID(), nullable=False)
    op.alter_column('recurring_transactions', 'user_id', existing_type=sa.UUID(), nullable=False)
    op.alter_column('savings_goals', 'user_id', existing_type=sa.UUID(), nullable=False)
    op.alter_column('transactions', 'user_id', existing_type=sa.UUID(), nullable=False)


def downgrade() -> None:
    """Downgrade schema."""
    op.alter_column('transactions', 'user_id', existing_type=sa.UUID(), nullable=True)
    op.alter_column('savings_goals', 'user_id', existing_type=sa.UUID(), nullable=True)
    op.alter_column('recurring_transactions', 'user_id', existing_type=sa.UUID(), nullable=True)
    op.alter_column('preferences', 'user_id', existing_type=sa.UUID(), nullable=True)
    op.alter_column('earmarked_funds', 'user_id', existing_type=sa.UUID(), nullable=True)
    op.alter_column('debts', 'user_id', existing_type=sa.UUID(), nullable=True)
    op.alter_column('budget_categories', 'user_id', existing_type=sa.UUID(), nullable=True)
    op.alter_column('bills', 'user_id', existing_type=sa.UUID(), nullable=True)
