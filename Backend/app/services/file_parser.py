"""
app/services/file_parser.py
─────────────────────────────────────────────────────────────────────────────
Parses bank statement files (CSV, XLSX) into a normalised list of raw rows
that the import wizard can work with.

Supported banks (v1):
  - Bancolombia   → XLSX export format (auto-detected by structure)
  - Generic CSV   → First row treated as column headers

Raw row schema returned for every bank:
  {
    "_row_index": int,          # original row position in file (for error reporting)
    "raw_date":   str | None,   # date string exactly as it appeared in the file
    "raw_amount": str | None,   # amount string exactly as it appeared
    "raw_desc":   str | None,   # description string
    "raw_balance":str | None,   # balance-after string (if available)
    "raw_doc":    str | None,   # document / reference number (if available)
    "raw_branch": str | None,   # branch / office (Bancolombia only)
    # For generic CSV, every detected column is also included as raw_col_<header>
  }

The column_mapping step in the wizard maps these raw keys onto the four
internal fields the backend needs: date, amount, description, balance.
─────────────────────────────────────────────────────────────────────────────
"""

import io
import csv
import re
from datetime import date
from typing import Optional


# ── Dependency guard ──────────────────────────────────────────────────────────
try:
    import openpyxl
    _HAS_OPENPYXL = True
except ImportError:
    _HAS_OPENPYXL = False


# ── Constants ─────────────────────────────────────────────────────────────────

MAX_FILE_BYTES = 5 * 1024 * 1024  # 5 MB

# Bancolombia XLSX column names (Spanish)
_BANCO_COL_FECHA = "FECHA"
_BANCO_COL_DESC  = "DESCRIPCIÓN"
_BANCO_COL_BRANCH = "SUCURSAL"
_BANCO_COL_DOC   = "DCTO."
_BANCO_COL_VALOR = "VALOR"
_BANCO_COL_SALDO = "SALDO"

# Bancolombia section markers
_BANCO_MOVIMIENTOS_MARKER = "Movimientos:"

# ATM description patterns (Bancolombia)
ATM_PATTERNS_BANCOLOMBIA = [
    r"RETIRO ATM",
    r"RETIRO CAJERO",
    r"RETIRO EFECTIVO",
    r"AVANCE",
    r"ATM",
]

# ── Exceptions ────────────────────────────────────────────────────────────────

class ParseError(Exception):
    """Raised when a file cannot be parsed."""


# ── Amount parsing ────────────────────────────────────────────────────────────

def _parse_amount_string(raw: str, decimal_sep: str = ".") -> Optional[float]:
    """
    Convert a raw amount string to a float, handling both:
      - Period decimal:  '1,234.56' or '-34,150.00'
      - Comma decimal:   '1.234,56' or '-34.150,00'

    Returns None if parsing fails.
    """
    if raw is None:
        return None
    s = str(raw).strip()
    if not s:
        return None
    try:
        if decimal_sep == ".":
            # Remove thousands commas then parse
            s = s.replace(",", "")
        else:
            # Comma decimal: remove thousands periods, swap comma to period
            s = s.replace(".", "").replace(",", ".")
        return float(s)
    except ValueError:
        return None


# ── Date inference (DD/MM without year) ──────────────────────────────────────

def _infer_year(day: int, month: int, reference_date: Optional[date] = None) -> int:
    """
    When a date has no year, infer it from the reference date (today or
    the date range of the statement).  A date that falls more than
    60 days in the future is assumed to belong to the previous year.
    """
    ref = reference_date or date.today()
    candidate = date(ref.year, month, day)
    diff = (candidate - ref).days
    if diff > 60:
        return ref.year - 1
    return ref.year


def _parse_bancolombia_date(raw: str, reference_date: Optional[date] = None) -> Optional[str]:
    """
    Parse Bancolombia date strings like '1/01', '15/03', '28/12'.
    Returns ISO YYYY-MM-DD string or None on failure.
    """
    if not raw:
        return None
    raw = str(raw).strip()
    # Try D/MM  or  DD/MM
    m = re.match(r"^(\d{1,2})/(\d{1,2})$", raw)
    if m:
        day, month = int(m.group(1)), int(m.group(2))
        try:
            year = _infer_year(day, month, reference_date)
            return date(year, month, day).isoformat()
        except ValueError:
            return None
    return None


