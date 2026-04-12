"""
reconciliation.py
Sync is now handled by entity_sync.py.
This file is kept for future banking API auto-categorization use.
"""

from sqlalchemy.orm import Session
from ..models import Transaction


def reconcile_transaction(tx: Transaction, db: Session) -> None:
    pass  # handled by entity_sync.py


def reconcile_transaction_update(
    old_amount: float,
    tx: Transaction,
    db: Session,
) -> None:
    pass  # handled by entity_sync.py