#!/usr/bin/env python3
"""
migrate_legacy.py — Migra TODOS los datos de la app legacy (MariaDB dump) a Vestra.

Migra: transacciones, cuentas, carteras, plataformas, símbolos,
operaciones de inversión, precios de mercado y presupuestos.

Idempotente: se puede ejecutar varias veces sin duplicar datos.

IMPORTANTE: ejecutar SOLO sobre el usuario real (susoinc@gmail.com).
Las carteras legacy usan IDs cortos globales (W01-W04) como PK. Si se ejecuta
sobre otro usuario después, el ON CONFLICT salta las carteras y las ops de
inversión quedarían apuntando a las carteras del primer usuario. Vestra es
single-user, así que esto no es problema en la práctica.

Uso (en VestraApp):
  cd /opt/vestra/backend
  export $(grep -v '^#' .env | xargs)
  /opt/vestra/venv/bin/python scripts/migrate_legacy.py \
    --dump /tmp/legacy_dump.sql \
    --user admin@vestra.local
"""
from __future__ import annotations

import argparse
import os
import re
import sys
import uuid
from datetime import datetime

import psycopg2
import psycopg2.extras
from dotenv import load_dotenv

load_dotenv()
DATABASE_URL = os.environ.get("DATABASE_URL", "")

# ── Legacy entity → account ─────────────────────────────────────────────────
ENTITY_MAP = {
    "E01": {"iban": "ES4214650100961720814434", "name": "ING Cuenta Nómina",   "type": "checking"},
    "E02": {"iban": "ES7914650100982039132362", "name": "ING Cuenta Ahorro",   "type": "savings"},
    "E03": {"iban": "ES5414650200252062840905", "name": "ING Cuenta Inversión","type": "savings"},
}

# Legacy symbol type → Vestra type
SYMBOL_TYPE_MAP = {"I01": "FND", "I02": "ETF", "I03": "CRY"}


# ── Robust SQL VALUES tokenizer ─────────────────────────────────────────────
def parse_insert_block(content: str, table: str) -> list[list]:
    """
    Parses `INSERT INTO table ... VALUES (...),(...);` respecting quoted
    strings, escaped quotes and commas/parens inside string literals.
    Returns a list of rows, each a list of Python values (str/int/float/None).
    """
    m = re.search(rf"INSERT INTO `{table}`[^;]*?VALUES\s*(.+?);\s*\n",
                  content, re.DOTALL)
    if not m:
        m = re.search(rf"INSERT INTO `{table}`[^;]*?VALUES\s*(.+?);",
                      content, re.DOTALL)
    if not m:
        return []
    block = m.group(1)
    rows, i, n = [], 0, len(m.group(1))

    while i < n:
        if block[i] != "(":
            i += 1
            continue
        # parse one tuple
        i += 1
        raw_fields, field, in_str = [], "", False
        while i < n:
            ch = block[i]
            if in_str:
                if ch == "\\":
                    field += block[i:i + 2]; i += 2; continue
                if ch == "'":
                    # doubled '' = escaped quote
                    if i + 1 < n and block[i + 1] == "'":
                        field += "'"; i += 2; continue
                    in_str = False; i += 1; continue
                field += ch; i += 1
            else:
                if ch == "'":
                    in_str = True; i += 1
                elif ch == ",":
                    raw_fields.append(field); field = ""; i += 1
                elif ch == ")":
                    raw_fields.append(field); i += 1; break
                else:
                    field += ch; i += 1
        rows.append([_coerce(f) for f in raw_fields])
    return rows


def _coerce(raw: str):
    raw = raw.strip()
    if raw in ("NULL", "None", ""):
        return None
    # was it a quoted string? our parser already stripped quotes for those,
    # but numbers come through unquoted
    if re.fullmatch(r"-?\d+", raw):
        return int(raw)
    if re.fullmatch(r"-?\d*\.\d+", raw):
        return float(raw)
    return raw  # plain string (already unquoted)


def _s(v) -> str:
    """Safe string, '' for None."""
    return "" if v is None else str(v).strip()


def _merge_comment(*parts) -> str | None:
    vals = [_s(p) for p in parts if _s(p)]
    return " | ".join(vals) or None


