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
)

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
