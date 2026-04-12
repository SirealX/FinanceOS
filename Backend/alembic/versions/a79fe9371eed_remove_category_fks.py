"""remove_category_fks

Revision ID: a79fe9371eed
Revises: 4b9d636e9e03
Create Date: 2026-04-10 17:11:25.545251

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


# revision identifiers, used by Alembic.
revision: str = 'a79fe9371eed'
down_revision: Union[str, Sequence[str], None] = '4b9d636e9e03'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade():
    # ── 1. Drop FK columns from bills ────────────────────────────────────────
    op.drop_constraint('bills_linked_category_id_fkey', 'bills', type_='foreignkey')
    op.drop_column('bills', 'linked_category_id')
 
    # ── 2. Drop FK column from debts ─────────────────────────────────────────
    op.drop_constraint('debts_payment_category_id_fkey', 'debts', type_='foreignkey')
    op.drop_column('debts', 'payment_category_id')
 
    # ── 3. Drop FK column from savings_goals ─────────────────────────────────
    op.drop_constraint('savings_goals_contribution_category_id_fkey', 'savings_goals', type_='foreignkey')
    op.drop_column('savings_goals', 'contribution_category_id')
 
    # ── 4. Update category_kind enum ─────────────────────────────────────────
    # PostgreSQL requires this multi-step approach to change an enum type.
 
    # a. Create the new enum type
    op.execute("CREATE TYPE category_kind_new AS ENUM ('expense', 'income', 'savings')")
 
    # b. Convert the column to use the new enum
    #    Any rows with old values (bill_payment, debt_payment, savings_contribution)
    #    should not exist after this cleanup, but we cast safely just in case.
    op.execute("""
        ALTER TABLE categories
        ALTER COLUMN kind TYPE category_kind_new
        USING (
            CASE kind::text
                WHEN 'expense'               THEN 'expense'
                WHEN 'income'                THEN 'income'
                WHEN 'savings'               THEN 'savings'
                WHEN 'savings_contribution'  THEN 'savings'
                ELSE 'expense'
            END
        )::category_kind_new
    """)
 
    # c. Drop the old enum type and rename the new one
    op.execute("DROP TYPE category_kind")
    op.execute("ALTER TYPE category_kind_new RENAME TO category_kind")
 
 
def downgrade():
    # Restore the three FK columns and old enum values if needed.
    # Enum downgrade is complex — only implement if rollback is required.
 
    op.add_column('bills',
        sa.Column('linked_category_id', postgresql.UUID(as_uuid=True), nullable=True)
    )
    op.add_column('debts',
        sa.Column('payment_category_id', postgresql.UUID(as_uuid=True), nullable=True)
    )
    op.add_column('savings_goals',
        sa.Column('contribution_category_id', postgresql.UUID(as_uuid=True), nullable=True)
    )