from __future__ import annotations

import calendar
import time
import uuid
from datetime import date as date_type
from decimal import Decimal

import requests
from sqlalchemy import select

from ..extensions import db
from ..models.finance import Loan, EuriborRate


# ── Helpers ──────────────────────────────────────────────────────────────────

def _add_months(d: date_type, m: int, day: int) -> date_type:
    idx = d.year * 12 + (d.month - 1) + m
    y, mo = idx // 12, idx % 12 + 1
    return date_type(y, mo, min(day, calendar.monthrange(y, mo)[1]))


def _payment(balance: float, r_month: float, n: int) -> float:
    """Cuota constante (sistema francés)."""
    if n <= 0:
        return 0.0
    if r_month <= 1e-9:
        return balance / n
    return balance * r_month / (1 - (1 + r_month) ** -n)


def _euribor_lookup():
    """Devuelve (func, last_month, last_rate). func(date, scenario_bps) → % anual.
    Para meses con dato → valor real; para futuro → último conocido + escenario."""
    rows = db.session.execute(
        select(EuriborRate.month, EuriborRate.rate).order_by(EuriborRate.month)
    ).all()
    by_month = {r.month.replace(day=1): float(r.rate) for r in rows}
    months_sorted = sorted(by_month)
    last_month = months_sorted[-1] if months_sorted else None
    last_rate = by_month[last_month] if last_month else 0.0

    def euribor_at(d: date_type, scenario_bps: float = 0.0) -> float:
        key = d.replace(day=1)
        if key in by_month:
            return by_month[key]
        if last_month and key > last_month:
            return last_rate + scenario_bps          # proyección futura
        # antes del primer dato: usa el primero conocido
        for m in months_sorted:
            if m >= key:
                return by_month[m]
        return last_rate

    return euribor_at, last_month, last_rate


# ── Cuadro de amortización ───────────────────────────────────────────────────

def build_schedule(loan: Loan, euribor_at, scenario_bps: float = 0.0,
                   extra_amount: float = 0.0, extra_at: int | None = None,
                   extra_mode: str = "plazo") -> list[dict]:
    """Cuadro mes a mes. Soporta fijo, variable (euríbor+diferencial) y mixto.
    extra_at: índice de mes (0-based) en el que aplicar una amortización anticipada."""
    P = float(loan.principal)
    n = loan.term_months
    spread = float(loan.spread or 0)
    rev = loan.revision_months or 12
    mfm = loan.mixed_fixed_months or 0
    tin = float(loan.tin_fixed or 0)
    var_start = 0 if loan.rate_kind == "variable" else (mfm if loan.rate_kind == "mixed" else None)

    def annual_rate(i: int, d: date_type) -> float:
        if loan.rate_kind == "fixed":
            return tin
        if loan.rate_kind == "mixed" and i < mfm:
            return tin
        return euribor_at(d, scenario_bps) + spread

    rows = []
    balance = P
    payment = 0.0
    cur_r = 0.0
    cur_annual = 0.0
    for i in range(n):
        d = _add_months(loan.start_date, i, loan.payment_day or 1)
        recompute = (i == 0) or (loan.rate_kind == "mixed" and i == mfm) \
            or (var_start is not None and i >= var_start and (i - var_start) % rev == 0)
        if recompute:
            cur_annual = annual_rate(i, d)
            cur_r = cur_annual / 100 / 12
            payment = _payment(balance, cur_r, n - i)

        interest = balance * cur_r
        principal_paid = payment - interest

        extra = 0.0
        if extra_at is not None and i == extra_at and extra_amount > 0:
            extra = min(extra_amount, balance - principal_paid)

        if i == n - 1 or principal_paid >= balance:
            principal_paid = balance
            payment = interest + principal_paid
            extra = 0.0

        balance = balance - principal_paid - extra
        rows.append({
            "n": i + 1,
            "date": d.isoformat(),
            "year": d.year,
            "rate": round(cur_annual, 4),
            "payment": round(payment, 2),
            "interest": round(interest, 2),
            "principal": round(principal_paid, 2),
            "extra": round(extra, 2),
            "balance": round(max(balance, 0), 2),
        })
        # Tras una amortización que reduce cuota, recalcular sobre el saldo y plazo restantes
        if extra > 0 and extra_mode == "cuota" and balance > 0.005:
            payment = _payment(balance, cur_r, n - i - 1)
        if balance <= 0.005:
            break
    return rows


