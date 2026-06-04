"""Subcategories (tx_subcategory) + transactions.subcategory_id

Revision ID: 0005
Revises: 0004
Create Date: 2026-06-04 00:00:00

Subcategorías por categoría (editables por el usuario). Ej: Car → Gasoil,
Maintenance, Parking. El usuario las elige de un combobox filtrado por la
categoría seleccionada, o crea una nueva al vuelo.
"""
from __future__ import annotations
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = "0005"
down_revision: Union[str, None] = "0004"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "tx_subcategory",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("user_id", sa.String(36), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("category_id", sa.String(10), sa.ForeignKey("tx_category.id"), nullable=False),
        sa.Column("label", sa.String(64), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True),
                  server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_tx_subcategory_user_cat", "tx_subcategory",
                    ["user_id", "category_id"])
    op.create_unique_constraint("uq_tx_subcategory_user_cat_label", "tx_subcategory",
                                ["user_id", "category_id", "label"])

    op.add_column("transactions",
        sa.Column("subcategory_id", sa.String(36),
                  sa.ForeignKey("tx_subcategory.id"), nullable=True))
    op.create_index("ix_transactions_subcategory", "transactions", ["subcategory_id"])


def downgrade() -> None:
    op.drop_index("ix_transactions_subcategory", "transactions")
    op.drop_column("transactions", "subcategory_id")
    op.drop_constraint("uq_tx_subcategory_user_cat_label", "tx_subcategory", type_="unique")
    op.drop_index("ix_tx_subcategory_user_cat", "tx_subcategory")
    op.drop_table("tx_subcategory")
