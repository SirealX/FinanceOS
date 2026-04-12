"""bug_fix_connection

Revision ID: dcbb79b558ef
Revises: a79fe9371eed
Create Date: 2026-04-12 09:00:59.471843

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


# revision identifiers, used by Alembic.
revision: str = 'dcbb79b558ef'
down_revision: Union[str, Sequence[str], None] = 'a79fe9371eed'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

def upgrade() -> None:
    # ── transactions ──────────────────────────────────────────────────────────
    op.add_column(
        "transactions",
        sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=True),
    )
    op.create_index(
        "ix_transactions_user_id", "transactions", ["user_id"], unique=False
    )
 
    # ── budget_categories ─────────────────────────────────────────────────────
    op.add_column(
        "budget_categories",
        sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=True),
    )
    op.create_index(
        "ix_budget_categories_user_id",
        "budget_categories",
        ["user_id"],
        unique=False,
    )
 
    # ── bills ─────────────────────────────────────────────────────────────────
    op.add_column(
        "bills",
        sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=True),
    )
    op.create_index(
        "ix_bills_user_id", "bills", ["user_id"], unique=False
    )
 
    # ── debts ─────────────────────────────────────────────────────────────────
    op.add_column(
        "debts",
        sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=True),
    )
    op.add_column(
        "debts",
        sa.Column("original_balance", sa.Numeric(10, 2), nullable=True),
    )
    op.create_index(
        "ix_debts_user_id", "debts", ["user_id"], unique=False
    )
 
    # ── savings_goals ─────────────────────────────────────────────────────────
    op.add_column(
        "savings_goals",
        sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=True),
    )
    op.create_index(
        "ix_savings_goals_user_id", "savings_goals", ["user_id"], unique=False
    )
 
    # ── categories ────────────────────────────────────────────────────────────
    op.add_column(
        "categories",
        sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=True),
    )
    op.create_index(
        "ix_categories_user_id", "categories", ["user_id"], unique=False
    )
 
    # ── preferences ───────────────────────────────────────────────────────────
    op.add_column(
        "preferences",
        sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=True),
    )
    op.create_index(
        "ix_preferences_user_id", "preferences", ["user_id"], unique=False
    )
    # One preferences row per user
    op.create_unique_constraint(
        "uq_preferences_user_id", "preferences", ["user_id"]
    )
 
 
def downgrade() -> None:
    # ── preferences ───────────────────────────────────────────────────────────
    op.drop_constraint("uq_preferences_user_id", "preferences", type_="unique")
    op.drop_index("ix_preferences_user_id", table_name="preferences")
    op.drop_column("preferences", "user_id")
 
    # ── categories ────────────────────────────────────────────────────────────
    op.drop_index("ix_categories_user_id", table_name="categories")
    op.drop_column("categories", "user_id")
 
    # ── savings_goals ─────────────────────────────────────────────────────────
    op.drop_index("ix_savings_goals_user_id", table_name="savings_goals")
    op.drop_column("savings_goals", "user_id")
 
    # ── debts ─────────────────────────────────────────────────────────────────
    op.drop_index("ix_debts_user_id", table_name="debts")
    op.drop_column("debts", "original_balance")
    op.drop_column("debts", "user_id")
 
    # ── bills ─────────────────────────────────────────────────────────────────
    op.drop_index("ix_bills_user_id", table_name="bills")
    op.drop_column("bills", "user_id")
 
    # ── budget_categories ─────────────────────────────────────────────────────
    op.drop_index("ix_budget_categories_user_id", table_name="budget_categories")
    op.drop_column("budget_categories", "user_id")
 
    # ── transactions ──────────────────────────────────────────────────────────
    op.drop_index("ix_transactions_user_id", table_name="transactions")
    op.drop_column("transactions", "user_id")