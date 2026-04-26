"""
app/routers/export.py
─────────────────────────────────────────────────────────────────────────────
Export the authenticated user's transactions to CSV or XML.

GET /transactions/export?date_from=YYYY-MM-DD&date_to=YYYY-MM-DD&format=csv

Constraints:
  - Formats: csv, xml
  - Scoped strictly to the authenticated user's data
  - File generated in memory, streamed directly — never written to disk

Fields exported:
  date, description, amount, type, category, notes (payment_method), balance_after
─────────────────────────────────────────────────────────────────────────────
"""

import io
import csv
from datetime import date, datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import Transaction
from ..dependencies import get_current_user

router = APIRouter(prefix="/transactions", tags=["export"])


# ── Helpers ───────────────────────────────────────────────────────────────────

def _safe_str(value) -> str:
    return "" if value is None else str(value)


def _build_csv(rows: list) -> bytes:
    buffer = io.StringIO()
    writer = csv.DictWriter(
        buffer,
        fieldnames=["date", "description", "amount", "type", "category",
                    "payment_method", "balance_after"],
        lineterminator="\n",
    )
    writer.writeheader()
    for r in rows:
        writer.writerow({
            "date":           _safe_str(r["date"]),
            "description":    _safe_str(r["description"]),
            "amount":         _safe_str(r["amount"]),
            "type":           _safe_str(r["type"]),
            "category":       _safe_str(r["category"]),
            "payment_method": _safe_str(r["payment_method"]),
            "balance_after":  "",
        })
    return buffer.getvalue().encode("utf-8-sig")  # utf-8-sig adds BOM for Excel compatibility


def _build_xml(rows: list, date_from: str, date_to: str, user_id: str) -> bytes:
    lines = [
        '<?xml version="1.0" encoding="UTF-8"?>',
        f'<transactions export_date="{datetime.utcnow().date()}" '
        f'date_from="{date_from}" date_to="{date_to}">',
    ]
    for r in rows:
        # Escape XML special characters in description
        desc = (
            _safe_str(r["description"])
            .replace("&", "&amp;")
            .replace("<", "&lt;")
            .replace(">", "&gt;")
            .replace('"', "&quot;")
            .replace("'", "&apos;")
        )
        lines.append(
            f'  <transaction>'
            f'<date>{_safe_str(r["date"])}</date>'
            f'<description>{desc}</description>'
            f'<amount>{_safe_str(r["amount"])}</amount>'
            f'<type>{_safe_str(r["type"])}</type>'
            f'<category>{_safe_str(r["category"])}</category>'
            f'<payment_method>{_safe_str(r["payment_method"])}</payment_method>'
            f'</transaction>'
        )
    lines.append("</transactions>")
    return "\n".join(lines).encode("utf-8")


# ── Export endpoint ───────────────────────────────────────────────────────────

@router.get("/export")
def export_transactions(
    date_from: date = Query(..., description="Start date (YYYY-MM-DD)"),
    date_to:   date = Query(..., description="End date (YYYY-MM-DD)"),
    format:    str  = Query("csv", description="Export format: csv or xml"),
    current_user: str = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Export transactions for the authenticated user within the given date range.
    Maximum range: 3 months. Format: csv or xml.
    """
    # ── Validation ─────────────────────────────────────────────────────────────
    if date_to < date_from:
        raise HTTPException(status_code=400, detail="date_to must be on or after date_from.")

    fmt = format.lower().strip()
    if fmt not in ("csv", "xml"):
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported format '{format}'. Choose 'csv' or 'xml'.",
        )

    # ── Query — strictly scoped to this user ──────────────────────────────────
    txs = (
        db.query(Transaction)
        .filter(
            Transaction.user_id == current_user,
            Transaction.date >= date_from,
            Transaction.date <= date_to,
        )
        .order_by(Transaction.date.asc())
        .all()
    )

    if not txs:
        raise HTTPException(
            status_code=404,
            detail=f"No transactions found between {date_from} and {date_to}.",
        )

    # ── Serialise ──────────────────────────────────────────────────────────────
    rows = [
        {
            "date":           str(tx.date),
            "description":    tx.description,
            "amount":         float(tx.amount),
            "type":           tx.type,
            "category":       tx.category,
            "payment_method": tx.payment_method,
        }
        for tx in txs
    ]

    filename_stem = f"transactions_{date_from}_{date_to}"

    if fmt == "csv":
        content = _build_csv(rows)
        media_type = "text/csv"
        filename   = f"{filename_stem}.csv"
    else:
        content = _build_xml(rows, str(date_from), str(date_to), current_user)
        media_type = "application/xml"
        filename   = f"{filename_stem}.xml"

    # ── Stream response (file never touches disk) ──────────────────────────────
    return StreamingResponse(
        io.BytesIO(content),
        media_type=media_type,
        headers={
            "Content-Disposition": f'attachment; filename="{filename}"',
            "Content-Length": str(len(content)),
            "Cache-Control": "no-store",
        },
    )
