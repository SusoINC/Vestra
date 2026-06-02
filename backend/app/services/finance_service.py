from __future__ import annotations

import uuid
from decimal import Decimal

from sqlalchemy import select, func

from ..extensions import db
from ..models.finance import Account, Transaction, TxCategory, TxClass, TxType


# ── Catalogues ─────────────────────────────────────────────────────────────────

def get_catalogues() -> dict:
    types = db.session.execute(select(TxType)).scalars().all()
    classes = db.session.execute(select(TxClass)).scalars().all()
    categories = db.session.execute(select(TxCategory)).scalars().all()
    return {
        "types": [{"id": t.id, "label": t.label} for t in types],
        "classes": [{"id": c.id, "label": c.label} for c in classes],
        "categories": [
            {"id": c.id, "label": c.label, "class_id": c.class_id,
             "icon": c.icon, "color": c.color}
            for c in categories
        ],
    }


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
    ).scalar_one_or_none()


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

def list_transactions(user_id: str, filters: dict) -> dict:
    """Returns paginated categorized transactions."""
    q = (
        select(Transaction)
        .where(
            Transaction.user_id == user_id,
            Transaction.is_split == False,       # exclude split parents
            Transaction.category_id != None,     # only categorized
        )
    )
    if filters.get("account_id"):
        q = q.where(Transaction.account_id == filters["account_id"])
    if filters.get("type_id"):
        q = q.where(Transaction.type_id == filters["type_id"])
    if filters.get("category_id"):
        q = q.where(Transaction.category_id == filters["category_id"])
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
        q.order_by(Transaction.op_date.desc())
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
    """Transactions awaiting categorization."""
    return db.session.execute(
        select(Transaction)
        .where(
            Transaction.user_id == user_id,
            Transaction.category_id == None,
            Transaction.is_split == False,
            Transaction.parent_id == None,
        )
        .order_by(Transaction.op_date.desc())
    ).scalars().all()


def count_pending(user_id: str) -> int:
    return db.session.execute(
        select(func.count()).where(
            Transaction.user_id == user_id,
            Transaction.category_id == None,
            Transaction.is_split == False,
            Transaction.parent_id == None,
        )
    ).scalar()


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
    db.session.commit()
    return tx


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
    return {
        "id": t.id,
        "account_id": t.account_id,
        "parent_id": t.parent_id,
        "type_id": t.type_id,
        "class_id": t.class_id,
        "category_id": t.category_id,
        "source": t.source,
        "op_date": t.op_date.isoformat() if t.op_date else None,
        "amount": float(t.amount),
        "company": t.company,
        "description": t.description,
        "comment": t.comment,
        "is_split": t.is_split,
        "is_recurring": t.is_recurring,
        "created_at": t.created_at.isoformat() if t.created_at else None,
    }
