from __future__ import annotations

import uuid
from bisect import bisect_right
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
    prices = _latest_prices()
    return {
        "wallets": [{"id": w.id, "name": w.name, "description": w.description} for w in wallets],
        "platforms": [{"id": p.id, "name": p.name} for p in platforms],
        "symbols": [{"ticker": s.ticker, "type": s.type, "isin": s.isin,
                     "description": s.description, "market": s.market,
                     "type_label": TYPE_LABELS.get(s.type, s.type)} for s in symbols],
        "prices": {t: round(c, 6) for t, (c, _d) in prices.items()},
    }


# ── Cartera / posiciones ────────────────────────────────────────────────────

TYPE_LABELS = {"CRY": "Cripto", "ETF": "ETF", "FND": "Fondo", "STK": "Acción"}
TYPE_COLORS = {"CRY": "#f59e0b", "ETF": "#3b82f6", "FND": "#8b5cf6", "STK": "#22c55e"}


def _tickers_of_type(asset_type: str):
    """Subconsulta con los tickers de un tipo de activo (para filtrar operaciones)."""
    return select(Symbol.ticker).where(Symbol.type == asset_type)


def _avg_cost(ops) -> tuple[float, float]:
    """Participaciones y coste base por **coste medio**. ops = iterable de
    (shares, amount, fee) en orden cronológico.

    Compra (shares >= 0): suma importe + comisión al coste.
    Venta (shares < 0): reduce el coste proporcionalmente (coste medio × part. vendidas),
    NO por el importe de venta. Así el coste nunca se vuelve negativo y, al liquidar todo,
    la base vuelve a 0 (solo cuentan las compras posteriores)."""
    shares = 0.0
    cost = 0.0
    for s, amt, fee in ops:
        s = float(s); amt = float(amt); fee = float(fee or 0)
        if s >= 0:
            cost += amt + fee
            shares += s
        elif shares > 1e-12:
            avg = cost / shares
            cost += avg * s          # s negativo → reduce el coste a coste medio
            shares += s
            if shares < 1e-9:        # liquidación total → base a 0
                shares = cost = 0.0
        else:
            shares += s
    return shares, cost


def portfolio(user_id: str, wallet_id: str | None = None,
              platform_id: str | None = None, asset_type: str | None = None,
              ticker: str | None = None) -> dict:
    """
    Posiciones actuales (por símbolo, filtrables por cartera, plataforma, tipo y activo).
    valor = shares × último precio · coste = coste medio de lo que queda · P&L = valor − coste.
    """
    q = select(
        WalletTransaction.ticker, WalletTransaction.op_date,
        WalletTransaction.shares, WalletTransaction.amount, WalletTransaction.fee,
    ).where(WalletTransaction.user_id == user_id)
    if wallet_id:
        q = q.where(WalletTransaction.wallet_id == wallet_id)
    if platform_id:
        q = q.where(WalletTransaction.platform_id == platform_id)
    if asset_type:
        q = q.where(WalletTransaction.ticker.in_(_tickers_of_type(asset_type)))
    if ticker:
        q = q.where(WalletTransaction.ticker == ticker)
    q = q.order_by(WalletTransaction.ticker, WalletTransaction.op_date, WalletTransaction.id)

    prices = _latest_prices()
    symbols = {s.ticker: s for s in db.session.execute(select(Symbol)).scalars().all()}

    # Operaciones agrupadas por ticker (ya en orden cronológico)
    ops_by_ticker: dict[str, list] = {}
    for r in db.session.execute(q):
        ops_by_ticker.setdefault(r.ticker, []).append((r.shares, r.amount, r.fee))

    positions = []
    total_value = total_cost = 0.0
    by_type = {}
    for tk, ops in ops_by_ticker.items():
        shares, cost = _avg_cost(ops)
        if abs(shares) < 1e-9:
            continue
        price, price_date = prices.get(tk, (0.0, None))
        value = shares * price
        pnl = value - cost
        sym = symbols.get(tk)
        stype = sym.type if sym else "STK"

        positions.append({
            "ticker": tk,
            "description": sym.description if sym else tk,
            "type": stype,
            "type_label": TYPE_LABELS.get(stype, stype),
            "shares": round(shares, 8),
            "invested": round(cost, 2),
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
                                       "color": TYPE_COLORS.get(stype, "#888"),
                                       "value": 0.0, "cost": 0.0, "pnl": 0.0})
        t["value"] += value
        t["cost"] += cost
        t["pnl"] += pnl

    positions.sort(key=lambda p: -p["value"])
    total_pnl = total_value - total_cost
    allocation = sorted(by_type.values(), key=lambda x: -x["value"])
    for a in allocation:
        a["pnl_pct"] = round(a["pnl"] / a["cost"] * 100, 2) if a["cost"] else None
        a["value"] = round(a["value"], 2)
        a["cost"] = round(a["cost"], 2)
        a["pnl"] = round(a["pnl"], 2)

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


