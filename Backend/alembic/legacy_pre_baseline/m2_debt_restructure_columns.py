"""Extend debts table with type, payment, amortization, CC, and BNPL columns.

Revision ID: m2_debt_restructure_columns
Revises: m1_extend_enums_for_debt
Create Date: 2026-05-05 00:00:01.000000

SAFETY NOTES
  • All new columns are nullable or carry a server_default.
  • Existing debt rows are unaffected:
      - type           defaults to 'loan'
      - is_paid_off    defaults to false
      - installments_paid defaults to 0
      - show_amortization defaults to false
  • No UPDATE statements touch existing rows.
  • Run AFTER m1_extend_enums_for_debt (enums must exist first).
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID

revision: str = "m2_debt_restructure_columns"
down_revision: Union[str, Sequence[str], None] = "m1_extend_enums_for_debt"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # ── Core type ─────────────────────────────────────────────────────────────
    # 'credit_card' | 'loan' | 'bnpl'
    # Existing rows default to 'loan' — safest assumption for flat debts.
    op.add_column("debts", sa.Column(
        "type", sa.String(20), nullable=True, server_default="loan"
    ))

    # ── Shared fields ─────────────────────────────────────────────────────────
    op.add_column("debts", sa.Column("bank_name",         sa.String(100),    nullable=True))
    op.add_column("debts", sa.Column("is_paid_off",       sa.Boolean(),      server_default="false", nullable=False))
    op.add_column("debts", sa.Column("payment_type",      sa.String(20),     nullable=True))
    # payment_type values: 'manual' | 'auto_bank_debit' | 'payroll_deduction'

    op.add_column("debts", sa.Column("payment_frequency", sa.String(20),     nullable=True))
    # 'weekly' | 'biweekly' | 'monthly' | 'quarterly'

    op.add_column("debts", sa.Column("payment_amount",    sa.Numeric(10, 2), nullable=True))
    # Fixed payment amount per cycle (loan / bnpl)

    op.add_column("debts", sa.Column("start_date",        sa.Date(),         nullable=True))
    op.add_column("debts", sa.Column("end_date",          sa.Date(),         nullable=True))
    # Projected payoff / last installment date

    # ── Loan-specific: amortization ───────────────────────────────────────────
    op.add_column("debts", sa.Column("show_amortization", sa.Boolean(),      server_default="false", nullable=False))
    op.add_column("debts", sa.Column("term_months",       sa.Integer(),      nullable=True))
    # Total loan term in months — used to generate amortization schedule

    # ── Credit card-specific ──────────────────────────────────────────────────
    op.add_column("debts", sa.Column("credit_limit",          sa.Numeric(10, 2), nullable=True))
    op.add_column("debts", sa.Column("billing_cycle_end_day", sa.Integer(),      nullable=True))
    # Day of month the billing cycle closes (1–31) — interest calculated here

    op.add_column("debts", sa.Column("card_network", sa.String(50), nullable=True))
    # e.g. 'Visa', 'Mastercard', 'Amex', 'Other'

    # ── BNPL-specific ─────────────────────────────────────────────────────────
    op.add_column("debts", sa.Column(
        "linked_transaction_id",
        UUID(as_uuid=True),
        sa.ForeignKey("transactions.id", ondelete="SET NULL"),
        nullable=True,
    ))
    # The original purchase transaction this BNPL is tied to

    op.add_column("debts", sa.Column("total_installments",    sa.Integer(),      nullable=True))
    op.add_column("debts", sa.Column("installments_paid",     sa.Integer(),      server_default="0", nullable=False))
    op.add_column("debts", sa.Column("installment_amount",    sa.Numeric(10, 2), nullable=True))

    # ── Auto bank debit link ──────────────────────────────────────────────────
    op.add_column("debts", sa.Column(
        "recurring_transaction_id",
        UUID(as_uuid=True),
        sa.ForeignKey("recurring_transactions.id", ondelete="SET NULL"),
        nullable=True,
    ))
    # When payment_type = 'auto_bank_debit', links this debt to its
    # RecurringTransaction so balance auto-decrements when the recurring logs.


def downgrade() -> None:
    op.drop_column("debts", "recurring_transaction_id")
    op.drop_column("debts", "installment_amount")
    op.drop_column("debts", "installments_paid")
    op.drop_column("debts", "total_installments")
    op.drop_column("debts", "linked_transaction_id")
    op.drop_column("debts", "card_network")
    op.drop_column("debts", "billing_cycle_end_day")
    op.drop_column("debts", "credit_limit")
    op.drop_column("debts", "term_months")
    op.drop_column("debts", "show_amortization")
    op.drop_column("debts", "end_date")
    op.drop_column("debts", "start_date")
    op.drop_column("debts", "payment_amount")
    op.drop_column("debts", "payment_frequency")
    op.drop_column("debts", "payment_type")
    op.drop_column("debts", "is_paid_off")
    op.drop_column("debts", "bank_name")
    op.drop_column("debts", "type")
