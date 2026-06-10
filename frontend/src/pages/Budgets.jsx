import { useEffect, useState, useCallback, Fragment } from "react";
import {
  ResponsiveContainer, ComposedChart, Bar, Line, LineChart,
  XAxis, YAxis, Tooltip, CartesianGrid, Legend,
} from "recharts";
import financeApi from "../api/finance";
import { fmtEUR as fmt } from "../utils/format";

const MONTHS = ["Ene", "Feb", "Mar", "Abr", "May", "Jun",
                "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];

function DarkTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-navy-950 border border-navy-600 rounded-lg px-3 py-2 text-xs shadow-xl">
      {label != null && <p className="text-navy-300 mb-1">{typeof label === "number" ? MONTHS[label - 1] : label}</p>}
      {payload.map((p, i) => (
        <p key={i} style={{ color: p.color || p.fill }}>
          {p.name}: <span className="font-semibold">{fmt(p.value)}</span>
        </p>
      ))}
    </div>
  );
}

const inputCls =
  "w-full bg-navy-900 border border-navy-600 text-white rounded-lg px-3 py-2 text-sm " +
  "focus:outline-none focus:border-champagne focus:ring-1 focus:ring-champagne transition disabled:opacity-40";

// Color de la barra según % consumido (ingresos: lógica invertida)
function barColor(pct, isIncome) {
  if (pct == null) return "bg-navy-600";
  if (isIncome) {
    if (pct >= 100) return "bg-green-500";
    if (pct >= 90) return "bg-amber-500";
    return "bg-red-500";
  }
  if (pct <= 80) return "bg-green-500";
  if (pct <= 100) return "bg-amber-500";
  return "bg-red-500";
}

// Texto de color del rating (clase Tailwind)
function ratingText(pct, isIncome) {
  if (pct == null) return "text-navy-400";
  if (isIncome) {
    if (pct >= 100) return "text-green-400";
    if (pct >= 90) return "text-amber-400";
    return "text-red-400";
  }
  if (pct > 110) return "text-red-400";
  if (pct > 100) return "text-amber-400";
  return "text-green-400";
}

// Color de fondo de celda de la matriz (rating). Ingresos invertido.
function cellStyle(cell, isIncome) {
  const G = { background: "rgba(34,197,94,0.22)", color: "#4ade80" };
  const L = { background: "rgba(132,204,22,0.20)", color: "#a3e635" };
  const A = { background: "rgba(234,179,8,0.25)", color: "#fbbf24" };
  const O = { background: "rgba(249,115,22,0.28)", color: "#fb923c" };
  const R = { background: "rgba(239,68,68,0.32)", color: "#f87171" };
  const { pct, actual } = cell;
  if (pct == null) {
    if (actual > 0) return { background: "rgba(100,116,139,0.25)", color: "#94a3b8" };
    return { background: "transparent", color: "#334155" };
  }
  if (isIncome) {
    // ingresos: cobrar >=100% es bueno (verde), por debajo es malo
    if (pct >= 100) return G;
    if (pct >= 90) return L;
    if (pct >= 75) return A;
    if (pct >= 50) return O;
    return R;
  }
  // gastos: gastar poco es bueno (verde), pasarse es malo
  if (pct <= 75) return G;
  if (pct <= 100) return L;
  if (pct <= 110) return A;
  if (pct <= 130) return O;
  return R;
}

// ── Progress bar ──────────────────────────────────────────────────────────────
function ProgressBar({ pct, isIncome }) {
  const width = pct == null ? 0 : Math.min(pct, 100);
  return (
    <div className="w-full h-2 bg-navy-900 rounded-full overflow-hidden">
      <div className={`h-full ${barColor(pct, isIncome)} transition-all`} style={{ width: `${width}%` }} />
    </div>
  );
}

