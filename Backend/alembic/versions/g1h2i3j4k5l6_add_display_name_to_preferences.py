"""add display_name to preferences

Revision ID: g1h2i3j4k5l6
Revises: b2c3d4e5f6a7
Create Date: 2026-04-14 00:00:00.000000
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = 'g1h2i3j4k5l6'
down_revision: Union[str, Sequence[str], None] = 'b2c3d4e5f6a7'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        'preferences',
        sa.Column('display_name', sa.String(100), nullable=True),
    )


def downgrade() -> None:
    op.drop_column('preferences', 'display_name')
