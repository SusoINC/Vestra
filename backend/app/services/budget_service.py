from __future__ import annotations

import uuid
from decimal import Decimal

from sqlalchemy import select, func, and_, or_, extract

from ..extensions import db
from ..models.finance import (
    Budget, Transaction, TxCategory, TxSubcategory, TxType, TxClass,
)
from .finance_service import get_or_create_subcategory


# ── Serializer ──────────────────────────────────────────────────────────────

def budget_to_dict(b: Budget) -> dict:
    return {
        "id": b.id,
        "type_id": b.type_id,
        "class_id": b.class_id,
        "category_id": b.category_id,
        "subcategory_id": b.subcategory_id,
        "year": b.year,
        "month": b.month,
        "day": b.day,
        "amount": float(b.amount),
        "notes": b.notes,
    }


# ── CRUD ────────────────────────────────────────────────────────────────────

def list_budgets(user_id: str, year: int, month: int | None) -> list[Budget]:
    """Lista presupuestos de un período. month=None → todo el año (incl. anuales)."""
    q = select(Budget).where(Budget.user_id == user_id, Budget.year == year)
    if month is not None:
        # Vista mensual: SOLO los presupuestos de ese mes.
        # Los anuales (month NULL) se comparan únicamente en la vista "Todo el año".
        q = q.where(Budget.month == month)
    # month is None → vista anual: devuelve TODO (mensuales + anuales)
    return db.session.execute(
        q.order_by(Budget.type_id, Budget.category_id,
                   Budget.subcategory_id.nullsfirst(), Budget.month, Budget.day)
    ).scalars().all()


def create_budgets(user_id: str, data: dict) -> list[Budget]:
    """
    Crea una o varias líneas de presupuesto.
    data = {
      type_id, class_id, category_id, subcategory_id?, notes?,
      year,
      months: [1,2,3...] | None  (None = presupuesto anual, month=NULL),
      amount: número  (mismo importe en todos los meses)  -- o --
      amounts: {"1": 100, "2": 120, ...}  (importe por mes)
    }
    """
    year = int(data["year"])
    months = data.get("months")  # list or None
    day = data.get("day")  # día del mes (mismo para todos los meses recurrentes)
    amount_single = data.get("amount")
    amounts_map = data.get("amounts") or {}

    category_id = data.get("category_id")
    # Resolver subcategoría: por label (find-or-create) o id directo
    if data.get("subcategory_label"):
        subcategory_id = get_or_create_subcategory(
            user_id, category_id, data["subcategory_label"])
    else:
        subcategory_id = data.get("subcategory_id") or None

    base = dict(
        user_id=user_id,
        type_id=data.get("type_id"),
        class_id=data["class_id"],
        category_id=category_id,
        subcategory_id=subcategory_id,
        notes=data.get("notes"),
        year=year,
    )

    created = []
    targets = months if months else [None]  # None = anual (sin mes ni día)
    for m in targets:
        amt = amounts_map.get(str(m)) if amounts_map else amount_single
        if amt is None:
            continue
        b = Budget(id=str(uuid.uuid4()), month=m,
                   day=(day if m is not None else None),
                   amount=Decimal(str(amt)), **base)
        db.session.add(b)
        created.append(b)
    db.session.commit()
    return created


def get_budget(user_id: str, budget_id: str) -> Budget | None:
    return db.session.execute(
        select(Budget).where(Budget.id == budget_id, Budget.user_id == user_id)
    ).scalars().first()


def update_budget(b: Budget, data: dict) -> Budget:
    for field in ("type_id", "class_id", "category_id",
                  "year", "month", "day", "notes"):
        if field in data:
            setattr(b, field, data[field] if data[field] != "" else None)

    # Subcategoría: por label (find-or-create) o id directo
    if "subcategory_label" in data:
        label = data.get("subcategory_label")
        if label:
            b.subcategory_id = get_or_create_subcategory(b.user_id, b.category_id, label)
        else:
            b.subcategory_id = None
    elif "subcategory_id" in data:
        b.subcategory_id = data["subcategory_id"] or None

    # Si no hay categoría, no puede haber subcategoría
    if not b.category_id:
        b.subcategory_id = None

    if "amount" in data and data["amount"] is not None:
        b.amount = Decimal(str(data["amount"]))
    db.session.commit()
    return b


