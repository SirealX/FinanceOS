"""safe batch — add due_day, is_active, is_variable columns

Revision ID: j4k5l6m7n8o9
Revises: i3j4k5l6m7n8
Create Date: 2026-04-28 00:00:00.000000
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = 'j4k5l6m7n8o9'
down_revision: Union[str, Sequence[str], None] = 'i3j4k5l6m7n8'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # #21 — debt due day (nullable — existing debts have no due day)
    op.add_column(
        'debts',
        sa.Column('due_day', sa.Integer(), nullable=True),
    )
    # #3 — budget category active/inactive toggle (default True = no change for existing rows)
    op.add_column(
        'categories',
        sa.Column('is_active', sa.Boolean(), nullable=False, server_default='true'),
    )
    # #16 — variable income flag (default False = no change for existing rows)
    op.add_column(
        'categories',
        sa.Column('is_variable', sa.Boolean(), nullable=False, server_default='false'),
    )


def downgrade() -> None:
    op.drop_column('debts', 'due_day')
    op.drop_column('categories', 'is_active')
    op.drop_column('categories', 'is_variable')