def portfolio_timeseries(user_id: str, wallet_id: str | None = None,
                         granularity: str = "month", range_key: str = "max",
                         platform_id: str | None = None, asset_type: str | None = None,
                         ticker: str | None = None) -> list[dict]:
    """Serie del valor de cartera vs invertido acumulado (importe + comisiones).

    granularity: 'day' | 'week' | 'month'. range_key: '1m'|'3m'|'6m'|'ytd'|'1y'|'max'.
    Las posiciones se acumulan desde la primera operación; el rango solo recorta la ventana mostrada.
    """
    q = select(
        WalletTransaction.op_date, WalletTransaction.ticker,
        WalletTransaction.shares, WalletTransaction.amount, WalletTransaction.fee,
    ).where(WalletTransaction.user_id == user_id)
    if wallet_id:
        q = q.where(WalletTransaction.wallet_id == wallet_id)
    if platform_id:
        q = q.where(WalletTransaction.platform_id == platform_id)
    if asset_type:
        q = q.where(WalletTransaction.ticker.in_(_tickers_of_type(asset_type)))
    if ticker:
        q = q.where(WalletTransaction.ticker == ticker)
    ops = db.session.execute(q.order_by(WalletTransaction.op_date)).all()
    if not ops:
        return []

    tickers = {o.ticker for o in ops}
    prows = db.session.execute(
        select(MarketPrice.ticker, MarketPrice.date, MarketPrice.close)
        .where(MarketPrice.ticker.in_(tickers))
        .order_by(MarketPrice.ticker, MarketPrice.date)
    ).all()
    # Por ticker: listas paralelas (fechas, cierres) para búsqueda binaria
    pdates: dict[str, list] = {}
    pcloses: dict[str, list] = {}
    for r in prows:
        pdates.setdefault(r.ticker, []).append(r.date)
        pcloses.setdefault(r.ticker, []).append(float(r.close or 0))

    today = date_type.today()
    first = ops[0].op_date
    cutoffs = {
        "1m": today - timedelta(days=30),
        "3m": today - timedelta(days=90),
        "6m": today - timedelta(days=180),
        "1y": today - timedelta(days=365),
        "ytd": date_type(today.year, 1, 1),
    }
    start = max(cutoffs.get(range_key, first), first)

    def month_end(y: int, m: int) -> date_type:
        return (date_type(y, 12, 31) if m == 12
                else date_type(y, m + 1, 1) - timedelta(days=1))

    # Fechas a representar según granularidad, dentro de [start, today]
    dates: list[date_type] = []
    if granularity == "day":
        d = start
        while d <= today:
            dates.append(d)
            d += timedelta(days=1)
    elif granularity == "week":
        d = start
        while d <= today:
            dates.append(d)
            d += timedelta(days=7)
    else:  # month
        y, m = start.year, start.month
        while (y, m) <= (today.year, today.month):
            me = min(month_end(y, m), today)
            if me >= start:
                dates.append(me)
            y, m = (y + 1, 1) if m == 12 else (y, m + 1)
    if not dates or dates[-1] != today:
        dates.append(today)

    def price_at(tk: str, target: date_type) -> float | None:
        ds = pdates.get(tk)
        if not ds:
            return None
        i = bisect_right(ds, target) - 1
        return pcloses[tk][i] if i >= 0 else None

    # Acumulación incremental (ops y fechas ordenadas asc). holdings[tk] = [shares, coste medio]
    points = []
    oi, n = 0, len(ops)
    holdings: dict[str, list] = {}
    for d in dates:
        while oi < n and ops[oi].op_date <= d:
            o = ops[oi]
            s = float(o.shares); amt = float(o.amount); fee = float(o.fee or 0)
            h = holdings.setdefault(o.ticker, [0.0, 0.0])
            if s >= 0:
                h[1] += amt + fee
                h[0] += s
            elif h[0] > 1e-12:
                avg = h[1] / h[0]
                h[1] += avg * s
                h[0] += s
                if h[0] < 1e-9:
                    h[0] = h[1] = 0.0
            else:
                h[0] += s
            oi += 1
        invested = sum(h[1] for h in holdings.values())
        value = 0.0
        for tk, h in holdings.items():
            if abs(h[0]) < 1e-12:
                continue
            px = price_at(tk, d)
            if px:
                value += h[0] * px
        points.append({
            "date": d.isoformat(),
            "value": round(value, 2),
            "invested": round(invested, 2),
        })
    return points


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


