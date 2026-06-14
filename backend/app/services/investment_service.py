from __future__ import annotations

import uuid
from datetime import date as date_type, timedelta
from decimal import Decimal

from sqlalchemy import select, func

from ..extensions import db
from ..models.investment import (
    Wallet, Platform, Symbol, WalletTransaction, MarketPrice,
)


# ── Precios ─────────────────────────────────────────────────────────────────

def _latest_prices() -> dict:
    """Último precio de cierre conocido por ticker → {ticker: (close, date)}."""
    # DISTINCT ON (ticker) ordenado por fecha desc
    sub = (
        select(
            MarketPrice.ticker,
            MarketPrice.close,
            MarketPrice.date,
            func.row_number().over(
                partition_by=MarketPrice.ticker,
                order_by=MarketPrice.date.desc(),
            ).label("rn"),
        ).subquery()
    )
    rows = db.session.execute(
        select(sub.c.ticker, sub.c.close, sub.c.date).where(sub.c.rn == 1)
    ).all()
    return {r.ticker: (float(r.close or 0), r.date) for r in rows}


# ── Catálogos ───────────────────────────────────────────────────────────────

def get_catalogues(user_id: str) -> dict:
    wallets = db.session.execute(
        select(Wallet).where(Wallet.user_id == user_id).order_by(Wallet.name)
    ).scalars().all()
    platforms = db.session.execute(select(Platform).order_by(Platform.name)).scalars().all()
    symbols = db.session.execute(
        select(Symbol).where(Symbol.enabled == True).order_by(Symbol.description)
    ).scalars().all()
    return {
        "wallets": [{"id": w.id, "name": w.name, "description": w.description} for w in wallets],
        "platforms": [{"id": p.id, "name": p.name} for p in platforms],
        "symbols": [{"ticker": s.ticker, "type": s.type, "isin": s.isin,
                     "description": s.description, "market": s.market} for s in symbols],
    }


# ── Cartera / posiciones ────────────────────────────────────────────────────

TYPE_LABELS = {"CRY": "Cripto", "ETF": "ETF", "FND": "Fondo", "STK": "Acción"}
TYPE_COLORS = {"CRY": "#f59e0b", "ETF": "#3b82f6", "FND": "#8b5cf6", "STK": "#22c55e"}


def portfolio(user_id: str, wallet_id: str | None = None) -> dict:
    """
    Posiciones actuales (agregadas por símbolo, opcionalmente filtradas por cartera).
    valor = shares × último precio · coste = invertido + comisiones · P&L = valor − coste.
    """
    q = select(
        WalletTransaction.ticker,
        func.sum(WalletTransaction.shares).label("shares"),
        func.sum(WalletTransaction.amount).label("invested"),
        func.sum(WalletTransaction.fee).label("fees"),
    ).where(WalletTransaction.user_id == user_id)
    if wallet_id:
        q = q.where(WalletTransaction.wallet_id == wallet_id)
    q = q.group_by(WalletTransaction.ticker)

    prices = _latest_prices()
    symbols = {s.ticker: s for s in db.session.execute(select(Symbol)).scalars().all()}

    positions = []
    total_value = total_cost = 0.0
    by_type = {}
    for row in db.session.execute(q):
        shares = float(row.shares or 0)
        if abs(shares) < 1e-9:
            continue
        invested = float(row.invested or 0)
        fees = float(row.fees or 0)
        cost = invested + fees
        price, price_date = prices.get(row.ticker, (0.0, None))
        value = shares * price
        pnl = value - cost
        sym = symbols.get(row.ticker)
        stype = sym.type if sym else "STK"

        positions.append({
            "ticker": row.ticker,
            "description": sym.description if sym else row.ticker,
            "type": stype,
            "type_label": TYPE_LABELS.get(stype, stype),
            "shares": round(shares, 8),
            "invested": round(invested, 2),
            "fees": round(fees, 2),
            "cost": round(cost, 2),
            "avg_cost": round(cost / shares, 6) if shares else 0,
            "price": round(price, 6),
            "price_date": price_date.isoformat() if price_date else None,
            "value": round(value, 2),
            "pnl": round(pnl, 2),
            "pnl_pct": round(pnl / cost * 100, 2) if cost else None,
        })
        total_value += value
        total_cost += cost
        t = by_type.setdefault(stype, {"type": stype, "label": TYPE_LABELS.get(stype, stype),
                                       "color": TYPE_COLORS.get(stype, "#888"), "value": 0.0})
        t["value"] += value

    positions.sort(key=lambda p: -p["value"])
    total_pnl = total_value - total_cost
    allocation = sorted(by_type.values(), key=lambda x: -x["value"])
    for a in allocation:
        a["value"] = round(a["value"], 2)

    return {
        "positions": positions,
        "allocation": allocation,
        "totals": {
            "value": round(total_value, 2),
            "cost": round(total_cost, 2),
            "pnl": round(total_pnl, 2),
            "pnl_pct": round(total_pnl / total_cost * 100, 2) if total_cost else None,
        },
    }


