from __future__ import annotations

import uuid
from decimal import Decimal

from datetime import date as date_type

from sqlalchemy import select, func, or_, and_

from ..extensions import db
from ..models.finance import (
    Account, Transaction, TxCategory, TxClass, TxType, TxSubcategory,
)

# ── Categorization state ────────────────────────────────────────────────────
# Una transacción está "hecha" (no pendiente) si:
#   - tiene category_id, O
#   - es una Transferencia (type_id = 'T03') — el usuario las marca solo con el tipo
TRANSFER_TYPE = "T03"


def _is_done():
    """Condición SQL: transacción categorizada o transferencia."""
    return or_(Transaction.category_id != None, Transaction.type_id == TRANSFER_TYPE)


def _is_pending():
    """
    Condición SQL: pendiente de categorizar.
    Sin categoría, no transferencia (T03), y no marcado como histórico (deprecated).
    """
    return and_(
        Transaction.category_id == None,
        Transaction.type_id.is_distinct_from(TRANSFER_TYPE),
        Transaction.deprecated == False,
    )


# ── Catalogues ─────────────────────────────────────────────────────────────────

def get_catalogues(user_id: str) -> dict:
    types = db.session.execute(select(TxType)).scalars().all()
    classes = db.session.execute(select(TxClass)).scalars().all()
    categories = db.session.execute(select(TxCategory)).scalars().all()
    subcats = db.session.execute(
        select(TxSubcategory).where(TxSubcategory.user_id == user_id)
        .order_by(TxSubcategory.label)
    ).scalars().all()
    # Empresas/comercios distintos del usuario (para autocompletar)
    companies = db.session.execute(
        select(Transaction.company)
        .where(Transaction.user_id == user_id, Transaction.company != None,
               Transaction.company != "")
        .distinct().order_by(Transaction.company)
    ).scalars().all()
    return {
        "types": [{"id": t.id, "label": t.label} for t in types],
        "classes": [{"id": c.id, "label": c.label} for c in classes],
        "categories": [
            {"id": c.id, "label": c.label, "class_id": c.class_id,
             "icon": c.icon, "color": c.color}
            for c in categories
        ],
        "subcategories": [
            {"id": s.id, "category_id": s.category_id, "label": s.label}
            for s in subcats
        ],
        "companies": list(companies),
    }


# ── Subcategories ──────────────────────────────────────────────────────────────

def get_or_create_subcategory(user_id: str, category_id: str, label: str) -> str | None:
    """
    Resuelve (o crea) una subcategoría para una categoría dada.
    Búsqueda case-insensitive; devuelve el id, o None si label vacío/sin categoría.
    """
    label = (label or "").strip()
    if not label or not category_id:
        return None

    existing = db.session.execute(
        select(TxSubcategory).where(
            TxSubcategory.user_id == user_id,
            TxSubcategory.category_id == category_id,
            func.lower(TxSubcategory.label) == label.lower(),
        )
    ).scalars().first()
    if existing:
        return existing.id

    sub = TxSubcategory(
        id=str(uuid.uuid4()),
        user_id=user_id,
        category_id=category_id,
        label=label,
    )
    db.session.add(sub)
    db.session.flush()  # get id without full commit
    return sub.id


# ── Accounts ───────────────────────────────────────────────────────────────────

def list_accounts(user_id: str) -> list[Account]:
    return db.session.execute(
        select(Account).where(Account.user_id == user_id, Account.active == True)
        .order_by(Account.name)
    ).scalars().all()


def get_account(user_id: str, account_id: str) -> Account | None:
    return db.session.execute(
        select(Account).where(Account.id == account_id, Account.user_id == user_id)
    ).scalar_one_or_none()


def get_account_by_iban(user_id: str, iban: str) -> Account | None:
    return db.session.execute(
        select(Account).where(Account.user_id == user_id, Account.iban == iban)
    ).scalars().first()


def create_account(user_id: str, data: dict) -> Account:
    account = Account(
        id=str(uuid.uuid4()),
        user_id=user_id,
        name=data["name"],
        type=data.get("type", "checking"),
        iban=data.get("iban"),
        country=data.get("country", "ES"),
        balance=Decimal(str(data.get("balance", 0))),
    )
    db.session.add(account)
    db.session.commit()
    return account


