from __future__ import annotations

import hashlib
import uuid
from decimal import Decimal
from io import BytesIO

import pandas as pd
from sqlalchemy import select, update

from ..extensions import db
from ..models.finance import Account, Transaction
from . import finance_service

# ── ING category → Vestra (type_id, class_id, category_id) ──────────────────
# None in category_id = Transfer / uncategorizable, leave pending

ING_MAP: dict[tuple[str, str], tuple[str, str, str | None]] = {
    # Income
    ("Nómina y otras prestaciones", "Nómina o Pensión"):        ("T01", "C01", "1"),
    ("Nómina y otras prestaciones", "Prestaciones"):            ("T01", "C01", "1"),
    ("Ingresos extra",              "Otros ingresos"):          ("T01", "C02", "25"),
    ("Transferencias",              "Transferencia recibida"):  ("T01", "C02", "25"),
    # Transfers (excluded from normal reporting)
    ("Movimientos excluidos",       "Traspaso entre cuentas"):  ("T03", "C01", None),
    ("Movimientos excluidos",       "Ingreso en cajero"):       ("T03", "C01", None),
    ("Movimientos excluidos",       "Reintegro en cajero"):     ("T03", "C01", None),
    # Fixed expenses
    ("Hogar y comunicaciones",      "Alquiler y gastos de vivienda"): ("T02", "C01", "3"),
    ("Hogar y comunicaciones",      "Suministros"):             ("T02", "C01", "3"),
    ("Hogar y comunicaciones",      "Teléfono, internet y tv"): ("T02", "C01", "4"),
    ("Seguros y finanzas",          "Seguros"):                 ("T02", "C01", "15"),
    ("Seguros y finanzas",          "Comisiones bancarias"):    ("T02", "C01", "6"),
    ("Educación, salud y deporte",  "Suscripciones"):           ("T02", "C01", "4"),
    # Variable expenses
    ("Alimentación",                "Supermercados y alimentación"): ("T02", "C02", "5"),
    ("Alimentación",                "Mercados y tiendas"):      ("T02", "C02", "5"),
    ("Ocio y viajes",               "Cafeterías y restaurantes"):("T02", "C02", "7"),
    ("Ocio y viajes",               "Hoteles y alojamiento"):   ("T02", "C02", "24"),
    ("Ocio y viajes",               "Transporte"):              ("T02", "C02", "14"),
    ("Ocio y viajes",               "Ocio y entretenimiento"):  ("T02", "C02", "18"),
    ("Vehículo y transporte",       "Gasolina y combustible"):  ("T02", "C02", "2"),
    ("Vehículo y transporte",       "Reparaciones y mantenimiento"): ("T02", "C02", "2"),
    ("Vehículo y transporte",       "Transporte público"):      ("T02", "C02", "14"),
    ("Compras",                     "Electrónica"):             ("T02", "C02", "8"),
    ("Compras",                     "Ropa y complementos"):     ("T02", "C02", "9"),
    ("Compras",                     "Compras (otros)"):         ("T02", "C02", "34"),
    ("Educación, salud y deporte",  "Educación"):               ("T02", "C02", "10"),
    ("Educación, salud y deporte",  "Salud y farmacia"):        ("T02", "C02", "16"),
    ("Educación, salud y deporte",  "Deporte"):                 ("T02", "C01", "12"),
    ("Otros gastos",                "Bizum enviado"):           ("T02", "C02", "32"),
    ("Otros gastos",                "Gasto Bizum"):             ("T02", "C02", "32"),
    ("Otros gastos",                "Otros gastos (otros)"):    ("T02", "C02", "34"),
}


def _str(val) -> str:
    """Safely convert a pandas cell to str, treating NaN/None as empty string."""
    if val is None:
        return ""
    try:
        if pd.isna(val):
            return ""
    except (TypeError, ValueError):
        pass
    return str(val).strip()


def _make_external_id(
    iban: str,
    op_date: str,
    amount: float,
    description: str,
    categoria: str,
    subcategoria: str,
    comentario: str,
    saldo: float,
) -> str:
    """
    Deduplication key uses ALL ING export fields (non-categorization).
    Two transactions with identical date+amount+description but different
    saldo (e.g., two 3€ gas station payments on the same day) are treated
    as distinct transactions.
    """
    key = f"{iban}|{op_date}|{amount}|{description}|{categoria}|{subcategoria}|{comentario}|{saldo}"
    return hashlib.md5(key.encode()).hexdigest()[:20]


def _extract_company(description: str) -> str:
    """Best-effort company name extraction from ING description strings."""
    desc = str(description or "").strip()
    for prefix in ("Pago en ", "Bizum enviado a ", "Recibo ", "Recibo GC RE ",
                   "Transferencia emitida a ", "Transferencia recibida de "):
        if desc.startswith(prefix):
            rest = desc[len(prefix):]
            # Stop at first uppercase-after-lowercase word boundary or multiple spaces
            parts = rest.split()
            company_parts = []
            for p in parts[:5]:
                company_parts.append(p)
                # If part is a 2-char country code (ES, LU, DE…) stop
                if len(p) == 2 and p.isupper():
                    break
            return " ".join(company_parts).strip()
    return desc[:40]