def _summary(loan: Loan, schedule: list[dict]) -> dict:
    today = date_type.today().isoformat()
    paid = [r for r in schedule if r["date"] <= today]
    future = [r for r in schedule if r["date"] > today]
    total_interest = round(sum(r["interest"] for r in schedule), 2)
    interest_paid = round(sum(r["interest"] for r in paid), 2)
    pending = future[0]["balance"] + future[0]["principal"] + future[0]["extra"] if future else 0.0
    # saldo pendiente = saldo al cierre del último pago hecho (o principal si no hay pagos)
    pending = paid[-1]["balance"] if paid else float(loan.principal)
    current = future[0] if future else (paid[-1] if paid else None)
    return {
        "monthly_payment": current["payment"] if current else 0.0,
        "current_rate": current["rate"] if current else 0.0,
        "pending": round(pending, 2),
        "pct_amortized": round((1 - pending / float(loan.principal)) * 100, 1) if loan.principal else 0,
        "interest_paid": interest_paid,
        "interest_total": total_interest,
        "total_paid": round(sum(r["payment"] for r in schedule) + float(loan.opening_fee or 0), 2),
        "end_date": schedule[-1]["date"] if schedule else None,
        "months_total": len(schedule),
        "months_left": len(future),
    }


# ── API de servicio ──────────────────────────────────────────────────────────

def loan_dict(loan: Loan) -> dict:
    return {
        "id": loan.id, "name": loan.name, "kind": loan.kind, "lender": loan.lender,
        "principal": float(loan.principal), "start_date": loan.start_date.isoformat(),
        "term_months": loan.term_months, "payment_day": loan.payment_day,
        "rate_kind": loan.rate_kind,
        "tin_fixed": float(loan.tin_fixed) if loan.tin_fixed is not None else None,
        "mixed_fixed_months": loan.mixed_fixed_months,
        "spread": float(loan.spread) if loan.spread is not None else None,
        "revision_months": loan.revision_months,
        "opening_fee": float(loan.opening_fee or 0),
        "early_fee_pct": float(loan.early_fee_pct or 0),
        "status": loan.status, "category_id": loan.category_id,
        "account_id": loan.account_id, "notes": loan.notes,
    }


def list_loans(user_id: str) -> list[dict]:
    loans = db.session.execute(
        select(Loan).where(Loan.user_id == user_id).order_by(Loan.created_at.desc())
    ).scalars().all()
    euribor_at, _, _ = _euribor_lookup()
    out = []
    for l in loans:
        sched = build_schedule(l, euribor_at)
        s = _summary(l, sched)
        out.append({**loan_dict(l), **{
            "monthly_payment": s["monthly_payment"], "pending": s["pending"],
            "pct_amortized": s["pct_amortized"], "interest_total": s["interest_total"],
            "end_date": s["end_date"],
        }})
    return out


def get_loan(user_id: str, loan_id: str) -> Loan | None:
    return db.session.execute(
        select(Loan).where(Loan.id == loan_id, Loan.user_id == user_id)
    ).scalars().first()


def detail(user_id: str, loan_id: str, scenario_bps: float = 0.0) -> dict | None:
    l = get_loan(user_id, loan_id)
    if not l:
        return None
    euribor_at, last_month, last_rate = _euribor_lookup()
    sched = build_schedule(l, euribor_at, scenario_bps)
    return {
        "loan": loan_dict(l),
        "summary": _summary(l, sched),
        "schedule": sched,
        "euribor": {"last_month": last_month.isoformat() if last_month else None, "last_rate": last_rate},
    }


def create_loan(user_id: str, data: dict) -> Loan:
    def dec(k):
        v = data.get(k)
        return Decimal(str(v)) if v not in (None, "") else None
    loan = Loan(
        id=str(uuid.uuid4()), user_id=user_id,
        name=data["name"], kind=data.get("kind", "loan"), lender=data.get("lender"),
        principal=Decimal(str(data["principal"])),
        start_date=date_type.fromisoformat(data["start_date"]),
        term_months=int(data["term_months"]), payment_day=int(data.get("payment_day", 1)),
        rate_kind=data.get("rate_kind", "fixed"),
        tin_fixed=dec("tin_fixed"), mixed_fixed_months=data.get("mixed_fixed_months") or None,
        spread=dec("spread"), revision_months=int(data.get("revision_months", 12)),
        opening_fee=dec("opening_fee") or Decimal("0"),
        early_fee_pct=dec("early_fee_pct") or Decimal("0"),
        category_id=data.get("category_id"), account_id=data.get("account_id"),
        notes=data.get("notes"),
    )
    db.session.add(loan)
    db.session.commit()
    return loan


def update_loan(loan: Loan, data: dict) -> Loan:
    simple = ("name", "kind", "lender", "payment_day", "rate_kind", "revision_months",
              "mixed_fixed_months", "status", "category_id", "account_id", "notes")
    for f in simple:
        if f in data:
            setattr(loan, f, data[f])
    if "principal" in data and data["principal"] not in (None, ""):
        loan.principal = Decimal(str(data["principal"]))
    if "term_months" in data and data["term_months"]:
        loan.term_months = int(data["term_months"])
    if "start_date" in data and data["start_date"]:
        loan.start_date = date_type.fromisoformat(data["start_date"])
    for f in ("tin_fixed", "spread", "opening_fee", "early_fee_pct"):
        if f in data:
            setattr(loan, f, Decimal(str(data[f])) if data[f] not in (None, "") else None)
    db.session.commit()
    return loan


