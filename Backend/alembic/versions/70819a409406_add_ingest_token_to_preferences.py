"""add ingest_token to preferences

Revision ID: 70819a409406
Revises: 648b41c29881
Create Date: 2026-08-02 11:05:00.000000

WHY THIS EXISTS
----------------
Item #6 (email ingestion pipeline). Each user's forwarding address is
financeos.ingest+<ingest_token>@gmail.com. Deliberately a separate random
token, not the raw user_id -- non-guessable, so knowing it doesn't let
someone email fake transactions into that account, and it can be rotated
independently of the real user_id if it ever leaks.

Nullable + generated lazily (see preferences.py's GET /preferences/ingest-email)
rather than backfilled for every existing user here -- most users will never
touch this feature, no reason to mint a token nobody asked for.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '70819a409406'
down_revision: Union[str, Sequence[str], None] = '648b41c29881'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column('preferences', sa.Column('ingest_token', sa.String(length=24), nullable=True))
    op.create_index(
        op.f('ix_preferences_ingest_token'), 'preferences', ['ingest_token'],
        unique=True,
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_index(op.f('ix_preferences_ingest_token'), table_name='preferences')
    op.drop_column('preferences', 'ingest_token')