def update_account(account: Account, data: dict) -> Account:
    for field in ("name", "type", "iban", "country", "balance"):
        if field in data:
            setattr(account, field, data[field])
    db.session.commit()
    return account


def delete_account(account: Account) -> None:
    account.active = False
    db.session.commit()


def account_to_dict(a: Account) -> dict:
    return {
        "id": a.id,
        "name": a.name,
        "type": a.type,
        "iban": a.iban,
        "country": a.country,
        "balance": float(a.balance),
        "active": a.active,
    }


# ── Transactions ───────────────────────────────────────────────────────────────

def _category_clause(category_id):
    """Acepta uno o varios ids de categoría separados por coma."""
    if not category_id:
        return None
    ids = [c for c in str(category_id).split(",") if c]
    return Transaction.category_id.in_(ids) if ids else None


def _search_clause(term: str):
    """Búsqueda libre en empresa, descripción, comentario y subcategoría."""
    like = f"%{term}%"
    sub_ids = select(TxSubcategory.id).where(TxSubcategory.label.ilike(like))
    return or_(
        Transaction.company.ilike(like),
        Transaction.description.ilike(like),
        Transaction.comment.ilike(like),
        Transaction.subcategory_id.in_(sub_ids),
    )


def list_transactions(user_id: str, filters: dict) -> dict:
    """Returns paginated categorized transactions."""
    q = (
        select(Transaction)
        .where(
            Transaction.user_id == user_id,
            Transaction.is_split == False,       # exclude split parents
            _is_done(),                          # categorizada o transferencia
        )
    )
    if filters.get("q"):
        q = q.where(_search_clause(filters["q"]))
    if filters.get("account_id"):
        q = q.where(Transaction.account_id == filters["account_id"])
    if filters.get("type_id"):
        q = q.where(Transaction.type_id == filters["type_id"])
    cat_clause = _category_clause(filters.get("category_id"))
    if cat_clause is not None:
        q = q.where(cat_clause)
    if filters.get("date_from"):
        q = q.where(Transaction.op_date >= filters["date_from"])
    if filters.get("date_to"):
        q = q.where(Transaction.op_date <= filters["date_to"])

    total = db.session.execute(
        select(func.count()).select_from(q.subquery())
    ).scalar()

    page = int(filters.get("page", 1))
    per_page = int(filters.get("per_page", 50))
    items = db.session.execute(
        q.order_by(Transaction.op_date.desc(),
                   Transaction.created_at.desc(), Transaction.id)
        .offset((page - 1) * per_page)
        .limit(per_page)
    ).scalars().all()

    return {
        "items": [tx_to_dict(t) for t in items],
        "total": total,
        "page": page,
        "per_page": per_page,
        "pages": (total + per_page - 1) // per_page,
    }


def list_pending(user_id: str) -> list[Transaction]:
    """Transactions awaiting categorization (sin categoría y no transferencia)."""
    return db.session.execute(
        select(Transaction)
        .where(
            Transaction.user_id == user_id,
            Transaction.is_split == False,
            Transaction.parent_id == None,
            _is_pending(),
        )
        .order_by(Transaction.op_date.desc(),
                  Transaction.created_at.desc(), Transaction.id)
    ).scalars().all()


def count_pending(user_id: str) -> int:
    return db.session.execute(
        select(func.count()).where(
            Transaction.user_id == user_id,
            Transaction.is_split == False,
            Transaction.parent_id == None,
            _is_pending(),
        )
    ).scalar()