def wallets_summary(user_id: str) -> list[dict]:
    """Valor y P&L por cartera."""
    wallets = db.session.execute(
        select(Wallet).where(Wallet.user_id == user_id).order_by(Wallet.name)
    ).scalars().all()
    out = []
    for w in wallets:
        p = portfolio(user_id, w.id)
        out.append({
            "id": w.id, "name": w.name,
            "value": p["totals"]["value"],
            "cost": p["totals"]["cost"],
            "pnl": p["totals"]["pnl"],
            "pnl_pct": p["totals"]["pnl_pct"],
        })
    return out


# ── Operaciones ─────────────────────────────────────────────────────────────

def list_operations(user_id: str, filters: dict) -> dict:
    q = select(WalletTransaction).where(WalletTransaction.user_id == user_id)
    if filters.get("wallet_id"):
        q = q.where(WalletTransaction.wallet_id == filters["wallet_id"])
    if filters.get("ticker"):
        q = q.where(WalletTransaction.ticker == filters["ticker"])

    total = db.session.execute(select(func.count()).select_from(q.subquery())).scalar()
    page = int(filters.get("page", 1))
    per_page = int(filters.get("per_page", 50))
    items = db.session.execute(
        q.order_by(WalletTransaction.op_date.desc(), WalletTransaction.id)
        .offset((page - 1) * per_page).limit(per_page)
    ).scalars().all()

    return {
        "items": [op_to_dict(o) for o in items],
        "total": total, "page": page, "per_page": per_page,
        "pages": (total + per_page - 1) // per_page,
    }


def op_to_dict(o: WalletTransaction) -> dict:
    return {
        "id": o.id, "wallet_id": o.wallet_id, "platform_id": o.platform_id,
        "ticker": o.ticker, "op_date": o.op_date.isoformat() if o.op_date else None,
        "amount": float(o.amount), "fee": float(o.fee), "shares": float(o.shares),
    }


def create_operation(user_id: str, data: dict) -> WalletTransaction:
    op = WalletTransaction(
        id=str(uuid.uuid4()), user_id=user_id,
        wallet_id=data["wallet_id"], platform_id=data["platform_id"],
        ticker=data["ticker"], op_date=data["op_date"],
        amount=Decimal(str(data.get("amount", 0))),
        fee=Decimal(str(data.get("fee", 0))),
        shares=Decimal(str(data.get("shares", 0))),
    )
    db.session.add(op)
    db.session.commit()
    return op


def get_operation(user_id: str, op_id: str) -> WalletTransaction | None:
    return db.session.execute(
        select(WalletTransaction).where(
            WalletTransaction.id == op_id, WalletTransaction.user_id == user_id)
    ).scalars().first()


def update_operation(op: WalletTransaction, data: dict) -> WalletTransaction:
    for field in ("wallet_id", "platform_id", "ticker", "op_date"):
        if field in data and data[field]:
            setattr(op, field, data[field])
    for field in ("amount", "fee", "shares"):
        if field in data and data[field] is not None:
            setattr(op, field, Decimal(str(data[field])))
    db.session.commit()
    return op


def delete_operation(op: WalletTransaction) -> None:
    db.session.delete(op)
    db.session.commit()


# ── Análisis de símbolo ──────────────────────────────────────────────────────

def _close_at_or_before(prices: list, target: date_type) -> float | None:
    """Cierre más reciente con fecha <= target (prices ordenados asc por fecha)."""
    found = None
    for d, c in prices:
        if d <= target:
            found = c
        else:
            break
    return found


