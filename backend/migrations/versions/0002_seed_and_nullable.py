"""Seed catalogues + nullable type_id/class_id on transactions

Revision ID: 0002
Revises: 0001
Create Date: 2026-06-02 00:00:00
"""
from __future__ import annotations
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = "0002"
down_revision: Union[str, None] = "0001"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # ── 1. Make type_id and class_id nullable (pending categorization) ──
    op.alter_column("transactions", "type_id",
                    existing_type=sa.String(3), nullable=True)
    op.alter_column("transactions", "class_id",
                    existing_type=sa.String(3), nullable=True)

    # ── 2. Seed tx_type ──────────────────────────────────────────────────
    op.execute("""
        INSERT INTO tx_type (id, label, description) VALUES
        ('T01', 'Ingreso',       'Nómina, ventas y otros ingresos'),
        ('T02', 'Gasto',         'Gastos en general'),
        ('T03', 'Transferencia', 'Movimientos entre cuentas propias'),
        ('T04', 'Inversión',     'Aportaciones a inversiones'),
        ('T05', 'Deuda',         'Cuotas de préstamos e hipotecas')
        ON CONFLICT (id) DO NOTHING
    """)

    # ── 3. Seed tx_class ─────────────────────────────────────────────────
    op.execute("""
        INSERT INTO tx_class (id, label, description) VALUES
        ('C01', 'Fijo',     'Gastos/ingresos fijos mensuales o anuales'),
        ('C02', 'Variable', 'Gastos variables y opcionales'),
        ('C03', 'Especial', 'Gastos especiales o extraordinarios'),
        ('C04', 'Deuda',    'Cuotas de préstamos e hipotecas')
        ON CONFLICT (id) DO NOTHING
    """)

    # ── 4. Seed tx_category (35 categorías del legacy) ───────────────────
    op.execute("""
        INSERT INTO tx_category (id, class_id, label, icon, color) VALUES
        ('1',  'C01', 'Salary',        '💰', '#22c55e'),
        ('2',  'C02', 'Car',           '🚗', '#3b82f6'),
        ('3',  'C01', 'Home',          '🏠', '#8b5cf6'),
        ('4',  'C01', 'Subscriptions', '📱', '#f59e0b'),
        ('5',  'C02', 'Groceries',     '🛒', '#10b981'),
        ('6',  'C02', 'Penalty',       '⚠', '#ef4444'),
        ('7',  'C02', 'Restaurant',    '🍽', '#f97316'),
        ('8',  'C02', 'Electronics',   '💻', '#6366f1'),
        ('9',  'C02', 'Clothes',       '👕', '#ec4899'),
        ('10', 'C02', 'Learning',      '📚', '#0ea5e9'),
        ('11', 'C02', 'Apparel',       '👗', '#d946ef'),
        ('12', 'C01', 'Sport',         '🏃', '#14b8a6'),
        ('13', 'C02', 'Beauty',        '💄', '#f43f5e'),
        ('14', 'C02', 'Transport',     '🚌', '#78716c'),
        ('15', 'C01', 'Insurance',     '🛡', '#64748b'),
        ('16', 'C02', 'Health',        '🏥', '#06b6d4'),
        ('17', 'C02', 'Gift',          '🎁', '#a855f7'),
        ('18', 'C02', 'Leisure',       '🎮', '#fb923c'),
        ('19', 'C02', 'Bike',          '🚴', '#84cc16'),
        ('20', 'C01', 'Gewerbe',       '🏢', '#475569'),
        ('21', 'C02', 'Videogames',    '🎮', '#7c3aed'),
        ('22', 'C02', 'Flowers',       '🌸', '#f472b6'),
        ('23', 'C02', 'Vacations',     '✈', '#0284c7'),
        ('24', 'C02', 'Hotel',         '🏨', '#0369a1'),
        ('25', 'C01', 'Sells',         '💸', '#16a34a'),
        ('26', 'C01', 'Crowdlending',  '📊', '#b45309'),
        ('27', 'C01', 'Actions',       '📈', '#15803d'),
        ('28', 'C01', 'Funds',         '💼', '#1d4ed8'),
        ('29', 'C01', 'Yield',         '💹', '#065f46'),
        ('30', 'C01', 'Garage',        '🔧', '#92400e'),
        ('31', 'C01', 'Nave',          '🏭', '#374151'),
        ('32', 'C02', 'Personal',      '👤', '#6b7280'),
        ('33', 'C03', 'EcomBomb',      '💣', '#dc2626'),
        ('34', 'C03', 'Other',         '❓', '#9ca3af'),
        ('35', 'C02', 'Crypto',        '₿',  '#f59e0b')
        ON CONFLICT (id) DO NOTHING
    """)


def downgrade() -> None:
    op.execute("DELETE FROM tx_category")
    op.execute("DELETE FROM tx_class")
    op.execute("DELETE FROM tx_type")
    op.alter_column("transactions", "type_id",
                    existing_type=sa.String(3), nullable=False)
    op.alter_column("transactions", "class_id",
                    existing_type=sa.String(3), nullable=False)