def list_all_transactions(user_id: str, filters: dict) -> dict:
    """
    Returns ALL top-level transactions (categorized + pending + split parents).
    Split children are embedded inside their parent's 'splits' key.
    Supports full-text search across company / description / comment.
    """
    q = select(Transaction).where(
        Transaction.user_id == user_id,
        Transaction.parent_id == None,  # top-level only
    )

    # Free-text search (empresa, descripción, comentario y subcategoría)
    if filters.get("q"):
        q = q.where(_search_clause(filters["q"]))

    # Status filter
    status = filters.get("status", "all")
    if status == "pending":
        q = q.where(Transaction.is_split == False, _is_pending())
    elif status == "categorized":
        q = q.where(_is_done())
    elif status == "deprecated":
        q = q.where(Transaction.deprecated == True)
    elif status == "active":
        # Todo excepto los históricos deprecated
        q = q.where(Transaction.deprecated == False)

    if filters.get("account_id"):
        q = q.where(Transaction.account_id == filters["account_id"])
    if filters.get("type_id"):
        q = q.where(Transaction.type_id == filters["type_id"])
    cat_clause = _category_clause(filters.get("category_id"))
    if cat_clause is not None:
        q = q.where(cat_clause)
    if filters.get("date_from"):
        q = q.where(Transaction.op_date >= filters["date_from"])
    if filters.get("date_to"):
        q = q.where(Transaction.op_date <= filters["date_to"])

    total = db.session.execute(
        select(func.count()).select_from(q.subquery())
    ).scalar()

    page = int(filters.get("page", 1))
    per_page = int(filters.get("per_page", 50))
    items = db.session.execute(
        q.order_by(Transaction.op_date.desc(),
                   Transaction.created_at.desc(), Transaction.id)
        .offset((page - 1) * per_page)
        .limit(per_page)
    ).scalars().all()

    result = []
    for tx in items:
        d = tx_to_dict(tx)
        if tx.is_split:
            children = db.session.execute(
                select(Transaction)
                .where(Transaction.parent_id == tx.id)
                .order_by(Transaction.created_at)
            ).scalars().all()
            d["splits"] = [tx_to_dict(c) for c in children]
        result.append(d)

    return {
        "items": result,
        "total": total,
        "page": page,
        "per_page": per_page,
        "pages": (total + per_page - 1) // per_page,
    }


def update_transaction(tx: Transaction, data: dict) -> Transaction:
    """Full update — edits any field including date, amount, categorisation."""
    for field in ("op_date", "amount", "company", "description", "comment"):
        if field in data and data[field] is not None:
            setattr(tx, field, data[field])

    # Categorisation fields — each applied independently ('' / None clears it).
    # This supports both real categories and transfers (type T03 sin categoría).
    if "type_id" in data:
        tx.type_id = data["type_id"] or None
    if "class_id" in data:
        tx.class_id = data["class_id"] or None
    if "category_id" in data:
        tx.category_id = data["category_id"] or None

    # Subcategoría: si cambia la categoría o se limpia, recalcular.
    if "subcategory_label" in data:
        tx.subcategory_id = get_or_create_subcategory(
            tx.user_id, tx.category_id, data.get("subcategory_label")
        )
    # Si ya no hay categoría, no puede haber subcategoría
    if not tx.category_id:
        tx.subcategory_id = None

    # Si el movimiento queda "hecho" (con categoría o es transferencia T03),
    # deja de ser histórico → se quita el flag deprecated automáticamente.
    is_done = bool(tx.category_id) or tx.type_id == TRANSFER_TYPE
    if is_done:
        tx.deprecated = False

    db.session.commit()
    return tx


def unsplit_transaction(tx: Transaction) -> Transaction:
    """Deletes all split children and reverts parent to a normal pending transaction."""
    if not tx.is_split:
        raise ValueError("NOT_SPLIT")
    children = db.session.execute(
        select(Transaction).where(Transaction.parent_id == tx.id)
    ).scalars().all()
    for c in children:
        db.session.delete(c)
    tx.is_split = False
    tx.category_id = None
    tx.type_id = None
    tx.class_id = None
    db.session.commit()
    return tx


def get_transaction(user_id: str, tx_id: str) -> Transaction | None:
    return db.session.execute(
        select(Transaction).where(
            Transaction.id == tx_id, Transaction.user_id == user_id
        )
    ).scalar_one_or_none()


def categorize_transaction(tx: Transaction, data: dict) -> Transaction:
    tx.type_id = data["type_id"]
    tx.class_id = data["class_id"]
    tx.category_id = data["category_id"]
    if "company" in data:
        tx.company = data["company"]
    if "comment" in data:
        tx.comment = data["comment"]
    # Subcategoría: find-or-create dentro de la categoría asignada
    if "subcategory_label" in data:
        tx.subcategory_id = get_or_create_subcategory(
            tx.user_id, tx.category_id, data.get("subcategory_label")
        )
    tx.deprecated = False  # categorizar quita el flag histórico
    db.session.commit()
    return tx