def symbol_detail(user_id: str, ticker: str, range_key: str = "1y") -> dict | None:
    sym = db.session.get(Symbol, ticker)
    if not sym:
        return None

    # Serie completa de cierres (asc)
    rows = db.session.execute(
        select(MarketPrice.date, MarketPrice.close)
        .where(MarketPrice.ticker == ticker)
        .order_by(MarketPrice.date)
    ).all()
    series = [(r.date, float(r.close or 0)) for r in rows]

    if not series:
        return {"symbol": _symbol_dict(sym), "history": [], "stats": None,
                "performance": [], "position": _position(user_id, ticker, 0)}

    last_date, last_close = series[-1]
    first_date, first_close = series[0]
    # Máximo y mínimo histórico con su fecha
    ath_d, ath = max(series, key=lambda x: x[1])
    atl_d, atl = min(series, key=lambda x: x[1])

    # Rendimiento por período
    def perf(days, label, since=None):
        target = since or (last_date - timedelta(days=days))
        base = _close_at_or_before(series, target)
        if not base:
            return {"label": label, "pct": None}
        return {"label": label, "pct": round((last_close - base) / base * 100, 2)}

    jan1 = date_type(last_date.year, 1, 1)
    performance = [
        perf(30, "1M"), perf(90, "3M"), perf(180, "6M"),
        {"label": "YTD", "pct": (round((last_close - _close_at_or_before(series, jan1))
                                        / _close_at_or_before(series, jan1) * 100, 2)
                                 if _close_at_or_before(series, jan1) else None)},
        perf(365, "1A"),
        {"label": "Máx", "pct": round((last_close - first_close) / first_close * 100, 2)
         if first_close else None},
    ]

    # Historial filtrado por rango (para el gráfico)
    range_days = {"1m": 30, "3m": 90, "6m": 180, "1y": 365, "2y": 730}.get(range_key)
    if range_key == "ytd":
        cutoff = jan1
    elif range_key == "max" or range_days is None:
        cutoff = first_date
    else:
        cutoff = last_date - timedelta(days=range_days)
    history = [{"date": d.isoformat(), "close": round(c, 6)} for d, c in series if d >= cutoff]

    # Cambio en el rango mostrado
    range_base = history[0]["close"] if history else last_close
    range_change = round(last_close - range_base, 6)
    range_pct = round(range_change / range_base * 100, 2) if range_base else None

    # Operaciones del símbolo (para marcar compras/ventas en el gráfico)
    ops = db.session.execute(
        select(WalletTransaction.op_date, WalletTransaction.shares,
               WalletTransaction.amount)
        .where(WalletTransaction.user_id == user_id, WalletTransaction.ticker == ticker)
        .order_by(WalletTransaction.op_date)
    ).all()
    operations = [{
        "date": o.op_date.isoformat(),
        "shares": float(o.shares),
        "amount": float(o.amount),
        "side": "sell" if float(o.shares) < 0 else "buy",
        "close": round(_close_at_or_before(series, o.op_date) or last_close, 6),
    } for o in ops]

    return {
        "symbol": _symbol_dict(sym),
        "history": history,
        "stats": {
            "price": round(last_close, 6),
            "price_date": last_date.isoformat(),
            "range_change": range_change,
            "range_pct": range_pct,
            "ath": round(ath, 6),
            "ath_date": ath_d.isoformat(),
            "atl": round(atl, 6),
            "atl_date": atl_d.isoformat(),
            "first_date": first_date.isoformat(),
        },
        "performance": performance,
        "operations": operations,
        "position": _position(user_id, ticker, last_close),
    }


def _symbol_dict(s: Symbol) -> dict:
    return {
        "ticker": s.ticker, "type": s.type,
        "type_label": TYPE_LABELS.get(s.type, s.type),
        "color": TYPE_COLORS.get(s.type, "#888"),
        "isin": s.isin, "description": s.description, "market": s.market,
    }


def _position(user_id: str, ticker: str, price: float) -> dict | None:
    row = db.session.execute(
        select(
            func.sum(WalletTransaction.shares),
            func.sum(WalletTransaction.amount),
            func.sum(WalletTransaction.fee),
        ).where(WalletTransaction.user_id == user_id, WalletTransaction.ticker == ticker)
    ).first()
    shares = float(row[0] or 0)
    if abs(shares) < 1e-9:
        return None
    invested = float(row[1] or 0)
    cost = invested + float(row[2] or 0)
    value = shares * price
    return {
        "shares": round(shares, 8),
        "invested": round(invested, 2),
        "cost": round(cost, 2),
        "avg_cost": round(cost / shares, 6) if shares else 0,
        "value": round(value, 2),
        "pnl": round(value - cost, 2),
        "pnl_pct": round((value - cost) / cost * 100, 2) if cost else None,
    }