def _parse_generic_date(raw: str, date_format: str) -> Optional[str]:
    """
    Parse a date string using one of the supported format codes.
    Returns ISO YYYY-MM-DD string or None on failure.
    """
    from datetime import datetime
    if not raw:
        return None
    raw = str(raw).strip()

    fmt_map = {
        "DD/MM/YYYY":  "%d/%m/%Y",
        "MM/DD/YYYY":  "%m/%d/%Y",
        "YYYY-MM-DD":  "%Y-%m-%d",
        "DD/MM":       None,   # handled specially
        "MM/DD":       None,
    }
    fmt = fmt_map.get(date_format)
    if fmt:
        try:
            return datetime.strptime(raw, fmt).date().isoformat()
        except ValueError:
            return None
    elif date_format == "DD/MM":
        m = re.match(r"^(\d{1,2})/(\d{1,2})$", raw)
        if m:
            day, month = int(m.group(1)), int(m.group(2))
            year = _infer_year(day, month)
            try:
                return date(year, month, day).isoformat()
            except ValueError:
                return None
    elif date_format == "MM/DD":
        m = re.match(r"^(\d{1,2})/(\d{1,2})$", raw)
        if m:
            month, day = int(m.group(1)), int(m.group(2))
            year = _infer_year(day, month)
            try:
                return date(year, month, day).isoformat()
            except ValueError:
                return None
    return None


# ── ATM detection ─────────────────────────────────────────────────────────────

def is_atm_description(description: str, patterns: list = None) -> bool:
    patterns = patterns or ATM_PATTERNS_BANCOLOMBIA
    desc_upper = description.upper()
    return any(re.search(p, desc_upper) for p in patterns)


# ── Bancolombia XLSX parser ───────────────────────────────────────────────────

def parse_bancolombia_xlsx(file_bytes: bytes) -> dict:
    """
    Parse a Bancolombia savings/checking account XLSX statement.

    File structure:
      Rows 1-13:  Client info, account info, summary (skip)
      Row 14:     'Movimientos:' section header
      Row 15:     Column headers: FECHA | DESCRIPCIÓN | SUCURSAL | DCTO. | VALOR | SALDO
      Row 16+:    Transaction data

    Returns:
      {
        "bank": "Bancolombia",
        "account_number": str | None,
        "date_from": str | None,   # ISO date of earliest transaction
        "date_to":   str | None,   # ISO date of latest transaction
        "columns": [str, ...],     # detected column header names
        "suggested_mapping": {     # pre-filled mapping for the UI
            "date": "raw_date",
            "amount": "raw_amount",
            "description": "raw_desc",
            "balance": "raw_balance",
        },
        "rows": [{...}],           # normalised raw rows
        "skipped_count": int,      # rows with no usable data
      }
    """
    if not _HAS_OPENPYXL:
        raise ParseError("openpyxl is required for XLSX parsing. Install it: pip install openpyxl")

    wb = openpyxl.load_workbook(io.BytesIO(file_bytes), data_only=True, read_only=True)
    ws = wb.active

    all_rows = list(ws.iter_rows(values_only=True))

    # Extract account number from header section
    account_number = None
    for row in all_rows[:12]:
        for cell in row:
            if isinstance(cell, str) and len(cell) >= 8 and cell.isdigit():
                account_number = cell
                break

    # Find the "Movimientos:" marker row, then the header row just below it
    header_row_idx = None
    for i, row in enumerate(all_rows):
        if not row:  # completely empty tuple — skip
            continue
        first = str(row[0]).strip() if row[0] else ""
        if first == _BANCO_MOVIMIENTOS_MARKER:
            header_row_idx = i + 1  # the next row is the column header
            break

    if header_row_idx is None:
        raise ParseError(
            "Could not find the 'Movimientos:' section in this file. "
            "Please ensure you are uploading a Bancolombia account statement."
        )

    header_row = all_rows[header_row_idx]
    columns = [str(c).strip() if c else "" for c in header_row[:6]]

    # Validate expected columns
    expected = [_BANCO_COL_FECHA, _BANCO_COL_DESC, _BANCO_COL_BRANCH,
                _BANCO_COL_DOC, _BANCO_COL_VALOR, _BANCO_COL_SALDO]
    if columns[:2] != expected[:2]:
        raise ParseError(
            f"Unexpected column layout: {columns[:2]}. "
            f"Expected [{_BANCO_COL_FECHA}, {_BANCO_COL_DESC}]. "
            "This file may not be a standard Bancolombia statement export."
        )

    # Parse data rows
    data_start = header_row_idx + 1
    raw_rows = []
    skipped = 0
    dates_seen = []

    for row_idx, row in enumerate(all_rows[data_start:], start=data_start + 1):
        if not row or len(row) < 2:  # guard against empty or very short rows
            skipped += 1
            continue
        raw_fecha  = str(row[0]).strip() if len(row) > 0 and row[0] is not None else ""
        raw_desc   = str(row[1]).strip() if len(row) > 1 and row[1] is not None else ""
        raw_branch = str(row[2]).strip() if len(row) > 2 and row[2] is not None else None
        raw_doc    = str(row[3]).strip() if len(row) > 3 and row[3] is not None else None
        raw_valor  = str(row[4]).strip() if len(row) > 4 and row[4] is not None else ""
        raw_saldo  = str(row[5]).strip() if len(row) > 5 and row[5] is not None else None

        # Skip completely empty rows
        if not raw_fecha and not raw_desc and not raw_valor:
            skipped += 1
            continue

        parsed_date = _parse_bancolombia_date(raw_fecha)
        if parsed_date:
            dates_seen.append(parsed_date)

        raw_rows.append({
            "_row_index":  row_idx,
            "raw_date":    raw_fecha or None,
            "raw_amount":  raw_valor or None,
            "raw_desc":    raw_desc or None,
            "raw_balance": raw_saldo or None,
            "raw_doc":     raw_doc or None,
            "raw_branch":  raw_branch or None,
        })

    wb.close()

    date_from = min(dates_seen) if dates_seen else None
    date_to   = max(dates_seen) if dates_seen else None

    return {
        "bank":       "Bancolombia",
        "account_number": account_number,
        "date_from":  date_from,
        "date_to":    date_to,
        "columns":    columns,
        "suggested_mapping": {
            "date":        "raw_date",
            "amount":      "raw_amount",
            "description": "raw_desc",
            "balance":     "raw_balance",
            "document":    "raw_doc",
        },
        "rows":          raw_rows,
        "skipped_count": skipped,
    }


