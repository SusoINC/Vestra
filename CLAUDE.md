# Vestra — Contexto para Claude Code

## Qué es este proyecto
Aplicación web personal de **finanzas, inversiones, vehículos y proyectos DIY**.
Nombre: **Vestra**. Usuario propietario: **Jesús Manuel Santiago** (susoinc@gmail.com).
Monorepo en `/Users/jmsantiago/Documents/Github/Vestra`.

---

## Stack

| Capa | Tecnología |
|---|---|
| Backend | Python 3.13 · Flask 3.x · SQLAlchemy 2.x · Alembic/Flask-Migrate |
| Base de datos | PostgreSQL 17 (LXC separado) |
| Auth | flask-jwt-extended · access 15min · refresh 30 días |
| Scheduler | APScheduler (integrado en Flask) |
| Import bancario | pandas + xlrd (ING .xls) |
| PDF export | WeasyPrint |
| Frontend | React 18 · Vite · React Router v6 · Tailwind CSS v3 |
| Estado global | Zustand |
| Formularios | React Hook Form + Zod |
| Charts | Recharts (pendiente implementar) |
| HTTP client | Axios con interceptor de refresh token automático |

---

## Infraestructura (Proxmox)

| LXC | IP | Contenido |
|---|---|---|
| VestraDB | 192.168.1.111 | PostgreSQL 17 · DB=vestra · user=vestra · pass=vestra_secret_2026 |
| VestraApp | 192.168.1.112 | Python 3.13 · Gunicorn (puerto 5000) · Nginx (puerto 80) |

```bash
ssh vestradb   # acceso directo a la BD (clave ~/.ssh/vestra_lxc)
ssh vestraapp  # acceso directo a la app
```

**Rutas en VestraApp:**
- Código backend: `/opt/vestra/backend/`
- Frontend servido: `/opt/vestra/frontend/`
- Fuentes frontend: `/opt/vestra/frontend-src/`
- Venv Python: `/opt/vestra/venv/`
- Logs: `/var/log/vestra/`
- Config app: `/opt/vestra/backend/.env`
- Servicio: `systemctl restart vestra` / `systemctl reload nginx`

---

## Workflow (OBLIGATORIO respetar)
1. Claude escribe código en el Mac local
2. `rsync` + `ssh` para desplegar en VestraApp
3. El usuario valida en http://192.168.1.112
4. El usuario confirma "ok, sube"
5. Claude hace `git commit` + `git push`

**NUNCA hacer push a GitHub sin confirmación explícita del usuario.**

---

## Usuarios

| Email | Contraseña | Rol |
|---|---|---|
| susoinc@gmail.com | (solo él la sabe) | **Usuario real — NO TOCAR sus datos sin confirmación explícita** |
| admin@vestra.local | vestra123 | Usuario de test de Claude — datos de prueba |

**Regla de oro:** cualquier operación sobre datos de `susoinc@gmail.com` requiere confirmación explícita antes de ejecutarse.

---

## Convenciones de código

### Backend
- `from __future__ import annotations` en TODOS los ficheros con type hints (Python 3.13 en servidor, 3.9 en Mac)
- SQLAlchemy 2.x: `db.session.execute(select(...)).scalars().first()` — nunca `scalar_one_or_none()` en imports
- Blueprints registrados en `create_app()`, nunca imports circulares
- Servicios en `app/services/` — los endpoints solo llaman servicios, sin lógica de negocio directa
- Respuestas API: `{"data": ..., "meta": ..., "error": null}` — usar helpers `ok()`, `created()`, `error()` de `app/utils/responses.py`

### Frontend
- Build del frontend se hace **en VestraApp** (Node 20), no en el Mac (no hay Node en Mac)
- Componentes en PascalCase, hooks en camelCase con prefijo `use`
- API centralizada en `src/api/` (un fichero por módulo)
- Estado global: Zustand stores en `src/store/`

---

## Estado de deliverables

