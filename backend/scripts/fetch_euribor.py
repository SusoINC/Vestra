#!/usr/bin/env python3
"""
fetch_euribor.py — Descarga el Euríbor a 1 año (media mensual) desde el ECB Data
Portal y lo upserta en euribor_rates. Sin clave, gratis.

Serie: FM.M.U2.EUR.RT.MM.EURIBOR1YD_.HSTA (Euribor 1-year, monthly average).

Uso (VestraApp):
  cd /opt/vestra/backend && export $(grep -v '^#' .env | xargs)
  /opt/vestra/venv/bin/python scripts/fetch_euribor.py

Programado por cron (mensual).
"""
from __future__ import annotations

import os
import sys
from datetime import date

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import requests
from dotenv import load_dotenv

load_dotenv()

from app import create_app
from app.extensions import db
from app.models.finance import EuriborRate
from sqlalchemy.dialects.postgresql import insert as pg_insert

URL = ("https://data-api.ecb.europa.eu/service/data/"
       "FM/M.U2.EUR.RT.MM.EURIBOR1YD_.HSTA?format=jsondata")


def main() -> None:
    resp = requests.get(URL, headers={"Accept": "application/json"}, timeout=30)
    resp.raise_for_status()
    data = resp.json()

    series = next(iter(data["dataSets"][0]["series"].values()))
    obs = series["observations"]
    periods = data["structure"]["dimensions"]["observation"][0]["values"]

    rows = []
    for k, v in obs.items():
        rate = v[0] if v else None
        if rate is None:
            continue
        ym = periods[int(k)]["id"]            # "YYYY-MM"
        y, m = ym.split("-")
        rows.append({"month": date(int(y), int(m), 1), "rate": round(float(rate), 4)})

    if not rows:
        print("Sin datos de Euríbor")
        return

    app = create_app("production")
    with app.app_context():
        stmt = pg_insert(EuriborRate.__table__).values(rows)
        stmt = stmt.on_conflict_do_update(index_elements=["month"],
                                          set_={"rate": stmt.excluded.rate})
        db.session.execute(stmt)
        db.session.commit()
    print(f"✅ {len(rows)} meses de Euríbor actualizados (último {rows[-1]['month']} "
          f"= {rows[-1]['rate']}%)")


if __name__ == "__main__":
    main()
