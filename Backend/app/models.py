from sqlalchemy import (
    Column, String, Numeric, Date, DateTime, Boolean, Integer, Enum, ForeignKey, Text, Time,
    CheckConstraint, Index, text,
)
from sqlalchemy.dialects.postgresql import UUID, JSONB
import uuid
from datetime import datetime
from .database import Base


class Transaction(Base):
    __tablename__ = "transactions"
    id                 = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id            = Column(UUID(as_uuid=True), nullable=False, index=True)
    date               = Column(Date, nullable=False)
    description        = Column(String(255))
    category           = Column(String(100))
    type               = Column(Enum("income", "expense", "savings", "debt_payment", "transfer",
                                     name="transaction_type"))
    amount             = Column(Numeric(10, 2))
    payment_method     = Column(String(50))
    source             = Column(Enum(
                             "manual", "import", "api_sync",
                             "bill_payment", "savings_contribution", "csv_import",
                             "cc_charge",      # expense paid via CC (no cash debit, CC balance rises)
                             "debt_payment",   # paying off a debt balance
                             "email_import",   # item #6 — created by the Gmail ingestion poller
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
        index=True,
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
    user_id                    = Column(UUID(as_uuid=True), nullable=False, index=True)
    transaction_id             = Column(UUID(as_uuid=True),
                                        ForeignKey("transactions.id", ondelete="SET NULL"),
                                        nullable=True, index=True)
    # ── Entity back-references (item #5, 2026-08-02) ────────────────────────
    # Bills are 1 hub row per bill (reused across payment cycles), so Bill
    # already carries its own budget_category_id pointing here -- no column
    # needed on this side for bills.
    # Debts and savings goals create a NEW hub row per payment/contribution
    # event (many hub rows -> one debt/goal), so the FK has to live here
    # instead. Replaces the old approach of parsing `type` (e.g. "Debt: Car
    # Loan") and looking the entity up by name, which silently breaks on
    # rename and picks arbitrarily if two entities share a name.
    debt_id                    = Column(UUID(as_uuid=True),
                                        ForeignKey("debts.id", ondelete="SET NULL"),
                                        nullable=True, index=True)
    savings_goal_id            = Column(UUID(as_uuid=True),
                                        ForeignKey("savings_goals.id", ondelete="SET NULL"),
                                        nullable=True, index=True)
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
    user_id            = Column(UUID(as_uuid=True), nullable=False, index=True)
    name               = Column(String(100))
    amount             = Column(Numeric(10, 2))
    due_date           = Column(Date)
    frequency          = Column(String(50))
    category           = Column(String(100))
    status             = Column(Enum("paid", "unpaid", name="bill_status"))
    transaction_id     = Column(UUID(as_uuid=True),
                                ForeignKey("transactions.id", ondelete="SET NULL"),
                                nullable=True, index=True)
    budget_category_id = Column(UUID(as_uuid=True),
                                ForeignKey("budget_categories.id", ondelete="SET NULL"),
                                nullable=True, index=True)


class Debt(Base):
    __tablename__ = "debts"
    id               = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    # ── AUTH ──────────────────────────────────────────────────────────────────
    user_id          = Column(UUID(as_uuid=True), nullable=False, index=True)
    name             = Column(String(100))
    balance          = Column(Numeric(10, 2))
    original_balance = Column(Numeric(10, 2), nullable=True)  # tracks starting balance
    interest_rate    = Column(Numeric(5, 2))
    min_payment      = Column(Numeric(10, 2))
    # How often min_payment is actually billed by the lender -- entered as-is
    # off the real statement (e.g. a biweekly loan payment stays biweekly
    # here), never pre-converted by the user. Everywhere min_payment needs to
    # be compared against or summed as a MONTHLY figure (budget sync, payoff
    # simulator, negative-amortization check), it must go through
    # payment_utils.monthly_equivalent(min_payment, min_payment_frequency)
    # first -- never read min_payment directly assuming it's already monthly.
    # 'weekly' | 'biweekly' | 'monthly' | 'quarterly'. Defaults 'monthly' so
    # every pre-existing debt (entered before this field existed, always as a
    # true monthly figure) keeps behaving exactly as before.
    min_payment_frequency = Column(String(20), nullable=False, default="monthly")
    priority_rank    = Column(Integer)
    due_day          = Column(Integer, nullable=True)  # day of month payment is due (1–31)

    # ── Debt type (m2 migration) ───────────────────────────────────────────────
    # 'credit_card' | 'loan' | 'bnpl'  — existing rows default to 'loan'
    type                    = Column(String(20), nullable=True, default="loan")

    # ── Shared new fields ────────────────────────────────────────────────────
    bank_name               = Column(String(100), nullable=True)
    is_paid_off             = Column(Boolean, nullable=False, default=False)
    payment_type            = Column(String(20), nullable=True)
    # 'manual' | 'auto_bank_debit' | 'payroll_deduction'
    payment_frequency       = Column(String(20), nullable=True)
    # 'weekly' | 'biweekly' | 'monthly' | 'quarterly'
    payment_amount          = Column(Numeric(10, 2), nullable=True)
    start_date              = Column(Date, nullable=True)
    end_date                = Column(Date, nullable=True)

    # ── Loan amortization ────────────────────────────────────────────────────
    show_amortization       = Column(Boolean, nullable=False, default=False)
    term_months             = Column(Integer, nullable=True)

    # ── Credit card ──────────────────────────────────────────────────────────
    credit_limit            = Column(Numeric(10, 2), nullable=True)
    billing_cycle_end_day   = Column(Integer, nullable=True)
    card_network            = Column(String(50), nullable=True)

    # ── BNPL ─────────────────────────────────────────────────────────────────
    linked_transaction_id   = Column(
        UUID(as_uuid=True),
        ForeignKey("transactions.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    total_installments      = Column(Integer, nullable=True)
    installments_paid       = Column(Integer, nullable=False, default=0)
    installment_amount      = Column(Numeric(10, 2), nullable=True)

    # ── Auto bank debit ───────────────────────────────────────────────────────
    recurring_transaction_id = Column(
        UUID(as_uuid=True),
        ForeignKey("recurring_transactions.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )


class SavingsGoal(Base):
    __tablename__ = "savings_goals"
    id             = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    # ── AUTH ──────────────────────────────────────────────────────────────────
    user_id        = Column(UUID(as_uuid=True), nullable=False, index=True)
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
        Enum("expense", "income", "savings", "debt_payment", name="category_kind"),
        nullable=False
    )
    system         = Column(Boolean, default=False)
    sort_order     = Column(Integer, default=0)
    planned_amount = Column(Numeric(10, 2), nullable=False, default=0)
    # #3 — active/inactive toggle per category
    is_active      = Column(Boolean, nullable=False, default=True)
    # #16 — variable income flag (income kind only)
    is_variable    = Column(Boolean, nullable=False, default=False)

    # These 2 only ever existed as raw SQL in the old (now-archived) migration
    # chain -- never declared here, so the 2026-08-02 baseline squash missed
    # them entirely. They're what actually enforces the "one name per system
    # category, one name per user" rule described in the docstring above --
    # without them nothing stops a duplicate category name from being
    # inserted, which is the exact same class of bug this whole item #5
    # session has been fixing for debts/savings goals/bills.
    __table_args__ = (
        Index(
            "uq_categories_name_system", "name",
            unique=True, postgresql_where=text("user_id IS NULL"),
        ),
        Index(
            "uq_categories_name_user", "name", "user_id",
            unique=True, postgresql_where=text("user_id IS NOT NULL"),
        ),
    )


class Preferences(Base):
    """
    One row per user (keyed by user_id).
    GET /preferences auto-creates the default row on first call.
    """
    __tablename__ = "preferences"
    id           = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    # ── AUTH ──────────────────────────────────────────────────────────────────
    user_id      = Column(UUID(as_uuid=True), nullable=False, unique=True, index=True)
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

    # ── Email ingestion (item #6) ──────────────────────────────────────────────
    # Random per-user token, NOT the raw user_id — deliberately non-guessable so
    # knowing it doesn't let someone email fake transactions into this account.
    # Forwarding address the user sets up at their bank:
    #     financeos.ingest+<ingest_token>@gmail.com
    # Generated lazily on first GET /preferences/ingest-email call, not at row
    # creation, since most users will never touch this feature.
    ingest_token         = Column(String(24), nullable=True, unique=True, index=True)


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

    # These 3 only ever existed as raw SQL in the old (now-archived) migration
    # chain -- never declared here, so the 2026-08-02 baseline squash missed
    # them entirely. Declared now so (a) they're actually documented as part
    # of the schema instead of tribal knowledge in a migration file, and (b)
    # future `alembic revision --autogenerate` runs see them as intentional
    # instead of drift to be dropped.
    __table_args__ = (
        CheckConstraint("tier IN (1, 2, 3)", name="alerts_tier_check"),
        CheckConstraint(
            "severity IN ('info', 'warning', 'critical')",
            name="alerts_severity_check",
        ),
        Index(
            "ix_alerts_user_unread", "user_id", "read_at",
            postgresql_where=text("read_at IS NULL"),
        ),
    )


class EarmarkedFund(Base):
    """
    #4 — Money reserved for a known future expense (envelope concept).
    Does not count as income or expense — just reduces "Free to Spend".
    """
    __tablename__ = "earmarked_funds"
    id         = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id    = Column(UUID(as_uuid=True), nullable=False, index=True)
    name       = Column(String(100), nullable=False)
    amount     = Column(Numeric(10, 2), nullable=False)
    due_date   = Column(Date, nullable=True)
    note       = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)


class RecurringTransaction(Base):
    """
    #22 — Template for transactions that repeat on a schedule.
    The app creates a reminder (or auto-entry) on next_due each cycle.
    """
    __tablename__ = "recurring_transactions"
    id          = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id     = Column(UUID(as_uuid=True), nullable=False, index=True)
    description = Column(String(255), nullable=False)
    amount      = Column(Numeric(10, 2), nullable=False)
    category    = Column(String(100), nullable=True)
    type        = Column(String(20), nullable=False)   # income | expense | savings | transfer
    frequency   = Column(String(50), nullable=False)   # weekly | monthly | yearly
    next_due    = Column(Date, nullable=False)
    is_active   = Column(Boolean, nullable=False, default=True)
    created_at  = Column(DateTime, default=datetime.utcnow)


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
    # ── Alert mode ────────────────────────────────────────────────────────────
    # informative  → alerts show what happened, user acts independently
    # interactive  → alerts include a navigation link to the relevant screen
    alert_mode            = Column(String(20),        nullable=False, default="informative")
    # ── Periodic review ───────────────────────────────────────────────────────
    # monthly | quarterly | semester | NULL (disabled)
    periodic_review_freq  = Column(String(20),        nullable=True)
