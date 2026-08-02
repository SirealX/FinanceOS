"""safe batch — create earmarked_funds and recurring_transactions tables

Revision ID: l6m7n8o9p0q1
Revises: k5l6m7n8o9p0
Create Date: 2026-04-28 00:00:00.000000
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID

revision: str = 'l6m7n8o9p0q1'
down_revision: Union[str, Sequence[str], None] = 'k5l6m7n8o9p0'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        'earmarked_funds',
        sa.Column('id',         UUID(as_uuid=True), primary_key=True, server_default=sa.text('gen_random_uuid()')),
        sa.Column('user_id',    UUID(as_uuid=True), nullable=True,  index=True),
        sa.Column('name',       sa.String(100),     nullable=False),
        sa.Column('amount',     sa.Numeric(10, 2),  nullable=False),
        sa.Column('due_date',   sa.Date(),           nullable=True),
        sa.Column('note',       sa.Text(),           nullable=True),
        sa.Column('created_at', sa.DateTime(),       server_default=sa.text('NOW()')),
    )

    op.create_table(
        'recurring_transactions',
        sa.Column('id',          UUID(as_uuid=True), primary_key=True, server_default=sa.text('gen_random_uuid()')),
        sa.Column('user_id',     UUID(as_uuid=True), nullable=True,  index=True),
        sa.Column('description', sa.String(255),     nullable=False),
        sa.Column('amount',      sa.Numeric(10, 2),  nullable=False),
        sa.Column('category',    sa.String(100),     nullable=True),
        sa.Column('type',        sa.String(20),      nullable=False),
        sa.Column('frequency',   sa.String(50),      nullable=False),
        sa.Column('next_due',    sa.Date(),           nullable=False),
        sa.Column('is_active',   sa.Boolean(),       nullable=False, server_default='true'),
        sa.Column('created_at',  sa.DateTime(),       server_default=sa.text('NOW()')),
    )


def downgrade() -> None:
    op.drop_table('recurring_transactions')
    op.drop_table('earmarked_funds')