def delete_budget(b: Budget) -> None:
    db.session.delete(b)
    db.session.commit()


# ── Comparativa presupuesto vs real ─────────────────────────────────────────

def report_value(type_id: str | None, total: float) -> float:
    """
    Magnitud de reporting respetando el signo:
      - Ingreso (T01): entradas en positivo → tal cual.
      - Resto (gasto/inversión/ahorro/deuda): salida en positivo → -total.
        Un reembolso (importe positivo en una categoría de gasto) RESTA.
    """
    return total if type_id == "T01" else -total


def _actuals(user_id: str, year: int, month: int | None) -> dict:
    """
    Gasto/ingreso real (con signo) por (class_id, category_id, subcategory_id).
    Solo movimientos 'hechos': is_split=False AND category_id IS NOT NULL.
    """
    q = select(
        Transaction.type_id,
        Transaction.class_id,
        Transaction.category_id,
        Transaction.subcategory_id,
        func.sum(Transaction.amount).label("total"),
    ).where(
        Transaction.user_id == user_id,
        Transaction.is_split == False,
        Transaction.category_id != None,
        extract("year", Transaction.op_date) == year,
    )
    if month is not None:
        q = q.where(extract("month", Transaction.op_date) == month)
    q = q.group_by(Transaction.type_id, Transaction.class_id,
                   Transaction.category_id, Transaction.subcategory_id)

    by_tccs = {}          # (type, class, cat, sub) -> valor de reporting (con signo)
    by_tcc = {}           # (type, class, cat) -> valor de reporting
    for row in db.session.execute(q):
        tid, cl, cat, sub, total = (row.type_id, row.class_id, row.category_id,
                                    row.subcategory_id, float(row.total or 0))
        rep = report_value(tid, total)
        by_tccs[(tid, cl, cat, sub)] = by_tccs.get((tid, cl, cat, sub), 0) + rep
        by_tcc[(tid, cl, cat)] = by_tcc.get((tid, cl, cat), 0) + rep
    return {"by_tccs": by_tccs, "by_tcc": by_tcc}


