"""seed_import_system_categories

Ensures the three non-removable system categories required by the import
wizard are present and correctly marked as system=True in the database.

Changes:
  1. Sets system = TRUE on the existing "Debt Payments" system category
     (user_id IS NULL) in case it was seeded before the flag was enforced.
  2. Inserts "ATM Withdrawal" as a new system category (expense, system=True)
     if it does not already exist.

Both operations are fully idempotent — safe to run multiple times.

Revision ID: c1d2e3f4a5b6
Revises:     b2c3d4e5f6a7
"""

from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = 'c1d2e3f4a5b6'
down_revision: Union[str, Sequence[str], None] = 'b2c3d4e5f6a7'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # ── 1. Ensure "Debt Payments" system category is protected ─────────────────
    # The row was seeded correctly but may have system=FALSE if it was created
    # before the system-flag logic was fully enforced.  This is a safe UPDATE
    # that only touches the system-level row (user_id IS NULL).
    op.execute("""
        UPDATE categories
           SET system = TRUE
         WHERE name    = 'Debt Payments'
           AND user_id IS NULL
           AND system  IS DISTINCT FROM TRUE
    """)

    # ── 2. Insert "ATM Withdrawal" system category (idempotent) ────────────────
    # Only inserts if a system-level row with this exact name does not exist.
    op.execute("""
        INSERT INTO categories (id, user_id, name, color, kind, system, sort_order, planned_amount)
        SELECT
            gen_random_uuid(),
            NULL,
            'ATM Withdrawal',
            '#64748B',
            'expense',
            TRUE,
            14,
            0.00
        WHERE NOT EXISTS (
            SELECT 1
              FROM categories
             WHERE name    = 'ATM Withdrawal'
               AND user_id IS NULL
        )
    """)


def downgrade() -> None:
    # Intentionally a no-op.
    # Removing "ATM Withdrawal" or un-protecting "Debt Payments" could break
    # existing transactions that reference these categories.
    pass