// ── Tarjeta de categoría ────────────────────────────────────────────────────────
function CategoryCard({ c, isOpen, onToggle }) {
  const hasSubs = c.subcategories.length > 0;
  const isIncome = c.type_id === "T01";
  // Para ingresos, "remaining" positivo significa que falta por cobrar (no es bueno)
  const remainingOk = isIncome ? c.remaining <= 0 : c.remaining >= 0;
  return (
    <div className="bg-navy-800 border border-navy-700 rounded-xl overflow-hidden">
      <div className="p-4">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            {hasSubs && (
              <button onClick={onToggle} className="text-navy-400 hover:text-white text-xs w-4">
                {isOpen ? "▼" : "▶"}
              </button>
            )}
            <span className="font-medium text-white">{c.category_icon} {c.category_label}</span>
            {!c.has_budget && (
              <span className="text-xs text-navy-500 bg-navy-900 px-2 py-0.5 rounded">sin presupuesto</span>
            )}
          </div>
          <div className="text-right text-sm">
            <span className="text-white">{fmt(c.actual)}</span>
            <span className="text-navy-500"> / {fmt(c.budget)}</span>
            {c.pct != null && (
              <span className={`ml-2 text-xs ${ratingText(c.pct, isIncome)}`}>{c.pct}%</span>
            )}
          </div>
        </div>
        {c.has_budget && <ProgressBar pct={c.pct} isIncome={isIncome} />}
        {c.has_budget && (
          <p className={`text-xs mt-1 ${remainingOk ? "text-green-400" : "text-amber-400"}`}>
            {isIncome
              ? (c.remaining <= 0 ? `Objetivo cumplido (+${fmt(-c.remaining)})` : `Faltan ${fmt(c.remaining)}`)
              : (c.remaining >= 0 ? `Quedan ${fmt(c.remaining)}` : `Excedido ${fmt(-c.remaining)}`)}
          </p>
        )}
      </div>
      {hasSubs && isOpen && (
        <div className="bg-navy-900/50 border-t border-navy-700 px-4 py-2 space-y-1.5">
          {c.subcategories.map((s) => (
            <div key={s.subcategory_id} className="flex items-center justify-between text-sm py-1">
              <span className="text-navy-300">
                › {s.subcategory_label}
                {!s.budgeted && <span className="text-navy-600 text-xs ml-2">(sin ppto)</span>}
              </span>
              <span className="text-right">
                <span className={s.budgeted && s.actual > s.budget ? "text-red-400" : "text-navy-200"}>
                  {fmt(s.actual)}
                </span>
                {s.budgeted && <span className="text-navy-500"> / {fmt(s.budget)}</span>}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Budget form modal (con recurrencia) ────────────────────────────────────────
function BudgetModal({ year, catalogues, editing, onClose, onSaved }) {
  const isEdit = !!editing;
  // Label de la subcategoría actual (para pre-rellenar en edición)
  const initialSubLabel = editing
    ? (catalogues.subcategories || []).find((s) => s.id === editing.subcategory_id)?.label || ""
    : "";
  const [form, setForm] = useState(
    editing
      ? {
          type_id: editing.type_id || "T02",
          class_id: editing.class_id || "C02",
          category_id: editing.category_id || "",
          subcategory_label: initialSubLabel,
          notes: editing.notes || "",
          amount: editing.amount ?? "",
          month: editing.month ?? "",
        }
      : {
          type_id: "T02",
          class_id: "C02",
          category_id: "",
          subcategory_label: "",
          notes: "",
          amount: "",
        }
  );
  // Fecha completa (día). En edición se reconstruye de year/month/day.
  const pad = (n) => String(n).padStart(2, "0");
  const initialDate = editing && editing.month
    ? `${editing.year}-${pad(editing.month)}-${pad(editing.day || 1)}`
    : new Date().toISOString().slice(0, 10);
  const [dateValue, setDateValue] = useState(initialDate);

  // Recurrencia (solo en alta)
  const [recurring, setRecurring] = useState(false);
  const [months, setMonths] = useState([]); // meses seleccionados (1-12)
  const [varyAmount, setVaryAmount] = useState(false);
  const [amounts, setAmounts] = useState({}); // {mes: importe}
  const [annual, setAnnual] = useState(editing ? editing.month == null : false);
  const [saving, setSaving] = useState(false);

  // Clase y categoría son independientes → se muestran todas las categorías
  const filteredCats = catalogues.categories;
  const subcatOptions = (catalogues.subcategories || [])
    .filter((s) => s.category_id === form.category_id);

  const toggleMonth = (m) =>
    setMonths((prev) => prev.includes(m) ? prev.filter((x) => x !== m) : [...prev, m].sort((a, b) => a - b));

  const onSave = async () => {
    if (!form.category_id) { alert("Elige una categoría"); return; }
    setSaving(true);
    // Descomponer la fecha (YYYY-MM-DD) en partes
    const [dY, dM, dD] = dateValue.split("-").map((x) => parseInt(x));
    try {
      if (isEdit) {
        await financeApi.updateBudget(editing.id, {
          type_id: form.type_id, class_id: form.class_id,
          category_id: form.category_id,
          subcategory_label: form.subcategory_label || "",
          notes: form.notes, amount: parseFloat(form.amount),
          year: annual ? year : dY,
          month: annual ? null : dM,
          day: annual ? null : dD,
        });
      } else {
        // alta: resolver meses objetivo y fecha
        const base = {
          type_id: form.type_id, class_id: form.class_id,
          category_id: form.category_id,
          subcategory_label: form.subcategory_label || null,
          notes: form.notes,
        };
        if (annual) {
          base.year = year;
          base.months = null;
          base.day = null;
        } else if (recurring) {
          // meses del grid, año y día de la fecha (mismo día en todos los meses)
          base.year = dY;
          base.months = months;
          base.day = dD;
        } else {
          // un solo movimiento: fecha completa
          base.year = dY;
          base.months = [dM];
          base.day = dD;
        }
        if (recurring && varyAmount) {
          base.amounts = amounts;
        } else {
          base.amount = parseFloat(form.amount);
        }
        await financeApi.createBudgets(base);
      }
      onSaved();
    } catch (e) {
      alert(e.response?.data?.error?.message || "Error guardando");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-navy-800 border border-navy-700 rounded-2xl w-full max-w-lg p-6 my-4">
        <h2 className="text-white font-semibold text-lg mb-4">
          {isEdit ? "Editar presupuesto" : `Nuevo presupuesto · ${year}`}
        </h2>

        <div className="space-y-4">
          {/* Tipo / Clase */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-navy-400 text-xs mb-1">Tipo</label>
              <select value={form.type_id} onChange={(e) => setForm({ ...form, type_id: e.target.value })}
                className={inputCls}>
                {catalogues.types.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-navy-400 text-xs mb-1">Clase</label>
              <select value={form.class_id}
                onChange={(e) => setForm({ ...form, class_id: e.target.value })}
                className={inputCls}>
                {catalogues.classes.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
              </select>
            </div>
          </div>

          {/* Categoría / Subcategoría */}
          <div>
            <label className="block text-navy-400 text-xs mb-1">Categoría *</label>
            <select value={form.category_id}
              onChange={(e) => setForm({ ...form, category_id: e.target.value, subcategory_label: "" })}
              className={inputCls}>
              <option value="">— Categoría —</option>
              {filteredCats.map((c) => <option key={c.id} value={c.id}>{c.icon} {c.label}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-navy-400 text-xs mb-1">
              Subcategoría <span className="text-navy-600">(opcional)</span>
            </label>
            <input list="budget-subcats" value={form.subcategory_label}
              onChange={(e) => setForm({ ...form, subcategory_label: e.target.value })}
              disabled={!form.category_id} className={inputCls}
              placeholder={form.category_id ? "Ej: Gasoil…" : "Elige categoría primero"} />
            <datalist id="budget-subcats">
              {subcatOptions.map((s) => <option key={s.id} value={s.label} />)}
            </datalist>
          </div>

          {/* Período / recurrencia (solo en alta) */}
          {!isEdit && (
            <div className="bg-navy-900 rounded-xl p-4 space-y-3">
              <label className="flex items-center gap-2 text-sm text-navy-200">
                <input type="checkbox" checked={annual}
                  onChange={(e) => { setAnnual(e.target.checked); if (e.target.checked) setRecurring(false); }} />
                Presupuesto anual (todo el año, una línea)
              </label>

              {!annual && (
                <>
                  <label className="flex items-center gap-2 text-sm text-navy-200">
                    <input type="checkbox" checked={recurring}
                      onChange={(e) => setRecurring(e.target.checked)} />
                    Recurrente (varios meses)
                  </label>

                  {!recurring ? (
                    <div>
                      <label className="block text-navy-400 text-xs mb-1">Fecha prevista</label>
                      <input type="date" value={dateValue}
                        onChange={(e) => setDateValue(e.target.value)} className={inputCls} />
                    </div>
                  ) : (
                    <div>
                      <label className="block text-navy-400 text-xs mb-1">Meses que aplica</label>
                      <div className="grid grid-cols-6 gap-1.5">
                        {MONTHS.map((m, i) => {
                          const mi = i + 1;
                          const on = months.includes(mi);
                          return (
                            <button key={mi} type="button" onClick={() => toggleMonth(mi)}
                              className={`text-xs py-1.5 rounded transition ${on
                                ? "bg-champagne text-navy-950 font-semibold"
                                : "bg-navy-700 text-navy-300 hover:bg-navy-600"}`}>
                              {m}
                            </button>
                          );
                        })}
                      </div>
                      <button type="button" onClick={() => setMonths([1,2,3,4,5,6,7,8,9,10,11,12])}
                        className="text-champagne text-xs mt-2 hover:text-champagne-light">
                        Seleccionar todos
                      </button>
                      <div className="mt-3">
                        <label className="block text-navy-400 text-xs mb-1">
                          Fecha (se usa el mismo día en todos los meses)
                        </label>
                        <input type="date" value={dateValue}
                          onChange={(e) => setDateValue(e.target.value)} className={inputCls} />
                      </div>
                      <label className="flex items-center gap-2 text-sm text-navy-200 mt-3">
                        <input type="checkbox" checked={varyAmount}
                          onChange={(e) => setVaryAmount(e.target.checked)} />
                        El importe varía por mes
                      </label>
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {/* Período en edición */}
          {isEdit && (
            <div className="bg-navy-900 rounded-xl p-4 space-y-3">
              <label className="flex items-center gap-2 text-sm text-navy-200">
                <input type="checkbox" checked={annual}
                  onChange={(e) => setAnnual(e.target.checked)} />
                Presupuesto anual
              </label>
              {!annual && (
                <div>
                  <label className="block text-navy-400 text-xs mb-1">Fecha prevista</label>
                  <input type="date" value={dateValue}
                    onChange={(e) => setDateValue(e.target.value)} className={inputCls} />
                </div>
              )}
            </div>
          )}

          {/* Importe(s) */}
          {!isEdit && recurring && varyAmount ? (
            <div>
              <label className="block text-navy-400 text-xs mb-1">Importe por mes (€)</label>
              <div className="grid grid-cols-3 gap-2">
                {months.map((mi) => (
                  <div key={mi}>
                    <span className="text-navy-500 text-xs">{MONTHS[mi - 1]}</span>
                    <input type="number" step="0.01" value={amounts[mi] || ""}
                      onChange={(e) => setAmounts({ ...amounts, [mi]: e.target.value })}
                      className={inputCls} placeholder="0.00" />
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div>
              <label className="block text-navy-400 text-xs mb-1">Importe (€) *</label>
              <input type="number" step="0.01" value={form.amount}
                onChange={(e) => setForm({ ...form, amount: e.target.value })}
                className={inputCls} placeholder="0.00" />
            </div>
          )}

          <div>
            <label className="block text-navy-400 text-xs mb-1">Notas</label>
            <input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })}
              className={inputCls} placeholder="Opcional" />
          </div>
        </div>

        <div className="flex gap-3 mt-6">
          <button onClick={onClose}
            className="flex-1 border border-navy-600 text-navy-300 hover:text-white rounded-lg py-2 text-sm transition">
            Cancelar
          </button>
          <button onClick={onSave} disabled={saving}
            className="flex-1 bg-champagne hover:bg-champagne-light text-navy-950 font-semibold rounded-lg py-2 text-sm transition disabled:opacity-50">
            {saving ? "Guardando…" : "Guardar"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function Budgets() {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1); // null = año completo
  const [view, setView] = useState("summary"); // "summary" | "comparison" | "lines"
  const [comparison, setComparison] = useState(null);
  const [lines, setLines] = useState([]);
  const [annual, setAnnual] = useState(null);
  const [catalogues, setCatalogues] = useState(null);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(null); // "new" | budget object (edit)
  const [expanded, setExpanded] = useState({});

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = { year, ...(month ? { month } : {}) };
      const [compRes, linesRes, annualRes, catRes] = await Promise.all([
        financeApi.getBudgetComparison(params),
        financeApi.getBudgets(params),
        financeApi.getBudgetAnnual({ year }),
        catalogues ? null : financeApi.getCatalogues(),
      ]);
      setComparison(compRes.data.data);
      setLines(linesRes.data.data);
      setAnnual(annualRes.data.data);
      if (catRes) setCatalogues(catRes.data.data);
    } finally {
      setLoading(false);
    }
  }, [year, month]); // eslint-disable-line

  useEffect(() => { load(); }, [load]);

  const handleDeleteBudget = async (id) => {
    if (!confirm("¿Eliminar esta línea de presupuesto?")) return;
    await financeApi.deleteBudget(id);
    load();
  };

  const catMap = Object.fromEntries((catalogues?.categories || []).map((c) => [c.id, c]));
  const subMap = Object.fromEntries((catalogues?.subcategories || []).map((s) => [s.id, s]));
  const typeMap = Object.fromEntries((catalogues?.types || []).map((t) => [t.id, t]));
  const t = comparison?.totals;

  return (
    <div>
      {/* Header + período */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
        <div>
          <h1 className="text-2xl font-semibold">Presupuestos</h1>
          <p className="text-navy-400 text-sm mt-0.5">Previsto vs real</p>
        </div>
        <div className="flex items-center gap-2">
          <select value={month || ""} onChange={(e) => setMonth(e.target.value ? parseInt(e.target.value) : null)}
            className="bg-navy-900 border border-navy-600 text-white rounded-lg px-3 py-2 text-sm">
            <option value="">Todo el año</option>
            {MONTHS.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
          </select>
          <select value={year} onChange={(e) => setYear(parseInt(e.target.value))}
            className="bg-navy-900 border border-navy-600 text-white rounded-lg px-3 py-2 text-sm">
            {[2024, 2025, 2026, 2027].map((y) => <option key={y} value={y}>{y}</option>)}
          </select>
          <button onClick={() => setModal("new")}
            className="bg-champagne hover:bg-champagne-light text-navy-950 font-semibold rounded-lg px-4 py-2 text-sm transition whitespace-nowrap">
            + Presupuesto
          </button>
        </div>
      </div>

      {/* Resumen de gastos */}
      {t && (
        <div className="grid grid-cols-3 gap-4 mb-6">
          <div className="bg-navy-800 border border-navy-700 rounded-xl p-4">
            <p className="text-navy-400 text-xs">Presupuesto gastos</p>
            <p className="text-xl font-bold text-white mt-1">{fmt(t.budget_expenses)}</p>
          </div>
          <div className="bg-navy-800 border border-navy-700 rounded-xl p-4">
            <p className="text-navy-400 text-xs">Gastado real</p>
            <p className="text-xl font-bold text-white mt-1">{fmt(t.actual_expenses)}</p>
          </div>
          <div className="bg-navy-800 border border-navy-700 rounded-xl p-4">
            <p className="text-navy-400 text-xs">Disponible</p>
            <p className={`text-xl font-bold mt-1 ${t.remaining_expenses >= 0 ? "text-green-400" : "text-red-400"}`}>
              {fmt(t.remaining_expenses)}
            </p>
          </div>
        </div>
      )}

      {/* Toggle de vista */}
      <div className="flex gap-1 bg-navy-800 rounded-lg p-1 border border-navy-700 w-fit mb-4">
        {[["summary", "Resumen anual"], ["comparison", "Comparativa"], ["lines", "Líneas"]].map(([v, label]) => (
          <button key={v} onClick={() => setView(v)}
            className={`px-4 py-1.5 rounded-md text-sm transition ${view === v
              ? "bg-navy-600 text-white font-medium" : "text-navy-400 hover:text-white"}`}>
            {label}
          </button>
        ))}
      </div>

      {loading ? (
        <p className="text-navy-400">Cargando…</p>
      ) : view === "summary" ? (
        /* ── Resumen anual ── */
        !annual ? (
          <p className="text-navy-400">Sin datos.</p>
        ) : (
          <div className="space-y-4">
            <div className="bg-navy-800 border border-navy-700 rounded-xl p-5">
              <p className="text-navy-300 text-sm font-medium mb-3">
                Presupuesto vs gasto real por mes · {year}
              </p>
              <ResponsiveContainer width="100%" height={280}>
                <ComposedChart data={annual.monthly}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#21305a" vertical={false} />
                  <XAxis dataKey="month" tickFormatter={(m) => MONTHS[m - 1]}
                    tick={{ fill: "#7f94bc", fontSize: 11 }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fill: "#7f94bc", fontSize: 11 }} axisLine={false} tickLine={false}
                    tickFormatter={(v) => v >= 1000 ? `${v / 1000}k` : v} />
                  <Tooltip content={<DarkTooltip />} cursor={{ fill: "#ffffff08" }} />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Bar dataKey="budget" name="Presupuesto" fill="#3a5490" radius={[3, 3, 0, 0]} />
                  <Line type="monotone" dataKey="actual" name="Real" stroke="#c9922a" strokeWidth={2}
                    dot={{ r: 3, fill: "#c9922a" }} />
                </ComposedChart>
              </ResponsiveContainer>
            </div>

            <div className="bg-navy-800 border border-navy-700 rounded-xl p-5">
              <p className="text-navy-300 text-sm font-medium mb-3">
                Evolución del gasto por categoría (top 6)
              </p>
              {annual.category_series.length === 0 ? (
                <p className="text-navy-500 text-sm py-8 text-center">Sin datos</p>
              ) : (
                <ResponsiveContainer width="100%" height={300}>
                  <LineChart data={MONTHS.map((label, i) => {
                    const point = { month: i + 1 };
                    annual.category_series.forEach((s) => { point[s.label] = s.values[i]; });
                    return point;
                  })}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#21305a" vertical={false} />
                    <XAxis dataKey="month" tickFormatter={(m) => MONTHS[m - 1]}
                      tick={{ fill: "#7f94bc", fontSize: 11 }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fill: "#7f94bc", fontSize: 11 }} axisLine={false} tickLine={false}
                      tickFormatter={(v) => v >= 1000 ? `${v / 1000}k` : v} />
                    <Tooltip content={<DarkTooltip />} />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                    {annual.category_series.map((s) => (
                      <Line key={s.category_id} type="monotone" dataKey={s.label}
                        stroke={s.color} strokeWidth={2} dot={false} />
                    ))}
                  </LineChart>
                </ResponsiveContainer>
              )}
            </div>

            {/* Matriz budget status: meses × clase-categoría con rating + color */}
            <div className="bg-navy-800 border border-navy-700 rounded-xl p-5">
              <p className="text-navy-300 text-sm font-medium mb-1">Estado del presupuesto</p>
              <p className="text-navy-500 text-xs mb-3">
                % gastado sobre presupuesto · pasa el ratón por una celda para ver importes
              </p>
              <div className="overflow-x-auto">
                <table className="text-xs border-separate" style={{ borderSpacing: 2 }}>
                  <thead>
                    <tr>
                      <th className="text-left px-2 py-1 text-navy-400 font-medium sticky left-0 bg-navy-800 z-10">
                        Categoría
                      </th>
                      {MONTHS.map((m) => (
                        <th key={m} className="px-1 py-1 text-navy-500 font-medium w-12 text-center">{m}</th>
                      ))}
                      <th className="px-2 py-1 text-navy-400 font-medium text-center">YTD</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(annual.matrix || []).map((row, i) => {
                      const prev = annual.matrix[i - 1];
                      const showType = !prev || prev.type_id !== row.type_id;
                      const inc = row.type_id === "T01";
                      const ytdCell = { pct: row.ytd_pct, budget: row.ytd_budget, actual: row.ytd_actual };
                      return (
                        <Fragment key={`${row.class_id}-${row.category_id}`}>
                          {showType && (
                            <tr>
                              <td colSpan={14} className="pt-3 pb-1 px-2 text-champagne text-xs font-bold uppercase tracking-wide">
                                {row.type_label}
                              </td>
                            </tr>
                          )}
                          <tr>
                            <td className="px-2 py-1 sticky left-0 bg-navy-800 z-10 whitespace-nowrap">
                              <span className="text-white">{row.category_icon} {row.category_label}</span>
                              <span className="text-navy-500 ml-1.5">· {row.class_label}</span>
                            </td>
                            {row.cells.map((cell) => (
                              <td key={cell.month} className="text-center rounded"
                                style={{ ...cellStyle(cell, inc), width: 44, height: 26 }}
                                title={cell.budget || cell.actual
                                  ? `${MONTHS[cell.month - 1]}: real ${fmt(cell.actual)} / ppto ${fmt(cell.budget)}`
                                  : ""}>
                                {cell.pct != null ? `${Math.round(cell.pct)}%` : (cell.actual > 0 ? "·" : "")}
                              </td>
                            ))}
                            <td className="text-center rounded font-semibold"
                              style={{ ...cellStyle(ytdCell, inc), width: 52, height: 26 }}
                              title={`YTD: real ${fmt(row.ytd_actual)} / ppto ${fmt(row.ytd_budget)}`}>
                              {row.ytd_pct != null ? `${Math.round(row.ytd_pct)}%` : "·"}
                            </td>
                          </tr>
                        </Fragment>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              {/* Leyenda */}
              <div className="flex items-center gap-3 mt-4 text-xs text-navy-400 flex-wrap">
                <span className="flex items-center gap-1"><span className="w-3 h-3 rounded" style={{ background: "rgba(34,197,94,0.22)" }} /> &lt;75%</span>
                <span className="flex items-center gap-1"><span className="w-3 h-3 rounded" style={{ background: "rgba(132,204,22,0.20)" }} /> 75-100%</span>
                <span className="flex items-center gap-1"><span className="w-3 h-3 rounded" style={{ background: "rgba(234,179,8,0.25)" }} /> 100-110%</span>
                <span className="flex items-center gap-1"><span className="w-3 h-3 rounded" style={{ background: "rgba(249,115,22,0.28)" }} /> 110-130%</span>
                <span className="flex items-center gap-1"><span className="w-3 h-3 rounded" style={{ background: "rgba(239,68,68,0.32)" }} /> &gt;130%</span>
                <span className="flex items-center gap-1"><span className="w-3 h-3 rounded" style={{ background: "rgba(100,116,139,0.25)" }} /> sin ppto</span>
              </div>
            </div>
          </div>
        )
      ) : view === "lines" ? (
        /* ── Vista de líneas (gestión) ── */
        lines.length === 0 ? (
          <div className="text-center py-16 text-navy-500">
            <p className="text-4xl mb-3">📝</p>
            <p>Sin líneas de presupuesto en este período.</p>
          </div>
        ) : (
          <div className="bg-navy-800 border border-navy-700 rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-navy-700 text-navy-400 text-xs uppercase tracking-wide">
                  <th className="text-left px-4 py-3">Fecha</th>
                  <th className="text-left px-4 py-3">Tipo</th>
                  <th className="text-left px-4 py-3">Categoría</th>
                  <th className="text-left px-4 py-3 hidden md:table-cell">Subcategoría</th>
                  <th className="text-right px-4 py-3">Importe</th>
                  <th className="text-right px-4 py-3">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {lines.map((b, i) => (
                  <tr key={b.id} className={`border-b border-navy-700/50 hover:bg-navy-700/20 ${i % 2 ? "bg-navy-900/20" : ""}`}>
                    <td className="px-4 py-2.5 text-navy-300">
                      {b.month ? `${String(b.day || 1).padStart(2, "0")} ${MONTHS[b.month - 1]}` : "Anual"}
                    </td>
                    <td className="px-4 py-2.5 text-navy-400 text-xs">{typeMap[b.type_id]?.label || "—"}</td>
                    <td className="px-4 py-2.5 text-white">
                      {catMap[b.category_id]?.icon} {catMap[b.category_id]?.label || "—"}
                    </td>
                    <td className="px-4 py-2.5 text-navy-400 hidden md:table-cell">
                      {b.subcategory_id ? subMap[b.subcategory_id]?.label : "—"}
                    </td>
                    <td className="px-4 py-2.5 text-right font-medium text-white">{fmt(b.amount)}</td>
                    <td className="px-4 py-2.5 text-right">
                      <button onClick={() => setModal(b)}
                        className="px-2 py-1 text-xs bg-champagne/20 hover:bg-champagne/40 text-champagne rounded transition mr-1">
                        Editar
                      </button>
                      <button onClick={() => handleDeleteBudget(b.id)}
                        className="px-2 py-1 text-xs text-red-500 hover:text-red-300 border border-red-900/50 rounded transition">
                        ✕
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      ) : !comparison?.groups?.length ? (
        <div className="text-center py-16 text-navy-500">
          <p className="text-4xl mb-3">📊</p>
          <p>Sin datos para este período.</p>
        </div>
      ) : (
        <div className="space-y-7">
          {comparison.groups.map((g) => {
            const gIncome = g.type_id === "T01";
            return (
            <div key={g.type_id || "none"}>
              {/* Cabecera de TIPO con rating */}
              <div className="flex items-center justify-between mb-3 pb-1 border-b border-navy-700">
                <h2 className="text-base font-bold uppercase tracking-wide text-champagne">
                  {g.type_label}
                </h2>
                <div className="text-sm">
                  <span className="text-navy-200">{fmt(g.actual)}</span>
                  <span className="text-navy-500"> / {fmt(g.budget)}</span>
                  {g.pct != null && (
                    <span className={`ml-2 font-semibold ${ratingText(g.pct, gIncome)}`}>
                      {g.pct}%
                    </span>
                  )}
                </div>
              </div>

              {/* Subgrupos por CLASE */}
              <div className="space-y-5">
                {g.classes.map((cl) => (
                  <div key={cl.class_id || "none"}>
                    <div className="flex items-center justify-between mb-2 px-1">
                      <h3 className="text-xs font-semibold uppercase tracking-widest text-navy-400">
                        {cl.class_label}
                      </h3>
                      <div className="text-xs">
                        <span className="text-navy-300">{fmt(cl.actual)}</span>
                        <span className="text-navy-600"> / {fmt(cl.budget)}</span>
                        {cl.pct != null && (
                          <span className={`ml-2 font-semibold ${ratingText(cl.pct, gIncome)}`}>
                            {cl.pct}%
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="space-y-2">
                      {cl.categories.map((c) => {
                        const key = `${cl.class_id}-${c.category_id}`;
                        return (
                          <CategoryCard key={key} c={c}
                            isOpen={expanded[key]}
                            onToggle={() => setExpanded((e) => ({ ...e, [key]: !e[key] }))} />
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </div>
            );
          })}

          {/* Sin categoría — movimientos y presupuesto sin categorizar */}
          {comparison.uncategorized && (
            <div className="bg-navy-800/60 border border-dashed border-navy-600 rounded-xl p-4">
              <div className="flex items-center justify-between">
                <span className="italic text-navy-400">
                  Sin categoría
                  {comparison.uncategorized.count > 0 && (
                    <span className="text-navy-600 text-xs ml-2">
                      ({comparison.uncategorized.count} movimiento{comparison.uncategorized.count !== 1 ? "s" : ""})
                    </span>
                  )}
                </span>
                <span className="text-right text-sm italic">
                  <span className="text-navy-300">{fmt(comparison.uncategorized.actual)}</span>
                  {comparison.uncategorized.budget > 0 && (
                    <span className="text-navy-500"> / {fmt(comparison.uncategorized.budget)}</span>
                  )}
                </span>
              </div>
            </div>
          )}
        </div>
      )}

      {modal && catalogues && (
        <BudgetModal
          year={year}
          catalogues={catalogues}
          editing={modal === "new" ? null : modal}
          onClose={() => setModal(null)}
          onSaved={() => { setModal(null); load(); }}
        />
      )}
    </div>
  );
}