def comparison(user_id: str, year: int, month: int | None) -> dict:
    """
    Comparativa presupuesto vs real para el período.
    Para mes: usa presupuestos de ese mes + anuales (prorrateados /12 no — se muestran tal cual).
    Devuelve estructura jerárquica por categoría con sus subcategorías presupuestadas
    y el gasto no presupuestado.
    """
    budgets = list_budgets(user_id, year, month)
    actuals = _actuals(user_id, year, month)
    by_tccs = actuals["by_tccs"]        # (type, class, cat, sub) -> signed
    by_tcc = actuals["by_tcc"]          # (type, class, cat) -> signed

    # Catálogos para etiquetas
    cats = {c.id: c for c in db.session.execute(select(TxCategory)).scalars().all()}
    subs = {s.id: s for s in db.session.execute(
        select(TxSubcategory).where(TxSubcategory.user_id == user_id)
    ).scalars().all()}
    type_labels = {t.id: t.label for t in
                   db.session.execute(select(TxType)).scalars().all()}
    class_labels = {c.id: c.label for c in
                    db.session.execute(select(TxClass)).scalars().all()}

    # Presupuestos agrupados por (type, class, cat) — el tipo separa p.ej. Vacations gasto vs ahorro
    cc_budgets: dict = {}  # (type, class, cat) -> {"cat_level":x, "subs":{sub:x}, "ids":[]}
    for b in budgets:
        key = (b.type_id, b.class_id, b.category_id)
        if key not in cc_budgets:
            cc_budgets[key] = {"cat_level": 0.0, "subs": {}, "ids": []}
        cc_budgets[key]["ids"].append(b.id)
        if b.subcategory_id:
            cc_budgets[key]["subs"][b.subcategory_id] = \
                cc_budgets[key]["subs"].get(b.subcategory_id, 0.0) + float(b.amount)
        else:
            cc_budgets[key]["cat_level"] += float(b.amount)

    # Construir nodos por (type, class, cat)
    nodes = []
    all_keys = set(cc_budgets) | set(by_tcc)
    for (tid, cl, cat) in all_keys:
        cat_info = cats.get(cat)
        cb = cc_budgets.get((tid, cl, cat), {"cat_level": 0.0, "subs": {}, "ids": []})
        budget_node = cb["cat_level"] + sum(cb["subs"].values())
        actual_node = by_tcc.get((tid, cl, cat), 0.0)  # ya con signo (reembolsos restan)

        # Subcategorías de este tipo+clase+categoría
        budgeted_subs = set(cb["subs"].keys())
        spent_subs = {s for (t2, c2, cat2, s) in by_tccs if t2 == tid and c2 == cl and cat2 == cat and s}
        sub_rows = []
        for sub_id in budgeted_subs | spent_subs:
            sinfo = subs.get(sub_id)
            sub_rows.append({
                "subcategory_id": sub_id,
                "subcategory_label": sinfo.label if sinfo else "?",
                "budget": round(cb["subs"].get(sub_id, 0.0), 2),
                "actual": round(by_tccs.get((tid, cl, cat, sub_id), 0.0), 2),
                "budgeted": sub_id in budgeted_subs,
            })
        sub_rows.sort(key=lambda x: (-x["budget"], -x["actual"]))

        nodes.append({
            "class_id": cl,
            "category_id": cat,
            "category_label": cat_info.label if cat_info else "?",
            "category_icon": cat_info.icon if cat_info else None,
            "category_color": cat_info.color if cat_info else None,
            "type_id": tid,
            "budget": round(budget_node, 2),
            "actual": round(actual_node, 2),
            "remaining": round(budget_node - actual_node, 2),
            "pct": round(actual_node / budget_node * 100, 1) if budget_node > 0 else None,
            "has_budget": bool(cb["ids"]),
            "subcategories": sub_rows,
        })

    # ── Jerarquía: Tipo → Clase → Categoría ───────────────────────────────
    TYPE_ORDER = {"T01": 0, "T04": 1, "T06": 2, "T02": 3, "T05": 4}
    CLASS_ORDER = {"C01": 0, "C02": 1, "C03": 2, "C04": 3}

    type_map: dict = {}  # type -> {class -> [nodes]}
    for n in nodes:
        tid = n["type_id"] or "??"
        type_map.setdefault(tid, {}).setdefault(n["class_id"] or "??", []).append(n)

    def _rating(actual, budget):
        return round(actual / budget * 100, 1) if budget > 0 else None

    groups = []
    for tid, classes in type_map.items():
        class_list = []
        for clid, cat_nodes in classes.items():
            cat_nodes.sort(key=lambda x: (x["pct"] is None, -(x["pct"] or 0), -x["actual"]))
            cl_budget = sum(c["budget"] for c in cat_nodes)
            cl_actual = sum(c["actual"] for c in cat_nodes)
            class_list.append({
                "class_id": clid if clid != "??" else None,
                "class_label": class_labels.get(clid, "Sin clase"),
                "budget": round(cl_budget, 2),
                "actual": round(cl_actual, 2),
                "pct": _rating(cl_actual, cl_budget),
                "categories": cat_nodes,
            })
        class_list.sort(key=lambda c: CLASS_ORDER.get(c["class_id"], 99))
        g_budget = sum(c["budget"] for c in class_list)
        g_actual = sum(c["actual"] for c in class_list)
        groups.append({
            "type_id": tid if tid != "??" else None,
            "type_label": type_labels.get(tid, "Sin tipo"),
            "budget": round(g_budget, 2),
            "actual": round(g_actual, 2),
            "pct": _rating(g_actual, g_budget),
            "classes": class_list,
        })
    groups.sort(key=lambda g: TYPE_ORDER.get(g["type_id"], 99))

    # ── Sin categoría: movimientos y líneas de presupuesto sin categorizar ──
    # (excluye transferencias T03 y splits, que cuentan como "hechos")
    unq = select(func.sum(Transaction.amount), func.count()).where(
        Transaction.user_id == user_id,
        Transaction.is_split == False,
        Transaction.category_id == None,
        Transaction.type_id.is_distinct_from("T03"),
        extract("year", Transaction.op_date) == year,
    )
    if month is not None:
        unq = unq.where(extract("month", Transaction.op_date) == month)
    urow = db.session.execute(unq).first()
    # Sin categoría son salidas pendientes → mostramos -suma (un reembolso resta)
    uncat_actual = -float(urow[0] or 0)
    uncat_count = int(urow[1] or 0)

    # Líneas de presupuesto sin categoría (de las del período)
    uncat_budget = sum(float(b.amount) for b in budgets if not b.category_id)

    uncategorized = {
        "actual": round(uncat_actual, 2),
        "budget": round(uncat_budget, 2),
        "count": uncat_count,
    } if (uncat_actual or uncat_budget or uncat_count) else None

    # Totales (solo gastos: todo lo que no es ingreso T01)
    total_budget_exp = sum(n["budget"] for n in nodes if n["type_id"] != "T01")
    total_actual_exp = sum(n["actual"] for n in nodes if n["type_id"] != "T01")

    return {
        "year": year,
        "month": month,
        "groups": groups,
        "uncategorized": uncategorized,
        "totals": {
            "budget_expenses": round(total_budget_exp, 2),
            "actual_expenses": round(total_actual_exp, 2),
            "remaining_expenses": round(total_budget_exp - total_actual_exp, 2),
        },
    }


