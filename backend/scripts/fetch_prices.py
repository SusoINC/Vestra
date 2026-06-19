#!/usr/bin/env python3
"""
fetch_prices.py — Descarga precios de mercado de todos los símbolos activos
y los upserta en market_prices. Precio actual + histórico.

Fuentes (campo symbols.market):
  - yfinance: fondos (0P...) y cripto (xxx-EUR) → librería yfinance, ticker tal cual
  - eodhd: ETF XETRA (8PSB.XETRA, FBTC.XETRA, GLDA.XETRA) → API EODHD con el ticker
           completo (requiere EODHD_API_TOKEN en .env)

Uso:
  cd /opt/vestra/backend && export $(grep -v '^#' .env | xargs)
  /opt/vestra/venv/bin/python scripts/fetch_prices.py            # incremental (~40 días)
  /opt/vestra/venv/bin/python scripts/fetch_prices.py --full     # histórico completo
  /opt/vestra/venv/bin/python scripts/fetch_prices.py --ticker BTC-EUR

Programado por cron (ver crontab de root en VestraApp).
"""
from __future__ import annotations

import argparse
import os
import sys
from datetime import date, timedelta

# Permite ejecutar el script desde scripts/ (añade el backend al path)
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import pandas as pd
import requests
import yfinance as yf
from dotenv import load_dotenv

load_dotenv()

from app import create_app
from app.extensions import db
from app.models.investment import Symbol, MarketPrice
from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert as pg_insert

EODHD_TOKEN = os.environ.get("EODHD_API_TOKEN", "")
INCREMENTAL_DAYS = 40
TROY_OZ_G = 31.1034768  # gramos por onza troy


def _num(v):
    return None if pd.isna(v) else float(v)


def fetch_gold_eur_g(symbol: Symbol, period: str) -> list[dict]:
    """Precio del oro físico en €/gramo, derivado de GC=F (USD/oz) y EUR/USD.

    eur_g = (USD_oz / EURUSD) / 31.1034768. Es el precio spot; la diferencia con
    lo pagado (que incluye prima del lingote) se refleja como P&L, igual que un
    activo más. Aproxima bien el precio de recompra de lingotes reconocidos."""
    try:
        gc = yf.Ticker("GC=F").history(period=period, auto_adjust=False)["Close"].dropna()
        fx = yf.Ticker("EURUSD=X").history(period=period, auto_adjust=False)["Close"].dropna()
    except Exception as exc:
        print(f"  {symbol.ticker}: ERROR oro {exc}")
        return []
    if gc.empty or fx.empty:
        print(f"  {symbol.ticker}: sin datos GC=F/EURUSD")
        return []
    fx_by_date = {ts.date(): float(v) for ts, v in fx.items()}
    rows, last_fx = [], None
    for ts, usd_oz in gc.items():
        d = ts.date()
        eurusd = fx_by_date.get(d, last_fx)
        if eurusd:
            last_fx = eurusd
        if not eurusd:
            continue
        eur_g = round((float(usd_oz) / eurusd) / TROY_OZ_G, 4)
        rows.append({"date": d, "ticker": symbol.ticker,
                     "open": eur_g, "high": eur_g, "low": eur_g, "close": eur_g, "volume": 0})
    return rows


def fetch_yfinance(symbol: Symbol, period: str) -> list[dict]:
    """Fondos y cripto. Para ETF XETRA sin eodhd, mapea .XETRA → .DE."""
    ytk = symbol.ticker
    if ytk.endswith(".XETRA"):
        ytk = ytk.replace(".XETRA", ".DE")
    try:
        df = yf.Ticker(ytk).history(period=period, auto_adjust=False)
    except Exception as exc:
        print(f"  {symbol.ticker} ({ytk}): ERROR yfinance {exc}")
        return []
    if df is None or df.empty:
        print(f"  {symbol.ticker} ({ytk}): sin datos yfinance")
        return []
    rows = []
    for idx, r in df.iterrows():
        close = _num(r.get("Close"))
        if close is None:
            continue
        rows.append({
            "date": idx.date(), "ticker": symbol.ticker,
            "open": _num(r.get("Open")) or close, "high": _num(r.get("High")) or close,
            "low": _num(r.get("Low")) or close, "close": close,
            "volume": int(r["Volume"]) if not pd.isna(r.get("Volume")) else 0,
        })
    return rows


def fetch_eodhd(symbol: Symbol, period: str) -> list[dict]:
    """ETF XETRA vía API EODHD con el ticker completo."""
    if not EODHD_TOKEN:
        print(f"  {symbol.ticker}: sin EODHD_API_TOKEN, intento yfinance")
        return fetch_yfinance(symbol, period)
    url = f"https://eodhd.com/api/eod/{symbol.ticker}?api_token={EODHD_TOKEN}&fmt=json"
    if period != "max":
        frm = (date.today() - timedelta(days=INCREMENTAL_DAYS)).isoformat()
        url += f"&from={frm}"
    try:
        resp = requests.get(url, timeout=30)
    except Exception as exc:
        print(f"  {symbol.ticker}: ERROR eodhd {exc}")
        return []
    if resp.status_code != 200:
        print(f"  {symbol.ticker}: eodhd HTTP {resp.status_code}")
        return []
    rows = []
    for e in resp.json():
        try:
            rows.append({
                "date": e["date"], "ticker": symbol.ticker,
                "open": float(e["open"]), "high": float(e["high"]),
                "low": float(e["low"]), "close": float(e["close"]),
                "volume": int(e.get("volume") or 0),
            })
        except (KeyError, TypeError, ValueError):
            continue
    return rows


def fetch(period: str, only_ticker: str | None = None) -> None:
    app = create_app("production")
    with app.app_context():
        q = select(Symbol).where(Symbol.enabled == True)
        if only_ticker:
            q = q.where(Symbol.ticker == only_ticker)
        symbols = db.session.execute(q).scalars().all()

        total = 0
        for s in symbols:
            if s.market == "gold_eur_g":
                rows = fetch_gold_eur_g(s, period)
            elif s.market == "eodhd":
                rows = fetch_eodhd(s, period)
                if not rows:  # 402/sin plan → probar yfinance (.DE)
                    rows = fetch_yfinance(s, period)
            else:
                rows = fetch_yfinance(s, period)
            if not rows:
                continue
            stmt = pg_insert(MarketPrice.__table__).values(rows)
            stmt = stmt.on_conflict_do_update(
                index_elements=["date", "ticker"],
                set_={
                    "open": stmt.excluded.open, "high": stmt.excluded.high,
                    "low": stmt.excluded.low, "close": stmt.excluded.close,
                    "volume": stmt.excluded.volume,
                },
            )
            db.session.execute(stmt)
            db.session.commit()
            total += len(rows)
            last = rows[-1]
            print(f"  {s.ticker:14} [{s.market:8}]: {len(rows):>4} precios → "
                  f"{last['date']} {round(last['close'], 4)}")

        print(f"\n✅ {total} precios actualizados ({len(symbols)} símbolos)")


if __name__ == "__main__":
    p = argparse.ArgumentParser()
    p.add_argument("--full", action="store_true", help="Histórico completo (period=max)")
    p.add_argument("--ticker", help="Solo este ticker")
    args = p.parse_args()
    fetch("max" if args.full else "1mo", args.ticker)