def parse_ing_excel(file_bytes: bytes, user_id: str) -> dict:
    """
    Parses an ING .xls movements file.
    Returns a preview dict without writing to DB.
    """
    df = pd.read_excel(BytesIO(file_bytes), engine="xlrd", header=None)

    # Row 0: ['Movimientos de la Cuenta', nan, '  Número de cuenta:', '<IBAN>']
    raw_iban = str(df.iloc[0, 3]).strip().replace(" ", "")
    # ING sometimes exports without country code (e.g. "14650100961720814434")
    # Try to resolve against known accounts or reconstruct the full IBAN
    if not (len(raw_iban) >= 2 and raw_iban[:2].isalpha()):
        # Look for an account whose IBAN ends with this number
        from ..models.finance import Account as _Account
        from sqlalchemy import select as _select
        matched = db.session.execute(
            _select(_Account).where(_Account.iban.like(f"%{raw_iban}"))
        ).scalars().first()
        if matched:
            raw_iban = matched.iban
        else:
            raw_iban = "ES??" + raw_iban  # partial IBAN, user can correct

    # Row 3: actual column headers; data from row 4 onwards
    df.columns = df.iloc[3]
    df = df.iloc[4:].reset_index(drop=True)
    df = df.dropna(subset=["F. VALOR"])

    rows = []
    for _, row in df.iterrows():
        try:
            op_date = pd.to_datetime(row["F. VALOR"]).date()
        except Exception:
            continue

        amount      = float(row["IMPORTE (€)"] or 0)
        description = _str(row.get("DESCRIPCIÓN"))
        categoria   = _str(row.get("CATEGORÍA"))
        subcategoria= _str(row.get("SUBCATEGORÍA"))
        comentario  = _str(row.get("COMENTARIO"))   # empty string if blank/NaN
        saldo       = float(row.get("SALDO (€)") or 0)

        ing_key = (categoria, subcategoria)
        suggestion = ING_MAP.get(ing_key) or ING_MAP.get((categoria, None))

        rows.append({
            "iban": raw_iban,
            "op_date": op_date.isoformat(),
            "amount": amount,
            "description": description,
            "company": _extract_company(description),
            "categoria": categoria,
            "subcategoria": subcategoria,
            "comment": comentario or None,
            "saldo": saldo,
            "external_id": _make_external_id(
                raw_iban, op_date.isoformat(), amount, description,
                categoria, subcategoria, comentario, saldo
            ),
            "suggestion": {
                "type_id": suggestion[0],
                "class_id": suggestion[1],
                "category_id": suggestion[2],
            } if suggestion else None,
        })

    return {"iban": raw_iban, "rows": rows, "total": len(rows)}


def import_ing_excel(file_bytes: bytes, user_id: str) -> dict:
    """
    Full import: parses + inserts transactions, skipping duplicates.
    Returns summary: imported, skipped, account.
    """
    preview = parse_ing_excel(file_bytes, user_id)
    iban = preview["iban"]
    rows = preview["rows"]

    # Find or create account
    account = finance_service.get_account_by_iban(user_id, iban)
    if not account:
        # Try to infer a name from ING account patterns
        account = finance_service.create_account(user_id, {
            "name": f"ING {iban[-4:]}",
            "type": "checking",
            "iban": iban,
            "country": "ES",
            "balance": rows[0]["saldo"] if rows else 0,
        })

    # Update balance with most recent saldo (first row = most recent)
    if rows:
        account.balance = Decimal(str(rows[0]["saldo"]))

    imported = 0
    skipped = 0

    for r in rows:
        # Deduplication
        existing = db.session.execute(
            select(Transaction).where(
                Transaction.external_id == r["external_id"],
                Transaction.user_id == user_id,
            )
        ).scalars().first()

        if existing:
            skipped += 1
            continue

        # Suggestion: stored but NEVER auto-applied.
        # The user sees it pre-filled in the categorization modal and must confirm.
        sug = r.get("suggestion")

        tx = Transaction(
            id=str(uuid.uuid4()),
            user_id=user_id,
            account_id=account.id,
            source="import_excel",
            external_id=r["external_id"],
            op_date=r["op_date"],
            amount=Decimal(str(r["amount"])),
            company=r["company"],
            # ING raw categories stored as description for reference
            description=f"ING: {r['categoria']} › {r['subcategoria']}" if r["categoria"] else r["description"],
            comment=r["comment"],
            # Always pending — categorization requires explicit user action
            type_id=None,
            class_id=None,
            category_id=None,
            # Suggestion fields — pre-fill the modal but do NOT categorize
            suggested_type_id=sug["type_id"] if sug else None,
            suggested_class_id=sug["class_id"] if sug else None,
            suggested_category_id=sug["category_id"] if sug else None,
            is_split=False,
            is_recurring=False,
        )
        db.session.add(tx)
        imported += 1

    db.session.commit()

    return {
        "account": finance_service.account_to_dict(account),
        "imported": imported,
        "skipped": skipped,
        "total": len(rows),
    }