# ── Resumen anual (para la pestaña "Resumen") ────────────────────────────────

def annual_summary(user_id: str, year: int) -> dict:
    """
    Resumen anual: presupuesto vs real de gastos por mes, y evolución mensual
    del gasto real por categoría (para gráfico de líneas).
    """
    # Real de gastos (T02) por mes y categoría
    q = select(
        extract("month", Transaction.op_date).label("m"),
        Transaction.category_id,
        func.sum(Transaction.amount).label("total"),
    ).where(
        Transaction.user_id == user_id,
        Transaction.is_split == False,
        Transaction.type_id == "T02",
        Transaction.category_id != None,
        extract("year", Transaction.op_date) == year,
    ).group_by("m", Transaction.category_id)

    actual_by_month = {m: 0.0 for m in range(1, 13)}
    cat_month = {}  # cat -> {m: total}
    cat_total = {}  # cat -> total año
    for row in db.session.execute(q):
        m = int(row.m)
        amt = -float(row.total or 0)  # gasto (T02): salida positiva, reembolso resta
        actual_by_month[m] += amt
        cat_month.setdefault(row.category_id, {})[m] = amt
        cat_total[row.category_id] = cat_total.get(row.category_id, 0) + amt

    # ── Balance mensual: ingresos vs gastos/inversión/ahorro (real y ppto) ──
    # Real por (mes, tipo)
    aq2 = select(
        extract("month", Transaction.op_date).label("m"),
        Transaction.type_id, func.sum(Transaction.amount),
    ).where(
        Transaction.user_id == user_id,
        Transaction.is_split == False,
        Transaction.category_id != None,
        extract("year", Transaction.op_date) == year,
    ).group_by("m", Transaction.type_id)
    act = {}  # (mes, tipo) -> valor reporting
    for m, tid, total in db.session.execute(aq2):
        act[(int(m), tid)] = act.get((int(m), tid), 0) + report_value(tid, float(total or 0))

    # Presupuesto por (mes, tipo)
    bq = select(
        Budget.month, Budget.type_id, func.sum(Budget.amount),
    ).where(
        Budget.user_id == user_id, Budget.year == year, Budget.month != None,
    ).group_by(Budget.month, Budget.type_id)
    bud = {}
    for m, tid, total in db.session.execute(bq):
        bud[(int(m), tid)] = bud.get((int(m), tid), 0) + float(total or 0)

    monthly = []
    for m in range(1, 13):
        inc_a, inc_b = act.get((m, "T01"), 0), bud.get((m, "T01"), 0)
        exp_a, exp_b = act.get((m, "T02"), 0), bud.get((m, "T02"), 0)
        inv_a, inv_b = act.get((m, "T04"), 0), bud.get((m, "T04"), 0)
        sav_a, sav_b = act.get((m, "T06"), 0), bud.get((m, "T06"), 0)
        monthly.append({
            "month": m,
            "income": round(inc_a, 2), "income_budget": round(inc_b, 2),
            "expense": round(exp_a, 2), "expense_budget": round(exp_b, 2),
            "investment": round(inv_a, 2), "investment_budget": round(inv_b, 2),
            "savings": round(sav_a, 2), "savings_budget": round(sav_b, 2),
            "out_actual": round(exp_a + inv_a + sav_a, 2),
            "out_budget": round(exp_b + inv_b + sav_b, 2),
        })

    # Top categorías por gasto anual → series mensuales para líneas
    cats = {c.id: c for c in db.session.execute(select(TxCategory)).scalars().all()}
    top = sorted(cat_total.items(), key=lambda x: -x[1])[:6]
    series = []
    for cat_id, _tot in top:
        c = cats.get(cat_id)
        series.append({
            "category_id": cat_id,
            "label": c.label if c else "?",
            "color": c.color if c else "#888",
            "values": [round(cat_month.get(cat_id, {}).get(m, 0.0), 2) for m in range(1, 13)],
        })

    return {
        "year": year,
        "monthly": monthly,
        "category_series": series,
        "matrix": _annual_matrix(user_id, year),
    }