| # | Deliverable | Estado |
|---|---|---|
| #1 | Infraestructura base (scaffolding, modelos, migración) | ✅ Completo |
| #1b | LXCs Proxmox configuradas y en producción | ✅ Completo |
| #2 | Auth (register, login, refresh, me, logout) | ✅ Completo |
| #3a | Finance: import Excel ING, categorización, split, edit | ✅ Completo |
| #3b | Finance: presupuestos + charts Recharts | ⏳ Pendiente |
| #4 | Inversiones (wallets, operaciones, precios de mercado) | ⏳ Pendiente |
| #5 | Vehículos + mantenimiento + alertas | ⏳ Pendiente |
| #6 | Proyectos DIY | ⏳ Pendiente |
| #7 | Integración GoCardless/Nordigen (open banking ING real-time) | ⏳ Pendiente |
| #8 | Export PDF con WeasyPrint | ⏳ Pendiente |
| Migration | Importar datos legacy (MariaDB dump, 4579 tx) | ⏳ Pendiente |

---

## Modelos de datos clave

### Flujo de transacciones financieras
```
Import Excel ING
    ↓
transactions (pendientes: type_id=NULL, class_id=NULL, category_id=NULL)
suggested_type_id / suggested_class_id / suggested_category_id  ← sugerencia ING, nunca auto-aplicada
    ↓ usuario categoriza manualmente (modal con pre-relleno de sugerencia)
transactions (categorizadas: todos los campos rellenos)
    ↓
Reporting: WHERE is_split=FALSE AND category_id IS NOT NULL
```

### Splits
- Padre: `is_split=True`, sin category_id → NO aparece en reporting
- Hijos: `parent_id=padre.id`, `is_split=False`, con category_id → SÍ aparecen en reporting
- Máximo 2 niveles (padre → hijos)
- Filtro reporting siempre: `WHERE is_split=FALSE AND category_id IS NOT NULL`

### Catálogos (seeded en migración 0002)
- `tx_type`: T01=Ingreso, T02=Gasto, T03=Transferencia, T04=Inversión, T05=Deuda
- `tx_class`: C01=Fijo, C02=Variable, C03=Especial, C04=Deuda
- `tx_category`: 35 categorías del legacy (IDs numéricos '1'–'35')

---

## Deduplicación de imports Excel
Clave MD5 de: `{iban}|{fecha}|{importe}|{descripción}|{categoría_ING}|{subcategoría_ING}|{comentario}|{saldo}`
El **saldo** es el discriminador para dos pagos idénticos el mismo día en el mismo comercio.
Re-importar el mismo Excel → 0 nuevos (todos skipped). Seguro.

---

## Migraciones Alembic
```
0001 → Esquema inicial (26 tablas)
0002 → nullable type_id/class_id + seed catálogos (5 tipos, 4 clases, 35 categorías)
0003 → Campos suggested_type/class/category_id en transactions
```
Para correr: `ssh vestraapp` → `cd /opt/vestra/backend` → `export $(grep -v '^#' .env | xargs)` → `/opt/vestra/venv/bin/flask db upgrade`

---

## Notas técnicas importantes
- **Python en VestraApp es 3.13** (Debian 13 Trixie), no 3.11 como en el spec original
- **PostgreSQL 17** (PG15 incompatible con libicu74 de Debian 13)
- `pandas` requiere versión 2.3+ para tener wheels en Python 3.13
- ING exporta XLS sin prefijo ES en el IBAN — el importer lo resuelve buscando cuentas existentes por sufijo
- `scalar_one_or_none()` falla si hay múltiples filas — usar `.scalars().first()` en código de import
- WeasyPrint necesita: libpango, libcairo, libgdk-pixbuf, fonts-liberation instalados en el sistema

---

## Datos legacy (pendiente migrar)
- App v0 en Raspberry Pi (MariaDB/phpMyAdmin)
- 4.579 transacciones (2020–2026), solo cuenta E01 (ING ES4214650100961720814434)
- Script de migración: `backend/scripts/migrate_legacy.py`
- Mapeo: Entity→accounts, Type→tx_type, Class→tx_class, Category→tx_category, Detail→comment
- Dump disponible en: `/Users/jmsantiago/Downloads/legacy_dump.sql`
