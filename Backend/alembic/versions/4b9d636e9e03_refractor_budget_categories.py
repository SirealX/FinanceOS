"""refractor Budget_categories

Revision ID: 4b9d636e9e03
Revises: 5dadb7844cf9
Create Date: 2026-04-10 10:34:26.201083

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


# revision identifiers, used by Alembic.
revision: str = '4b9d636e9e03'
down_revision: Union[str, Sequence[str], None] = '5dadb7844cf9'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade():
    # ── 1. Add "savings" to transaction_type enum ─────────────────────────────
    op.execute("ALTER TYPE transaction_type ADD VALUE IF NOT EXISTS 'savings'")

    # ── 2. Reconstruct budget_categories ──────────────────────────────────────
    # Drop all old columns
    op.drop_column("budget_categories", "name")
    op.drop_column("budget_categories", "color")
    op.drop_column("budget_categories", "planned")
    op.drop_column("budget_categories", "sort_order")

    # Add new columns
    op.add_column("budget_categories",
        sa.Column("transaction_id", postgresql.UUID(as_uuid=True), nullable=True))
    op.add_column("budget_categories",
        sa.Column("transaction_name", sa.String(255), nullable=False,
                  server_default=""))
    op.add_column("budget_categories",
        sa.Column("transaction_payment_method", sa.String(50), nullable=True))
    op.add_column("budget_categories",
        sa.Column("categories_name", sa.String(100), nullable=False,
                  server_default=""))
    op.add_column("budget_categories",
        sa.Column("type", sa.String(255), nullable=False,
                  server_default=""))
    op.add_column("budget_categories",
        sa.Column("amount", sa.Numeric(10, 2), nullable=False,
                  server_default="0"))
    op.add_column("budget_categories",
        sa.Column("date", sa.Date, nullable=False,
                  server_default=sa.text("CURRENT_DATE")))

    # FKs on budget_categories
    op.create_foreign_key(
        "fk_budget_categories_transaction",
        "budget_categories", "transactions",
        ["transaction_id"], ["id"], ondelete="SET NULL"
    )

    # ── 3. Add budget_category_id to transactions ──────────────────────────────
    op.add_column("transactions",
        sa.Column("budget_category_id", postgresql.UUID(as_uuid=True), nullable=True))
    op.create_foreign_key(
        "fk_transactions_budget_category",
        "transactions", "budget_categories",
        ["budget_category_id"], ["id"], ondelete="SET NULL"
    )

    # ── 4. Add budget_category_id to bills ────────────────────────────────────
    op.add_column("bills",
        sa.Column("budget_category_id", postgresql.UUID(as_uuid=True), nullable=True))
    op.create_foreign_key(
        "fk_bills_budget_category",
        "bills", "budget_categories",
        ["budget_category_id"], ["id"], ondelete="SET NULL"
    )


def downgrade():
    op.drop_constraint("fk_bills_budget_category",      "bills",         type_="foreignkey")
    op.drop_constraint("fk_transactions_budget_category","transactions",  type_="foreignkey")
    op.drop_constraint("fk_budget_categories_transaction","budget_categories", type_="foreignkey")

    op.drop_column("bills",         "budget_category_id")
    op.drop_column("transactions",  "budget_category_id")

    op.drop_column("budget_categories", "date")
    op.drop_column("budget_categories", "amount")
    op.drop_column("budget_categories", "type")
    op.drop_column("budget_categories", "categories_name")
    op.drop_column("budget_categories", "transaction_payment_method")
    op.drop_column("budget_categories", "transaction_name")
    op.drop_column("budget_categories", "transaction_id")

    op.add_column("budget_categories", sa.Column("name",       sa.String(100)))
    op.add_column("budget_categories", sa.Column("color",      sa.String(20)))
    op.add_column("budget_categories", sa.Column("planned",    sa.Numeric(10, 2)))
    op.add_column("budget_categories", sa.Column("sort_order", sa.Integer))