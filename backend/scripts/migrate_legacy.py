#!/usr/bin/env python3
"""
migrate_legacy.py — Importa datos de la app legacy (MariaDB dump) a Vestra (PostgreSQL).

Uso:
  python scripts/migrate_legacy.py --dump /path/to/legacy_dump.sql --user <user_email>

Requiere que el usuario ya exista en Vestra (créalo con register primero).
Ejecutar en VestraApp:
  cd /opt/vestra/backend
  export $(grep -v '^#' .env | xargs)
  /opt/vestra/venv/bin/python scripts/migrate_legacy.py \
    --dump /tmp/legacy_dump.sql \
    --user admin@vestra.local
"""
from __future__ import annotations

import argparse
import re
import sys
import uuid
from datetime import datetime
from decimal import Decimal

import psycopg2
import psycopg2.extras
from dotenv import load_dotenv
import os

load_dotenv()

DATABASE_URL = os.environ.get("DATABASE_URL", "")

# ── Entity → Account mapping ─────────────────────────────────────────────────
ENTITY_MAP = {
    "E01": {"iban": "ES4214650100961720814434", "name": "ING Cuenta Nómina",    "type": "checking"},
    "E02": {"iban": "ES7914650100982039132362", "name": "ING Cuenta Ahorro",    "type": "savings"},
    "E03": {"iban": "ES5414650200252062840905", "name": "ING Cuenta Inversión", "type": "savings"},
}


def parse_dump(path: str) -> dict:
    with open(path, encoding="utf-8") as f:
        content = f.read()

    def extract_rows(table: str) -> list[list]:
        m = re.search(
            rf"INSERT INTO `{table}`[^;]+VALUES\s*(.+?);",
            content, re.DOTALL
        )
        if not m:
            return []
        block = m.group(1)
        # Each row is (...) — use a simple CSV-like parser
        rows = []
        for match in re.finditer(r"\(([^)]+)\)", block):
            raw = match.group(1)
            # Skip header row that starts with a backtick
            if raw.strip().startswith("`"):
                continue
            rows.append(raw)
        return rows

    def parse_value(v: str):
        v = v.strip()
        if v in ("NULL", "None", "''"):
            return None
        if v.startswith("'") and v.endswith("'"):
            return v[1:-1].replace("\\'", "'").replace("\\n", "\n")
        try:
            if "." in v:
                return float(v)
            return int(v)
        except ValueError:
            return v

    def parse_row(raw: str) -> list:
        # Naive CSV split — handles simple cases in this dump
        parts = []
        current = ""
        in_string = False
        for char in raw:
            if char == "'" and not in_string:
                in_string = True
                current += char
            elif char == "'" and in_string:
                in_string = False
                current += char
            elif char == "," and not in_string:
                parts.append(parse_value(current.strip()))
                current = ""
            else:
                current += char
        if current.strip():
            parts.append(parse_value(current.strip()))
        return parts

    data = {}
    for table in ["Entity", "Transact", "Category", "Class", "Type",
                  "Budget", "Wallets", "Platforms", "Symbols", "WalletTransact"]:
        raw_rows = extract_rows(table)
        data[table] = [parse_row(r) for r in raw_rows]

    return data


