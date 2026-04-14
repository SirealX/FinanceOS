"""
app/routers/import_router.py
─────────────────────────────────────────────────────────────────────────────
Three-step import wizard endpoints.

POST /transactions/import/parse
    Upload the bank statement file. Returns detected columns, suggested
    column mapping, and the raw rows. File is processed in memory only —
    never written to disk, never stored in the database.

POST /transactions/import/validate
    Apply the user's column mapping to the raw rows and run validation.
    Returns valid rows, error rows, and soft duplicate warnings.
    The client re-sends the rows (no server-side session state required).

POST /transactions/import/commit
    Bulk insert all user-reviewed and categorised transactions in a single
    atomic database transaction. Rolls back entirely on any failure.

Security:
  - All endpoints require a valid JWT (Depends(get_current_user))
  - user_id is read from the token, never from the request body
  - Rate limiting should be applied at the reverse-proxy level (Render)
─────────────────────────────────────────────────────────────────────────────
"""

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
from sqlalchemy.orm import Session
from typing import Optional
from pydantic import BaseModel
import uuid

from ..database import get_db
from ..models import Transaction
from ..dependencies import get_current_user
from ..services.payment_utils import infer_payment_method
from ..services.file_parser import (
    parse_file,
    apply_mapping_and_validate,
    ParseError,
    MAX_FILE_BYTES,
)

router = APIRouter(prefix="/transactions/import", tags=["import"])


# ── Request / Response Models ─────────────────────────────────────────────────

class ColumnMapping(BaseModel):
    date: str
    amount: str
    description: str
    balance: Optional[str] = None
    document: Optional[str] = None


class ValidateRequest(BaseModel):
    bank: str = "Bancolombia"
    date_format: str = "DD/MM"
    decimal_sep: str = "."
    column_mapping: ColumnMapping
    rows: list  # raw rows as returned from /parse


class ReviewedTransaction(BaseModel):
    # From parser
    date: str
    amount: float
    description: str
    balance_after: Optional[float] = None
    document: Optional[str] = None
    # User-assigned during review
    type: str            # income | expense
    category: str
    notes: Optional[str] = None
    payment_method: Optional[str] = None


class CommitRequest(BaseModel):
    transactions: list[ReviewedTransaction]


# ── Step 1: Parse ─────────────────────────────────────────────────────────────

@router.post("/parse")
async def import_parse(
    file: UploadFile = File(...),
    bank: str = Form("Bancolombia"),
    current_user: str = Depends(get_current_user),
):
    """
    Accepts a bank statement file upload.
    Returns: detected columns, suggested column mapping, raw rows, metadata.
    File is processed in memory — never stored.
    """
    # ── File size guard (also enforced by file_parser.parse_file) ────────────
    content = await file.read()
    if len(content) > MAX_FILE_BYTES:
        raise HTTPException(
            status_code=413,
            detail=(
                f"File size {len(content) / 1024 / 1024:.1f} MB exceeds the 5 MB limit. "
                "Please trim the statement to a shorter date range."
            ),
        )

    # ── File type guard ───────────────────────────────────────────────────────
    filename = file.filename or "upload"
    ext = filename.rsplit(".", 1)[-1].lower() if "." in filename else ""
    allowed_extensions = {"csv", "xlsx", "xls", "xml", "ofx", "qif"}
    if ext not in allowed_extensions:
        raise HTTPException(
            status_code=400,
            detail=f"File type '.{ext}' is not supported. Use CSV or XLSX.",
        )

    # ── Parse ─────────────────────────────────────────────────────────────────
    try:
        result = parse_file(content, filename, bank)
    except ParseError as e:
        raise HTTPException(status_code=422, detail=str(e))
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Unexpected error while parsing the file: {e}",
        )

    return {
        "bank":              result["bank"],
        "account_number":    result["account_number"],
        "date_from":         result["date_from"],
        "date_to":           result["date_to"],
        "columns":           result["columns"],
        "suggested_mapping": result["suggested_mapping"],
        "row_count":         len(result["rows"]),
        "skipped_count":     result["skipped_count"],
        "rows":              result["rows"],
    }


# ── Step 2: Validate (with duplicate detection) ───────────────────────────────