def _annual_matrix(user_id: str, year: int) -> list[dict]:
    """
    Matriz presupuesto status: filas (tipo→clase→categoría), columnas 12 meses.
    Cada celda: {budget, actual, pct}. Para tabla con color coding.
    """
    cats = {c.id: c for c in db.session.execute(select(TxCategory)).scalars().all()}
    class_labels = {c.id: c.label for c in db.session.execute(select(TxClass)).scalars().all()}
    type_labels = {t.id: t.label for t in db.session.execute(select(TxType)).scalars().all()}

    # Presupuesto por (class, cat, month)
    bq = select(
        Budget.type_id, Budget.class_id, Budget.category_id, Budget.month,
        func.sum(Budget.amount),
    ).where(
        Budget.user_id == user_id, Budget.year == year, Budget.month != None,
    ).group_by(Budget.type_id, Budget.class_id, Budget.category_id, Budget.month)

    rows: dict = {}  # (type, class, cat) -> {budget[m], actual[m]}

    def _row(tid, cl, cat):
        key = (tid, cl, cat)
        if key not in rows:
            rows[key] = {"type_id": tid, "class_id": cl, "category_id": cat,
                         "budget": {}, "actual": {}}
        return rows[key]

    for tid, cl, cat, m, amt in db.session.execute(bq):
        _row(tid, cl, cat)["budget"][int(m)] = float(amt or 0)

    # Real por (class, cat, month)
    aq = select(
        Transaction.type_id, Transaction.class_id, Transaction.category_id,
        extract("month", Transaction.op_date).label("m"),
        func.sum(Transaction.amount),
    ).where(
        Transaction.user_id == user_id,
        Transaction.is_split == False,
        Transaction.category_id != None,
        extract("year", Transaction.op_date) == year,
    ).group_by(Transaction.type_id, Transaction.class_id, Transaction.category_id, "m")

    for tid, cl, cat, m, amt in db.session.execute(aq):
        rd = _row(tid, cl, cat)["actual"]
        rd[int(m)] = rd.get(int(m), 0.0) + report_value(tid, float(amt or 0))

    # Orden de la matriz: Ingreso → Inversión → Ahorro → Gasto → Deuda
    TYPE_ORDER = {"T01": 0, "T04": 1, "T06": 2, "T02": 3, "T05": 4}
    CLASS_ORDER = {"C01": 0, "C02": 1, "C03": 2, "C04": 3}

    # Mes de corte para el YTD: mes actual si es el año en curso, si no diciembre
    from datetime import date as _date
    today = _date.today()
    ytd_month = today.month if today.year == year else 12

    out = []
    for (_tid, cl, cat), r in rows.items():
        cells = []
        tot_b = tot_a = 0.0
        ytd_b = ytd_a = 0.0
        for m in range(1, 13):
            b = round(r["budget"].get(m, 0.0), 2)
            a = round(r["actual"].get(m, 0.0), 2)
            tot_b += b
            tot_a += a
            if m <= ytd_month:
                ytd_b += b
                ytd_a += a
            cells.append({
                "month": m, "budget": b, "actual": a,
                "pct": round(a / b * 100, 1) if b > 0 else None,
            })
        c_info = cats.get(cat)
        out.append({
            "type_id": r["type_id"],
            "type_label": type_labels.get(r["type_id"], "—"),
            "class_id": cl,
            "class_label": class_labels.get(cl, "—"),
            "category_id": cat,
            "category_label": c_info.label if c_info else "?",
            "category_icon": c_info.icon if c_info else None,
            "cells": cells,
            "total_budget": round(tot_b, 2),
            "total_actual": round(tot_a, 2),
            "total_pct": round(tot_a / tot_b * 100, 1) if tot_b > 0 else None,
            # YTD: solo hasta el mes actual (no distorsiona con presupuesto futuro)
            "ytd_budget": round(ytd_b, 2),
            "ytd_actual": round(ytd_a, 2),
            "ytd_pct": round(ytd_a / ytd_b * 100, 1) if ytd_b > 0 else None,
        })
    out.sort(key=lambda r: (TYPE_ORDER.get(r["type_id"], 99),
                            CLASS_ORDER.get(r["class_id"], 99),
                            -r["total_actual"]))
    return out


