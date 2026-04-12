from sqlalchemy import Column, String, Numeric, Date, DateTime, Boolean, Integer, Enum, ForeignKey, Text
from sqlalchemy.dialects.postgresql import UUID
import uuid
from datetime import datetime
from .database import Base


class Transaction(Base):
    __tablename__ = "transactions"
    id                 = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id            = Column(UUID(as_uuid=True), nullable=True, index=True)
    date               = Column(Date, nullable=False)
    description        = Column(String(255))
    category           = Column(String(100))
    type               = Column(Enum("income", "expense", "savings", name="transaction_type"))
    amount             = Column(Numeric(10, 2))
    planned_amt        = Column(Numeric(10, 2))
    payment_method     = Column(String(50))
    source             = Column(Enum("manual", "import", "api_sync", name="source_type"))
    created_at         = Column(DateTime, default=datetime.utcnow)
    is_draft           = Column(Boolean, default=False)
    budget_category_id = Column(
        UUID(as_uuid=True),
        ForeignKey("budget_categories.id", ondelete="SET NULL"),
        nullable=True,
    )


class BudgetCategory(Base):
    """
    One row per entity event.
    - One row per bill (created when bill is created)
    - One row per debt payment (created when payment is recorded)
    - One row per savings contribution (created when contribution is recorded)

    categories_name is a soft reference to categories.name for budget grouping.
    transaction_id links to the transaction once it exists.
    type identifies the specific entity ("Bill: Electric Bill", etc.)
    """
    __tablename__ = "budget_categories"
    id                         = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    # ── AUTH ──────────────────────────────────────────────────────────────────
    user_id                    = Column(UUID(as_uuid=True), nullable=True, index=True)
    transaction_id             = Column(UUID(as_uuid=True),
                                        ForeignKey("transactions.id", ondelete="SET NULL"),
                                        nullable=True)
    transaction_name           = Column(String(255), nullable=False)
    transaction_payment_method = Column(String(50), nullable=True)
    categories_name            = Column(String(100), nullable=False)
    type                       = Column(String(255), nullable=False)
    amount                     = Column(Numeric(10, 2), nullable=False)
    date                       = Column(Date, nullable=False)


class Bill(Base):
    __tablename__ = "bills"
    id                 = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    # ── AUTH ──────────────────────────────────────────────────────────────────
    user_id            = Column(UUID(as_uuid=True), nullable=True, index=True)
    name               = Column(String(100))
    amount             = Column(Numeric(10, 2))
    due_date           = Column(Date)
    frequency          = Column(String(50))
    category           = Column(String(100))
    status             = Column(Enum("paid", "unpaid", name="bill_status"))
    auto_detected      = Column(Boolean, default=False)
    transaction_id     = Column(UUID(as_uuid=True),
                                ForeignKey("transactions.id", ondelete="SET NULL"),
                                nullable=True)
    budget_category_id = Column(UUID(as_uuid=True),
                                ForeignKey("budget_categories.id", ondelete="SET NULL"),
                                nullable=True)


class Debt(Base):
    __tablename__ = "debts"
    id               = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    # ── AUTH ──────────────────────────────────────────────────────────────────
    user_id          = Column(UUID(as_uuid=True), nullable=True, index=True)
    name             = Column(String(100))
    balance          = Column(Numeric(10, 2))
    original_balance = Column(Numeric(10, 2), nullable=True)  # tracks starting balance
    interest_rate    = Column(Numeric(5, 2))
    min_payment      = Column(Numeric(10, 2))
    priority_rank    = Column(Integer)


class SavingsGoal(Base):
    __tablename__ = "savings_goals"
    id             = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    # ── AUTH ──────────────────────────────────────────────────────────────────
    user_id        = Column(UUID(as_uuid=True), nullable=True, index=True)
    goal_name      = Column(String(100))
    target_amount  = Column(Numeric(10, 2))
    current_amount = Column(Numeric(10, 2))
    deadline_date  = Column(Date)


class Category(Base):
    """
    Two kinds of rows live in this table:

    1. System categories  (user_id = NULL)
       Shared across all users. Seeded once via POST /categories/seed.
       Cannot be deleted or renamed.

    2. User categories  (user_id = <uuid>)
       Created by a specific user. Visible only to that user.

    Queries always filter:  WHERE (user_id = :uid OR user_id IS NULL)
    so every user sees system rows + their own custom rows.
    """
    __tablename__ = "categories"
    id             = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    # ── AUTH: NULL = system / shared, UUID = user-specific ───────────────────
    user_id        = Column(UUID(as_uuid=True), nullable=True, index=True)
    name           = Column(String(100), nullable=False)
    color          = Column(String(20), nullable=False, default="#475569")
    kind           = Column(
        Enum("expense", "income", "savings", name="category_kind"),
        nullable=False
    )
    system         = Column(Boolean, default=False)
    sort_order     = Column(Integer, default=0)
    planned_amount = Column(Numeric(10, 2), nullable=False, default=0)


class Preferences(Base):
    """
    One row per user (keyed by user_id).
    GET /preferences auto-creates the default row on first call.
    """
    __tablename__ = "preferences"
    id          = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    # ── AUTH ──────────────────────────────────────────────────────────────────
    user_id     = Column(UUID(as_uuid=True), nullable=True, unique=True, index=True)
    currency    = Column(String(10),  nullable=False, default="USD")
    date_format = Column(String(20),  nullable=False, default="MMM D, YYYY")
    month_start = Column(Integer,     nullable=False, default=1)