# ── Migration ───────────────────────────────────────────────────────────────
def run_migration(dump_path: str, user_email: str) -> None:
    print(f"→ Conectando a la base de datos…")
    conn = psycopg2.connect(DATABASE_URL)
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)

    cur.execute("SELECT id FROM users WHERE email = %s", (user_email,))
    row = cur.fetchone()
    if not row:
        print(f"✗ Usuario {user_email} no encontrado. Regístralo primero.")
        sys.exit(1)
    user_id = row["id"]
    print(f"  Usuario: {user_email} ({user_id})")

    with open(dump_path, encoding="utf-8") as f:
        content = f.read()

    L = {t: parse_insert_block(content, t) for t in
         ["Transact", "Wallets", "Platforms", "Symbols",
          "WalletTransact", "MarketTransact", "Budget", "Category", "Class", "Type"]}
    print(f"  Leído: {len(L['Transact'])} tx · {len(L['WalletTransact'])} ops inv · "
          f"{len(L['MarketTransact'])} precios · {len(L['Budget'])} presupuestos")

    # Valid catalogue ids (already seeded in Vestra by migration 0002)
    cur.execute("SELECT id FROM tx_category")
    valid_cats = {r["id"] for r in cur.fetchall()}
    valid_types = {"T01", "T02", "T03", "T04", "T05"}
    valid_classes = {"C01", "C02", "C03", "C04"}

    # ── 1. Accounts ──────────────────────────────────────────────────────
    account_map = {}
    for eid, info in ENTITY_MAP.items():
        core = info["iban"][-20:]  # 20-digit account number
        cur.execute(
            "SELECT id, iban FROM accounts WHERE user_id=%s AND iban LIKE %s",
            (user_id, f"%{core}"))
        existing = cur.fetchone()
        if existing:
            account_map[eid] = existing["id"]
            # Fix partial IBAN (ES??…) to canonical, keep name/balance
            if existing["iban"] != info["iban"]:
                cur.execute("UPDATE accounts SET iban=%s WHERE id=%s",
                            (info["iban"], existing["id"]))
                print(f"  Cuenta {eid}: reutilizada + IBAN corregido")
            else:
                print(f"  Cuenta {eid}: reutilizada")
        else:
            aid = str(uuid.uuid4())
            cur.execute("""
                INSERT INTO accounts (id, user_id, name, type, iban, country, balance, active)
                VALUES (%s,%s,%s,%s,%s,'ES',0,true)
            """, (aid, user_id, info["name"], info["type"], info["iban"]))
            account_map[eid] = aid
            print(f"  Cuenta {eid}: creada ({info['name']})")
    conn.commit()
    main_account = account_map["E01"]

    # ── 2. Platforms ─────────────────────────────────────────────────────
    for r in L["Platforms"]:
        if len(r) < 2:
            continue
        cur.execute("""
            INSERT INTO platforms (id, name) VALUES (%s,%s)
            ON CONFLICT (id) DO NOTHING
        """, (_s(r[0]), _s(r[1])))
    conn.commit()

    # ── 3. Wallets ───────────────────────────────────────────────────────
    for r in L["Wallets"]:
        if len(r) < 3:
            continue
        cur.execute("""
            INSERT INTO wallets (id, user_id, name, description) VALUES (%s,%s,%s,%s)
            ON CONFLICT (id) DO NOTHING
        """, (_s(r[0]), user_id, _s(r[1]), _s(r[2])))
    conn.commit()

    # ── 4. Symbols ───────────────────────────────────────────────────────
    for r in L["Symbols"]:
        if len(r) < 6:
            continue
        ticker, ltype, isin, desc, system, enabled = r[:6]
        cur.execute("""
            INSERT INTO symbols (ticker, type, isin, description, market, enabled)
            VALUES (%s,%s,%s,%s,%s,%s)
            ON CONFLICT (ticker) DO NOTHING
        """, (_s(ticker), SYMBOL_TYPE_MAP.get(_s(ltype), "STK"),
              _s(isin) or None, _s(desc), _s(system) or None, bool(enabled)))
    conn.commit()
    print(f"  Catálogos inversión: {len(L['Platforms'])} plataformas, "
          f"{len(L['Wallets'])} carteras, {len(L['Symbols'])} símbolos")

    # ── 5. Transactions ──────────────────────────────────────────────────
    # Cutoff: movimientos sin categorizar y no-transferencia ANTERIORES a esta
    # fecha se marcan deprecated (históricos, fuera de la cola de categorización).
    DEPRECATED_BEFORE = "2026-01-01"

    cur.execute("SELECT external_id FROM transactions WHERE user_id=%s "
                "AND external_id IS NOT NULL", (user_id,))
    existing_ext = {r["external_id"] for r in cur.fetchall()}

    tx_rows = []
    tx_imported = tx_skipped = tx_cat = tx_pending = tx_deprecated = tx_transfers = 0
    # Transact cols: id,Entity,Type,Class,Category,Detail,Company,Op_Date,
    #                Categoria,Subcategoria,Description,Comment,Amount,FreeText
    for r in L["Transact"]:
        if len(r) < 13:
            continue
        leg_id = r[0]
        ext_id = f"legacy:{leg_id}"
        if ext_id in existing_ext:
            tx_skipped += 1
            continue

        entity   = _s(r[1])
        type_id  = _s(r[2]) if _s(r[2]) in valid_types else None
        class_id = _s(r[3]) if _s(r[3]) in valid_classes else None
        cat_id   = _s(r[4]) if _s(r[4]) in valid_cats else None
        detail   = r[5]
        company  = _s(r[6]) or None
        op_date  = _s(r[7])
        categoria = _s(r[8])
        subcat    = _s(r[9])
        bank_desc = _s(r[10])
        comment   = r[11]
        amount    = r[12]
        freetext  = r[13] if len(r) > 13 else None

        if not op_date or amount is None:
            continue

        account_id = account_map.get(entity, main_account)

        # Description: prefer the real bank text, fall back to ING categories
        if bank_desc:
            description = bank_desc
        elif categoria:
            description = f"ING: {categoria} › {subcat}" if subcat else f"ING: {categoria}"
        else:
            description = None

        merged_comment = _merge_comment(detail, comment, freetext)

        # Estado de categorización:
        #   - tiene categoría        → categorizada
        #   - es transferencia (T03) → categorizada (no necesita más)
        #   - resto                  → pendiente
        # Los pendientes anteriores al cutoff se marcan deprecated (histórico).
        is_transfer = type_id == "T03"
        is_done = bool(cat_id) or is_transfer
        deprecated = (not is_done) and op_date < DEPRECATED_BEFORE

        if cat_id:
            tx_cat += 1
        elif is_transfer:
            tx_transfers += 1
        elif deprecated:
            tx_deprecated += 1
        else:
            tx_pending += 1

        tx_rows.append((
            str(uuid.uuid4()), user_id, account_id,
            type_id, class_id, cat_id,
            "import_legacy", ext_id, op_date, float(amount),
            company, description[:500] if description else None, merged_comment,
            False, False, deprecated,
        ))
        tx_imported += 1

    if tx_rows:
        psycopg2.extras.execute_values(cur, """
            INSERT INTO transactions
              (id, user_id, account_id, type_id, class_id, category_id,
               source, external_id, op_date, amount,
               company, description, comment, is_split, is_recurring, deprecated)
            VALUES %s
        """, tx_rows, page_size=500)
    conn.commit()
    print(f"  Transacciones: {tx_imported} migradas, {tx_skipped} ya existían")
    print(f"    · {tx_cat} categorizadas")
    print(f"    · {tx_transfers} transferencias (T03 = categorizadas)")
    print(f"    · {tx_deprecated} históricas deprecated (< {DEPRECATED_BEFORE}, fuera de cola)")
    print(f"    · {tx_pending} PENDIENTES activas (cola de categorización)")

    # ── 6. Wallet transactions ───────────────────────────────────────────
    cur.execute("""SELECT wallet_id, platform_id, ticker, op_date, amount, shares
                   FROM wallet_transactions WHERE user_id=%s""", (user_id,))
    existing_wt = {(r["wallet_id"], r["platform_id"], r["ticker"],
                   str(r["op_date"]), float(r["amount"]), float(r["shares"]))
                   for r in cur.fetchall()}
    wt_imported = wt_skipped = 0
    # WalletTransact cols: id,Date,Wallet,Platform,Symbol,Amount,Fee,Shares
    for r in L["WalletTransact"]:
        if len(r) < 8:
            continue
        _, wdate, wallet, platform, symbol, amount, fee, shares = r[:8]
        key = (_s(wallet), _s(platform), _s(symbol), _s(wdate),
               float(amount or 0), float(shares or 0))
        if key in existing_wt:
            wt_skipped += 1
            continue
        cur.execute("""
            INSERT INTO wallet_transactions
              (id, user_id, wallet_id, platform_id, ticker, op_date, amount, fee, shares)
            VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s)
        """, (str(uuid.uuid4()), user_id, _s(wallet), _s(platform), _s(symbol),
              _s(wdate), float(amount or 0), float(fee or 0), float(shares or 0)))
        wt_imported += 1
    conn.commit()
    print(f"  Operaciones inversión: {wt_imported} migradas, {wt_skipped} ya existían")

    # ── 7. Market prices (bulk, idempotent via PK) ───────────────────────
    mp_rows = []
    for r in L["MarketTransact"]:
        if len(r) < 7:
            continue
        mdate, symbol, o, h, lo, c, vol = r[:7]
        if not _s(mdate) or not _s(symbol):
            continue
        mp_rows.append((
            _s(mdate), _s(symbol),
            round(float(o or 0), 10), round(float(h or 0), 10),
            round(float(lo or 0), 10), round(float(c or 0), 10),
            int(vol or 0),
        ))
    if mp_rows:
        psycopg2.extras.execute_values(cur, """
            INSERT INTO market_prices (date, ticker, open, high, low, close, volume)
            VALUES %s
            ON CONFLICT (date, ticker) DO NOTHING
        """, mp_rows, page_size=1000)
    conn.commit()
    print(f"  Precios de mercado: {len(mp_rows)} procesados (ON CONFLICT skip)")

    # ── 8. Budgets (aggregate multiple lines per class/cat/month) ────────
    cur.execute("""SELECT class_id, category_id, year, month
                   FROM budgets WHERE user_id=%s""", (user_id,))
    existing_bud = {(r["class_id"], r["category_id"], r["year"], r["month"])
                    for r in cur.fetchall()}

    # Aggregate legacy budgets: same (class, cat, year, month) → sum amounts
    agg: dict[tuple, dict] = {}
    # Budget cols: id,Op_Date,Type,Class,Category,Project,Amount,Observations
    for r in L["Budget"]:
        if len(r) < 8:
            continue
        _, opdate, _type, lclass, lcat, project, amount, obs = r[:8]
        opdate = _s(opdate)
        if not opdate or amount is None:
            continue
        class_id = _s(lclass) if _s(lclass) in valid_classes else None
        cat_id = _s(lcat) if _s(lcat) in valid_cats else None
        if not class_id:
            continue
        try:
            dt = datetime.strptime(opdate, "%Y-%m-%d")
        except ValueError:
            continue
        key = (class_id, cat_id, dt.year, dt.month)
        if key not in agg:
            agg[key] = {"amount": 0.0, "notes": _s(obs) or None}
        agg[key]["amount"] += float(amount)

    bud_imported = bud_skipped = 0
    for key, val in agg.items():
        if key in existing_bud:
            bud_skipped += 1
            continue
        class_id, cat_id, year, month = key
        cur.execute("""
            INSERT INTO budgets (id, user_id, class_id, category_id, year, month, amount, notes)
            VALUES (%s,%s,%s,%s,%s,%s,%s,%s)
        """, (str(uuid.uuid4()), user_id, class_id, cat_id, year, month,
              round(val["amount"], 2), val["notes"]))
        bud_imported += 1
    conn.commit()
    print(f"  Presupuestos: {bud_imported} migrados (agregados de {len(L['Budget'])} líneas), "
          f"{bud_skipped} ya existían")

    # ── Summary ──────────────────────────────────────────────────────────
    cur.execute("SELECT COUNT(*) AS n FROM transactions WHERE user_id=%s", (user_id,))
    total_tx = cur.fetchone()["n"]
    print(f"\n✅ Migración completada. Total transacciones en la cuenta: {total_tx}")

    cur.close()
    conn.close()


if __name__ == "__main__":
    p = argparse.ArgumentParser()
    p.add_argument("--dump", required=True)
    p.add_argument("--user", required=True)
    args = p.parse_args()
    run_migration(args.dump, args.user)
