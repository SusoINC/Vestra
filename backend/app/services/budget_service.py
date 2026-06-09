from __future__ import annotations

import uuid
from decimal import Decimal

from sqlalchemy import select, func, and_, or_, extract

from ..extensions import db
from ..models.finance import Budget, Transaction, TxCategory, TxSubcategory, TxType
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

def _actual_by_cat_sub(user_id: str, year: int, month: int | None) -> dict:
    """
    Gasto/ingreso real agregado por (category_id, subcategory_id) en el período.
    Solo movimientos 'hechos' que cuentan para reporting:
      is_split=False AND category_id IS NOT NULL
    Devuelve { (cat, sub|None): importe_abs_total, ... } y por categoría.
    """
    q = select(
        Transaction.category_id,
        Transaction.subcategory_id,
        Transaction.type_id,
        func.sum(Transaction.amount).label("total"),
    ).where(
        Transaction.user_id == user_id,
        Transaction.is_split == False,
        Transaction.category_id != None,
        extract("year", Transaction.op_date) == year,
    )
    if month is not None:
        q = q.where(extract("month", Transaction.op_date) == month)
    q = q.group_by(Transaction.category_id, Transaction.subcategory_id, Transaction.type_id)

    by_cat_sub = {}   # (cat, sub) -> total (signed sum)
    by_cat = {}       # cat -> total
    cat_type_weight = {}  # cat -> {type_id: abs_total} para elegir el tipo predominante
    for row in db.session.execute(q):
        cat, sub, type_id, total = (row.category_id, row.subcategory_id,
                                    row.type_id, float(row.total or 0))
        by_cat_sub[(cat, sub)] = by_cat_sub.get((cat, sub), 0) + total
        by_cat[cat] = by_cat.get(cat, 0) + total
        if type_id:
            cat_type_weight.setdefault(cat, {})
            cat_type_weight[cat][type_id] = cat_type_weight[cat].get(type_id, 0) + abs(total)
    # Tipo predominante por categoría (el de mayor importe)
    cat_type = {cat: max(w, key=w.get) for cat, w in cat_type_weight.items()}
    return {"by_cat_sub": by_cat_sub, "by_cat": by_cat, "cat_type": cat_type}


def comparison(user_id: str, year: int, month: int | None) -> dict:
    """
    Comparativa presupuesto vs real para el período.
    Para mes: usa presupuestos de ese mes + anuales (prorrateados /12 no — se muestran tal cual).
    Devuelve estructura jerárquica por categoría con sus subcategorías presupuestadas
    y el gasto no presupuestado.
    """
    budgets = list_budgets(user_id, year, month)
    actuals = _actual_by_cat_sub(user_id, year, month)
    by_cat_sub = actuals["by_cat_sub"]
    by_cat = actuals["by_cat"]
    cat_type = actuals["cat_type"]

    # Catálogos para etiquetas
    cats = {c.id: c for c in db.session.execute(select(TxCategory)).scalars().all()}
    subs = {s.id: s for s in db.session.execute(
        select(TxSubcategory).where(TxSubcategory.user_id == user_id)
    ).scalars().all()}

    # Agrupar presupuestos por categoría
    cat_budgets: dict = {}  # cat -> {"cat_level": amount, "subs": {sub_id: amount}, "type_id": ...}
    for b in budgets:
        cat = b.category_id
        if cat not in cat_budgets:
            cat_budgets[cat] = {"cat_level": 0.0, "subs": {}, "type_id": b.type_id,
                                "class_id": b.class_id, "budget_ids": []}
        cat_budgets[cat]["budget_ids"].append(b.id)
        if b.subcategory_id:
            cat_budgets[cat]["subs"][b.subcategory_id] = \
                cat_budgets[cat]["subs"].get(b.subcategory_id, 0.0) + float(b.amount)
        else:
            cat_budgets[cat]["cat_level"] += float(b.amount)

    result_cats = []
    all_cats = set(cat_budgets) | set(by_cat)
    for cat in all_cats:
        cat_info = cats.get(cat)
        cb = cat_budgets.get(cat, {"cat_level": 0.0, "subs": {}, "type_id": None,
                                   "class_id": None, "budget_ids": []})
        # Presupuesto de la categoría = TODAS sus líneas (nivel categoría + subcategorías)
        budget_cat = cb["cat_level"] + sum(cb["subs"].values())
        actual_cat = abs(by_cat.get(cat, 0.0))

        # Subcategorías: presupuestadas + las que tienen gasto real
        sub_rows = []
        budgeted_subs = set(cb["subs"].keys())
        spent_subs = {sub for (c, sub) in by_cat_sub if c == cat and sub}
        for sub_id in budgeted_subs | spent_subs:
            sinfo = subs.get(sub_id)
            b_amt = cb["subs"].get(sub_id, 0.0)
            a_amt = abs(by_cat_sub.get((cat, sub_id), 0.0))
            sub_rows.append({
                "subcategory_id": sub_id,
                "subcategory_label": sinfo.label if sinfo else "?",
                "budget": round(b_amt, 2),
                "actual": round(a_amt, 2),
                "budgeted": sub_id in budgeted_subs,
            })
        sub_rows.sort(key=lambda x: (-x["budget"], -x["actual"]))

        # Gasto sin subcategoría asignada (cat, None)
        unsub_actual = abs(by_cat_sub.get((cat, None), 0.0))

        result_cats.append({
            "category_id": cat,
            "category_label": cat_info.label if cat_info else "?",
            "category_icon": cat_info.icon if cat_info else None,
            "category_color": cat_info.color if cat_info else None,
            # Tipo: del presupuesto si lo tiene, si no del movimiento real
            "type_id": cb["type_id"] or cat_type.get(cat),
            "budget": round(budget_cat, 2),
            "actual": round(actual_cat, 2),
            "remaining": round(budget_cat - actual_cat, 2),
            "pct": round(actual_cat / budget_cat * 100, 1) if budget_cat > 0 else None,
            "has_budget": bool(cb["budget_ids"]),
            "subcategories": sub_rows,
            "unsubcategorized_actual": round(unsub_actual, 2),
        })

    # ── Agrupar categorías por tipo, con rating agregado ──────────────────
    # Orden de tipos: Ingreso, Gasto, Inversión, Deuda, (otros)
    TYPE_ORDER = {"T01": 0, "T02": 1, "T04": 2, "T05": 3}
    type_labels = {t.id: t.label for t in
                   db.session.execute(select(TxType)).scalars().all()}

    groups_map: dict = {}
    for c in result_cats:
        tid = c["type_id"] or "??"
        groups_map.setdefault(tid, []).append(c)

    groups = []
    for tid, cats_in in groups_map.items():
        # Ordenar categorías por rating (% desc); las sin presupuesto al final
        cats_in.sort(key=lambda x: (x["pct"] is None, -(x["pct"] or 0), -x["actual"]))
        g_budget = sum(c["budget"] for c in cats_in)
        g_actual = sum(c["actual"] for c in cats_in)
        groups.append({
            "type_id": tid if tid != "??" else None,
            "type_label": type_labels.get(tid, "Sin tipo"),
            "budget": round(g_budget, 2),
            "actual": round(g_actual, 2),
            "pct": round(g_actual / g_budget * 100, 1) if g_budget > 0 else None,
            "categories": cats_in,
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

    # Totales (solo gastos, type T02; ingresos aparte)
    total_budget_exp = sum(c["budget"] for c in result_cats if c["type_id"] != "T01")
    total_actual_exp = sum(c["actual"] for c in result_cats if c["type_id"] != "T01")

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
