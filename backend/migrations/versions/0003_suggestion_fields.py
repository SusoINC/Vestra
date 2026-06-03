"""Add suggestion fields to transactions

Revision ID: 0003
Revises: 0002
Create Date: 2026-06-02 00:00:00
"""
from __future__ import annotations
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = "0003"
down_revision: Union[str, None] = "0002"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("transactions",
        sa.Column("suggested_type_id", sa.String(3), nullable=True))
    op.add_column("transactions",
        sa.Column("suggested_class_id", sa.String(3), nullable=True))
    op.add_column("transactions",
        sa.Column("suggested_category_id", sa.String(10), nullable=True))


def downgrade() -> None:
    op.drop_column("transactions", "suggested_category_id")
    op.drop_column("transactions", "suggested_class_id")
    op.drop_column("transactions", "suggested_type_id")
