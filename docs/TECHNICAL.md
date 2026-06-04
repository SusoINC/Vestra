# Vestra — Documentación Técnica y de Uso

> **Versión:** 0.3a · **Actualizado:** junio 2026  
> Documento vivo — se actualiza con cada deliverable completado.

---

## 1. Qué es Vestra

Aplicación web personal para gestionar:
- **Finanzas** — cuentas bancarias, movimientos, categorización, presupuestos
- **Inversiones** — carteras (wallets), operaciones bursátiles, precios de mercado
- **Vehículos** — mantenimiento, repostajes, alertas, proyectos de restauración
- **Proyectos DIY** — tareas, materiales, presupuesto

Acceso: **http://192.168.1.112** (red local)

---

## 2. Arquitectura

```
Tu Mac (código fuente)
    │
    ├── /backend   Flask API REST
    └── /frontend  React SPA
         │
         └── rsync → VestraApp (192.168.1.112)
                          │
                          ├── Nginx :80 → sirve frontend (dist/)
                          ├── Gunicorn :5000 → Flask API
                          └── ──────────────────────────────
                                         │ SQL
                              VestraDB (192.168.1.111)
                                PostgreSQL 17 · DB: vestra
```

### Infraestructura
| Componente | Detalle |
|---|---|
| VestraDB | LXC Proxmox · 192.168.1.111 · PostgreSQL 17 |
| VestraApp | LXC Proxmox · 192.168.1.112 · Python 3.13 · Nginx 1.26 |
| Repo | github.com/SusoINC/Vestra |
| Deploy | `./deploy.sh [backend\|frontend\|all]` |

