from sqlalchemy import Column, String, Numeric, Date, DateTime, Boolean, Integer, Enum, ForeignKey, Text, Time
from sqlalchemy.dialects.postgresql import UUID, JSONB
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
    source             = Column(Enum(
                             "manual", "import", "api_sync",
                             "bill_payment", "savings_contribution", "csv_import",
                             name="source_type"
                         ))
    created_at         = Column(DateTime, default=datetime.utcnow)
    is_draft           = Column(Boolean, default=False)
    # reviewed: False for csv_import / api_sync until user reviews; True for manual
    reviewed           = Column(Boolean, default=True)
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
    id           = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    # ── AUTH ──────────────────────────────────────────────────────────────────
    user_id      = Column(UUID(as_uuid=True), nullable=True, unique=True, index=True)
    display_name = Column(String(100), nullable=True)   # user's chosen first name / display name
    currency     = Column(String(10),  nullable=False, default="USD")
    date_format  = Column(String(20),  nullable=False, default="MMM D, YYYY")
    month_start  = Column(Integer,     nullable=False, default=1)
    # Updated on every authenticated request — used for session-boundary detection
    last_seen_at = Column(DateTime, nullable=True)

    # ── Bank balance reconciliation ────────────────────────────────────────────
    # bank_balance:        actual balance the user last saw at their bank
    # bank_balance_date:   date they last updated it
    # initial_balance:     how much they had when they started using the app
    # tracking_start_date: date they began entering transactions (isolates the
    #                      "active gap" from historical pre-app data)
    # show_balance_gap:    whether to surface the active gap on the dashboard
    # balance_reminder_day: day of month (1–28) to fire a "check your balance"
    #                       alert — NULL means the reminder is disabled
    bank_balance         = Column(Numeric(12, 2), nullable=True)
    bank_balance_date    = Column(Date,    nullable=True)
    initial_balance      = Column(Numeric(12, 2), nullable=True)
    tracking_start_date  = Column(Date,    nullable=True)
    show_balance_gap     = Column(Boolean, nullable=False, default=False)
    balance_reminder_day = Column(Integer, nullable=True)
    # Snapshot of the app's own running balance at the moment the user last
    # entered bank_balance.  Used to project the bank balance forward without
    # requiring the user to re-enter it after every new transaction.
    # projected_bank = bank_balance + (current_closing - balance_anchor_app)
    balance_anchor_app   = Column(Numeric(12, 2), nullable=True)


class Alert(Base):
    """
    One row per alert event. Persists forever as the canonical record.
    read_at = NULL means unread.  fired_immediate prevents digest duplication.
    """
    __tablename__ = "alerts"
    id              = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id         = Column(UUID(as_uuid=True), nullable=False, index=True)
    type            = Column(String(50),  nullable=False)   # bill_due, large_transaction, …
    tier            = Column(Integer,     nullable=False)   # 1, 2, or 3
    title           = Column(String(255), nullable=False)
    body            = Column(Text,        nullable=False)
    severity        = Column(String(20),  nullable=False, default="info")  # info|warning|critical
    entity_type     = Column(String(50),  nullable=True)   # bill | debt | savings_goal | transaction
    entity_id       = Column(String(100), nullable=True)   # UUID of the linked entity
    source          = Column(String(50),  nullable=False, default="scheduler")
    created_at      = Column(DateTime,    nullable=False, default=datetime.utcnow)
    read_at         = Column(DateTime,    nullable=True)   # NULL = unread
    fired_immediate = Column(Boolean,     nullable=False, default=False)
    digest_date     = Column(Date,        nullable=True)   # date it was included in a digest


class AlertPreferences(Base):
    """
    Per-user notification channel settings, thresholds, and delivery options.
    One row per user; auto-created with defaults on first access.
    """
    __tablename__ = "alert_preferences"
    id                    = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id               = Column(UUID(as_uuid=True), nullable=False, unique=True, index=True)
    # ── Telegram ──────────────────────────────────────────────────────────────
    telegram_chat_id      = Column(String(100), nullable=True)
    telegram_enabled      = Column(Boolean, nullable=False, default=False)
    telegram_consented    = Column(Boolean, nullable=False, default=False)
    telegram_active_mode  = Column(Boolean, nullable=False, default=False)
    # ── PWA Push ──────────────────────────────────────────────────────────────
    pwa_push_enabled      = Column(Boolean, nullable=False, default=False)
    pwa_push_subscription = Column(JSONB,   nullable=True)
    # ── Digest ────────────────────────────────────────────────────────────────
    digest_enabled        = Column(Boolean, nullable=False, default=True)
    digest_time           = Column(Time,    nullable=False, default="09:00:00")
    # ── Tier 1 thresholds ─────────────────────────────────────────────────────
    immediate_enabled     = Column(Boolean,         nullable=False, default=True)
    bill_due_days         = Column(Integer,         nullable=False, default=3)
    large_tx_threshold    = Column(Numeric(12, 2),  nullable=True)   # NULL = disabled
    low_balance_floor     = Column(Numeric(12, 2),  nullable=True)   # NULL = disabled