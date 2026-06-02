from __future__ import annotations

import uuid
from datetime import date as date_type
from decimal import Decimal

from sqlalchemy import (
    String, Boolean, Date, Numeric, Text, BigInteger, ForeignKey,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from ..extensions import db


class Wallet(db.Model):
    __tablename__ = "wallets"

    id: Mapped[str] = mapped_column(String(3), primary_key=True)
    user_id: Mapped[str] = mapped_column(String(36), ForeignKey("users.id"), nullable=False)
    name: Mapped[str] = mapped_column(String(128), nullable=False)
    description: Mapped[str | None] = mapped_column(String(512))

    transactions: Mapped[list["WalletTransaction"]] = relationship(
        "WalletTransaction", back_populates="wallet"
    )


class Platform(db.Model):
    __tablename__ = "platforms"

    id: Mapped[str] = mapped_column(String(3), primary_key=True)
    name: Mapped[str] = mapped_column(String(128), nullable=False)


class Symbol(db.Model):
    __tablename__ = "symbols"

    ticker: Mapped[str] = mapped_column(String(15), primary_key=True)
    type: Mapped[str] = mapped_column(String(3))  # STK/ETF/CRY/FND
    isin: Mapped[str | None] = mapped_column(String(12))
    description: Mapped[str] = mapped_column(String(255), nullable=False)
    market: Mapped[str | None] = mapped_column(String(64))
    enabled: Mapped[bool] = mapped_column(Boolean, default=True)

    prices: Mapped[list["MarketPrice"]] = relationship("MarketPrice", back_populates="symbol")


class WalletTransaction(db.Model):
    __tablename__ = "wallet_transactions"

    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=lambda: str(uuid.uuid4())
    )
    user_id: Mapped[str] = mapped_column(String(36), ForeignKey("users.id"), nullable=False)
    wallet_id: Mapped[str] = mapped_column(String(3), ForeignKey("wallets.id"), nullable=False)
    platform_id: Mapped[str] = mapped_column(
        String(3), ForeignKey("platforms.id"), nullable=False
    )
    ticker: Mapped[str] = mapped_column(String(15), ForeignKey("symbols.ticker"), nullable=False)
    op_date: Mapped[date_type] = mapped_column(Date, nullable=False)
    amount: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    fee: Mapped[Decimal] = mapped_column(Numeric(10, 4), default=Decimal("0"))
    shares: Mapped[Decimal] = mapped_column(Numeric(30, 10), nullable=False)

    wallet: Mapped["Wallet"] = relationship("Wallet", back_populates="transactions")
    symbol: Mapped["Symbol"] = relationship("Symbol")
    platform: Mapped["Platform"] = relationship("Platform")


class MarketPrice(db.Model):
    __tablename__ = "market_prices"

    date: Mapped[date_type] = mapped_column(Date, primary_key=True)
    ticker: Mapped[str] = mapped_column(
        String(15), ForeignKey("symbols.ticker"), primary_key=True
    )
    open: Mapped[Decimal | None] = mapped_column(Numeric(30, 10))
    high: Mapped[Decimal | None] = mapped_column(Numeric(30, 10))
    low: Mapped[Decimal | None] = mapped_column(Numeric(30, 10))
    close: Mapped[Decimal | None] = mapped_column(Numeric(30, 10))
    volume: Mapped[int | None] = mapped_column(BigInteger)

    symbol: Mapped["Symbol"] = relationship("Symbol", back_populates="prices")