### Stack técnico
| Capa | Tecnología |
|---|---|
| Backend | Python 3.13 · Flask · SQLAlchemy 2.x · Alembic |
| Auth | JWT (access 15min + refresh 30 días) · bcrypt |
| Import | pandas + xlrd (Excel ING) |
| Frontend | React 18 · Vite · Tailwind CSS v3 · Zustand · React Hook Form + Zod |
| Charts | Recharts (pendiente #3b) |
| PDF | WeasyPrint (pendiente #8) |

---

## 3. Estructura del proyecto

```
Vestra/
├── CLAUDE.md               ← contexto para Claude Code (no tocar)
├── deploy.sh               ← script de despliegue
├── docs/
│   └── TECHNICAL.md        ← este documento
├── backend/
│   ├── app/
│   │   ├── __init__.py     ← create_app() factory
│   │   ├── config.py       ← DevelopmentConfig / ProductionConfig
│   │   ├── extensions.py   ← db, jwt, scheduler (instancias únicas)
│   │   ├── models/
│   │   │   ├── user.py
│   │   │   ├── finance.py  ← Account, Transaction, Tx*, Budget, RecurringRule
│   │   │   ├── investment.py ← Wallet, Symbol, MarketPrice, WalletTransaction
│   │   │   ├── vehicle.py  ← Vehicle, FuelLog, ServiceRecord, …
│   │   │   └── project.py  ← DiyProject, DiyTask, Attachment
│   │   ├── api/
│   │   │   ├── auth/       ← register, login, refresh, me, logout
│   │   │   └── finance/    ← accounts, transactions, import, pending, split
│   │   ├── services/
│   │   │   ├── auth_service.py
│   │   │   ├── finance_service.py
│   │   │   └── import_service.py
│   │   └── utils/
│   │       └── responses.py ← ok(), created(), error()
│   ├── migrations/
│   │   └── versions/
│   │       ├── 0001_initial_schema.py   ← 26 tablas
│   │       ├── 0002_seed_and_nullable.py ← catálogos + nullable type/class
│   │       └── 0003_suggestion_fields.py ← campos de sugerencia ING
│   ├── scripts/
│   │   └── migrate_legacy.py ← migración one-shot desde MariaDB legacy
│   ├── requirements.txt
│   ├── run.py
│   └── .env.example
└── frontend/
    └── src/
        ├── api/            ← auth.js, finance.js, client.js (Axios)
        ├── components/     ← Sidebar.jsx, ProtectedRoute.jsx
        ├── layouts/        ← AppLayout.jsx (sidebar + topbar)
        ├── pages/
        │   ├── Login.jsx, Register.jsx
        │   ├── Dashboard.jsx
        │   ├── Accounts.jsx
        │   ├── Import.jsx
        │   ├── Pending.jsx         ← cola de categorización
        │   ├── EditTransactions.jsx ← búsqueda + edición completa
        │   └── Transactions.jsx    ← listado categorizadas
        └── store/
            ├── authStore.js
            └── financeStore.js     ← pendingCount compartido
```

---

## 4. Base de datos

### Esquema (PostgreSQL 17 · DB: vestra)

#### Módulo Finance (implementado)

| Tabla | Descripción |
|---|---|
| `users` | Usuarios de la app |
| `accounts` | Cuentas bancarias (IBAN, tipo, saldo) |
| `bank_connections` | Sesiones Nordigen/GoCardless |
| `tx_type` | Catálogo: T01=Ingreso, T02=Gasto, T03=Transferencia, T04=Inversión, T05=Deuda |
| `tx_class` | Catálogo: C01=Fijo, C02=Variable, C03=Especial, C04=Deuda |
| `tx_category` | 35 categorías (Salary, Car, Home, Groceries, Restaurant…) |
| `transactions` | Movimientos bancarios — ver flujo de estados abajo |
| `recurring_rules` | Reglas de recurrencia |
| `budgets` | Presupuestos por categoría y mes |

#### Módulo Investment (modelos creados, endpoints pendientes)
`wallets`, `platforms`, `symbols`, `wallet_transactions`, `market_prices`

#### Módulo Vehicles (modelos creados, endpoints pendientes)
`vehicles`, `fuel_logs`, `maintenance_types`, `service_records`, `maintenance_alerts`, `restoration_projects`, `restoration_tasks`, `parts`

#### Módulo Projects (modelos creados, endpoints pendientes)
`diy_projects`, `diy_tasks`, `attachments`

### Flujo de estados de una transacción

```
BANCO (Excel ING / Migración legacy / Nordigen)
    │
    ▼
Transaction creada (pendiente)
  category_id = NULL · type_id = NULL · class_id = NULL
  suggested_*_id = X        ← sugerencia ING, nunca auto-aplicada
    │
    ├── [Categorizar] → categoría real → CATEGORIZADO
    ├── [Transferencia] → type_id='T03' sin categoría → TRANSFERENCIA (= hecho)
    ├── [Split] → padre is_split=True (oculto) + hijos categorizados
    └── (viejo, pre-2026, sin tocar) → deprecated=TRUE → HISTÓRICO (fuera de cola)
```

**Los 4 estados (mutuamente excluyentes):**

| Estado | Condición | En cola de categorizar |
|---|---|---|
| Categorizado | `category_id IS NOT NULL` | No |
| Transferencia | `type_id = 'T03'` | No (no necesita categoría) |
| Histórico | `deprecated = TRUE` | No (excluido a propósito) |
| Pendiente | sin categoría, no T03, no deprecated | **Sí** |

- Categorizar un histórico (categoría o T03) limpia `deprecated` → sale del tab Históricos.
- **Reporting:** `WHERE is_split=FALSE AND (category_id IS NOT NULL OR type_id='T03')`

---

## 5. API REST

### Base URL
`http://192.168.1.112/api/v1/`

### Formato de respuesta
```json
// Éxito
{ "data": { ... }, "meta": { "total": 100, "page": 1 }, "error": null }

// Error
{ "data": null, "meta": null, "error": { "code": "INVALID_CREDENTIALS", "message": "..." } }
```

### Autenticación
Header: `Authorization: Bearer <access_token>`  
El token de acceso caduca en 15 minutos. El interceptor de Axios lo renueva automáticamente usando el refresh token (30 días).

### Endpoints implementados

#### Auth (`/api/v1/auth/`)
| Método | Ruta | Descripción |
|---|---|---|
| POST | `/register` | Registrar usuario nuevo |
| POST | `/login` | Login → devuelve access_token + refresh_token |
| POST | `/refresh` | Renovar access_token (usar refresh_token como Bearer) |
| GET | `/me` | Datos del usuario autenticado |
| POST | `/logout` | Cerrar sesión (el cliente descarta los tokens) |

#### Finance (`/api/v1/finance/`)
| Método | Ruta | Descripción |
|---|---|---|
| GET | `/catalogues` | Tipos, clases y categorías |
| GET | `/accounts` | Lista de cuentas |
| POST | `/accounts` | Crear cuenta |
| PUT | `/accounts/:id` | Editar cuenta |
| DELETE | `/accounts/:id` | Eliminar cuenta (soft delete) |
| POST | `/import/excel` | Importar fichero .xls de ING (multipart/form-data, campo "file") |
| GET | `/transactions` | Transacciones categorizadas (filtros: account_id, type_id, category_id, date_from, date_to, page) |
| GET | `/transactions/all` | Todas las transacciones (filtros anteriores + q=búsqueda, status=all/pending/categorized) |
| GET | `/transactions/pending` | Cola de pendientes |
| PUT | `/transactions/:id/categorize` | Categorizar transacción |
| PUT | `/transactions/:id` | Edición completa |
| POST | `/transactions/:id/split` | Dividir en N splits |
| POST | `/transactions/:id/unsplit` | Fusionar splits → vuelve a pendiente |
| DELETE | `/transactions/:id` | Eliminar |

---

## 6. Cómo usar la app

### 6.1 Primer acceso
1. Ve a `http://192.168.1.112`
2. Regístrate con tu email y una contraseña (mínimo 8 caracteres)
3. El sistema te lleva al dashboard

### 6.2 Importar movimientos bancarios (ING)
1. En ING Online: **Mis productos → tu cuenta → Ver movimientos → Exportar** (formato .xls)
2. En Vestra: **Importar** en el menú lateral
3. Arrastra el fichero o haz clic para seleccionar
4. El sistema:
   - Detecta el IBAN del fichero y crea/enlaza la cuenta automáticamente
   - Importa todos los movimientos como **pendientes**
   - Guarda la sugerencia de categoría de ING (no la aplica automáticamente)
   - Muestra resumen: importados / duplicados (si reimportas el mismo fichero)

**Deduplicación:** si importas el mismo fichero dos veces, la segunda vez todo sale como "duplicado" (0 importados). Los duplicados se detectan por la combinación de todos los campos ING incluyendo el saldo — dos pagos iguales el mismo día se importan correctamente porque su saldo tras el pago es diferente.

### 6.3 Categorizar movimientos
1. El badge **⏳ Por categorizar** en el menú muestra cuántos pendientes hay
2. Haz clic en **Por categorizar**
3. Para cada movimiento, tienes dos opciones:

**Categorizar:**
- Clic en **Categorizar**
- Se abre el modal con tipo/clase/categoría pre-rellenados con la sugerencia ING (badge dorado **✦ Sugerencia ING**)
- Revisa y ajusta si es necesario
- Clic en **Guardar** para confirmar

**Split (dividir):**
- Clic en **Split** para movimientos que corresponden a varias categorías (ej: compra en Amazon con electrónica y ropa)
- Define N partes con su importe y categoría
- La suma debe cuadrar con el importe total
- Mientras haya restante sin asignar (en amarillo), no puedes guardar

### 6.4 Ver y editar movimientos
- **Transacciones** — solo los "hechos" (categorizados + transferencias), con filtros por cuenta/tipo/categoría/fecha
- **Editar movimientos** — TODOS los movimientos
  - Barra de búsqueda: busca en empresa, descripción y comentario
  - Tabs: **Todos / Pendientes / Categorizados / Históricos**
  - Botón **Editar** en cada fila: cambia cualquier campo, incluida la categorización
  - Categorizar un **Histórico** (con categoría o marcándolo Transferencia) lo saca del
    tab Históricos automáticamente → así limpias el histórico poco a poco
  - Si vacías la categoría → el movimiento vuelve a estado pendiente
  - Splits: el ▶ expande los hijos; botón **Fusionar** deshace el split

### 6.5 Migración de datos legacy (one-shot, ya ejecutado)
- Script `backend/scripts/migrate_legacy.py` importó los 6 años de la app v0 (Raspberry Pi)
- 4.578 transacciones + inversiones + presupuestos + precios de mercado
- Los movimientos sin categorizar anteriores a 2026 se marcaron como **Históricos**
  (deprecated) para no saturar la cola — quedan 106 pendientes (los de 2026)

---

## 7. Flujo de desarrollo

### Hacer cambios
```bash
# 1. Claude edita ficheros en el Mac

# 2. Desplegar backend
rsync -az --delete -e "ssh -i ~/.ssh/vestra_lxc -o StrictHostKeyChecking=no" \
  --exclude="__pycache__" --exclude="*.pyc" --exclude=".env" --exclude="venv/" \
  backend/ root@192.168.1.112:/opt/vestra/backend/
ssh vestraapp "systemctl restart vestra"

# 3. Desplegar frontend (build en el servidor)
rsync -az --delete -e "ssh -i ~/.ssh/vestra_lxc -o StrictHostKeyChecking=no" \
  --exclude="node_modules/" --exclude="dist/" \
  frontend/ root@192.168.1.112:/opt/vestra/frontend-src/
ssh vestraapp "cd /opt/vestra/frontend-src && npm run build && \
  rsync -a --delete dist/ /opt/vestra/frontend/ && systemctl reload nginx"

# 4. Validar en http://192.168.1.112

# 5. (Solo tras confirmación) Push a GitHub
git add -A && git commit -m "feat: ..." && git push origin main
```

### Migraciones de BD
```bash
ssh vestraapp
cd /opt/vestra/backend
export $(grep -v '^#' .env | xargs)
/opt/vestra/venv/bin/flask db upgrade
```

### Acceso a la BD
```bash
ssh vestradb
sudo -u postgres psql -d vestra
```

### Logs
```bash
ssh vestraapp
journalctl -u vestra -f           # logs de Flask/Gunicorn
tail -f /var/log/vestra/error.log  # errores de Gunicorn
tail -f /var/log/nginx/error.log   # errores de Nginx
```

---

## 8. Pendiente de implementar

### #3b — Presupuestos + Charts
- CRUD presupuestos mensuales por categoría
- Dashboard mejorado: saldo total, gasto del mes, top categorías
- Gráficos Recharts: donut por categoría, línea de evolución mensual

### #4 — Inversiones
- CRUD wallets y plataformas
- Import de operaciones (buy/sell/dividend)
- Precios de mercado (API externa)
- Portfolio: posición actual, P&L

### #5 — Vehículos
- CRUD vehículos
- Log de repostajes con cálculo de consumo l/100km
- Registro de mantenimientos con alertas por km/fecha
- Proyectos de restauración con tasks y partes

### #6 — Proyectos DIY
- CRUD proyectos y tareas
- Control de presupuesto y progreso

### #7 — Nordigen/GoCardless
- OAuth con ING España (open banking PSD2)
- Sync automático de movimientos
- Scheduler APScheduler para sync periódico

### #8 — Export PDF
- Informes mensuales con WeasyPrint

---

## 9. Historial de cambios

| Fecha | Versión | Cambio |
|---|---|---|
| Jun 2026 | 0.1 | Infraestructura base: modelos, migración, auth |
| Jun 2026 | 0.2 | Auth completo: login/register/refresh/me + frontend Login/Register |
| Jun 2026 | 0.3a | Finance: import Excel ING, categorización, splits, edit transactions |
| Jun 2026 | 0.3a | Migración legacy (4.578 tx, 6 años) + flag deprecated + lógica transfers (T03) |
