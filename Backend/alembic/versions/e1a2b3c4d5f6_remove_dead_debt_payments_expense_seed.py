"""remove dead Debt Payments expense-kind system category

Revision ID: e1a2b3c4d5f6
Revises: 70819a409406
Create Date: 2026-08-02 15:00:00.000000

WHY THIS EXISTS
----------------
categories.py's SYSTEM_CATEGORIES used to seed "Debt Payments" as an
expense-kind system category (user_id IS NULL). That was a pre-debt-restructure
artifact: the real, live "Debt Payments" budget category is a separate
debt_payment-kind row, created per-user and kept in sync with actual debt
minimum payments by debts.py's sync_debt_minimums_to_budget(). The
expense-kind system row was never touched by that sync function (which only
ever cleans up a *user's own* stale expense-kind override, never the shared
system row), so it sat in every account's Settings page forever: visible,
tagged "System", edit/delete both blocked, with no real budget behind it.
Confirmed 2026-08-02 (Cesar) -- this is the un-deletable ghost "Debt
Payments" category, not the real one.

Fix has two parts: SYSTEM_CATEGORIES no longer seeds it (so fresh
`POST /categories/seed` calls stop recreating it), and this migration
deletes the one that's already living in the DB from prior seed runs.

SAFETY: only deletes the exact shared system row (user_id IS NULL, kind =
'expense', name = 'Debt Payments'). Does NOT touch any user-owned override of
that same (name, kind) pair, if one somehow exists -- those are cleaned up by
sync_debt_minimums_to_budget() the next time the owning user touches any
debt, same as before. Idempotent -- safe to run whether or not the row still
exists.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'e1a2b3c4d5f6'
down_revision: Union[str, Sequence[str], None] = '70819a409406'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.execute("""
        DELETE FROM categories
        WHERE user_id IS NULL
          AND kind = 'expense'
          AND name = 'Debt Payments';
    """)


def downgrade() -> None:
    """Downgrade schema."""
    # Re-seed the shared system row exactly as SYSTEM_CATEGORIES used to.
    # Uses a guard since a fresh POST /categories/seed call may have already
    # re-created rows with a new id in the meantime.
    op.execute("""
        INSERT INTO categories (id, user_id, name, color, kind, system, sort_order, planned_amount, is_active, is_variable)
        SELECT gen_random_uuid(), NULL, 'Debt Payments', '#EF4444', 'expense', TRUE, 7, 0, TRUE, FALSE
        WHERE NOT EXISTS (
            SELECT 1 FROM categories
            WHERE user_id IS NULL AND kind = 'expense' AND name = 'Debt Payments'
        );
    """)
