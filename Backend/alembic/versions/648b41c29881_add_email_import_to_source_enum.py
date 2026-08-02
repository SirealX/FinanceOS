"""add email_import to transaction source enum

Revision ID: 648b41c29881
Revises: c4201ebc19cc
Create Date: 2026-08-02 11:00:00.000000

WHY THIS EXISTS
----------------
Item #6 (email ingestion pipeline). Transactions created by the Gmail poller
need their own source value so they're distinguishable from csv_import /
manual / etc., and so the existing import_reminder alert machinery (which
already watches `reviewed == False`) can treat them the same way it treats
csv_import rows without any new alert logic.

Postgres note: ALTER TYPE ... ADD VALUE cannot be combined with using that
value in the same transaction it was added in. This migration only adds the
value — nothing in this same migration inserts a row using it — so running
it inside Alembic's normal per-migration transaction is safe.
"""
from typing import Sequence, Union

from alembic import op


# revision identifiers, used by Alembic.
revision: str = '648b41c29881'
down_revision: Union[str, Sequence[str], None] = 'c4201ebc19cc'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.execute("""
        DO $$
        BEGIN
            IF NOT EXISTS (
                SELECT 1 FROM pg_enum
                WHERE enumlabel = 'email_import'
                  AND enumtypid = 'source_type'::regtype
            ) THEN
                ALTER TYPE source_type ADD VALUE 'email_import';
            END IF;
        END
        $$;
    """)


def downgrade() -> None:
    """Downgrade schema.

    Postgres has no ALTER TYPE ... DROP VALUE. Removing an enum value cleanly
    requires rebuilding the type (rename old, create new without the value,
    cast every dependent column, drop old) — deliberately not done here to
    avoid a destructive rebuild for a no-op downgrade. If this ever needs to
    be reversed for real, do it by hand with a full backup first.
    """
    pass
