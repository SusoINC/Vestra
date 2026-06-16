from __future__ import annotations

import uuid
from datetime import date as date_type
from decimal import Decimal

from sqlalchemy import select, func

from ..extensions import db
from ..models.vehicle import Vehicle, FuelLog


# ── Helpers ──────────────────────────────────────────────────────────────────

def _f(v) -> float | None:
    return float(v) if v is not None else None


def _compute_consumption(logs: list[FuelLog]) -> dict[str, dict]:
    """Distancia y l/100 por repostaje (método de depósito lleno).

    Entre dos lecturas de odómetro, el combustible consumido es la suma de TODOS los
    repostajes de ese tramo (incluidos los intermedios sin odómetro). El consumo se
    imputa al repostaje donde se cierra el tramo (el que trae el odómetro)."""
    ordered = sorted(logs, key=lambda l: (l.log_date or date_type.min, l.odometer_km or 0))
    out: dict[str, dict] = {l.id: {"distance": None, "l100": None,
                                   "interval_liters": None, "interval_cost": None} for l in logs}
    prev_odo = None
    acc_l = acc_c = 0.0
    for l in ordered:
        acc_l += float(l.liters) if l.liters else 0.0
        acc_c += float(l.total_cost) if l.total_cost else 0.0
        if l.odometer_km is not None:
            if prev_odo is not None and l.odometer_km > prev_odo:
                dist = l.odometer_km - prev_odo
                out[l.id]["distance"] = dist
                out[l.id]["interval_liters"] = round(acc_l, 2)
                out[l.id]["interval_cost"] = round(acc_c, 2)
                if dist:
                    out[l.id]["l100"] = round(acc_l / dist * 100, 2)
            prev_odo = l.odometer_km
            acc_l = acc_c = 0.0
    return out


def _log_dict(l: FuelLog, derived: dict) -> dict:
    cost = _f(l.total_cost)
    liters = _f(l.liters)
    d = derived.get(l.id, {})
    return {
        "id": l.id,
        "log_date": l.log_date.isoformat() if l.log_date else None,
        "station": l.station,
        "liters": liters,
        "total_cost": cost,
        "odometer_km": l.odometer_km,
        "price_per_liter": _f(l.price_per_liter) or (round(cost / liters, 4) if cost and liters else None),
        "full_tank": l.full_tank,
        "distance": d.get("distance"),
        "consumption_l100": d.get("l100"),
    }


# ── Vehículos ────────────────────────────────────────────────────────────────

def _vehicle_summary(v: Vehicle) -> dict:
    logs = list(v.fuel_logs)
    derived = _compute_consumption(logs)
    total_cost = sum(_f(l.total_cost) or 0 for l in logs)
    total_liters = sum(_f(l.liters) or 0 for l in logs)
    # Consumo medio ponderado (litros de cada tramo / distancia total)
    dist_total = sum(d["distance"] for d in derived.values() if d["distance"])
    liters_for_avg = sum(d["interval_liters"] for d in derived.values()
                         if d["interval_liters"] is not None)
    avg_l100 = round(liters_for_avg / dist_total * 100, 2) if dist_total else None
    odos = [l.odometer_km for l in logs if l.odometer_km is not None]
    dates = [l.log_date for l in logs if l.log_date]
    return {
        "id": v.id,
        "nickname": v.nickname,
        "make": v.make,
        "model": v.model,
        "year": v.year,
        "plate": v.plate,
        "fuel_type": v.fuel_type,
        "status": v.status,
        "photo_url": v.photo_url,
        "current_km": max(odos) if odos else v.current_km,
        "fills": len(logs),
        "total_cost": round(total_cost, 2),
        "total_liters": round(total_liters, 2),
        "avg_l100": avg_l100,
        "last_refuel": max(dates).isoformat() if dates else None,
    }


def list_vehicles(user_id: str) -> list[dict]:
    vehicles = db.session.execute(
        select(Vehicle).where(Vehicle.user_id == user_id).order_by(Vehicle.nickname)
    ).scalars().all()
    out = [_vehicle_summary(v) for v in vehicles]
    out.sort(key=lambda x: (x["last_refuel"] or ""), reverse=True)
    return out


def get_vehicle(user_id: str, vehicle_id: str) -> Vehicle | None:
    return db.session.execute(
        select(Vehicle).where(Vehicle.id == vehicle_id, Vehicle.user_id == user_id)
    ).scalars().first()


def create_vehicle(user_id: str, data: dict) -> Vehicle:
    v = Vehicle(
        id=str(uuid.uuid4()), user_id=user_id,
        nickname=data["nickname"],
        make=data.get("make"), model=data.get("model"),
        year=data.get("year"), plate=data.get("plate"),
        fuel_type=data.get("fuel_type"), status=data.get("status", "active"),
        notes=data.get("notes"), photo_url=data.get("photo_url"),
    )
    db.session.add(v)
    db.session.commit()
    return v


def update_vehicle(v: Vehicle, data: dict) -> Vehicle:
    for f in ("nickname", "make", "model", "year", "plate", "fuel_type",
              "status", "notes", "photo_url", "current_km"):
        if f in data:
            setattr(v, f, data[f])
    db.session.commit()
    return v


def delete_vehicle(v: Vehicle) -> None:
    db.session.delete(v)
    db.session.commit()


# ── Repostajes ───────────────────────────────────────────────────────────────

