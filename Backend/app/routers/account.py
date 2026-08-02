"""
backend/app/routers/account.py
─────────────────────────────────────────────────────────────────────────────
Self-service "reset my data" — lets a user wipe their own transactional data
and start testing from a clean slate without needing a new account. Built
2026-08-02 at Cesar's request (had stopped using the app for a while, wanted
to re-test from zero after all the item #3/#4/#5/#6 changes).

Deliberately scoped to the calling user only (current_user from the JWT) —
this is a shared production database with other testers' real data in it
from the multi-user trial, so there is no "reset everyone" version of this.

Deliberately KEEPS: Preferences (currency, month_start, ingest_token, bank
balance reconciliation settings), AlertPreferences (notification channels/
thresholds), and Category rows (both system and this user's custom ones).
Those are "Settings," not "data" — the account should be immediately usable
right after a reset, not need reconfiguring from scratch too.

Deliberately WIPES: every other table scoped to this user — transactions,
the budget_categories hub rows, bills, debts, savings goals, earmarked
funds, recurring transaction templates, and alerts.

Delete order doesn't matter for referential integrity: every FK among these
tables is declared ondelete="SET NULL" in models.py (not RESTRICT/CASCADE),
so deleting a referenced row just nulls the referencing column rather than
failing or cascading unexpectedly — confirmed by reading every FK in
models.py before writing this, not assumed.
"""

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from ..database import get_db
from ..dependencies import get_current_user
from ..models import (
    Transaction,
    BudgetCategory,
    Bill,
    Debt,
    SavingsGoal,
    EarmarkedFund,
    RecurringTransaction,
    Alert,
<<<<<<< HEAD
    Category,
)
from ..services.entity_sync import reverse_transaction
=======
)
>>>>>>> 09fba98087161f5e2aa32117b7407b44bbff5a40

router = APIRouter(prefix="/account", tags=["account"])

# Every model here has a user_id column and is NOT Preferences/AlertPreferences/
# Category — see the module docstring for why those three are excluded.
_RESET_MODELS = [
    BudgetCategory,
    Transaction,
    Bill,
    Debt,
    SavingsGoal,
    EarmarkedFund,
    RecurringTransaction,
    Alert,
]


@router.post("/reset")
def reset_my_data(
    current_user: str = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Deletes every row this user owns across transactions, bills, debts,
    savings goals, budget-category hub rows, earmarked funds, recurring
    templates, and alerts. Preferences, AlertPreferences, and Category rows
    are untouched — see module docstring.

    Returns a per-table count of rows deleted, so the caller (and Render
    logs) can see exactly what happened rather than a bare "ok".
    """
    counts = {}
    for model in _RESET_MODELS:
        deleted = (
            db.query(model)
            .filter(model.user_id == current_user)
            .delete(synchronize_session=False)
        )
        counts[model.__tablename__] = deleted

    db.commit()
    return {"deleted": counts}
<<<<<<< HEAD


@router.post("/clear-transactions")
def clear_all_transactions(
    current_user: str = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Settings → Danger Zone → "Clear All Transactions" (was a console.warn
    stub — wired for real 2026-08-02, same session as the Budget popup fixes).

    Narrower than /account/reset: only removes transactions, keeps bills,
    debts, and savings goals intact. Because those entities survive, each
    transaction is reversed through entity_sync.reverse_transaction() first —
    same call used by the single-transaction DELETE endpoint — so a paid bill
    goes back to "unpaid," a debt payment's amount is added back to its
    balance, and a savings contribution is subtracted back out of its goal's
    current_amount, instead of leaving those entities silently out of sync
    with a ledger that no longer explains how they got there.
    """
    txs = db.query(Transaction).filter(Transaction.user_id == current_user).all()

    for tx in txs:
        reverse_transaction(tx, db)

    # Reversal above only unwinds each transaction's effect on its linked
    # bill/debt/savings entity (and, for debt/savings, already deletes their
    # hub row — bill hubs are deliberately kept, reused across payment
    # cycles). The transaction rows themselves still need to go.
    deleted = (
        db.query(Transaction)
        .filter(Transaction.user_id == current_user)
        .delete(synchronize_session=False)
    )
    db.commit()
    return {"deleted": deleted}


@router.post("/reset-budgets")
def reset_all_budgets(
    current_user: str = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Settings → Danger Zone → "Reset All Budgets" (was a console.warn stub —
    wired for real 2026-08-02).

    Only zeroes the caller's own expense/income category overrides — the
    ones a user actually hand-types in the Budget popup. Deliberately
    excludes 'savings' and 'debt_payment' kind rows: those are system-managed
    (sync_savings_to_budget / sync_debt_minimums_to_budget) and always
    reflect real Savings-goal / Debt data, not something "Reset" should ever
    zero out from under the user.
    """
    updated = (
        db.query(Category)
        .filter(
            Category.user_id == current_user,
            Category.kind.in_(["expense", "income"]),
        )
        .update({"planned_amount": 0}, synchronize_session=False)
    )
    db.commit()
    return {"updated": updated}
=======
>>>>>>> 09fba98087161f5e2aa32117b7407b44bbff5a40
