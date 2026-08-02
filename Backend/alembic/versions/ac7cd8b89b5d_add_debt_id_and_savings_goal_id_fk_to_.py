"""add debt_id and savings_goal_id fk to budget_categories, backfill existing rows

Revision ID: ac7cd8b89b5d
Revises: 47316e7a94a0
Create Date: 2026-08-02 09:27:36.822029

WHAT THIS DOES
--------------
Part of replacing entity_sync.py's fragile name-based Bill/Debt/SavingsGoal
lookups with real FKs (item #5, 2026-08-02). Bills already had a working
reverse FK (Bill.budget_category_id); this migration adds the missing half
for Debt and SavingsGoal, which need the FK on budget_categories instead
(many hub rows -> one debt/goal, since a new hub row is created per
payment/contribution event -- see entity_sync.py's module docstring).

BACKFILL SAFETY GUARD
----------------------
Existing production rows predate these columns, so this does a ONE-TIME
name-based match (the same lookup entity_sync.py used to do at request
time) to populate them -- then that lookup is retired for good; every new
hub row going forward gets the FK set directly at creation.

Only backfills a row when exactly one debt/goal with that name exists for
that user. If a user has two debts or two goals sharing a name, the match
is genuinely ambiguous from the data alone -- those rows are deliberately
left NULL rather than guessing, so nothing gets silently mis-linked by the
migration itself. Left-NULL rows can be found afterward with:
    SELECT * FROM budget_categories
    WHERE (type LIKE 'Debt: %' AND debt_id IS NULL)
       OR (type LIKE 'Savings: %' AND savings_goal_id IS NULL);
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'ac7cd8b89b5d'
down_revision: Union[str, Sequence[str], None] = '47316e7a94a0'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column('budget_categories', sa.Column('debt_id', sa.UUID(), nullable=True))
    op.add_column('budget_categories', sa.Column('savings_goal_id', sa.UUID(), nullable=True))
    op.create_index(op.f('ix_budget_categories_debt_id'), 'budget_categories', ['debt_id'], unique=False)
    op.create_index(op.f('ix_budget_categories_savings_goal_id'), 'budget_categories', ['savings_goal_id'], unique=False)
    op.create_foreign_key(
        'fk_budget_categories_debt_id_debts',
        'budget_categories', 'debts',
        ['debt_id'], ['id'], ondelete='SET NULL',
    )
    op.create_foreign_key(
        'fk_budget_categories_savings_goal_id_savings_goals',
        'budget_categories', 'savings_goals',
        ['savings_goal_id'], ['id'], ondelete='SET NULL',
    )

    # ---- One-time backfill for existing rows (unambiguous matches only) ----
    conn = op.get_bind()

    conn.execute(sa.text("""
        UPDATE budget_categories bc
        SET debt_id = matched.id
        FROM (
            SELECT id, user_id, ('Debt: ' || name) AS hub_type
            FROM debts d
            WHERE (
                SELECT COUNT(*) FROM debts d2
                WHERE d2.user_id = d.user_id AND d2.name = d.name
            ) = 1
        ) AS matched
        WHERE bc.type = matched.hub_type
          AND bc.user_id = matched.user_id
          AND bc.type LIKE 'Debt: %'
          AND bc.debt_id IS NULL
    """))

    conn.execute(sa.text("""
        UPDATE budget_categories bc
        SET savings_goal_id = matched.id
        FROM (
            SELECT id, user_id, ('Savings: ' || goal_name) AS hub_type
            FROM savings_goals g
            WHERE (
                SELECT COUNT(*) FROM savings_goals g2
                WHERE g2.user_id = g.user_id AND g2.goal_name = g.goal_name
            ) = 1
        ) AS matched
        WHERE bc.type = matched.hub_type
          AND bc.user_id = matched.user_id
          AND bc.type LIKE 'Savings: %'
          AND bc.savings_goal_id IS NULL
    """))


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_constraint('fk_budget_categories_savings_goal_id_savings_goals', 'budget_categories', type_='foreignkey')
    op.drop_constraint('fk_budget_categories_debt_id_debts', 'budget_categories', type_='foreignkey')
    op.drop_index(op.f('ix_budget_categories_savings_goal_id'), table_name='budget_categories')
    op.drop_index(op.f('ix_budget_categories_debt_id'), table_name='budget_categories')
    op.drop_column('budget_categories', 'savings_goal_id')
    op.drop_column('budget_categories', 'debt_id')
