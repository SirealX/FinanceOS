"""
services/entity_sync.py
─────────────────────────────────────────────────────────────────────────────
FK UPDATE (item #5, 2026-08-02)
  Entity lookups (Bill, Debt, SavingsGoal) now resolve via real foreign
  keys instead of parsing `BudgetCategory.type` (e.g. "Debt: Car Loan")
  and matching by name. The old approach broke silently if the entity was
  renamed after the hub row was created, and picked an arbitrary match if
  a user had two entities of the same kind sharing a name.

    - Bills are 1 hub row per bill, reused across payment cycles, so
      Bill.budget_category_id (already existed) is the link -- looked up
      here as Bill.budget_category_id == hub.id.
    - Debts and savings goals get a NEW hub row per payment/contribution
      event, so the FK lives on the hub instead: hub.debt_id /
      hub.savings_goal_id, set at creation time in debts.py / savings.py.

  `hub.type`'s "Bill:"/"Debt:"/"Savings:" prefix is still used to route to
  the right branch below (that part was never the bug -- it's a label set
  once at creation, not a lookup key) -- only the entity lookup itself
  changed. user_id filters are kept on every query as a defense-in-depth
  ownership check, not as the lookup mechanism.

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

    # CC-charge hubs are identified by tx.source, not a "Debt:"-prefixed
    # hub.type -- charge_credit_card() deliberately sets hub.type to the
    # expense category name (e.g. "Groceries") so it still groups correctly
    # in expense reporting, which means the hub.type-prefix branches below
    # never match it. Checked first, before those branches, for that reason.
    if tx.source == "cc_charge":
        hub.categories_name = tx.category
        db.commit()
        _adjust_cc_charge(hub, old_amount, new_amount, db)
        return

    if hub.type.startswith("Bill:"):
        hub.categories_name = tx.category

        bill = db.query(Bill).filter(
            Bill.budget_category_id == hub.id,
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

        # Re-sync the "Savings" budget category — editing a contribution
        # changes the goal's current_amount, which changes how much is still
        # needed per month (same reasoning as the Debt: branch above).
        from ..routers.savings import sync_savings_to_budget
        sync_savings_to_budget(hub.user_id, db)
        db.commit()

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

    # Same reasoning as transaction_to_entity above -- cc_charge hubs are
    # identified by tx.source, never by a "Debt:"-prefixed hub.type.
    if tx.source == "cc_charge":
        debt = db.query(Debt).filter(
            Debt.id == hub.debt_id,
            Debt.user_id == hub.user_id,
        ).first()
        if debt:
            # Undo the balance increase this charge originally caused.
            debt.balance = max(0.0, float(debt.balance) - amount)

        db.delete(hub)
        db.commit()
        return

    if hub.type.startswith("Bill:"):
        bill = db.query(Bill).filter(
            Bill.budget_category_id == hub.id,
            Bill.user_id == hub.user_id,
        ).first()
        if bill:
            bill.status         = "unpaid"
            bill.transaction_id = None

        hub.transaction_id             = None
        hub.transaction_payment_method = None
        db.commit()

    elif hub.type.startswith("Debt:"):
        debt = db.query(Debt).filter(
            Debt.id == hub.debt_id,
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
        goal = db.query(SavingsGoal).filter(
            SavingsGoal.id == hub.savings_goal_id,
            SavingsGoal.user_id == hub.user_id,
        ).first()
        if goal:
            goal.current_amount = max(
                0.0,
                float(goal.current_amount) - amount,
            )

        db.delete(hub)
        db.commit()

        # Re-sync the "Savings" budget category after restoring the goal's
        # current_amount — same reasoning as the Debt: branch above.
        if goal:
            from ..routers.savings import sync_savings_to_budget
            sync_savings_to_budget(hub.user_id, db)
            db.commit()


# ── Private helpers ───────────────────────────────────────────────────────────

def _adjust_debt(
    hub: BudgetCategory,
    old_amount: float,
    new_amount: float,
    db: Session,
) -> None:
    debt = db.query(Debt).filter(
        Debt.id == hub.debt_id,
        Debt.user_id == hub.user_id,
    ).first()
    if not debt:
        return

    debt.balance = float(debt.balance) + old_amount
    debt.balance = max(0.0, float(debt.balance) - new_amount)
    db.commit()


def _adjust_cc_charge(
    hub: BudgetCategory,
    old_amount: float,
    new_amount: float,
    db: Session,
) -> None:
    """
    Mirror of _adjust_debt, opposite sign: a debt PAYMENT decreases the
    balance (so editing it re-adds the old amount before subtracting the
    new one), but a CC CHARGE increases the balance, so editing it must
    un-add the old amount before re-adding the new one.
    """
    debt = db.query(Debt).filter(
        Debt.id == hub.debt_id,
        Debt.user_id == hub.user_id,
    ).first()
    if not debt:
        return

    debt.balance = max(0.0, float(debt.balance) - old_amount)
    debt.balance = float(debt.balance) + new_amount
    db.commit()


def _adjust_savings(
    hub: BudgetCategory,
    old_amount: float,
    new_amount: float,
    db: Session,
) -> None:
    goal = db.query(SavingsGoal).filter(
        SavingsGoal.id == hub.savings_goal_id,
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