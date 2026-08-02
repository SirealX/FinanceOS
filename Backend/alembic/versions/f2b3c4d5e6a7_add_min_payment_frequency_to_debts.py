"""add min_payment_frequency to debts

Revision ID: f2b3c4d5e6a7
Revises: e1a2b3c4d5f6
Create Date: 2026-08-02 16:00:00.000000

WHY THIS EXISTS
----------------
Found 2026-08-02 while investigating why the Payoff Simulator showed a real
debt ("Enrollment") in negative amortization (30+ years, balance growing
instead of shrinking at $0 extra) even though Cesar confirmed the minimum
payment was entered exactly as billed on the lender's own statement.

Root cause: `Debt.min_payment` was always treated as a MONTHLY figure
everywhere it's used (sync_debt_minimums_to_budget, the payoff simulator,
the negative-amortization check) -- but some loans (this one included) are
billed BIWEEKLY, not monthly. The existing `payment_frequency` column looks
like it should cover this, but it's scoped entirely to the auto_bank_debit
RecurringTransaction cadence (paired with `payment_amount`, a different
field) -- it was never wired to `min_payment` at all. Entering a biweekly
figure into a field that's silently assumed-monthly makes the real minimum
payment look ~2.17x smaller than it actually is, which is exactly enough to
make a perfectly healthy loan look like it's in negative amortization.

Fix: a dedicated `min_payment_frequency` column so `min_payment` can be
entered exactly as billed (whatever cadence the statement uses), with a
shared monthly_equivalent() helper (payment_utils.py / Debt.js) doing the
conversion wherever `min_payment` needs to be treated as a monthly number.

Defaults every existing row to 'monthly' -- this is a no-op conversion
(monthly_equivalent(x, 'monthly') == x), so every debt entered before this
column existed keeps behaving exactly as it did before. Nothing needs
backfilling per-row; Cesar (or any user with a non-monthly-billed debt)
sets the real frequency going forward via the Debts tab.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'f2b3c4d5e6a7'
down_revision: Union[str, Sequence[str], None] = 'e1a2b3c4d5f6'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column(
        'debts',
        sa.Column(
            'min_payment_frequency',
            sa.String(length=20),
            nullable=False,
            server_default='monthly',
        ),
    )
    # Drop the server_default after backfilling existing rows so future ORM
    # inserts are explicit about the value (matches how the model declares
    # it -- a Python-side default, not a DB-side one) rather than silently
    # relying on a default that could drift out of sync with models.py later.
    op.alter_column('debts', 'min_payment_frequency', server_default=None)


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column('debts', 'min_payment_frequency')