def delete_loan(loan: Loan) -> None:
    db.session.delete(loan)
    db.session.commit()


def _amortize(balance: float, payment: float, r: float):
    """Amortiza un saldo a tipo constante con cuota fija → (meses, intereses)."""
    interest = 0.0
    months = 0
    while balance > 0.005 and months < 1500:
        i = balance * r
        princ = payment - i
        if princ <= 0:
            return None
        if princ > balance:
            princ = balance
        balance -= princ
        interest += i
        months += 1
    return months, interest


def simulate_early(user_id: str, loan_id: str, amount: float, mode: str,
                   annual_return: float = 0.0) -> dict | None:
    """Amortización anticipada hoy, proyectada al tipo actual (condiciones de hoy).
    Compara el ahorro neto de intereses con invertir ese importe a `annual_return`%."""
    l = get_loan(user_id, loan_id)
    if not l:
        return None
    euribor_at, _, _ = _euribor_lookup()
    s = _summary(l, build_schedule(l, euribor_at))
    r = s["current_rate"] / 100 / 12
    B = s["pending"]
    Pm = s["monthly_payment"]
    if B <= 0 or Pm <= 0:
        return None

    base = _amortize(B, Pm, r)
    Bp = max(B - amount, 0)
    if mode == "cuota":
        m0 = base[0]
        new_payment = round(_payment(Bp, r, m0), 2)
        sim = _amortize(Bp, new_payment, r)
    else:  # plazo
        new_payment = Pm
        sim = _amortize(Bp, Pm, r)

    interest_saved = round(base[1] - sim[1], 2)
    months_saved = base[0] - sim[0]
    fee = round(amount * float(l.early_fee_pct or 0) / 100, 2)
    net_saved = round(interest_saved - fee, 2)

    years = base[0] / 12
    invest_gain = round(amount * ((1 + annual_return / 100) ** years - 1), 2) if annual_return else 0.0

    return {
        "amount": amount, "mode": mode,
        "interest_saved": interest_saved, "early_fee": fee, "net_saved": net_saved,
        "months_saved": months_saved,
        "new_payment": new_payment, "old_payment": round(Pm, 2),
        "horizon_years": round(years, 1),
        "annual_return": annual_return, "invest_gain": invest_gain,
        "worth_it": net_saved >= invest_gain,
    }


# ── Histórico del Euríbor + insights ─────────────────────────────────────────

_dfr_cache = {"ts": 0.0, "val": None}


def _current_dfr() -> float | None:
    """Tipo de la facilidad de depósito del BCE (en vivo, cacheado 6h)."""
    if _dfr_cache["val"] is not None and time.time() - _dfr_cache["ts"] < 6 * 3600:
        return _dfr_cache["val"]
    try:
        r = requests.get(
            "https://data-api.ecb.europa.eu/service/data/FM/D.U2.EUR.4F.KR.DFR.LEV"
            "?format=jsondata&lastNObservations=1",
            headers={"Accept": "application/json"}, timeout=8)
        d = r.json()
        s = next(iter(d["dataSets"][0]["series"].values()))
        val = float(s["observations"]["0"][0])
        _dfr_cache.update(ts=time.time(), val=val)
        return val
    except Exception:
        return _dfr_cache["val"]


def _add_months_d(d: date_type, m: int) -> date_type:
    idx = d.year * 12 + (d.month - 1) + m
    return date_type(idx // 12, idx % 12 + 1, 1)


def euribor_history() -> dict:
    rows = db.session.execute(
        select(EuriborRate.month, EuriborRate.rate).order_by(EuriborRate.month)
    ).all()
    series = [{"month": r.month.isoformat(), "rate": float(r.rate)} for r in rows]
    if not series:
        return {"series": [], "insight": None, "projection": []}

    rates = [s["rate"] for s in series]
    cur = rates[-1]
    mom = round(cur - rates[-2], 3) if len(rates) >= 2 else None
    yoy = round(cur - rates[-13], 3) if len(rates) >= 13 else None

    window = series[-6:] if len(series) >= 6 else series
    slope = (window[-1]["rate"] - window[0]["rate"]) / max(len(window) - 1, 1)  # %/mes
    trend = "subiendo" if slope > 0.02 else "bajando" if slope < -0.02 else "estable"

    mx = max(series, key=lambda s: s["rate"])
    mn = min(series, key=lambda s: s["rate"])

    # Proyección orientativa: extrapola la pendiente reciente 6 meses
    last_month = rows[-1].month
    projection = []
    for k in range(1, 7):
        projection.append({
            "month": _add_months_d(last_month, k).isoformat(),
            "rate": round(cur + slope * k, 3),
        })

    dfr = _current_dfr()
    return {
        "series": series,
        "projection": projection,
        "insight": {
            "current": cur, "mom": mom, "yoy": yoy,
            "slope": round(slope, 4), "trend": trend,
            "max": mx, "min": mn,
            "dfr": dfr,
            "vs_dfr": round(cur - dfr, 3) if dfr is not None else None,
        },
    }