def list_fuel_logs(user_id: str, vehicle_id: str) -> list[dict]:
    v = get_vehicle(user_id, vehicle_id)
    if not v:
        return []
    logs = list(v.fuel_logs)
    derived = _compute_consumption(logs)
    rows = [_log_dict(l, derived) for l in logs]
    rows.sort(key=lambda r: (r["log_date"] or "", r["odometer_km"] or 0), reverse=True)
    return rows


def _ppl(data: dict):
    cost = data.get("total_cost")
    liters = data.get("liters")
    if data.get("price_per_liter"):
        return Decimal(str(data["price_per_liter"]))
    if cost and liters:
        return round(Decimal(str(cost)) / Decimal(str(liters)), 4)
    return None


def create_fuel_log(user_id: str, vehicle_id: str, data: dict) -> FuelLog | None:
    v = get_vehicle(user_id, vehicle_id)
    if not v:
        return None
    log = FuelLog(
        id=str(uuid.uuid4()), vehicle_id=vehicle_id,
        log_date=date_type.fromisoformat(data["log_date"]) if isinstance(data.get("log_date"), str)
        else data.get("log_date"),
        station=data.get("station"),
        liters=Decimal(str(data["liters"])) if data.get("liters") is not None else None,
        total_cost=Decimal(str(data["total_cost"])) if data.get("total_cost") is not None else None,
        odometer_km=data.get("odometer_km"),
        price_per_liter=_ppl(data),
        full_tank=data.get("full_tank", True),
    )
    db.session.add(log)
    # Actualiza el km actual del vehículo si este repostaje es el más alto
    if log.odometer_km and (v.current_km is None or log.odometer_km > v.current_km):
        v.current_km = log.odometer_km
    db.session.commit()
    return log


def get_fuel_log(user_id: str, log_id: str) -> FuelLog | None:
    return db.session.execute(
        select(FuelLog).join(Vehicle, Vehicle.id == FuelLog.vehicle_id)
        .where(FuelLog.id == log_id, Vehicle.user_id == user_id)
    ).scalars().first()


def update_fuel_log(log: FuelLog, data: dict) -> FuelLog:
    if "log_date" in data and data["log_date"]:
        log.log_date = (date_type.fromisoformat(data["log_date"])
                        if isinstance(data["log_date"], str) else data["log_date"])
    if "station" in data:
        log.station = data["station"]
    if "liters" in data:
        log.liters = Decimal(str(data["liters"])) if data["liters"] is not None else None
    if "total_cost" in data:
        log.total_cost = Decimal(str(data["total_cost"])) if data["total_cost"] is not None else None
    if "odometer_km" in data:
        log.odometer_km = data["odometer_km"]
    if "full_tank" in data:
        log.full_tank = data["full_tank"]
    log.price_per_liter = _ppl({
        "price_per_liter": None,
        "total_cost": _f(log.total_cost), "liters": _f(log.liters),
    })
    db.session.commit()
    return log


def delete_fuel_log(log: FuelLog) -> None:
    db.session.delete(log)
    db.session.commit()


# ── Estadísticas / gráficos ──────────────────────────────────────────────────

def vehicle_stats(user_id: str, vehicle_id: str) -> dict | None:
    v = get_vehicle(user_id, vehicle_id)
    if not v:
        return None
    logs = list(v.fuel_logs)
    derived = _compute_consumption(logs)
    summary = _vehicle_summary(v)

    # Series temporales (ordenadas asc por fecha)
    by_date = sorted([l for l in logs if l.log_date], key=lambda l: l.log_date)
    consumption_series = []
    price_series = []
    for l in by_date:
        d = derived.get(l.id, {})
        price = _f(l.price_per_liter) or (
            round((_f(l.total_cost) or 0) / _f(l.liters), 4) if l.liters else None)
        if d.get("l100"):
            consumption_series.append({"date": l.log_date.isoformat(), "l100": d["l100"]})
        if price:
            price_series.append({"date": l.log_date.isoformat(), "price": price})

    # Coste mensual de combustible
    monthly: dict[str, float] = {}
    for l in by_date:
        if l.total_cost:
            key = l.log_date.strftime("%Y-%m")
            monthly[key] = monthly.get(key, 0) + float(l.total_cost)
    cost_series = [{"month": k, "cost": round(c, 2)} for k, c in sorted(monthly.items())]

    # €/100 km (coste de cada tramo / distancia total)
    dist_total = sum(d["distance"] for d in derived.values() if d["distance"])
    cost_for_dist = sum(d["interval_cost"] for d in derived.values()
                        if d["interval_cost"] is not None)
    eur_100km = round(cost_for_dist / dist_total * 100, 2) if dist_total else None

    avg_price = round(
        sum(_f(l.price_per_liter) or 0 for l in logs if l.price_per_liter)
        / sum(1 for l in logs if l.price_per_liter), 4) if any(l.price_per_liter for l in logs) else None

    return {
        "vehicle": summary,
        "kpis": {
            "avg_l100": summary["avg_l100"],
            "eur_100km": eur_100km,
            "avg_price": avg_price,
            "total_cost": summary["total_cost"],
            "total_liters": summary["total_liters"],
            "total_km": dist_total or None,
            "fills": summary["fills"],
        },
        "consumption_series": consumption_series,
        "price_series": price_series,
        "cost_series": cost_series,
    }