def categorize_bulk(user_id: str, items: list[dict]) -> int:
    """
    Categoriza varias transacciones de golpe (una sola transacción de BD).
    Cada item: {id, type_id, class_id, category_id, subcategory_label?}.
    Solo aplica los que tengan type_id, class_id y category_id.
    """
    count = 0
    for item in items:
        type_id = item.get("type_id")
        is_transfer = type_id == TRANSFER_TYPE
        # Transferencia: basta el tipo. Resto: requiere tipo+clase+categoría.
        if not is_transfer and not (type_id and item.get("class_id") and item.get("category_id")):
            continue
        tx = db.session.get(Transaction, item.get("id"))
        if not tx or tx.user_id != user_id:
            continue

        if is_transfer:
            tx.type_id = TRANSFER_TYPE
            tx.class_id = None
            tx.category_id = None
            tx.subcategory_id = None
        else:
            tx.type_id = type_id
            tx.class_id = item["class_id"]
            tx.category_id = item["category_id"]
            if "subcategory_label" in item:
                tx.subcategory_id = get_or_create_subcategory(
                    user_id, item["category_id"], item.get("subcategory_label"))

        if "company" in item:
            tx.company = (item.get("company") or "").strip() or None
        if "comment" in item:
            tx.comment = (item.get("comment") or "").strip() or None
        tx.deprecated = False
        count += 1
    db.session.commit()
    return count


def split_transaction(tx: Transaction, splits: list[dict]) -> list[Transaction]:
    """
    Converts tx into a split parent + N children.
    splits = [{"amount": x, "type_id": ..., "class_id": ..., "category_id": ...,
               "company": ..., "comment": ...}, ...]
    """
    total = sum(Decimal(str(s["amount"])) for s in splits)
    if abs(total - abs(tx.amount)) > Decimal("0.01"):
        raise ValueError("SPLIT_AMOUNTS_MISMATCH")

    tx.is_split = True
    tx.category_id = None

    children = []
    for s in splits:
        child = Transaction(
            id=str(uuid.uuid4()),
            user_id=tx.user_id,
            account_id=tx.account_id,
            parent_id=tx.id,
            type_id=s["type_id"],
            class_id=s["class_id"],
            category_id=s["category_id"],
            source=tx.source,
            op_date=tx.op_date,
            amount=Decimal(str(s["amount"])),
            split_amount=Decimal(str(s["amount"])),
            company=s.get("company", tx.company),
            description=s.get("description", tx.description),
            comment=s.get("comment"),
            is_split=False,
            is_recurring=False,
        )
        db.session.add(child)
        children.append(child)

    db.session.commit()
    return children


def delete_transaction(tx: Transaction) -> None:
    # If it's a split parent, delete children too
    if tx.is_split:
        children = db.session.execute(
            select(Transaction).where(Transaction.parent_id == tx.id)
        ).scalars().all()
        for c in children:
            db.session.delete(c)
    db.session.delete(tx)
    db.session.commit()


def tx_to_dict(t: Transaction) -> dict:
    d = {
        "id": t.id,
        "account_id": t.account_id,
        "parent_id": t.parent_id,
        "type_id": t.type_id,
        "class_id": t.class_id,
        "category_id": t.category_id,
        "subcategory_id": t.subcategory_id,
        "source": t.source,
        "op_date": t.op_date.isoformat() if t.op_date else None,
        "amount": float(t.amount),
        "company": t.company,
        "description": t.description,
        "comment": t.comment,
        "is_split": t.is_split,
        "is_recurring": t.is_recurring,
        "deprecated": getattr(t, "deprecated", False),
        "created_at": t.created_at.isoformat() if t.created_at else None,
    }
    # Include suggestion fields if present (from import)
    sug_type = getattr(t, "suggested_type_id", None)
    sug_class = getattr(t, "suggested_class_id", None)
    sug_cat = getattr(t, "suggested_category_id", None)
    if sug_type or sug_class or sug_cat:
        d["suggestion"] = {
            "type_id": sug_type,
            "class_id": sug_class,
            "category_id": sug_cat,
        }
    return d
