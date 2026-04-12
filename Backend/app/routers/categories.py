"""
backend/app/routers/categories.py — AUTH UPDATE

Category visibility rules:
  system rows   (user_id IS NULL)  → visible to every authenticated user
  user rows     (user_id = caller) → visible only to the owner

Users can only CREATE expense/income categories (not savings).
System categories cannot be deleted or renamed.
The POST /categories/seed endpoint seeds system rows (user_id = NULL) once.
"""

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import or_
from sqlalchemy.orm import Session
from typing import Optional
import uuid

from ..database import get_db
from ..models import Category
from ..dependencies import get_current_user

router = APIRouter(prefix="/categories", tags=["categories"])

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


VALID_KINDS = {"expense", "income", "savings"}
ALLOWED_USER_KINDS = {"expense", "income"}


SYSTEM_CATEGORIES = [
    { "name": "Housing / Rent",  "color": "#6366F1", "kind": "expense", "sort_order": 0  },
    { "name": "Food & Dining",   "color": "#10B981", "kind": "expense", "sort_order": 1  },
    { "name": "Transport",       "color": "#F97316", "kind": "expense", "sort_order": 2  },
    { "name": "Shopping",        "color": "#38BDF8", "kind": "expense", "sort_order": 3  },
    { "name": "Health",          "color": "#A78BFA", "kind": "expense", "sort_order": 4  },
    { "name": "Entertainment",   "color": "#F97316", "kind": "expense", "sort_order": 5  },
    { "name": "Utilities",       "color": "#84CC16", "kind": "expense", "sort_order": 6  },
    { "name": "Debt Payments",   "color": "#EF4444", "kind": "expense", "sort_order": 7  },
    { "name": "Other",           "color": "#475569", "kind": "expense", "sort_order": 8  },
    { "name": "Salary",          "color": "#10B981", "kind": "income",  "sort_order": 9  },
    { "name": "Side Income",     "color": "#10B981", "kind": "income",  "sort_order": 10 },
    { "name": "Refund",          "color": "#38BDF8", "kind": "income",  "sort_order": 11 },
    { "name": "Other Income",    "color": "#475569", "kind": "income",  "sort_order": 12 },
    { "name": "Savings",         "color": "#A78BFA", "kind": "savings", "sort_order": 13 },
]


def _serialize(cat: Category) -> dict:
    return {
        "id":         str(cat.id),
        "name":       cat.name,
        "color":      cat.color,
        "kind":       cat.kind,
        "system":     cat.system,
        "sort_order": cat.sort_order,
    }


def _user_filter(q, current_user: str):
    """System rows (NULL) + caller's own rows."""
    return q.filter(
        or_(Category.user_id == current_user, Category.user_id.is_(None))
    )


@router.get("/")
def get_categories(
    kind: Optional[str] = Query(None),
    current_user: str = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if kind and kind not in VALID_KINDS:
        raise HTTPException(status_code=400, detail=f"Invalid kind '{kind}'.")

    q = _user_filter(db.query(Category), current_user)
    if kind:
        q = q.filter(Category.kind == kind)

    return [_serialize(r) for r in q.order_by(Category.sort_order, Category.name).all()]


@router.post("/", status_code=201)
def create_category(
    data: CategoryCreate,
    current_user: str = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if data.kind not in ALLOWED_USER_KINDS:
        raise HTTPException(
            status_code=400,
            detail=f"Users can only create 'expense' or 'income' categories.",
        )

    # Check for duplicate among system rows AND this user's own rows
    existing = _user_filter(db.query(Category), current_user).filter(
        Category.name.ilike(data.name.strip())
    ).first()
    if existing:
        raise HTTPException(
            status_code=409,
            detail=f"A category named '{data.name.strip()}' already exists.",
        )

    cat = Category(
        user_id=current_user,
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
    current_user: str = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    try:
        parsed_id = uuid.UUID(category_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid ID format")

    # Only rows visible to this user (system or own)
    cat = _user_filter(db.query(Category), current_user).filter(
        Category.id == parsed_id
    ).first()
    if not cat:
        raise HTTPException(status_code=404, detail="Category not found")

    if data.name is not None:
        incoming = data.name.strip()
        if cat.system and incoming != cat.name:
            raise HTTPException(status_code=403, detail="System category names cannot be changed.")
        if incoming != cat.name:
            duplicate = _user_filter(db.query(Category), current_user).filter(
                Category.name.ilike(incoming),
                Category.id != parsed_id,
            ).first()
            if duplicate:
                raise HTTPException(status_code=409, detail=f"'{incoming}' already exists.")
            cat.name = incoming

    if data.color      is not None: cat.color      = data.color
    if data.sort_order is not None: cat.sort_order = data.sort_order

    db.commit()
    db.refresh(cat)
    return _serialize(cat)


@router.delete("/{category_id}")
def delete_category(
    category_id: str,
    current_user: str = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    try:
        parsed_id = uuid.UUID(category_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid ID format")

    cat = _user_filter(db.query(Category), current_user).filter(
        Category.id == parsed_id
    ).first()
    if not cat:
        raise HTTPException(status_code=404, detail="Category not found")
    if cat.system:
        raise HTTPException(status_code=403, detail="System categories cannot be deleted.")

    db.delete(cat)
    db.commit()
    return {"message": f"Category '{cat.name}' deleted"}


@router.post("/seed", status_code=200)
def seed_system_categories(
    current_user: str = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Idempotent seed of system categories (user_id = NULL).
    Safe to call multiple times — skips any that already exist by name.
    """
    created = []
    skipped = []

    for entry in SYSTEM_CATEGORIES:
        existing = db.query(Category).filter(
            Category.name == entry["name"],
            Category.user_id.is_(None),
        ).first()

        if existing:
            skipped.append(entry["name"])
            continue

        cat = Category(
            user_id=None,   # NULL = shared system row
            name=entry["name"],
            color=entry["color"],
            kind=entry["kind"],
            system=True,
            sort_order=entry["sort_order"],
        )
        db.add(cat)
        created.append(entry["name"])

    db.commit()
    return {"created": created, "skipped": skipped, "total": len(SYSTEM_CATEGORIES)}