# ── Generic CSV parser ────────────────────────────────────────────────────────

def parse_generic_csv(
    file_bytes: bytes,
    encoding: str = "utf-8",
    delimiter: str = ",",
) -> dict:
    """
    Parse a generic CSV file.  The first non-empty row is treated as column headers.
    Every subsequent row becomes a raw row with keys raw_col_<header>.

    Returns same schema as parse_bancolombia_xlsx but with:
      - suggested_mapping set to empty (user must map manually)
      - columns listing each detected CSV header
    """
    # Try specified encoding, fall back to latin-1
    for enc in [encoding, "utf-8-sig", "latin-1", "windows-1252"]:
        try:
            text = file_bytes.decode(enc)
            break
        except (UnicodeDecodeError, LookupError):
            text = None
    if not text:
        raise ParseError("Could not decode the file. Supported encodings: UTF-8, ISO-8859-1, Windows-1252.")

    reader = csv.reader(io.StringIO(text), delimiter=delimiter)
    rows = list(reader)

    # Find the first non-empty row as header
    header_idx = None
    for i, row in enumerate(rows):
        if any(cell.strip() for cell in row):
            header_idx = i
            break

    if header_idx is None:
        raise ParseError("The file appears to be empty or has no readable rows.")

    headers = [h.strip() for h in rows[header_idx]]
    if not any(headers):
        raise ParseError("Could not detect column headers in the first row.")

    raw_rows = []
    skipped = 0
    for row_idx, row in enumerate(rows[header_idx + 1:], start=header_idx + 2):
        if not any(cell.strip() for cell in row):
            skipped += 1
            continue
        entry = {"_row_index": row_idx}
        for col_i, header in enumerate(headers):
            key = f"raw_col_{re.sub(r'[^a-zA-Z0-9]', '_', header).lower()}"
            entry[key] = row[col_i].strip() if col_i < len(row) else None
        raw_rows.append(entry)

    return {
        "bank":       "Generic",
        "account_number": None,
        "date_from":  None,
        "date_to":    None,
        "columns":    headers,
        "suggested_mapping": {
            "date":        None,
            "amount":      None,
            "description": None,
            "balance":     None,
            "document":    None,
        },
        "rows":          raw_rows,
        "skipped_count": skipped,
    }


# ── Validate + apply column mapping ──────────────────────────────────────────