_MES_ABBR = ["Ene", "Feb", "Mar", "Abr", "May", "Jun",
             "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"]


def category_timeline(user_id: str, category_id: str, year: int, month: int,
                      type_id: str | None = None, back: int = 6, fwd: int = 3) -> list[dict]:
    """Presupuesto vs real de una categoría (del tipo dado, por defecto gasto T02)
    en una ventana de meses [month-back .. month+fwd], cruzando años si hace falta."""
    type_id = type_id or "T02"
    months = []
    for off in range(-back, fwd + 1):
        idx = year * 12 + (month - 1) + off
        y, m = idx // 12, idx % 12 + 1
        months.append((y, m))
    years = sorted({y for y, _ in months})

    bq = select(Budget.year, Budget.month, func.sum(Budget.amount)).where(
        Budget.user_id == user_id, Budget.category_id == category_id,
        Budget.type_id == type_id, Budget.month != None, Budget.year.in_(years),
    ).group_by(Budget.year, Budget.month)
    bud = {(int(r[0]), int(r[1])): float(r[2] or 0) for r in db.session.execute(bq)}

    aq = select(
        extract("year", Transaction.op_date), extract("month", Transaction.op_date),
        func.sum(Transaction.amount),
    ).where(
        Transaction.user_id == user_id, Transaction.is_split == False,
        Transaction.category_id == category_id, Transaction.type_id == type_id,
        extract("year", Transaction.op_date).in_(years),
    ).group_by(extract("year", Transaction.op_date), extract("month", Transaction.op_date))
    act = {}
    for yy, mm, total in db.session.execute(aq):
        act[(int(yy), int(mm))] = act.get((int(yy), int(mm)), 0.0) + report_value(type_id, float(total or 0))

    return [{
        "year": y, "month": m,
        "label": f"{_MES_ABBR[m - 1]} {str(y)[2:]}",
        "current": (y == year and m == month),
        "budget": round(bud.get((y, m), 0.0), 2),
        "actual": round(act.get((y, m), 0.0), 2),
    } for (y, m) in months]
