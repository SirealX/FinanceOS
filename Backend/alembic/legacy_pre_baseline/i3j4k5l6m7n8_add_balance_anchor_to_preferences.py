"""add balance_anchor_app to preferences

Stores a snapshot of the app's own running balance at the moment the user
last entered their real bank balance.  Allows the dashboard to project
the bank balance forward automatically:

    projected_bank = bank_balance + (current_closing_balance - balance_anchor_app)

The user only needs to re-enter their bank balance if reality drifts from
the projection (e.g. missed a cash transaction, unexpected bank fee).

Revision ID: i3j4k5l6m7n8
Revises: h2i3j4k5l6m7
Create Date: 2026-04-26 00:00:00.000000
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = 'i3j4k5l6m7n8'
down_revision: Union[str, Sequence[str], None] = 'h2i3j4k5l6m7'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        'preferences',
        sa.Column('balance_anchor_app', sa.Numeric(12, 2), nullable=True),
    )


def downgrade() -> None:
    op.drop_column('preferences', 'balance_anchor_app')