def apply_mapping_and_validate(
    raw_rows: list,
    column_mapping: dict,
    bank: str,
    date_format: str,
    decimal_sep: str,
    existing_transactions: list = None,
) -> dict:
    """
    Apply the user's column mapping to each raw row and validate every field.

    column_mapping keys expected:
      date, amount, description   (required)
      balance, document           (optional)

    existing_transactions: list of {"date": ISO, "amount": float, "description": str}
      used for duplicate detection.

    Returns:
      {
        "valid_rows":   [{date, amount, description, balance, document, _row_index}],
        "error_rows":   [{_row_index, errors: [str]}],
        "duplicates":   [{_row_index, reason: str}],
        "date_from":    str | None,
        "date_to":      str | None,
      }
    """
    date_key   = column_mapping.get("date")
    amount_key = column_mapping.get("amount")
    desc_key   = column_mapping.get("description")
    bal_key    = column_mapping.get("balance")
    doc_key    = column_mapping.get("document")

    valid_rows  = []
    error_rows  = []
    duplicates  = []
    dates_seen  = []

    for row in raw_rows:
        idx    = row.get("_row_index", 0)
        errors = []

        # ── Date ──────────────────────────────────────────────────────────────
        raw_date_val = row.get(date_key) if date_key else None
        if bank == "Bancolombia":
            parsed_date = _parse_bancolombia_date(raw_date_val)
        else:
            parsed_date = _parse_generic_date(raw_date_val, date_format)

        if not parsed_date:
            errors.append(f"Cannot parse date '{raw_date_val}' (format: {date_format})")

        # ── Amount ────────────────────────────────────────────────────────────
        raw_amount_val = row.get(amount_key) if amount_key else None
        parsed_amount  = _parse_amount_string(raw_amount_val, decimal_sep)
        if parsed_amount is None:
            errors.append(f"Cannot parse amount '{raw_amount_val}'")

        # ── Description ───────────────────────────────────────────────────────
        raw_desc_val = row.get(desc_key) if desc_key else None
        if not raw_desc_val:
            errors.append("Description is empty")

        # ── Optional fields ───────────────────────────────────────────────────
        raw_balance = row.get(bal_key) if bal_key else None
        raw_doc     = row.get(doc_key) if doc_key else None

        if errors:
            error_rows.append({"_row_index": idx, "errors": errors})
            continue

        # ── Duplicate detection ────────────────────────────────────────────────
        is_duplicate = False
        if existing_transactions and parsed_date and parsed_amount is not None:
            from datetime import datetime, timedelta
            check_date = datetime.fromisoformat(parsed_date).date()
            for ex in existing_transactions:
                try:
                    ex_date = datetime.fromisoformat(ex["date"]).date()
                    ex_amt  = float(ex["amount"])
                except (ValueError, KeyError, TypeError):
                    continue
                date_diff = abs((check_date - ex_date).days)
                amt_match = abs(ex_amt - abs(parsed_amount)) < 0.01
                if date_diff <= 3 and amt_match:
                    # Fuzzy description check (simple substring)
                    ex_desc_lower   = (ex.get("description") or "").lower()
                    row_desc_lower  = (raw_desc_val or "").lower()
                    words = [w for w in row_desc_lower.split() if len(w) > 3]
                    desc_match = any(w in ex_desc_lower for w in words) if words else False
                    if desc_match:
                        is_duplicate = True
                        duplicates.append({
                            "_row_index": idx,
                            "reason": (
                                f"Similar transaction on {ex['date']} for "
                                f"{abs(parsed_amount):,.2f} already exists"
                            ),
                        })
                        break

        dates_seen.append(parsed_date)

        # ── ATM auto-detection ────────────────────────────────────────────────
        suggested_type     = None
        suggested_category = None
        if raw_desc_val and is_atm_description(raw_desc_val):
            suggested_type     = "expense"
            suggested_category = "ATM Withdrawal"

        valid_rows.append({
            "_row_index":          idx,
            "date":                parsed_date,
            "amount":              abs(parsed_amount),
            "is_credit":           parsed_amount > 0,
            "description":         raw_desc_val,
            "balance_after":       _parse_amount_string(raw_balance, decimal_sep),
            "document":            raw_doc,
            "is_potential_dup":    is_duplicate,
            "suggested_type":      suggested_type,
            "suggested_category":  suggested_category,
        })

    date_from = min(dates_seen) if dates_seen else None
    date_to   = max(dates_seen) if dates_seen else None

    return {
        "valid_rows":  valid_rows,
        "error_rows":  error_rows,
        "duplicates":  duplicates,
        "date_from":   date_from,
        "date_to":     date_to,
    }


# ── Top-level dispatcher ──────────────────────────────────────────────────────

def parse_file(file_bytes: bytes, filename: str, bank: str) -> dict:
    """
    Route to the correct parser based on file extension and bank.
    Returns the raw parse result (columns + rows, no validation yet).
    """
    if len(file_bytes) > MAX_FILE_BYTES:
        raise ParseError(
            f"File size {len(file_bytes) / 1024 / 1024:.1f} MB exceeds the 5 MB limit. "
            "Please trim the file to a shorter date range."
        )

    ext = filename.rsplit(".", 1)[-1].lower() if "." in filename else ""

    if ext in ("xlsx", "xls"):
        if bank == "Bancolombia":
            return parse_bancolombia_xlsx(file_bytes)
        else:
            raise ParseError(
                f"XLSX format is currently only supported for Bancolombia. "
                f"For {bank}, please export as CSV."
            )
    elif ext == "csv":
        return parse_generic_csv(file_bytes)
    elif ext in ("xml", "ofx", "qif"):
        raise ParseError("XML/OFX/QIF parsing is not yet implemented for this bank.")
    else:
        raise ParseError(
            f"Unsupported file type '.{ext}'. "
            "Accepted formats: CSV (.csv), Excel (.xlsx), XML (.xml)."
        )
