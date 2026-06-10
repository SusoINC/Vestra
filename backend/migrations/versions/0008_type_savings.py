"""Add tx_type T06 = Ahorro (savings)

Revision ID: 0008
Revises: 0007
Create Date: 2026-06-06 00:00:00
"""
from __future__ import annotations
from typing import Sequence, Union
from alembic import op

revision: str = "0008"
down_revision: Union[str, None] = "0007"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("""
        INSERT INTO tx_type (id, label, description)
        VALUES ('T06', 'Ahorro', 'Dinero apartado a ahorro / colchón')
        ON CONFLICT (id) DO NOTHING
    """)


def downgrade() -> None:
    op.execute("DELETE FROM tx_type WHERE id='T06'")
