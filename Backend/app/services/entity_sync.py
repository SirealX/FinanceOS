"""
services/entity_sync.py
─────────────────────────────────────────────────────────────────────────────
AUTH UPDATE
  All entity lookups (Bill, Debt, SavingsGoal) now filter by user_id taken
  from the hub row. This prevents a bug where two users with identically
  named bills/debts/goals could accidentally affect each other's records
  during sync operations.

  The hub row always carries user_id (set at creation time in the router),
  so it is the authoritative source of ownership for every sync call.

Three sync functions:

  entity_to_transaction(budget_cat, db)
      Direction: entity → transaction.
      Called when a bill/debt/savings event changes on its own tab.

  transaction_to_entity(tx, old_amount, db)
      Direction: transaction → entity.
      Called after a transaction is edited from the Transactions tab.

  reverse_transaction(tx, db)
      Called before a transaction is DELETED from the Transactions tab.
─────────────────────────────────────────────────────────────────────────────
"""

from sqlalchemy.orm import Session
from ..models import BudgetCategory, Transaction, Bill, Debt, SavingsGoal, RecurringTransaction


# ── Direction 1: entity → transaction ────────────────────────────────────────

def entity_to_transaction(budget_cat: BudgetCategory, db: Session) -> None:
    """
    Pushes current budget_categories values to the linked transaction.
    No user_id filter needed here — we already have the exact transaction FK.
    """
    if not budget_cat.transaction_id:
        return

    tx = db.query(Transaction).filter(
        Transaction.id == budget_cat.transaction_id
    ).first()

    if not tx:
        return

    tx.amount   = budget_cat.amount
    tx.category = budget_cat.categories_name
    tx.date     = budget_cat.date
    db.commit()


# ── Direction 2: transaction → entity ────────────────────────────────────────

def transaction_to_entity(
    tx: Transaction,
    old_amount: float,
    db: Session,
) -> None:
    """
    Called after a transaction is edited from the Transactions tab.
    Syncs budget_categories and the linked entity.
    """
    if not tx.budget_category_id:
        return

    hub = db.query(BudgetCategory).filter(
        BudgetCategory.id == tx.budget_category_id
    ).first()

    if not hub:
        return

    new_amount = float(tx.amount)

    hub.amount = tx.amount
    hub.date   = tx.date

    if hub.type.startswith("Bill:"):
        hub.categories_name = tx.category

        bill_name = hub.type[len("Bill: "):]
        # AUTH: scope lookup to this user — prevents cross-user name collision
        bill = db.query(Bill).filter(
            Bill.name == bill_name,
            Bill.user_id == hub.user_id,
        ).first()
        if bill:
            bill.category = tx.category
            bill.amount   = tx.amount

        db.commit()

    elif hub.type.startswith("Debt:"):
        db.commit()
        _adjust_debt(hub, old_amount, new_amount, db)

    elif hub.type.startswith("Savings:"):
        db.commit()
        _adjust_savings(hub, old_amount, new_amount, db)

    else:
        db.commit()


# ── Direction 3: reverse on delete ───────────────────────────────────────────

def reverse_transaction(tx: Transaction, db: Session) -> None:
    """
    Called BEFORE a transaction is deleted from the Transactions tab.
    Reverses what the transaction originally did to its linked entity.
    """
    if not tx.budget_category_id:
        return

    hub = db.query(BudgetCategory).filter(
        BudgetCategory.id == tx.budget_category_id
    ).first()

    if not hub:
        return

    amount = float(tx.amount)

    if hub.type.startswith("Bill:"):
        bill_name = hub.type[len("Bill: "):]
        # AUTH: scope to user
        bill = db.query(Bill).filter(
            Bill.name == bill_name,
            Bill.user_id == hub.user_id,
        ).first()
        if bill:
            bill.status         = "unpaid"
            bill.transaction_id = None

        hub.transaction_id             = None
        hub.transaction_payment_method = None
        db.commit()

    elif hub.type.startswith("Debt:"):
        debt_name = hub.type[len("Debt: "):]
        # AUTH: scope to user
        debt = db.query(Debt).filter(
            Debt.name == debt_name,
            Debt.user_id == hub.user_id,
        ).first()
        if debt:
            debt.balance = float(debt.balance) + amount

            # BUG-05 fix: if the debt was paid off, restoring a payment must
            # un-mark it as paid off and reactivate its recurring template.
            if debt.is_paid_off and float(debt.balance) > 0:
                debt.is_paid_off = False

                # Reactivate the linked recurring template so future payments
                # are still scheduled.
                if debt.recurring_transaction_id:
                    recurring = db.query(RecurringTransaction).filter(
                        RecurringTransaction.id == debt.recurring_transaction_id,
                    ).first()
                    if recurring:
                        recurring.is_active = True

        db.delete(hub)
        db.commit()

        # Re-sync budget category planned amount after restoring balance.
        if debt:
            from ..routers.debts import sync_debt_minimums_to_budget
            sync_debt_minimums_to_budget(hub.user_id, db)

    elif hub.type.startswith("Savings:"):
        goal_name = hub.type[len("Savings: "):]
        # AUTH: scope to user
        goal = db.query(SavingsGoal).filter(
            SavingsGoal.goal_name == goal_name,
            SavingsGoal.user_id == hub.user_id,
        ).first()
        if goal:
            goal.current_amount = max(
                0.0,
                float(goal.current_amount) - amount,
            )

        db.delete(hub)
        db.commit()


# ── Private helpers ───────────────────────────────────────────────────────────

def _adjust_debt(
    hub: BudgetCategory,
    old_amount: float,
    new_amount: float,
    db: Session,
) -> None:
    debt_name = hub.type[len("Debt: "):]
    # AUTH: scope to user
    debt = db.query(Debt).filter(
        Debt.name == debt_name,
        Debt.user_id == hub.user_id,
    ).first()
    if not debt:
        return

    debt.balance = float(debt.balance) + old_amount
    debt.balance = max(0.0, float(debt.balance) - new_amount)
    db.commit()


def _adjust_savings(
    hub: BudgetCategory,
    old_amount: float,
    new_amount: float,
    db: Session,
) -> None:
    goal_name = hub.type[len("Savings: "):]
    # AUTH: scope to user
    goal = db.query(SavingsGoal).filter(
        SavingsGoal.goal_name == goal_name,
        SavingsGoal.user_id == hub.user_id,
    ).first()
    if not goal:
        return

    goal.current_amount = max(
        0.0,
        float(goal.current_amount) - old_amount,
    )
    goal.current_amount = min(
        float(goal.current_amount) + new_amount,
        float(goal.target_amount),
    )
    db.commit()