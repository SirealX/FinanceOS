"""
backend/app/routers/categories.py
─────────────────────────────────────────────────────────────────────────────
Categories endpoints. Only expense, income, and savings kinds exist.

  GET    /categories        → List all, filterable by ?kind=
  POST   /categories        → Create a user-defined expense or income category
  PUT    /categories/{id}   → Update name/color (system categories: color only)
  DELETE /categories/{id}   → Delete (guard: cannot delete system categories)
  POST   /categories/seed   → Idempotent seed of all system categories

Rules:
  • Only kind=expense and kind=income can be user-created.
  • kind=savings has exactly one row ("Savings") — system-managed, cannot be
    deleted, and users cannot add more categories under it.
  • System categories cannot be deleted or renamed.
─────────────────────────────────────────────────────────────────────────────
"""

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from typing import Optional
import uuid

from ..database import get_db
from ..models import Category

router = APIRouter(prefix="/categories", tags=["categories"])


# ── Pydantic schemas ──────────────────────────────────────────────────────────

from pydantic import BaseModel

class CategoryCreate(BaseModel):
    name: str
    color: str = "#475569"
    kind: str = "expense"
    sort_order: int = 0

class CategoryUpdate(BaseModel):
    name: Optional[str] = None
    color: Optional[str] = None
    sort_order: Optional[int] = None


# ── Valid kinds ───────────────────────────────────────────────────────────────

VALID_KINDS = {"expense", "income", "savings"}

# Users can only create categories under these two kinds.
# savings has exactly one system row and cannot be extended by users.
ALLOWED_USER_KINDS = {"expense", "income"}


# ── System category seed data ─────────────────────────────────────────────────

SYSTEM_CATEGORIES = [
    # Expense
    { "name": "Housing / Rent",  "color": "#6366F1", "kind": "expense", "sort_order": 0  },
    { "name": "Food & Dining",   "color": "#10B981", "kind": "expense", "sort_order": 1  },
    { "name": "Transport",       "color": "#F97316", "kind": "expense", "sort_order": 2  },
    { "name": "Shopping",        "color": "#38BDF8", "kind": "expense", "sort_order": 3  },
    { "name": "Health",          "color": "#A78BFA", "kind": "expense", "sort_order": 4  },
    { "name": "Entertainment",   "color": "#F97316", "kind": "expense", "sort_order": 5  },
    { "name": "Utilities",       "color": "#84CC16", "kind": "expense", "sort_order": 6  },
    { "name": "Debt Payments",   "color": "#EF4444", "kind": "expense", "sort_order": 7  },
    { "name": "Other",           "color": "#475569", "kind": "expense", "sort_order": 8  },
    # Income
    { "name": "Salary",          "color": "#10B981", "kind": "income",  "sort_order": 9  },
    { "name": "Side Income",     "color": "#10B981", "kind": "income",  "sort_order": 10 },
    { "name": "Refund",          "color": "#38BDF8", "kind": "income",  "sort_order": 11 },
    { "name": "Other Income",    "color": "#475569", "kind": "income",  "sort_order": 12 },
    # Savings — exactly one row, system-managed
    { "name": "Savings",         "color": "#A78BFA", "kind": "savings", "sort_order": 13 },
]


# ── Helpers ───────────────────────────────────────────────────────────────────

def _serialize(cat: Category) -> dict:
    return {
        "id":         str(cat.id),
        "name":       cat.name,
        "color":      cat.color,
        "kind":       cat.kind,
        "system":     cat.system,
        "sort_order": cat.sort_order,
    }


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.get("/")
def get_categories(
    kind: Optional[str] = Query(None),
    db:   Session = Depends(get_db),
):
    if kind and kind not in VALID_KINDS:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid kind '{kind}'. Must be one of: {', '.join(sorted(VALID_KINDS))}",
        )

    q = db.query(Category)
    if kind:
        q = q.filter(Category.kind == kind)

    rows = q.order_by(Category.sort_order, Category.name).all()
    return [_serialize(r) for r in rows]


@router.post("/", status_code=201)
def create_category(data: CategoryCreate, db: Session = Depends(get_db)):
    if data.kind not in ALLOWED_USER_KINDS:
        raise HTTPException(
            status_code=400,
            detail=f"Users can only create 'expense' or 'income' categories. Got '{data.kind}'.",
        )

    existing = db.query(Category).filter(
        Category.name.ilike(data.name.strip())
    ).first()
    if existing:
        raise HTTPException(
            status_code=409,
            detail=f"A category named '{data.name.strip()}' already exists.",
        )

    cat = Category(
        name=data.name.strip(),
        color=data.color,
        kind=data.kind,
        system=False,
        sort_order=data.sort_order,
    )
    db.add(cat)
    db.commit()
    db.refresh(cat)
    return _serialize(cat)


@router.put("/{category_id}")
def update_category(
    category_id: str,
    data: CategoryUpdate,
    db: Session = Depends(get_db),
):
    try:
        parsed_id = uuid.UUID(category_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid ID format")

    cat = db.query(Category).filter(Category.id == parsed_id).first()
    if not cat:
        raise HTTPException(status_code=404, detail="Category not found")

    if data.name is not None:
        incoming = data.name.strip()
        if cat.system and incoming != cat.name:
            raise HTTPException(
                status_code=403,
                detail="System category names cannot be changed.",
            )
        if incoming != cat.name:
            duplicate = db.query(Category).filter(
                Category.name.ilike(incoming),
                Category.id != parsed_id,
            ).first()
            if duplicate:
                raise HTTPException(
                    status_code=409,
                    detail=f"A category named '{incoming}' already exists.",
                )
            cat.name = incoming

    if data.color is not None:
        cat.color = data.color

    if data.sort_order is not None:
        cat.sort_order = data.sort_order

    db.commit()
    db.refresh(cat)
    return _serialize(cat)


@router.delete("/{category_id}")
def delete_category(category_id: str, db: Session = Depends(get_db)):
    try:
        parsed_id = uuid.UUID(category_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid ID format")

    cat = db.query(Category).filter(Category.id == parsed_id).first()
    if not cat:
        raise HTTPException(status_code=404, detail="Category not found")

    if cat.system:
        raise HTTPException(
            status_code=403,
            detail="System categories cannot be deleted.",
        )

    db.delete(cat)
    db.commit()
    return {"message": f"Category '{cat.name}' deleted"}


@router.post("/seed", status_code=200)
def seed_system_categories(db: Session = Depends(get_db)):
    """
    Idempotent seed. Safe to call multiple times.
    Inserts any system category that does not already exist by name.
    """
    created = []
    skipped = []

    for entry in SYSTEM_CATEGORIES:
        existing = db.query(Category).filter(
            Category.name == entry["name"]
        ).first()

        if existing:
            skipped.append(entry["name"])
            continue

        cat = Category(
            name=entry["name"],
            color=entry["color"],
            kind=entry["kind"],
            system=True,
            sort_order=entry["sort_order"],
        )
        db.add(cat)
        created.append(entry["name"])

    db.commit()
    return {
        "created": created,
        "skipped": skipped,
        "total_system_categories": len(SYSTEM_CATEGORIES),
    }