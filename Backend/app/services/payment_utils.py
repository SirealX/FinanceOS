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
