from __future__ import annotations

from datetime import date

from sqlalchemy import select, func, extract

from ..extensions import db
from ..models.finance import Transaction, TxCategory, Budget


def _month_flows(user_id: str, year: int) -> list[dict]:
    """Ingresos (T01), gastos (T02) e inversión (T04) por mes."""
    q = select(
        extract("month", Transaction.op_date).label("m"),
        Transaction.type_id,
        func.sum(Transaction.amount).label("total"),
    ).where(
        Transaction.user_id == user_id,
        Transaction.is_split == False,
        Transaction.category_id != None,
        extract("year", Transaction.op_date) == year,
    ).group_by("m", Transaction.type_id)

    flows = {m: {"month": m, "income": 0.0, "expense": 0.0,
                 "investment": 0.0, "savings": 0.0}
             for m in range(1, 13)}
    for row in db.session.execute(q):
        m = int(row.m)
        total = float(row.total or 0)
        if row.type_id == "T01":
            flows[m]["income"] += total
        elif row.type_id == "T02":
            flows[m]["expense"] += abs(total)
        elif row.type_id == "T04":
            flows[m]["investment"] += abs(total)
        elif row.type_id == "T06":
            flows[m]["savings"] += abs(total)
    for m in flows:
        f = flows[m]
        f["net"] = round(f["income"] - f["expense"], 2)          # ahorro neto
        f["saved"] = round(f["investment"] + f["savings"], 2)    # apartado (inv + ahorro)
        f["income"] = round(f["income"], 2)
        f["expense"] = round(f["expense"], 2)
        f["investment"] = round(f["investment"], 2)
        f["savings"] = round(f["savings"], 2)
    return [flows[m] for m in range(1, 13)]


def _daily_expense(user_id: str, year: int) -> list[dict]:
    """Gasto diario (T02) del año, para el heatmap de calendario."""
    q = select(
        Transaction.op_date,
        func.sum(Transaction.amount).label("total"),
    ).where(
        Transaction.user_id == user_id,
        Transaction.is_split == False,
        Transaction.type_id == "T02",
        extract("year", Transaction.op_date) == year,
    ).group_by(Transaction.op_date)
    return [{"date": row.op_date.isoformat(), "amount": round(abs(float(row.total or 0)), 2)}
            for row in db.session.execute(q)]


def _top_categories(user_id: str, year: int, limit: int = 6) -> list[dict]:
    """Top categorías de gasto (T02) del año."""
    q = select(
        Transaction.category_id,
        func.sum(Transaction.amount).label("total"),
    ).where(
        Transaction.user_id == user_id,
        Transaction.is_split == False,
        Transaction.type_id == "T02",
        Transaction.category_id != None,
        extract("year", Transaction.op_date) == year,
    ).group_by(Transaction.category_id)

    cats = {c.id: c for c in db.session.execute(select(TxCategory)).scalars().all()}
    rows = [(row.category_id, abs(float(row.total or 0))) for row in db.session.execute(q)]
    rows.sort(key=lambda x: -x[1])
    result = []
    for cat_id, total in rows[:limit]:
        c = cats.get(cat_id)
        result.append({
            "category_id": cat_id,
            "label": c.label if c else "?",
            "icon": c.icon if c else None,
            "color": c.color if c else "#888",
            "amount": round(total, 2),
        })
    # Agrupar el resto en "Otros"
    if len(rows) > limit:
        others = sum(t for _, t in rows[limit:])
        result.append({"category_id": None, "label": "Otros", "icon": "•",
                       "color": "#64748b", "amount": round(others, 2)})
    return result


def _ytd_kpis(user_id: str, year: int) -> dict:
    """KPIs acumulados del año hasta hoy (o todo el año si es pasado)."""
    today = date.today()
    upto_month = today.month if today.year == year else 12

    # Real YTD por tipo
    q = select(Transaction.type_id, func.sum(Transaction.amount)).where(
        Transaction.user_id == user_id,
        Transaction.is_split == False,
        Transaction.category_id != None,
        extract("year", Transaction.op_date) == year,
        extract("month", Transaction.op_date) <= upto_month,
    ).group_by(Transaction.type_id)
    income = expense = investment = savings = 0.0
    for tid, total in db.session.execute(q):
        total = float(total or 0)
        if tid == "T01": income += total
        elif tid == "T02": expense += abs(total)
        elif tid == "T04": investment += abs(total)
        elif tid == "T06": savings += abs(total)

    # Presupuesto de gastos YTD (líneas con mes <= upto_month, o anuales prorrateadas)
    bq = select(func.sum(Budget.amount)).where(
        Budget.user_id == user_id,
        Budget.year == year,
        Budget.type_id == "T02",
        Budget.month != None,
        Budget.month <= upto_month,
    )
    budget_exp = float(db.session.execute(bq).scalar() or 0)

    rating = round(expense / budget_exp * 100, 1) if budget_exp > 0 else None
    savings_rate = round((income - expense) / income * 100, 1) if income > 0 else None

    return {
        "year": year,
        "upto_month": upto_month,
        "income_ytd": round(income, 2),
        "expense_ytd": round(expense, 2),
        "investment_ytd": round(investment, 2),
        "savings_ytd": round(savings, 2),
        "saved_ytd": round(investment + savings, 2),
        "net_ytd": round(income - expense, 2),
        "budget_expense_ytd": round(budget_exp, 2),
        "rating_ytd": rating,
        "savings_rate": savings_rate,
    }


def dashboard(user_id: str, year: int) -> dict:
    return {
        "year": year,
        "kpis": _ytd_kpis(user_id, year),
        "monthly": _month_flows(user_id, year),
        "top_categories": _top_categories(user_id, year),
        "heatmap": {
            "current": _daily_expense(user_id, year),
            "previous": _daily_expense(user_id, year - 1),
        },
    }
