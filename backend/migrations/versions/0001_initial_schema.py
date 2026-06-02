"""Initial schema — all tables

Revision ID: 0001
Revises:
Create Date: 2026-06-01 00:00:00.000000

"""
from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0001"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # ------------------------------------------------------------------
    # users
    # ------------------------------------------------------------------
    op.create_table(
        "users",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("email", sa.String(255), nullable=False, unique=True),
        sa.Column("password_hash", sa.String(255), nullable=False),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("currency", sa.String(3), server_default="EUR"),
        sa.Column("timezone", sa.String(64), server_default="Europe/Madrid"),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
    )

    # ------------------------------------------------------------------
    # bank_connections
    # ------------------------------------------------------------------
    op.create_table(
        "bank_connections",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("user_id", sa.String(36), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("provider", sa.String(32), server_default="nordigen"),
        sa.Column("requisition_id", sa.String(128)),
        sa.Column("institution_id", sa.String(128)),
        sa.Column("institution_name", sa.String(255)),
        sa.Column("status", sa.String(16), server_default="active"),
        sa.Column("token_expires_at", sa.DateTime(timezone=True)),
        sa.Column("last_sync_at", sa.DateTime(timezone=True)),
    )

    # ------------------------------------------------------------------
    # accounts
    # ------------------------------------------------------------------
    op.create_table(
        "accounts",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("user_id", sa.String(36), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("type", sa.String(16)),
        sa.Column("iban", sa.String(34)),
        sa.Column("country", sa.String(2)),
        sa.Column("balance", sa.Numeric(12, 2), server_default="0"),
        sa.Column("active", sa.Boolean(), server_default=sa.true()),
        sa.Column(
            "bank_connection_id",
            sa.String(36),
            sa.ForeignKey("bank_connections.id"),
        ),
    )

    # ------------------------------------------------------------------
    # Catalogues: tx_type, tx_class, tx_category
    # ------------------------------------------------------------------
    op.create_table(
        "tx_type",
        sa.Column("id", sa.String(3), primary_key=True),
        sa.Column("label", sa.String(64), nullable=False),
        sa.Column("description", sa.String(255)),
    )

    op.create_table(
        "tx_class",
        sa.Column("id", sa.String(3), primary_key=True),
        sa.Column("label", sa.String(64), nullable=False),
        sa.Column("description", sa.String(255)),
    )

    op.create_table(
        "tx_category",
        sa.Column("id", sa.String(10), primary_key=True),
        sa.Column("class_id", sa.String(3), sa.ForeignKey("tx_class.id"), nullable=False),
        sa.Column("label", sa.String(128), nullable=False),
        sa.Column("icon", sa.String(64)),
        sa.Column("color", sa.String(7)),
    )

    # ------------------------------------------------------------------
    # recurring_rules
    # ------------------------------------------------------------------
    op.create_table(
        "recurring_rules",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("user_id", sa.String(36), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("frequency", sa.String(16)),
        sa.Column("next_date", sa.Date(), nullable=False),
        sa.Column("end_date", sa.Date()),
        sa.Column("active", sa.Boolean(), server_default=sa.true()),
    )

    # ------------------------------------------------------------------
    # transactions
    # ------------------------------------------------------------------
    op.create_table(
        "transactions",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("user_id", sa.String(36), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("account_id", sa.String(36), sa.ForeignKey("accounts.id"), nullable=False),
        sa.Column("parent_id", sa.String(36), sa.ForeignKey("transactions.id")),
        sa.Column("type_id", sa.String(3), sa.ForeignKey("tx_type.id"), nullable=False),
        sa.Column("class_id", sa.String(3), sa.ForeignKey("tx_class.id"), nullable=False),
        sa.Column("category_id", sa.String(10), sa.ForeignKey("tx_category.id")),
        sa.Column("source", sa.String(32)),
        sa.Column("external_id", sa.String(255)),
        sa.Column("op_date", sa.Date(), nullable=False),
        sa.Column("amount", sa.Numeric(12, 2), nullable=False),
        sa.Column("split_amount", sa.Numeric(12, 2)),
        sa.Column("company", sa.String(255)),
        sa.Column("description", sa.Text()),
        sa.Column("comment", sa.String(512)),
        sa.Column("is_split", sa.Boolean(), server_default=sa.false()),
        sa.Column("is_recurring", sa.Boolean(), server_default=sa.false()),
        sa.Column("recurring_id", sa.String(36), sa.ForeignKey("recurring_rules.id")),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
    )
    op.create_index("ix_transactions_user_op_date", "transactions", ["user_id", "op_date"])
    op.create_index("ix_transactions_external_id", "transactions", ["external_id"])

    # ------------------------------------------------------------------
    # budgets
    # ------------------------------------------------------------------
    op.create_table(
        "budgets",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("user_id", sa.String(36), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("class_id", sa.String(3), sa.ForeignKey("tx_class.id"), nullable=False),
        sa.Column("category_id", sa.String(10), sa.ForeignKey("tx_category.id")),
        sa.Column("year", sa.Integer(), nullable=False),
        sa.Column("month", sa.Integer()),
        sa.Column("amount", sa.Numeric(12, 2), nullable=False),
        sa.Column("notes", sa.String(512)),
    )

    # ------------------------------------------------------------------
    # Investment: wallets, platforms, symbols
    # ------------------------------------------------------------------
    op.create_table(
        "wallets",
        sa.Column("id", sa.String(3), primary_key=True),
        sa.Column("user_id", sa.String(36), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("name", sa.String(128), nullable=False),
        sa.Column("description", sa.String(512)),
    )

    op.create_table(
        "platforms",
        sa.Column("id", sa.String(3), primary_key=True),
        sa.Column("name", sa.String(128), nullable=False),
    )

    op.create_table(
        "symbols",
        sa.Column("ticker", sa.String(15), primary_key=True),
        sa.Column("type", sa.String(3)),
        sa.Column("isin", sa.String(12)),
        sa.Column("description", sa.String(255), nullable=False),
        sa.Column("market", sa.String(64)),
        sa.Column("enabled", sa.Boolean(), server_default=sa.true()),
    )

    op.create_table(
        "wallet_transactions",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("user_id", sa.String(36), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("wallet_id", sa.String(3), sa.ForeignKey("wallets.id"), nullable=False),
        sa.Column("platform_id", sa.String(3), sa.ForeignKey("platforms.id"), nullable=False),
        sa.Column("ticker", sa.String(15), sa.ForeignKey("symbols.ticker"), nullable=False),
        sa.Column("op_date", sa.Date(), nullable=False),
        sa.Column("amount", sa.Numeric(12, 2), nullable=False),
        sa.Column("fee", sa.Numeric(10, 4), server_default="0"),
        sa.Column("shares", sa.Numeric(30, 10), nullable=False),
    )

    op.create_table(
        "market_prices",
        sa.Column("date", sa.Date(), primary_key=True),
        sa.Column("ticker", sa.String(15), sa.ForeignKey("symbols.ticker"), primary_key=True),
        sa.Column("open", sa.Numeric(30, 10)),
        sa.Column("high", sa.Numeric(30, 10)),
        sa.Column("low", sa.Numeric(30, 10)),
        sa.Column("close", sa.Numeric(30, 10)),
        sa.Column("volume", sa.BigInteger()),
    )

    # ------------------------------------------------------------------
    # Vehicles
    # ------------------------------------------------------------------
    op.create_table(
        "vehicles",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("user_id", sa.String(36), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("nickname", sa.String(128), nullable=False),
        sa.Column("make", sa.String(64)),
        sa.Column("model", sa.String(64)),
        sa.Column("year", sa.Integer()),
        sa.Column("plate", sa.String(16)),
        sa.Column("vin", sa.String(17)),
        sa.Column("fuel_type", sa.String(16)),
        sa.Column("current_km", sa.Integer()),
        sa.Column("status", sa.String(16), server_default="active"),
        sa.Column("notes", sa.Text()),
        sa.Column("photo_url", sa.String(512)),
    )

    op.create_table(
        "fuel_logs",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("vehicle_id", sa.String(36), sa.ForeignKey("vehicles.id"), nullable=False),
        sa.Column("log_date", sa.Date(), nullable=False),
        sa.Column("liters", sa.Numeric(8, 2)),
        sa.Column("price_per_liter", sa.Numeric(6, 4)),
        sa.Column("total_cost", sa.Numeric(8, 2)),
        sa.Column("odometer_km", sa.Integer()),
        sa.Column("consumption_l100", sa.Numeric(5, 2)),
        sa.Column("station", sa.String(255)),
        sa.Column("full_tank", sa.Boolean(), server_default=sa.true()),
    )

    op.create_table(
        "maintenance_types",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("name", sa.String(128), nullable=False),
        sa.Column("category", sa.String(32)),
        sa.Column("interval_km", sa.Integer()),
        sa.Column("interval_months", sa.Integer()),
        sa.Column("description", sa.Text()),
        sa.Column("prescriptive", sa.Boolean(), server_default=sa.true()),
    )

    op.create_table(
        "service_records",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("vehicle_id", sa.String(36), sa.ForeignKey("vehicles.id"), nullable=False),
        sa.Column(
            "maintenance_type_id",
            sa.String(36),
            sa.ForeignKey("maintenance_types.id"),
            nullable=False,
        ),
        sa.Column("transaction_id", sa.String(36), sa.ForeignKey("transactions.id")),
        sa.Column("service_date", sa.Date(), nullable=False),
        sa.Column("odometer_km", sa.Integer()),
        sa.Column("cost", sa.Numeric(10, 2)),
        sa.Column("workshop", sa.String(255)),
        sa.Column("notes", sa.Text()),
        sa.Column("next_due_date", sa.Date()),
        sa.Column("next_due_km", sa.Integer()),
    )

    op.create_table(
        "maintenance_alerts",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("vehicle_id", sa.String(36), sa.ForeignKey("vehicles.id"), nullable=False),
        sa.Column(
            "maintenance_type_id",
            sa.String(36),
            sa.ForeignKey("maintenance_types.id"),
            nullable=False,
        ),
        sa.Column("alert_type", sa.String(8)),
        sa.Column("due_date", sa.Date()),
        sa.Column("due_km", sa.Integer()),
        sa.Column("dismissed", sa.Boolean(), server_default=sa.false()),
        sa.Column("notified", sa.Boolean(), server_default=sa.false()),
    )

    op.create_table(
        "restoration_projects",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("vehicle_id", sa.String(36), sa.ForeignKey("vehicles.id"), nullable=False),
        sa.Column("title", sa.String(255), nullable=False),
        sa.Column("status", sa.String(16), server_default="planning"),
        sa.Column("budget_target", sa.Numeric(10, 2)),
        sa.Column("budget_spent", sa.Numeric(10, 2), server_default="0"),
        sa.Column("progress_pct", sa.Integer(), server_default="0"),
        sa.Column("start_date", sa.Date()),
        sa.Column("end_date", sa.Date()),
        sa.Column("notes", sa.Text()),
    )

    op.create_table(
        "restoration_tasks",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column(
            "project_id",
            sa.String(36),
            sa.ForeignKey("restoration_projects.id"),
            nullable=False,
        ),
        sa.Column("title", sa.String(255), nullable=False),
        sa.Column("description", sa.Text()),
        sa.Column("status", sa.String(16), server_default="todo"),
        sa.Column("priority", sa.String(8), server_default="medium"),
        sa.Column("sort_order", sa.Integer(), server_default="0"),
        sa.Column("due_date", sa.Date()),
        sa.Column("cost_estimate", sa.Numeric(10, 2)),
    )

    op.create_table(
        "parts",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column(
            "project_id",
            sa.String(36),
            sa.ForeignKey("restoration_projects.id"),
            nullable=False,
        ),
        sa.Column("task_id", sa.String(36), sa.ForeignKey("restoration_tasks.id")),
        sa.Column("transaction_id", sa.String(36), sa.ForeignKey("transactions.id")),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("part_number", sa.String(64)),
        sa.Column("supplier", sa.String(255)),
        sa.Column("price", sa.Numeric(10, 2)),
        sa.Column("quantity", sa.Integer(), server_default="1"),
        sa.Column("status", sa.String(16), server_default="needed"),
        sa.Column("notes", sa.Text()),
    )

    # ------------------------------------------------------------------
    # DIY projects
    # ------------------------------------------------------------------
    op.create_table(
        "diy_projects",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("user_id", sa.String(36), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("title", sa.String(255), nullable=False),
        sa.Column("category", sa.String(16)),
        sa.Column("status", sa.String(16), server_default="planning"),
        sa.Column("budget_target", sa.Numeric(10, 2)),
        sa.Column("budget_spent", sa.Numeric(10, 2), server_default="0"),
        sa.Column("progress_pct", sa.Integer(), server_default="0"),
        sa.Column("start_date", sa.Date()),
        sa.Column("notes", sa.Text()),
    )

    op.create_table(
        "diy_tasks",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column(
            "project_id", sa.String(36), sa.ForeignKey("diy_projects.id"), nullable=False
        ),
        sa.Column("title", sa.String(255), nullable=False),
        sa.Column("description", sa.Text()),
        sa.Column("status", sa.String(16), server_default="todo"),
        sa.Column("sort_order", sa.Integer(), server_default="0"),
        sa.Column("due_date", sa.Date()),
    )

    # ------------------------------------------------------------------
    # Polymorphic attachments
    # ------------------------------------------------------------------
    op.create_table(
        "attachments",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("entity_type", sa.String(32)),
        sa.Column("entity_id", sa.String(36), nullable=False),
        sa.Column("filename", sa.String(255), nullable=False),
        sa.Column("file_url", sa.String(512), nullable=False),
        sa.Column("mime_type", sa.String(128)),
        sa.Column(
            "uploaded_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
    )
    op.create_index("ix_attachments_entity", "attachments", ["entity_type", "entity_id"])


def downgrade() -> None:
    op.drop_table("attachments")
    op.drop_table("diy_tasks")
    op.drop_table("diy_projects")
    op.drop_table("parts")
    op.drop_table("restoration_tasks")
    op.drop_table("restoration_projects")
    op.drop_table("maintenance_alerts")
    op.drop_table("service_records")
    op.drop_table("maintenance_types")
    op.drop_table("fuel_logs")
    op.drop_table("vehicles")
    op.drop_table("market_prices")
    op.drop_table("wallet_transactions")
    op.drop_table("symbols")
    op.drop_table("platforms")
    op.drop_table("wallets")
    op.drop_table("budgets")
    op.drop_table("transactions")
    op.drop_table("recurring_rules")
    op.drop_table("tx_category")
    op.drop_table("tx_class")
    op.drop_table("tx_type")
    op.drop_table("accounts")
    op.drop_table("bank_connections")
    op.drop_table("users")
