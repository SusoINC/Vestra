from __future__ import annotations

import uuid
from datetime import datetime, timezone, date as date_type
from decimal import Decimal

from sqlalchemy import (
    String, Boolean, DateTime, Date, Numeric, Text,
    ForeignKey, Integer, UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from ..extensions import db


class BankConnection(db.Model):
    __tablename__ = "bank_connections"

    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=lambda: str(uuid.uuid4())
    )
    user_id: Mapped[str] = mapped_column(String(36), ForeignKey("users.id"), nullable=False)
    provider: Mapped[str] = mapped_column(String(32), default="nordigen")
    requisition_id: Mapped[str | None] = mapped_column(String(128))
    institution_id: Mapped[str | None] = mapped_column(String(128))
    institution_name: Mapped[str | None] = mapped_column(String(255))
    status: Mapped[str] = mapped_column(String(16), default="active")  # active/expired/error
    token_expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    last_sync_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    accounts: Mapped[list["Account"]] = relationship("Account", back_populates="bank_connection")


class Account(db.Model):
    __tablename__ = "accounts"

    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=lambda: str(uuid.uuid4())
    )
    user_id: Mapped[str] = mapped_column(String(36), ForeignKey("users.id"), nullable=False)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    type: Mapped[str] = mapped_column(String(16))  # checking/savings/cash/card
    iban: Mapped[str | None] = mapped_column(String(34))
    country: Mapped[str | None] = mapped_column(String(2))
    balance: Mapped[Decimal] = mapped_column(Numeric(12, 2), default=Decimal("0"))
    active: Mapped[bool] = mapped_column(Boolean, default=True)
    bank_connection_id: Mapped[str | None] = mapped_column(
        String(36), ForeignKey("bank_connections.id")
    )

    bank_connection: Mapped["BankConnection | None"] = relationship(
        "BankConnection", back_populates="accounts"
    )
    transactions: Mapped[list["Transaction"]] = relationship(
        "Transaction", back_populates="account"
    )


class TxType(db.Model):
    __tablename__ = "tx_type"

    id: Mapped[str] = mapped_column(String(3), primary_key=True)
    label: Mapped[str] = mapped_column(String(64), nullable=False)
    description: Mapped[str | None] = mapped_column(String(255))


class TxClass(db.Model):
    __tablename__ = "tx_class"

    id: Mapped[str] = mapped_column(String(3), primary_key=True)
    label: Mapped[str] = mapped_column(String(64), nullable=False)
    description: Mapped[str | None] = mapped_column(String(255))

    categories: Mapped[list["TxCategory"]] = relationship(
        "TxCategory", back_populates="tx_class"
    )


class TxCategory(db.Model):
    __tablename__ = "tx_category"

    id: Mapped[str] = mapped_column(String(10), primary_key=True)
    class_id: Mapped[str] = mapped_column(String(3), ForeignKey("tx_class.id"), nullable=False)
    label: Mapped[str] = mapped_column(String(128), nullable=False)
    icon: Mapped[str | None] = mapped_column(String(64))
    color: Mapped[str | None] = mapped_column(String(7))

    tx_class: Mapped["TxClass"] = relationship("TxClass", back_populates="categories")


class RecurringRule(db.Model):
    __tablename__ = "recurring_rules"

    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=lambda: str(uuid.uuid4())
    )
    user_id: Mapped[str] = mapped_column(String(36), ForeignKey("users.id"), nullable=False)
    frequency: Mapped[str] = mapped_column(String(16))  # monthly/weekly/yearly
    next_date: Mapped[date_type] = mapped_column(Date, nullable=False)
    end_date: Mapped[date_type | None] = mapped_column(Date)
    active: Mapped[bool] = mapped_column(Boolean, default=True)


class Transaction(db.Model):
    __tablename__ = "transactions"

    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=lambda: str(uuid.uuid4())
    )
    user_id: Mapped[str] = mapped_column(String(36), ForeignKey("users.id"), nullable=False)
    account_id: Mapped[str] = mapped_column(String(36), ForeignKey("accounts.id"), nullable=False)
    parent_id: Mapped[str | None] = mapped_column(String(36), ForeignKey("transactions.id"))
    type_id: Mapped[str | None] = mapped_column(String(3), ForeignKey("tx_type.id"), nullable=True)
    class_id: Mapped[str | None] = mapped_column(String(3), ForeignKey("tx_class.id"), nullable=True)
    category_id: Mapped[str | None] = mapped_column(String(10), ForeignKey("tx_category.id"))
    source: Mapped[str] = mapped_column(String(32))  # manual/import_excel/nordigen
    external_id: Mapped[str | None] = mapped_column(String(255))
    op_date: Mapped[date_type] = mapped_column(Date, nullable=False)
    amount: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    split_amount: Mapped[Decimal | None] = mapped_column(Numeric(12, 2))
    company: Mapped[str | None] = mapped_column(String(255))
    description: Mapped[str | None] = mapped_column(Text)
    comment: Mapped[str | None] = mapped_column(String(512))
    # Suggestion from ING/Nordigen — never auto-applied, shown as hint in UI
    suggested_type_id: Mapped[str | None] = mapped_column(String(3))
    suggested_class_id: Mapped[str | None] = mapped_column(String(3))
    suggested_category_id: Mapped[str | None] = mapped_column(String(10))
    is_split: Mapped[bool] = mapped_column(Boolean, default=False)
    is_recurring: Mapped[bool] = mapped_column(Boolean, default=False)
    recurring_id: Mapped[str | None] = mapped_column(
        String(36), ForeignKey("recurring_rules.id")
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )

    account: Mapped["Account"] = relationship("Account", back_populates="transactions")
    splits: Mapped[list["Transaction"]] = relationship(
        "Transaction", foreign_keys=[parent_id], back_populates="parent"
    )
    parent: Mapped["Transaction | None"] = relationship(
        "Transaction", foreign_keys=[parent_id], back_populates="splits", remote_side=[id]
    )


class Budget(db.Model):
    __tablename__ = "budgets"

    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=lambda: str(uuid.uuid4())
    )
    user_id: Mapped[str] = mapped_column(String(36), ForeignKey("users.id"), nullable=False)
    class_id: Mapped[str] = mapped_column(String(3), ForeignKey("tx_class.id"), nullable=False)
    category_id: Mapped[str | None] = mapped_column(String(10), ForeignKey("tx_category.id"))
    year: Mapped[int] = mapped_column(Integer, nullable=False)
    month: Mapped[int | None] = mapped_column(Integer)
    amount: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    notes: Mapped[str | None] = mapped_column(String(512))
