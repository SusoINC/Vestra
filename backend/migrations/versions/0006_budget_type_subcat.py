"""Add type_id and subcategory_id to budgets

Revision ID: 0006
Revises: 0005
Create Date: 2026-06-05 00:00:00

Los presupuestos pasan a incluir tipo (Ingreso/Gasto/…) y subcategoría opcional,
para poder comparar el gasto previsto vs real a nivel categoría y subcategoría.
"""
from __future__ import annotations
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = "0006"
down_revision: Union[str, None] = "0005"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("budgets",
        sa.Column("type_id", sa.String(3), sa.ForeignKey("tx_type.id"), nullable=True))
    op.add_column("budgets",
        sa.Column("subcategory_id", sa.String(36),
                  sa.ForeignKey("tx_subcategory.id"), nullable=True))

    # Backfill type_id: las categorías de ingreso → T01, resto → T02
    # (Salary=1, Sells=25, Crowdlending=26, Actions=27, Funds=28, Yield=29)
    op.execute("""
        UPDATE budgets SET type_id = CASE
            WHEN category_id IN ('1','25','26','27','28','29') THEN 'T01'
            ELSE 'T02'
        END
        WHERE type_id IS NULL
    """)


def downgrade() -> None:
    op.drop_column("budgets", "subcategory_id")
    op.drop_column("budgets", "type_id")
