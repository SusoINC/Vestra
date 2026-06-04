#!/usr/bin/env python3
"""
seed_subcategories.py — Crea el catálogo de subcategorías desde el legacy
(campo Detail) y rellena transactions.subcategory_id en los movimientos migrados.

Limpieza:
  - Normaliza (minúsculas, sin acentos, sin espacios/puntuación) para fusionar variantes
  - Aplica alias manual para typos de letras (Soptify→Spotify, etc.)
  - Solo crea subcategorías usadas >= MIN_USES veces (resto se queda en comment)
  - Etiqueta canónica = la grafía más frecuente del grupo

Idempotente. Uso (en VestraApp):
  cd /opt/vestra/backend && export $(grep -v '^#' .env | xargs)
  /opt/vestra/venv/bin/python scripts/seed_subcategories.py \
    --dump /tmp/legacy_dump.sql --user susoinc@gmail.com
"""
from __future__ import annotations

import argparse
import os
import re
import sys
import unicodedata
import uuid
from collections import defaultdict

import psycopg2
import psycopg2.extras
from dotenv import load_dotenv

load_dotenv()
DATABASE_URL = os.environ.get("DATABASE_URL", "")

MIN_USES = 2  # subcategorías usadas menos de esto se descartan (quedan en comment)

# Alias manual para typos de letras que la normalización no fusiona
ALIASES = {
    "soptify": "spotify",
    "googleone": "google one",
    "crossfit": "crossfit",
    "protes": "proteins",
    "picted": "padel",
}


def _norm(s: str) -> str:
    """minúsculas + sin acentos + sin espacios/puntuación."""
    s = s.strip().lower()
    s = "".join(c for c in unicodedata.normalize("NFD", s)
                if unicodedata.category(c) != "Mn")
    s = re.sub(r"[^a-z0-9]", "", s)
    return s


def parse_insert_block(content: str, table: str) -> list[list]:
    m = re.search(rf"INSERT INTO `{table}`[^;]*?VALUES\s*(.+?);", content, re.DOTALL)
    if not m:
        return []
    block, rows, i, n = m.group(1), [], 0, len(m.group(1))
    while i < n:
        if block[i] != "(":
            i += 1; continue
        i += 1
        fields, field, in_str = [], "", False
        while i < n:
            ch = block[i]
            if in_str:
                if ch == "\\":
                    field += block[i:i + 2]; i += 2; continue
                if ch == "'":
                    if i + 1 < n and block[i + 1] == "'":
                        field += "'"; i += 2; continue
                    in_str = False; i += 1
                else:
                    field += ch; i += 1
            else:
                if ch == "'":
                    in_str = True; i += 1
                elif ch == ",":
                    fields.append(field.strip()); field = ""; i += 1
                elif ch == ")":
                    fields.append(field.strip()); i += 1; break
                else:
                    field += ch; i += 1
        rows.append(fields)
    return rows


def run(dump_path: str, user_email: str) -> None:
    conn = psycopg2.connect(DATABASE_URL)
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)

    cur.execute("SELECT id FROM users WHERE email=%s", (user_email,))
    row = cur.fetchone()
    if not row:
        print(f"✗ Usuario {user_email} no encontrado"); sys.exit(1)
    user_id = row["id"]

    with open(dump_path, encoding="utf-8") as f:
        content = f.read()

    cur.execute("SELECT id FROM tx_category")
    valid_cats = {r["id"] for r in cur.fetchall()}

    trans = parse_insert_block(content, "Transact")

    # ── 1. Agrupar Detail por (categoría, clave normalizada) ─────────────
    # group[cat][norm_key] = {"count": n, "variants": {original: count}, "legacy_ids": [...]}
    group: dict = defaultdict(lambda: defaultdict(
        lambda: {"count": 0, "variants": defaultdict(int), "legacy_ids": []}))
    for r in trans:
        if len(r) < 13:
            continue
        leg_id = r[0]
        cat = r[4].strip()
        detail = r[5].strip()
        if cat not in valid_cats or not detail or detail in ("NULL", "None"):
            continue
        key = _norm(detail)
        key = _norm(ALIASES.get(key, key))  # apply alias then re-normalize
        if not key:
            continue
        g = group[cat][key]
        g["count"] += 1
        g["variants"][detail] += 1
        g["legacy_ids"].append(leg_id)

    # ── 2. Construir catálogo (label canónico = grafía más usada) ────────
    # subcat_map[(cat, norm_key)] = subcategory_id
    subcat_map = {}
    created = 0
    for cat, keys in group.items():
        for key, g in keys.items():
            if g["count"] < MIN_USES:
                continue
            canonical = max(g["variants"].items(), key=lambda kv: kv[1])[0]
            # find-or-create
            cur.execute("""
                SELECT id FROM tx_subcategory
                WHERE user_id=%s AND category_id=%s AND lower(label)=lower(%s)
            """, (user_id, cat, canonical))
            ex = cur.fetchone()
            if ex:
                subcat_map[(cat, key)] = ex["id"]
            else:
                sid = str(uuid.uuid4())
                cur.execute("""
                    INSERT INTO tx_subcategory (id, user_id, category_id, label)
                    VALUES (%s,%s,%s,%s)
                """, (sid, user_id, cat, canonical))
                subcat_map[(cat, key)] = sid
                created += 1
    conn.commit()

    # ── 3. Backfill transactions.subcategory_id ──────────────────────────
    # map legacy_id → subcategory_id
    legid_to_sub = {}
    for cat, keys in group.items():
        for key, g in keys.items():
            sid = subcat_map.get((cat, key))
            if not sid:
                continue
            for leg_id in g["legacy_ids"]:
                legid_to_sub[f"legacy:{leg_id}"] = sid

    updated = 0
    # batch update by external_id
    for ext_id, sid in legid_to_sub.items():
        cur.execute("""
            UPDATE transactions SET subcategory_id=%s
            WHERE user_id=%s AND external_id=%s AND subcategory_id IS NULL
        """, (sid, user_id, ext_id))
        updated += cur.rowcount
    conn.commit()

    print(f"✓ Subcategorías creadas: {created}")
    print(f"✓ Movimientos con subcategoría asignada (backfill): {updated}")

    # Resumen por categoría
    cur.execute("""
        SELECT c.label AS categoria, COUNT(*) AS subs
        FROM tx_subcategory s JOIN tx_category c ON c.id=s.category_id
        WHERE s.user_id=%s GROUP BY c.label ORDER BY subs DESC
    """, (user_id,))
    print("\nSubcategorías por categoría:")
    for r in cur.fetchall():
        print(f"  {r['categoria']}: {r['subs']}")

    cur.close()
    conn.close()


if __name__ == "__main__":
    p = argparse.ArgumentParser()
    p.add_argument("--dump", required=True)
    p.add_argument("--user", required=True)
    args = p.parse_args()
    run(args.dump, args.user)
