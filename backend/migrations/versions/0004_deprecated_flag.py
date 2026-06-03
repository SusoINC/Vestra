"""Add deprecated flag to transactions

Revision ID: 0004
Revises: 0003
Create Date: 2026-06-03 00:00:00

Permite marcar movimientos históricos (viejos sin categorizar) para
excluirlos de la cola de categorización sin borrarlos de la base de datos.
"""
from __future__ import annotations
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = "0004"
down_revision: Union[str, None] = "0003"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("transactions",
        sa.Column("deprecated", sa.Boolean(), server_default=sa.false(), nullable=False))
    op.create_index("ix_transactions_deprecated", "transactions", ["deprecated"])


def downgrade() -> None:
    op.drop_index("ix_transactions_deprecated", "transactions")
    op.drop_column("transactions", "deprecated")