def platforms_summary(user_id: str, wallet_id: str | None = None,
                      asset_type: str | None = None, ticker: str | None = None) -> list[dict]:
    """Valor y P&L por plataforma. El universo lo fija la cartera; el valor se recalcula
    aplicando los filtros de tipo y activo (las plataformas sin ellos salen a 0)."""
    platforms = db.session.execute(select(Platform).order_by(Platform.name)).scalars().all()
    universe = []
    for p in platforms:
        full = portfolio(user_id, wallet_id, platform_id=p.id)
        if full["totals"]["cost"] or full["totals"]["value"]:
            universe.append((p, full))
    universe.sort(key=lambda x: -x[1]["totals"]["value"])  # orden estable por tamaño total

    out = []
    for p, full in universe:
        tot = (portfolio(user_id, wallet_id, platform_id=p.id,
                         asset_type=asset_type, ticker=ticker)["totals"]
               if (asset_type or ticker) else full["totals"])
        out.append({"id": p.id, "name": p.name, "value": tot["value"], "cost": tot["cost"],
                    "pnl": tot["pnl"], "pnl_pct": tot["pnl_pct"]})
    return out


def types_summary(user_id: str, wallet_id: str | None = None,
                  platform_id: str | None = None, ticker: str | None = None) -> list[dict]:
    """Valor y P&L por tipo de activo. El universo lo fija la cartera; el valor se recalcula
    aplicando los filtros de plataforma y activo (los tipos sin ellos salen a 0)."""
    universe = portfolio(user_id, wallet_id)["allocation"]
    if not platform_id and not ticker:
        return universe
    by_type = {a["type"]: a for a in
               portfolio(user_id, wallet_id, platform_id=platform_id, ticker=ticker)["allocation"]}
    out = []
    for u in universe:
        f = by_type.get(u["type"])
        out.append(f if f else {**u, "value": 0, "cost": 0, "pnl": 0, "pnl_pct": None})
    return out


# ── Operaciones ─────────────────────────────────────────────────────────────

def list_operations(user_id: str, filters: dict) -> dict:
    q = select(WalletTransaction).where(WalletTransaction.user_id == user_id)
    if filters.get("wallet_id"):
        q = q.where(WalletTransaction.wallet_id == filters["wallet_id"])
    if filters.get("platform_id"):
        q = q.where(WalletTransaction.platform_id == filters["platform_id"])
    if filters.get("type"):
        q = q.where(WalletTransaction.ticker.in_(_tickers_of_type(filters["type"])))
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


def create_operations_bulk(user_id: str, items: list[dict]) -> dict:
    """Alta masiva de operaciones. Inserta las válidas y reporta errores por fila."""
    created_n = 0
    errors = []
    for i, data in enumerate(items):
        missing = [f for f in ("wallet_id", "platform_id", "ticker", "op_date") if not data.get(f)]
        if missing:
            errors.append({"row": i, "msg": f"Faltan campos: {', '.join(missing)}"})
            continue
        try:
            op_date = data["op_date"]
            if isinstance(op_date, str):
                op_date = date_type.fromisoformat(op_date)
            op = WalletTransaction(
                id=str(uuid.uuid4()), user_id=user_id,
                wallet_id=data["wallet_id"], platform_id=data["platform_id"],
                ticker=data["ticker"], op_date=op_date,
                amount=Decimal(str(data.get("amount", 0))),
                fee=Decimal(str(data.get("fee", 0))),
                shares=Decimal(str(data.get("shares", 0))),
            )
            db.session.add(op)
            created_n += 1
        except Exception as e:  # noqa: BLE001 — reportamos el error de la fila al usuario
            errors.append({"row": i, "msg": str(e)})
    if created_n:
        db.session.commit()
    else:
        db.session.rollback()
    return {"created": created_n, "errors": errors}


def get_operation(user_id: str, op_id: str) -> WalletTransaction | None:
    return db.session.execute(
        select(WalletTransaction).where(
            WalletTransaction.id == op_id, WalletTransaction.user_id == user_id)
    ).scalars().first()


def update_operation(op: WalletTransaction, data: dict) -> WalletTransaction:
    for field in ("wallet_id", "platform_id", "ticker", "op_date"):
        if field in data and data[field]:
            value = data[field]
            if field == "op_date" and isinstance(value, str):
                value = date_type.fromisoformat(value)
            setattr(op, field, value)
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
    rows = db.session.execute(
        select(WalletTransaction.shares, WalletTransaction.amount, WalletTransaction.fee)
        .where(WalletTransaction.user_id == user_id, WalletTransaction.ticker == ticker)
        .order_by(WalletTransaction.op_date, WalletTransaction.id)
    ).all()
    shares, cost = _avg_cost([(r.shares, r.amount, r.fee) for r in rows])
    if abs(shares) < 1e-9:
        return None
    value = shares * price
    return {
        "shares": round(shares, 8),
        "invested": round(cost, 2),
        "cost": round(cost, 2),
        "avg_cost": round(cost / shares, 6) if shares else 0,
        "value": round(value, 2),
        "pnl": round(value - cost, 2),
        "pnl_pct": round((value - cost) / cost * 100, 2) if cost else None,
    }