def run_migration(dump_path: str, user_email: str) -> None:
    print(f"Conectando a {DATABASE_URL[:40]}...")
    conn = psycopg2.connect(DATABASE_URL)
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)

    # Get user
    cur.execute("SELECT id FROM users WHERE email = %s", (user_email,))
    row = cur.fetchone()
    if not row:
        print(f"ERROR: usuario {user_email} no encontrado en Vestra. Regístralo primero.")
        sys.exit(1)
    user_id = row["id"]
    print(f"Usuario: {user_email} ({user_id})")

    data = parse_dump(dump_path)
    print(f"Datos leídos: {len(data['Transact'])} transacciones, "
          f"{len(data['WalletTransact'])} wallet ops")

    # ── 1. Create accounts ───────────────────────────────────────────────
    account_id_map = {}  # legacy entity id → vestra account id
    for eid, info in ENTITY_MAP.items():
        cur.execute("SELECT id FROM accounts WHERE iban = %s AND user_id = %s",
                    (info["iban"], user_id))
        existing = cur.fetchone()
        if existing:
            account_id_map[eid] = existing["id"]
            print(f"  Account {eid} ya existe: {existing['id']}")
        else:
            aid = str(uuid.uuid4())
            cur.execute("""
                INSERT INTO accounts (id, user_id, name, type, iban, country, balance, active)
                VALUES (%s, %s, %s, %s, %s, 'ES', 0, true)
            """, (aid, user_id, info["name"], info["type"], info["iban"]))
            account_id_map[eid] = aid
            print(f"  Cuenta creada: {info['name']} ({aid})")
    conn.commit()

    # ── 2. Import transactions ────────────────────────────────────────────
    imported = skipped = errors = 0
    for row in data["Transact"]:
        if len(row) < 13:
            errors += 1
            continue

        # Columns: id, Entity, Type, Class, Category, Detail, Company,
        #          Op_Date, Categoria, Subcategoria, Description, Comment, Amount, FreeText
        (leg_id, entity, type_id, class_id, category_id, detail, company,
         op_date, categoria, subcategoria, description, comment, amount, freetext) = row[:14]

        # Skip if no date or amount
        if not op_date or amount is None:
            errors += 1
            continue

        # Map entity to account
        if entity and entity in account_id_map:
            account_id = account_id_map[entity]
        else:
            account_id = account_id_map.get("E01")  # default to main account

        # Clean type/class/category
        type_id = type_id if type_id and str(type_id).startswith("T") else None
        class_id = class_id if class_id and str(class_id).startswith("C") else None
        category_id = str(category_id) if category_id and str(category_id) not in ("", "NULL", "None") else None

        # Build description hint
        if categoria and str(categoria) not in ("", "NULL", "None"):
            hint = f"ING: {categoria}"
            if subcategoria and str(subcategoria) not in ("", "NULL", "None"):
                hint += f" › {subcategoria}"
        else:
            hint = str(description or "")

        # Merge comment + detail + freetext
        comment_parts = [
            str(detail) if detail and str(detail) not in ("", "NULL", "None") else None,
            str(comment) if comment and str(comment) not in ("", "NULL", "None") else None,
            str(freetext) if freetext and str(freetext) not in ("", "NULL", "None") else None,
        ]
        merged_comment = " | ".join(p for p in comment_parts if p) or None

        # External ID for dedup
        import hashlib
        key = f"legacy|{leg_id}|{op_date}|{amount}"
        external_id = "leg_" + hashlib.md5(key.encode()).hexdigest()[:16]

        cur.execute("SELECT id FROM transactions WHERE external_id = %s AND user_id = %s",
                    (external_id, user_id))
        if cur.fetchone():
            skipped += 1
            continue

        try:
            cur.execute("""
                INSERT INTO transactions
                  (id, user_id, account_id, type_id, class_id, category_id,
                   source, external_id, op_date, amount,
                   company, description, comment,
                   is_split, is_recurring, created_at)
                VALUES (%s,%s,%s,%s,%s,%s,'import_legacy',%s,%s,%s,%s,%s,%s,false,false,now())
            """, (
                str(uuid.uuid4()), user_id, account_id,
                type_id, class_id, category_id,
                external_id, op_date, float(amount),
                str(company) if company else None,
                hint[:500],
                merged_comment,
            ))
            imported += 1
        except Exception as exc:
            print(f"  ERROR fila {leg_id}: {exc}")
            conn.rollback()
            errors += 1
            continue

    conn.commit()
    print(f"\n✓ Transacciones: {imported} importadas, {skipped} duplicadas, {errors} errores")

    # ── 3. Import wallet transactions ─────────────────────────────────────
    w_imported = w_skipped = 0
    for row in data["WalletTransact"]:
        if len(row) < 8:
            continue
        (wid, wdate, wallet_id, platform_id, symbol, amount, fee, shares) = row[:8]

        cur.execute("SELECT id FROM wallet_transactions WHERE id = %s", (str(wid),))
        if cur.fetchone():
            w_skipped += 1
            continue

        try:
            cur.execute("""
                INSERT INTO wallet_transactions
                  (id, user_id, wallet_id, platform_id, ticker, op_date, amount, fee, shares)
                VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s)
                ON CONFLICT DO NOTHING
            """, (
                str(uuid.uuid4()), user_id,
                str(wallet_id), str(platform_id), str(symbol),
                wdate, float(amount), float(fee or 0), float(shares or 0),
            ))
            w_imported += 1
        except Exception as exc:
            print(f"  ERROR wallet row {wid}: {exc}")
            conn.rollback()
            w_skipped += 1

    conn.commit()
    print(f"✓ Wallet ops: {w_imported} importadas, {w_skipped} omitidas")

    cur.close()
    conn.close()
    print("\n✅ Migración completada")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--dump", required=True, help="Ruta al legacy_dump.sql")
    parser.add_argument("--user", required=True, help="Email del usuario en Vestra")
    args = parser.parse_args()
    run_migration(args.dump, args.user)
