"""
app/services/payment_utils.py
─────────────────────────────────────────────────────────────────────────────
Utility for inferring payment method from a bank statement transaction
description.

Since all imported transactions come from a bank account statement, every
transaction must be one of exactly four types:

  ▸ Cash        — ATM / cash-machine withdrawal
  ▸ Transfer    — Bank-to-bank transfer (national or international)
  ▸ QR          — QR-code payment (common in LATAM mobile banking)
  ▸ Debit Card  — Everything else (point-of-sale, online, contactless)

Rules are checked in priority order so that the most specific match wins.
Keywords cover both English and Spanish (Bancolombia / LATAM banks).
─────────────────────────────────────────────────────────────────────────────
"""

import re
from typing import Optional


# ── Keyword patterns ──────────────────────────────────────────────────────────

_CASH_PATTERN = re.compile(
    r'\bATM\b'
    r'|CAJERO'          # Spanish: ATM machine
    r'|RETIRO\b'        # Spanish: withdrawal
    r'|\bWITHDRAWAL\b'
    r'|EFECTIVO',       # Spanish: cash
    re.IGNORECASE,
)

_TRANSFER_PATTERN = re.compile(
    r'\bTRANSFER(ENCIA)?\b'   # transfer / transferencia
    r'|\bTRANSF\b'            # abbreviated form
    r'|\bTRASLADO\b'          # Spanish: transfer / movement
    r'|\bNEFT\b'              # National Electronic Funds Transfer
    r'|\bWIRE\b'              # wire transfer
    r'|\bACH\b',              # ACH transfer
    re.IGNORECASE,
)

_QR_PATTERN = re.compile(
    r'\bQR\b'
    r'|PAGO QR'               # Spanish: QR payment
    r'|CODIGO QR',            # Spanish: QR code
    re.IGNORECASE,
)


# ── Public API ────────────────────────────────────────────────────────────────

def infer_payment_method(description: str) -> str:
    """
    Infer the payment method from a bank-statement transaction description.

    Priority order (first match wins):
      1. Cash       — ATM / withdrawal keywords
      2. Transfer   — Bank-transfer keywords (EN + ES)
      3. QR         — QR-payment keyword
      4. Debit Card — Default fallback for all remaining entries

    Args:
        description: Raw transaction description from the bank statement.

    Returns:
        One of: "Cash", "Transfer", "QR", "Debit Card"
    """
    if not description:
        return "Debit Card"

    if _CASH_PATTERN.search(description):
        return "Cash"

    if _TRANSFER_PATTERN.search(description):
        return "Transfer"

    if _QR_PATTERN.search(description):
        return "QR"

    return "Debit Card"


# ── CC charge helper (ARCH-02) ────────────────────────────────────────────────

def apply_cc_charge(
    user_id: str,
    payment_method: Optional[str],
    amount: float,
    db,
    default_source: str = "manual",
) -> str:
    """
    Check whether payment_method names an active credit card for this user.
    If so, increase that card's balance by amount and return "cc_charge".
    Otherwise return default_source unchanged.

    Centralises the CC-detection logic that was duplicated in transactions.py
    and bills.py (ARCH-02).  Import Debt lazily to avoid circular imports
    between services/ and routers/.

    Args:
        user_id:        caller's user UUID string
        payment_method: payment method name from the request (may be None)
        amount:         transaction amount to add to CC balance
        db:             active SQLAlchemy session
        default_source: source value to return when no CC match is found

    Returns:
        "cc_charge" if matched, otherwise default_source.
    """
    if not payment_method:
        return default_source

    from ..models import Debt  # lazy import — avoids circular dependency

    cc_debt = db.query(Debt).filter(
        Debt.user_id     == user_id,
        Debt.type        == "credit_card",
        Debt.name        == payment_method,
        Debt.is_paid_off == False,
    ).first()

    if cc_debt:
        cc_debt.balance = float(cc_debt.balance or 0) + amount
        return "cc_charge"

    return default_source
