"""Préstamos/hipotecas y tabla de Euríbor

Revision ID: 0009
Revises: 0008
"""
from __future__ import annotations

from typing import Union

import sqlalchemy as sa
from alembic import op

revision: str = "0009"
down_revision: Union[str, None] = "0008"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "loans",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("user_id", sa.String(36), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("name", sa.String(128), nullable=False),
        sa.Column("kind", sa.String(16), server_default="loan"),
        sa.Column("lender", sa.String(128)),
        sa.Column("principal", sa.Numeric(12, 2), nullable=False),
        sa.Column("start_date", sa.Date, nullable=False),
        sa.Column("term_months", sa.Integer, nullable=False),
        sa.Column("payment_day", sa.Integer, server_default="1"),
        sa.Column("rate_kind", sa.String(16), server_default="fixed"),
        sa.Column("tin_fixed", sa.Numeric(6, 4)),
        sa.Column("mixed_fixed_months", sa.Integer),
        sa.Column("spread", sa.Numeric(6, 4)),
        sa.Column("revision_months", sa.Integer, server_default="12"),
        sa.Column("opening_fee", sa.Numeric(10, 2), server_default="0"),
        sa.Column("early_fee_pct", sa.Numeric(5, 4), server_default="0"),
        sa.Column("status", sa.String(16), server_default="active"),
        sa.Column("category_id", sa.String(8), sa.ForeignKey("tx_category.id")),
        sa.Column("account_id", sa.String(36), sa.ForeignKey("accounts.id")),
        sa.Column("notes", sa.Text),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_index("ix_loans_user", "loans", ["user_id"])

    op.create_table(
        "euribor_rates",
        sa.Column("month", sa.Date, primary_key=True),
        sa.Column("rate", sa.Numeric(6, 4), nullable=False),
    )


def downgrade() -> None:
    op.drop_table("euribor_rates")
    op.drop_index("ix_loans_user", table_name="loans")
    op.drop_table("loans")
