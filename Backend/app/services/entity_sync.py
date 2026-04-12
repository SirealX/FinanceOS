"""
services/entity_sync.py
─────────────────────────────────────────────────────────────────────────────
Three sync functions:

  entity_to_transaction(budget_cat, db)
      Direction: entity → transaction.
      Called when a bill/debt/savings event changes on its own tab.
      Pushes updated values to the linked transaction if one exists.

  transaction_to_entity(tx, old_amount, db)
      Direction: transaction → entity.
      Called after a transaction is edited from the Transactions tab.
      Syncs budget_categories and the linked entity (bill/debt/savings).

  reverse_transaction(tx, db)
      Called before a transaction is DELETED from the Transactions tab.
      Reverses whatever the transaction originally did to its linked entity:
        Bill      → unmarks as paid, unlinks hub (hub row kept)
        Debt      → adds amount back to balance, deletes hub row
        Savings   → subtracts amount from current_amount, deletes hub row
─────────────────────────────────────────────────────────────────────────────
"""

from sqlalchemy.orm import Session
from ..models import BudgetCategory, Transaction, Bill, Debt, SavingsGoal


# ── Direction 1: entity → transaction ────────────────────────────────────────

def entity_to_transaction(budget_cat: BudgetCategory, db: Session) -> None:
    """
    Pushes current budget_categories values to the linked transaction.
    Called when a bill is edited, or when a bill is marked paid/unpaid.
    Does nothing if transaction_id is null (transaction not yet created).
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

    # ── Sync budget_categories ────────────────────────────────────────────────
    hub.amount = tx.amount
    hub.date   = tx.date

    if hub.type.startswith("Bill:"):
        # Category CAN change on bill transactions — sync both directions
        hub.categories_name = tx.category

        # Also sync bill.category and bill.amount back to the Bill row
        bill_name = hub.type[len("Bill: "):]
        bill = db.query(Bill).filter(Bill.name == bill_name).first()
        if bill:
            bill.category = tx.category
            bill.amount   = tx.amount

        db.commit()

    elif hub.type.startswith("Debt:"):
        # Category is locked for debt transactions
        db.commit()
        _adjust_debt(hub, old_amount, new_amount, db)

    elif hub.type.startswith("Savings:"):
        # Category is locked for savings transactions
        db.commit()
        _adjust_savings(hub, old_amount, new_amount, db)

    else:
        db.commit()


# ── Direction 3: reverse on delete ───────────────────────────────────────────

def reverse_transaction(tx: Transaction, db: Session) -> None:
    """
    Called BEFORE a transaction is deleted from the Transactions tab.
    Reverses what the transaction originally did to its linked entity.

    Bill    → unmarks bill as paid, unlinks hub (hub row is kept —
              it was created with the bill, not the payment)
    Debt    → adds amount back to debt balance, deletes hub row
              (hub row was created for this payment specifically)
    Savings → subtracts amount from goal current_amount, deletes hub row
              (hub row was created for this contribution specifically)
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
        # Unmark the bill as paid
        bill_name = hub.type[len("Bill: "):]
        bill = db.query(Bill).filter(Bill.name == bill_name).first()
        if bill:
            bill.status         = "unpaid"
            bill.transaction_id = None

        # Unlink hub — keep the hub row (it belongs to the bill lifecycle)
        hub.transaction_id             = None
        hub.transaction_payment_method = None
        db.commit()

    elif hub.type.startswith("Debt:"):
        # Add the payment amount back to the debt balance
        debt_name = hub.type[len("Debt: "):]
        debt = db.query(Debt).filter(Debt.name == debt_name).first()
        if debt:
            debt.balance = float(debt.balance) + amount

        # Delete the hub row — it was created for this payment only
        db.delete(hub)
        db.commit()

    elif hub.type.startswith("Savings:"):
        # Subtract the contribution from the goal's current amount
        goal_name = hub.type[len("Savings: "):]
        goal = db.query(SavingsGoal).filter(
            SavingsGoal.goal_name == goal_name
        ).first()
        if goal:
            goal.current_amount = max(
                0.0,
                float(goal.current_amount) - amount,
            )

        # Delete the hub row — it was created for this contribution only
        db.delete(hub)
        db.commit()


# ── Private helpers ───────────────────────────────────────────────────────────

def _adjust_debt(
    hub: BudgetCategory,
    old_amount: float,
    new_amount: float,
    db: Session,
) -> None:
    """Reverse the old payment, apply the new payment to the debt balance."""
    debt_name = hub.type[len("Debt: "):]
    debt = db.query(Debt).filter(Debt.name == debt_name).first()
    if not debt:
        return

    debt.balance = float(debt.balance) + old_amount           # undo old payment
    debt.balance = max(0.0, float(debt.balance) - new_amount) # apply new payment
    db.commit()


def _adjust_savings(
    hub: BudgetCategory,
    old_amount: float,
    new_amount: float,
    db: Session,
) -> None:
    """Reverse the old contribution, apply the new contribution to the goal."""
    goal_name = hub.type[len("Savings: "):]
    goal = db.query(SavingsGoal).filter(
        SavingsGoal.goal_name == goal_name
    ).first()
    if not goal:
        return

    goal.current_amount = max(
        0.0,
        float(goal.current_amount) - old_amount,       # undo old contribution
    )
    goal.current_amount = min(
        float(goal.current_amount) + new_amount,        # apply new contribution
        float(goal.target_amount),
    )
    db.commit()