@router.post("/validate")
def import_validate(
    body: ValidateRequest,
    current_user: str = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Apply column mapping to the raw rows and validate every field.
    Runs duplicate detection against the user's existing transactions.
    Returns valid rows, error rows, and soft duplicate warnings.
    """
    # Load existing transactions for duplicate detection (lightweight query)
    existing_txs = (
        db.query(
            Transaction.date,
            Transaction.amount,
            Transaction.description,
        )
        .filter(Transaction.user_id == current_user)
        .all()
    )
    existing_list = [
        {
            "date":        str(tx.date),
            "amount":      float(tx.amount),
            "description": tx.description,
        }
        for tx in existing_txs
    ]

    try:
        result = apply_mapping_and_validate(
            raw_rows=body.rows,
            column_mapping={
                "date":        body.column_mapping.date,
                "amount":      body.column_mapping.amount,
                "description": body.column_mapping.description,
                "balance":     body.column_mapping.balance,
                "document":    body.column_mapping.document,
            },
            bank=body.bank,
            date_format=body.date_format,
            decimal_sep=body.decimal_sep,
            existing_transactions=existing_list,
        )
    except Exception as e:
        raise HTTPException(status_code=422, detail=str(e))

    # Date-range guards
    date_from = result["date_from"]
    date_to   = result["date_to"]
    warnings  = []

    if date_from and date_to:
        from datetime import datetime
        d_from = datetime.fromisoformat(date_from).date()
        d_to   = datetime.fromisoformat(date_to).date()
        span_days = (d_to - d_from).days

        if span_days > 6 * 30:  # hard block > 6 months
            raise HTTPException(
                status_code=422,
                detail=(
                    f"This file covers {span_days} days (more than 6 months). "
                    "Please trim the export to a maximum of 6 months and re-upload."
                ),
            )
        if span_days > 5 * 30:  # soft warning 5–6 months
            warnings.append(
                f"This file covers {span_days} days (over 5 months). "
                "Consider importing in smaller batches for better performance."
            )

    return {
        "valid_count":    len(result["valid_rows"]),
        "error_count":    len(result["error_rows"]),
        "duplicate_count": len(result["duplicates"]),
        "date_from":      date_from,
        "date_to":        date_to,
        "warnings":       warnings,
        "valid_rows":     result["valid_rows"],
        "error_rows":     result["error_rows"],
        "duplicates":     result["duplicates"],
    }


# ── Step 3: Commit ────────────────────────────────────────────────────────────

@router.post("/commit")
def import_commit(
    body: CommitRequest,
    current_user: str = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Bulk insert all reviewed transactions in a single atomic DB transaction.
    Either all rows are committed or none are (full rollback on any failure).
    """
    if not body.transactions:
        raise HTTPException(status_code=400, detail="No transactions to import.")

    if len(body.transactions) > 2000:
        raise HTTPException(
            status_code=400,
            detail="Cannot import more than 2,000 transactions in a single batch.",
        )

    # Validate transaction types
    valid_types = {"income", "expense"}
    for tx in body.transactions:
        if tx.type not in valid_types:
            raise HTTPException(
                status_code=400,
                detail=f"Invalid transaction type '{tx.type}'. Must be 'income' or 'expense'.",
            )
        if not tx.category:
            raise HTTPException(
                status_code=400,
                detail="All transactions must have a category before importing.",
            )

    # ── Atomic insert ─────────────────────────────────────────────────────────
    inserted_dates = []
    try:
        for tx_data in body.transactions:
            # Auto-infer payment method from description if the user did not
            # explicitly set one during the review step.  Since every imported
            # transaction comes from a bank statement it is always one of:
            # Debit Card, Transfer, QR, or Cash — never unknown.
            payment_method = (
                tx_data.payment_method
                if tx_data.payment_method and tx_data.payment_method.strip()
                else infer_payment_method(tx_data.description or "")
            )
            tx = Transaction(
                id=uuid.uuid4(),
                user_id=current_user,
                date=tx_data.date,
                description=tx_data.description.strip(),
                category=tx_data.category,
                type=tx_data.type,
                amount=tx_data.amount,
                payment_method=payment_method,
                source="import",
                is_draft=False,   # always resolved — user-set or auto-inferred
                reviewed=True,
            )
            db.add(tx)
            inserted_dates.append(tx_data.date)

        db.commit()

    except Exception as e:
        db.rollback()
        raise HTTPException(
            status_code=500,
            detail=(
                "Import failed and was fully rolled back. No data was saved. "
                f"Error: {e}"
            ),
        )

    date_from = min(inserted_dates) if inserted_dates else None
    date_to   = max(inserted_dates) if inserted_dates else None

    return {
        "imported_count": len(body.transactions),
        "date_from":      date_from,
        "date_to":        date_to,
        "message": (
            f"{len(body.transactions)} transactions imported successfully "
            f"({date_from} to {date_to})."
        ),
    }
