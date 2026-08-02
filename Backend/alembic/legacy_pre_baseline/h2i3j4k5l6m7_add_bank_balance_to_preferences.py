"""add bank balance reconciliation fields to preferences

Revision ID: h2i3j4k5l6m7
Revises: 4c5ad3b5836c
Create Date: 2026-04-26 00:00:00.000000
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = 'h2i3j4k5l6m7'
down_revision: Union[str, Sequence[str], None] = '4c5ad3b5836c'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column('preferences', sa.Column('bank_balance',         sa.Numeric(12, 2), nullable=True))
    op.add_column('preferences', sa.Column('bank_balance_date',    sa.Date(),         nullable=True))
    op.add_column('preferences', sa.Column('initial_balance',      sa.Numeric(12, 2), nullable=True))
    op.add_column('preferences', sa.Column('tracking_start_date',  sa.Date(),         nullable=True))
    op.add_column('preferences', sa.Column('show_balance_gap',     sa.Boolean(),      nullable=False, server_default='false'))
    op.add_column('preferences', sa.Column('balance_reminder_day', sa.Integer(),      nullable=True))


def downgrade() -> None:
    op.drop_column('preferences', 'balance_reminder_day')
    op.drop_column('preferences', 'show_balance_gap')
    op.drop_column('preferences', 'tracking_start_date')
    op.drop_column('preferences', 'initial_balance')
    op.drop_column('preferences', 'bank_balance_date')
    op.drop_column('preferences', 'bank_balance')
