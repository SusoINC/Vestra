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
        q.order_by(Budget.category_id, Budget.subcategory_id)
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

def _actuals(user_id: str, year: int, month: int | None) -> dict:
    """
    Gasto/ingreso real agregado por (class_id, category_id, subcategory_id).
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

    by_ccs = {}           # (class, cat, sub) -> signed sum
    by_cc = {}            # (class, cat) -> signed sum
    cat_type_weight = {}  # cat -> {type: abs} para el tipo predominante
    for row in db.session.execute(q):
        cl, cat, sub, total = (row.class_id, row.category_id,
                               row.subcategory_id, float(row.total or 0))
        by_ccs[(cl, cat, sub)] = by_ccs.get((cl, cat, sub), 0) + total
        by_cc[(cl, cat)] = by_cc.get((cl, cat), 0) + total
        if row.type_id:
            cat_type_weight.setdefault(cat, {})
            cat_type_weight[cat][row.type_id] = \
                cat_type_weight[cat].get(row.type_id, 0) + abs(total)
    return {"by_ccs": by_ccs, "by_cc": by_cc, "cat_type_weight": cat_type_weight}


def comparison(user_id: str, year: int, month: int | None) -> dict:
    """
    Comparativa presupuesto vs real para el período.
    Para mes: usa presupuestos de ese mes + anuales (prorrateados /12 no — se muestran tal cual).
    Devuelve estructura jerárquica por categoría con sus subcategorías presupuestadas
    y el gasto no presupuestado.
    """
    budgets = list_budgets(user_id, year, month)
    actuals = _actuals(user_id, year, month)
    by_ccs = actuals["by_ccs"]          # (class, cat, sub) -> signed
    by_cc = actuals["by_cc"]            # (class, cat) -> signed
    cat_type_weight = actuals["cat_type_weight"]

    # Catálogos para etiquetas
    cats = {c.id: c for c in db.session.execute(select(TxCategory)).scalars().all()}
    subs = {s.id: s for s in db.session.execute(
        select(TxSubcategory).where(TxSubcategory.user_id == user_id)
    ).scalars().all()}
    type_labels = {t.id: t.label for t in
                   db.session.execute(select(TxType)).scalars().all()}
    class_labels = {c.id: c.label for c in
                    db.session.execute(select(TxClass)).scalars().all()}

    # Presupuestos agrupados por (class, cat)
    cc_budgets: dict = {}  # (class, cat) -> {"cat_level":x, "subs":{sub:x}, "type":t, "ids":[]}
    for b in budgets:
        key = (b.class_id, b.category_id)
        if key not in cc_budgets:
            cc_budgets[key] = {"cat_level": 0.0, "subs": {}, "type": b.type_id, "ids": []}
        cc_budgets[key]["ids"].append(b.id)
        if b.subcategory_id:
            cc_budgets[key]["subs"][b.subcategory_id] = \
                cc_budgets[key]["subs"].get(b.subcategory_id, 0.0) + float(b.amount)
        else:
            cc_budgets[key]["cat_level"] += float(b.amount)
        if b.type_id:
            cat_type_weight.setdefault(b.category_id, {})
            cat_type_weight[b.category_id][b.type_id] = \
                cat_type_weight[b.category_id].get(b.type_id, 0) + abs(float(b.amount))

    cat_type = {cat: max(w, key=w.get) for cat, w in cat_type_weight.items()}

    # Construir nodos por (class, cat)
    nodes = []
    all_cc = set(cc_budgets) | set(by_cc)
    for (cl, cat) in all_cc:
        cat_info = cats.get(cat)
        cb = cc_budgets.get((cl, cat), {"cat_level": 0.0, "subs": {}, "type": None, "ids": []})
        budget_node = cb["cat_level"] + sum(cb["subs"].values())
        actual_node = abs(by_cc.get((cl, cat), 0.0))

        # Subcategorías de esta clase+categoría
        budgeted_subs = set(cb["subs"].keys())
        spent_subs = {s for (c2, cat2, s) in by_ccs if c2 == cl and cat2 == cat and s}
        sub_rows = []
        for sub_id in budgeted_subs | spent_subs:
            sinfo = subs.get(sub_id)
            sub_rows.append({
                "subcategory_id": sub_id,
                "subcategory_label": sinfo.label if sinfo else "?",
                "budget": round(cb["subs"].get(sub_id, 0.0), 2),
                "actual": round(abs(by_ccs.get((cl, cat, sub_id), 0.0)), 2),
                "budgeted": sub_id in budgeted_subs,
            })
        sub_rows.sort(key=lambda x: (-x["budget"], -x["actual"]))

        nodes.append({
            "class_id": cl,
            "category_id": cat,
            "category_label": cat_info.label if cat_info else "?",
            "category_icon": cat_info.icon if cat_info else None,
            "category_color": cat_info.color if cat_info else None,
            "type_id": cb["type"] or cat_type.get(cat),
            "budget": round(budget_node, 2),
            "actual": round(actual_node, 2),
            "remaining": round(budget_node - actual_node, 2),
            "pct": round(actual_node / budget_node * 100, 1) if budget_node > 0 else None,
            "has_budget": bool(cb["ids"]),
            "subcategories": sub_rows,
        })

    # ── Jerarquía: Tipo → Clase → Categoría ───────────────────────────────
    TYPE_ORDER = {"T01": 0, "T02": 1, "T04": 2, "T05": 3}
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
    uncat_actual = abs(float(urow[0] or 0))
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
        amt = abs(float(row.total or 0))
        actual_by_month[m] += amt
        cat_month.setdefault(row.category_id, {})[m] = amt
        cat_total[row.category_id] = cat_total.get(row.category_id, 0) + amt

    # Presupuesto de gastos (T02) por mes
    bq = select(
        Budget.month, func.sum(Budget.amount).label("total"),
    ).where(
        Budget.user_id == user_id,
        Budget.year == year,
        Budget.type_id == "T02",
        Budget.month != None,
    ).group_by(Budget.month)
    budget_by_month = {m: 0.0 for m in range(1, 13)}
    for row in db.session.execute(bq):
        budget_by_month[int(row.month)] = float(row.total or 0)

    monthly = [{
        "month": m,
        "budget": round(budget_by_month[m], 2),
        "actual": round(actual_by_month[m], 2),
    } for m in range(1, 13)]

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

    rows: dict = {}  # (class, cat) -> {type, budget[m], actual[m]}

    def _row(cl, cat, tid):
        key = (cl, cat)
        if key not in rows:
            rows[key] = {"type_id": tid, "class_id": cl, "category_id": cat,
                         "budget": {}, "actual": {}}
        if tid and not rows[key]["type_id"]:
            rows[key]["type_id"] = tid
        return rows[key]

    for tid, cl, cat, m, amt in db.session.execute(bq):
        _row(cl, cat, tid)["budget"][int(m)] = float(amt or 0)

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
        _row(cl, cat, tid)["actual"][int(m)] = abs(float(amt or 0))

    TYPE_ORDER = {"T01": 0, "T02": 1, "T04": 2, "T05": 3}
    CLASS_ORDER = {"C01": 0, "C02": 1, "C03": 2, "C04": 3}

    out = []
    for (cl, cat), r in rows.items():
        cells = []
        tot_b = tot_a = 0.0
        for m in range(1, 13):
            b = round(r["budget"].get(m, 0.0), 2)
            a = round(r["actual"].get(m, 0.0), 2)
            tot_b += b
            tot_a += a
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
        })
    out.sort(key=lambda r: (TYPE_ORDER.get(r["type_id"], 99),
                            CLASS_ORDER.get(r["class_id"], 99),
                            -r["total_actual"]))
    return out
