"""add alerts schema step 2 — alerts and alert_preferences tables

Revision ID: b2c3d4e5f6a7
Revises: a1b2c3d4e5f6
Create Date: 2026-04-14

Creates two new tables:
  alerts             — persistent record of every alert event
  alert_preferences  — per-user channel config, thresholds, and delivery settings
"""
from typing import Sequence, Union
from alembic import op


revision: str = 'b2c3d4e5f6a7'
down_revision: Union[str, Sequence[str], None] = 'a1b2c3d4e5f6'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # ── alerts ────────────────────────────────────────────────────────────────
    op.execute("""
        CREATE TABLE IF NOT EXISTS alerts (
            id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            user_id          UUID NOT NULL,
            type             VARCHAR(50)  NOT NULL,
            tier             INTEGER      NOT NULL CHECK (tier IN (1, 2, 3)),
            title            VARCHAR(255) NOT NULL,
            body             TEXT         NOT NULL,
            severity         VARCHAR(20)  NOT NULL DEFAULT 'info'
                                 CHECK (severity IN ('info', 'warning', 'critical')),
            entity_type      VARCHAR(50),
            entity_id        VARCHAR(100),
            source           VARCHAR(50)  NOT NULL DEFAULT 'scheduler',
            created_at       TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT now(),
            read_at          TIMESTAMP WITHOUT TIME ZONE,
            fired_immediate  BOOLEAN NOT NULL DEFAULT FALSE,
            digest_date      DATE
        );
    """)
    op.execute("""
        CREATE INDEX IF NOT EXISTS ix_alerts_user_id
            ON alerts (user_id);
    """)
    op.execute("""
        CREATE INDEX IF NOT EXISTS ix_alerts_user_unread
            ON alerts (user_id, read_at)
            WHERE read_at IS NULL;
    """)

    # ── alert_preferences ─────────────────────────────────────────────────────
    op.execute("""
        CREATE TABLE IF NOT EXISTS alert_preferences (
            id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            user_id                 UUID NOT NULL UNIQUE,
            telegram_chat_id        VARCHAR(100),
            telegram_enabled        BOOLEAN NOT NULL DEFAULT FALSE,
            telegram_consented      BOOLEAN NOT NULL DEFAULT FALSE,
            telegram_active_mode    BOOLEAN NOT NULL DEFAULT FALSE,
            pwa_push_enabled        BOOLEAN NOT NULL DEFAULT FALSE,
            pwa_push_subscription   JSONB,
            digest_enabled          BOOLEAN NOT NULL DEFAULT TRUE,
            digest_time             TIME WITHOUT TIME ZONE NOT NULL DEFAULT '09:00:00',
            immediate_enabled       BOOLEAN NOT NULL DEFAULT TRUE,
            bill_due_days           INTEGER NOT NULL DEFAULT 3,
            large_tx_threshold      NUMERIC(12, 2),
            low_balance_floor       NUMERIC(12, 2)
        );
    """)
    op.execute("""
        CREATE INDEX IF NOT EXISTS ix_alert_preferences_user_id
            ON alert_preferences (user_id);
    """)


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS alert_preferences;")
    op.execute("DROP TABLE IF EXISTS alerts;")
