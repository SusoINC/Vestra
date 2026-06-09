"""Add day to budgets (granularidad de día)

Revision ID: 0007
Revises: 0006
Create Date: 2026-06-05 00:00:00

Los presupuestos pasan a guardar el día (year + month + day) para poder
listar en el futuro los gastos previstos de los próximos días.
La comparativa sigue agrupando por mes; el día es info adicional.
"""
from __future__ import annotations
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = "0007"
down_revision: Union[str, None] = "0006"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("budgets", sa.Column("day", sa.Integer(), nullable=True))
    # Los migrados del legacy eran día 1 de cada mes
    op.execute("UPDATE budgets SET day = 1 WHERE day IS NULL AND month IS NOT NULL")


def downgrade() -> None:
    op.drop_column("budgets", "day")
