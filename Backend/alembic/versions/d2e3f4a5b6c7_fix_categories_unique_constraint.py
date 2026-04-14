"""fix categories unique constraint for multi-user support

Revision ID: d2e3f4a5b6c7
Revises: c1d2e3f4a5b6
Create Date: 2026-04-14

Problem
-------
The categories table has a legacy UNIQUE(name) constraint
("categories_name_key") that was created when there was only one global set
of categories.  Now that every authenticated user gets their own per-user
override rows (user_id = <uuid>), the INSERT for user-specific copies of
"Housing / Rent", "Salary", etc. crashes with:

    UniqueViolation: duplicate key value violates unique constraint
    "categories_name_key" — Key (name)=(Housing / Rent) already exists.

Fix
---
Drop the global constraint and replace it with two partial unique indexes
that correctly model the two kinds of rows:

  1. System rows  (user_id IS NULL)  — unique by name only.
     Only one system-level "Housing / Rent" may exist.

  2. User rows  (user_id IS NOT NULL) — unique by (name, user_id).
     Each user may have exactly one "Housing / Rent" row of their own.

PostgreSQL partial indexes make this precise: neither index applies to the
other kind of row, so there is no cross-kind collision.
"""
from typing import Sequence, Union
from alembic import op


revision: str = 'd2e3f4a5b6c7'
down_revision: Union[str, Sequence[str], None] = 'c1d2e3f4a5b6'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # ── 1. Drop the old global unique constraint ──────────────────────────────
    # Using raw SQL + IF EXISTS so this is safe to run on databases where the
    # constraint may already have been dropped manually.
    op.execute("""
        DO $$
        BEGIN
            IF EXISTS (
                SELECT 1 FROM pg_constraint
                WHERE conname = 'categories_name_key'
                  AND conrelid = 'categories'::regclass
            ) THEN
                ALTER TABLE categories DROP CONSTRAINT categories_name_key;
            END IF;
        END
        $$;
    """)

    # ── 2. System categories: unique by name (user_id IS NULL rows only) ─────
    op.execute("""
        CREATE UNIQUE INDEX IF NOT EXISTS uq_categories_name_system
            ON categories (name)
            WHERE user_id IS NULL;
    """)

    # ── 3. User categories: unique by (name, user_id) per-user ───────────────
    op.execute("""
        CREATE UNIQUE INDEX IF NOT EXISTS uq_categories_name_user
            ON categories (name, user_id)
            WHERE user_id IS NOT NULL;
    """)


def downgrade() -> None:
    # Remove the partial indexes and restore the original global constraint.
    # NOTE: downgrade only works if there are no duplicate names across
    # different users — run only in a clean dev environment.
    op.execute("DROP INDEX IF EXISTS uq_categories_name_user;")
    op.execute("DROP INDEX IF EXISTS uq_categories_name_system;")
    op.execute("""
        ALTER TABLE categories
            ADD CONSTRAINT categories_name_key UNIQUE (name);
    """)
