import { useEffect, useState, useCallback, Fragment } from "react";
import { useNavigate } from "react-router-dom";
import {
  ResponsiveContainer, ComposedChart, Bar, Line, LineChart, Cell,
  XAxis, YAxis, Tooltip, CartesianGrid, Legend,
} from "recharts";
import financeApi from "../api/finance";
import { fmtEUR as fmt } from "../utils/format";

const pad2 = (n) => String(n).padStart(2, "0");
const lastDay = (year, month) => new Date(year, month, 0).getDate();

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

// Agrega varias filas de la matriz en una (suma presupuesto/real por mes + YTD)
function aggCells(rows) {
  const cells = Array.from({ length: 12 }, (_, i) => ({ month: i + 1, budget: 0, actual: 0, pct: null }));
  let yb = 0, ya = 0;
  rows.forEach((r) => {
    r.cells.forEach((c, i) => { cells[i].budget += c.budget; cells[i].actual += c.actual; });
    yb += r.ytd_budget; ya += r.ytd_actual;
  });
  cells.forEach((c) => {
    c.budget = Math.round(c.budget * 100) / 100;
    c.actual = Math.round(c.actual * 100) / 100;
    c.pct = c.budget > 0 ? Math.round((c.actual / c.budget) * 1000) / 10 : null;
  });
  return {
    cells,
    ytd_budget: Math.round(yb * 100) / 100,
    ytd_actual: Math.round(ya * 100) / 100,
    ytd_pct: yb > 0 ? Math.round((ya / yb) * 1000) / 10 : null,
  };
}

const CLASS_LABEL = { C01: "Fijo", C02: "Variable" };
// Badge de clase (label + estilo) para listados
const CLASS_BADGE = {
  C01: { label: "Fijo", cls: "text-blue-300 bg-blue-500/15" },
  C02: { label: "Variable", cls: "text-amber-300 bg-amber-500/15" },
  C03: { label: "Especial", cls: "text-purple-300 bg-purple-500/15" },
  C04: { label: "Deuda", cls: "text-red-300 bg-red-500/15" },
};
const CLASS_SORT = { C01: 0, C02: 1, C03: 2, C04: 3 };

// Matriz "Estado del presupuesto": global, secciones por tipo, subtotales Fijo/Variable
function BudgetMatrix({ matrix, year, curYear, curMonth, goToTx, monthRange, ytdRange }) {
  const intFmt = (n) => Math.round(n).toLocaleString("es-ES");
  const row = (key, labelNode, cells, ytd, inc, filt, opts = {}) => {
    const { rowCls = "", strong = false, labelBg = "bg-navy-800" } = opts;
    const ytdClickable = ytd.ytd_budget || ytd.ytd_actual;
    const ytdAmount = ytd.ytd_pct == null && ytd.ytd_actual > 0;
    return (
      <tr key={key} className={rowCls}>
        <td className={`px-2 py-1 sticky left-0 z-10 whitespace-nowrap ${labelBg}`}>{labelNode}</td>
        {cells.map((cell) => {
          const isCur = year === curYear && cell.month === curMonth;
          const clickable = cell.budget || cell.actual;
          // Sin presupuesto pero con gasto real → mostramos el importe (que duela)
          const isAmount = cell.pct == null && cell.actual > 0;
          const fontCls = isAmount ? "text-[10px] leading-none"
            : isCur ? "font-bold text-[13px]" : strong ? "font-semibold" : "";
          return (
            <td key={cell.month}
              onClick={clickable ? () => goToTx({ ...filt, ...monthRange(cell.month) }) : undefined}
              className={`text-center rounded ${clickable ? "cursor-pointer hover:brightness-125" : ""} ${fontCls}`}
              style={{ ...cellStyle(cell, inc), width: 44, height: 26, ...(isCur ? { boxShadow: "inset 0 0 0 1.5px #d4af6e" } : {}) }}
              title={cell.budget || cell.actual
                ? `${MONTHS[cell.month - 1]}: real ${fmt(cell.actual)} / ppto ${fmt(cell.budget)} — clic para ver movimientos`
                : ""}>
              {cell.pct != null ? `${Math.round(cell.pct)}%` : (isAmount ? intFmt(cell.actual) : "")}
            </td>
          );
        })}
        <td onClick={ytdClickable ? () => goToTx({ ...filt, ...ytdRange() }) : undefined}
          className={`text-center rounded ${ytdAmount ? "text-[10px] leading-none font-semibold" : "font-semibold"} ${ytdClickable ? "cursor-pointer hover:brightness-125" : ""}`}
          style={{ ...cellStyle({ pct: ytd.ytd_pct, actual: ytd.ytd_actual }, inc), width: 52, height: 26 }}
          title={`YTD: real ${fmt(ytd.ytd_actual)} / ppto ${fmt(ytd.ytd_budget)} — clic para ver movimientos`}>
          {ytd.ytd_pct != null ? `${Math.round(ytd.ytd_pct)}%` : (ytdAmount ? intFmt(ytd.ytd_actual) : "·")}
        </td>
      </tr>
    );
  };

  const global = aggCells(matrix.filter((r) => r.type_id !== "T01"));
  const classAgg = {
    C01: aggCells(matrix.filter((r) => r.type_id === "T02" && r.class_id === "C01")),
    C02: aggCells(matrix.filter((r) => r.type_id === "T02" && r.class_id === "C02")),
  };

  const bodyRows = [];
  let curType = null;
  matrix.forEach((r, i) => {
    if (r.type_id !== curType) {
      curType = r.type_id;
      bodyRows.push(
        <tr key={`h-${r.type_id}`}>
          <td colSpan={14} className="pt-3 pb-1 px-2">
            <span className="sticky left-2 inline-block text-champagne text-xs font-bold uppercase tracking-wide">
              {r.type_label}
            </span>
          </td>
        </tr>
      );
    }
    bodyRows.push(row(
      `${r.class_id}-${r.category_id}`,
      <><span className="text-white">{r.category_icon} {r.category_label}</span>
        <span className="text-navy-500 ml-1.5">· {r.class_label}</span></>,
      r.cells, { ytd_budget: r.ytd_budget, ytd_actual: r.ytd_actual, ytd_pct: r.ytd_pct },
      r.type_id === "T01", { type_id: r.type_id, category_id: r.category_id },
    ));
    // Subtotal Fijo/Variable al cerrar el grupo dentro de Gasto
    const next = matrix[i + 1];
    if (r.type_id === "T02" && CLASS_LABEL[r.class_id] &&
        (!next || next.type_id !== "T02" || next.class_id !== r.class_id)) {
      const agg = classAgg[r.class_id];
      bodyRows.push(row(
        `sub-${r.class_id}`,
        <span className="text-navy-200 font-semibold">Total {CLASS_LABEL[r.class_id]}</span>,
        agg.cells, agg, false, { type_id: "T02", class_id: r.class_id },
        { strong: true, labelBg: "bg-navy-900" },
      ));
    }
  });

  return (
    <table className="text-xs border-separate" style={{ borderSpacing: 2 }}>
      <thead>
        <tr>
          <th className="text-left px-2 py-1 text-navy-400 font-medium sticky left-0 bg-navy-800 z-10">Categoría</th>
          {MONTHS.map((m, i) => {
            const isCur = year === curYear && i + 1 === curMonth;
            return (
              <th key={m} className={`px-1 py-1 w-12 text-center ${isCur
                ? "text-champagne font-bold text-sm" : "text-navy-500 font-medium"}`}>{m}</th>
            );
          })}
          <th className="px-2 py-1 text-navy-400 font-medium text-center">YTD</th>
        </tr>
      </thead>
      <tbody>
        {row("global", <span className="text-white font-bold">🌐 Global del mes</span>,
          global.cells, global, false, {}, { strong: true, labelBg: "bg-navy-900" })}
        <tr><td colSpan={14} className="h-1" /></tr>
        {bodyRows}
      </tbody>
    </table>
  );
}

// ── Análisis del mes ────────────────────────────────────────────────────────
function MonthAnalysis({ comparison, lines, year, month, curYear, curMonth, goToTx, monthRange }) {
  const [sel, setSel] = useState(null);          // categoría seleccionada (drill-down)
  const [timeline, setTimeline] = useState(null);
  const [loadingTl, setLoadingTl] = useState(false);
  const [showUpcoming, setShowUpcoming] = useState(false);
  const curLabel = `${MONTHS[month - 1]} ${String(year).slice(2)}`;

  const t = comparison?.totals;
  const budget = t?.budget_expenses || 0;
  const actual = t?.actual_expenses || 0;
  const remaining = t?.remaining_expenses ?? (budget - actual);
  const spentPct = budget > 0 ? (actual / budget) * 100 : (actual > 0 ? 100 : 0);

  const isCurrent = year === curYear && month === curMonth;
  const daysInMonth = new Date(year, month, 0).getDate();
  const day = isCurrent ? new Date().getDate() : daysInMonth;
  const elapsedFrac = day / daysInMonth;
  const projection = isCurrent && day > 0 ? actual / elapsedFrac : actual;

  const OUT = ["T04", "T06", "T02", "T05"];   // salidas: inversión, ahorro, gasto, deuda
  const TYPE_COLOR = { T02: "#ef4444", T04: "#3b82f6", T06: "#2dd4bf", T05: "#f59e0b" };
  const TYPE_ORDER_V = { T04: 1, T06: 2, T02: 3, T05: 4 };

  // "Esperado a día de hoy" según el día de cada línea de presupuesto (todas las salidas):
  // los fijos con día (hipoteca) cuentan enteros una vez pasa su día; lo no fechado se reparte.
  const expLines = (lines || []).filter((l) => OUT.includes(l.type_id) && l.month === month);
  const lineExpected = (l) => l.day ? (l.day <= day ? Number(l.amount) : 0) : Number(l.amount) * elapsedFrac;
  const expectedByCat = {};
  const daysByCat = {};   // category_id → días con presupuesto fechado (para el "cuándo")
  expLines.forEach((l) => {
    expectedByCat[l.category_id] = (expectedByCat[l.category_id] || 0) + lineExpected(l);
    if (l.day) (daysByCat[l.category_id] ||= new Set()).add(l.day);
  });
  const whenFor = (catId) => {
    let ds = daysByCat[catId] ? [...daysByCat[catId]].sort((a, b) => a - b) : [];
    if (isCurrent) ds = ds.filter((d) => d > day);   // solo días aún por venir
    return ds.length ? `día ${ds.join(", ")}` : null;
  };
  const expectedTotal = isCurrent ? Object.values(expectedByCat).reduce((a, b) => a + b, 0) : budget;
  const markerPct = budget > 0 ? Math.min((expectedTotal / budget) * 100, 100) : 0;

  let status, statusColor;
  if (budget <= 0) { status = "Sin presupuesto este mes"; statusColor = "text-navy-400"; }
  else if (actual > budget) { status = "Te has pasado del presupuesto"; statusColor = "text-red-400"; }
  else if (isCurrent && actual > expectedTotal * 1.05) { status = "Vas por encima del ritmo"; statusColor = "text-amber-400"; }
  else if (isCurrent && actual < expectedTotal * 0.95) { status = "Vas holgado"; statusColor = "text-green-400"; }
  else { status = isCurrent ? "Vas al día" : "Cerrado"; statusColor = "text-green-400"; }
  const barColor = actual > budget ? "#ef4444"
    : (isCurrent && actual > expectedTotal * 1.05 ? "#eab308" : "#22c55e");

  const severity = (c) => {
    const o = c.budget > 0 ? c.actual - c.budget : 0;
    return [o > 0 ? 0 : 1, -(c.budget > 0 ? c.actual / c.budget : 9), -c.actual];
  };

  // Balance del mes: lo que entra (ingresos) vs todo lo que sale
  const typeTot = {};
  (comparison?.groups || []).forEach((g) => { typeTot[g.type_id] = { label: g.type_label, budget: g.budget, actual: g.actual }; });
  const income = typeTot.T01?.actual || 0;
  const outflowTotal = OUT.reduce((s, k) => s + (typeTot[k]?.actual || 0), 0);
  const net = income - outflowTotal;

  // Todas las categorías de salida, ordenadas por tipo (Vestra) → clase → severidad
  const allCats = [];
  (comparison?.groups || []).filter((g) => OUT.includes(g.type_id)).forEach((g) =>
    (g.classes || []).forEach((cl) =>
      (cl.categories || []).forEach((c) =>
        allCats.push({ ...c, type_id: g.type_id, type_label: g.type_label,
          class_id: c.class_id ?? cl.class_id, expected: expectedByCat[c.category_id] || 0 }))));
  const byTypeClass = (a, b) =>
    ((TYPE_ORDER_V[a.type_id] ?? 9) - (TYPE_ORDER_V[b.type_id] ?? 9))
    || ((CLASS_SORT[a.class_id] ?? 9) - (CLASS_SORT[b.class_id] ?? 9));
  allCats.sort((a, b) => {
    const td = byTypeClass(a, b);
    if (td) return td;
    const sa = severity(a), sb = severity(b);
    return sa[0] - sb[0] || sa[1] - sb[1] || sa[2] - sb[2];
  });

  // Por venir (todas las salidas con presupuesto sin gastar) — orden tipo → clase
  const upcoming = allCats.filter((c) => c.budget > 0 && c.remaining > 0.5)
    .sort((a, b) => byTypeClass(a, b) || (b.remaining - a.remaining));
  const totalUpcoming = upcoming.reduce((s, c) => s + c.remaining, 0);

  // Drill-down: histórico de la categoría seleccionada
  useEffect(() => { setSel(null); }, [year, month]);
  useEffect(() => {
    if (!sel) { setTimeline(null); return; }
    setLoadingTl(true);
    financeApi.getCategoryTimeline({ category_id: sel.category_id, year, month, type_id: sel.type_id })
      .then((r) => setTimeline(r.data.data)).finally(() => setLoadingTl(false));
  }, [sel, year, month]);

  const catColor = (c) => !(c.budget > 0) ? "#64748b"
    : (c.actual > c.budget ? "#ef4444" : (isCurrent && c.actual > c.expected * 1.05 ? "#eab308" : "#22c55e"));

  return (
    <div className="space-y-4">
      {/* Balance del mes: lo que entra vs todo lo que sale */}
      <div className="bg-navy-800 border border-navy-700 rounded-xl p-5">
        <p className="text-navy-300 text-sm font-medium mb-3">Balance del mes</p>
        <div className="grid grid-cols-3 gap-3 mb-3">
          <div>
            <p className="text-navy-500 text-xs">Entra (ingresos)</p>
            <p className="text-green-400 font-bold text-lg">{fmt(income)}</p>
          </div>
          <div>
            <p className="text-navy-500 text-xs">Sale (todo)</p>
            <p className="text-red-400 font-bold text-lg">{fmt(outflowTotal)}</p>
          </div>
          <div>
            <p className="text-navy-500 text-xs">Neto</p>
            <p className={`font-bold text-lg ${net >= 0 ? "text-green-400" : "text-red-400"}`}>{net >= 0 ? "+" : ""}{fmt(net)}</p>
          </div>
        </div>
        {/* Barra de salidas apiladas por tipo */}
        <div className="flex h-3 rounded-full overflow-hidden bg-navy-900">
          {OUT.map((k) => {
            const v = typeTot[k]?.actual || 0;
            const w = outflowTotal > 0 ? (v / outflowTotal) * 100 : 0;
            return w > 0 ? <div key={k} style={{ width: `${w}%`, background: TYPE_COLOR[k] }} /> : null;
          })}
        </div>
        <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2 text-xs">
          {OUT.filter((k) => (typeTot[k]?.actual || 0) > 0).map((k) => (
            <button key={k} onClick={() => goToTx({ type_id: k, ...monthRange(month) })}
              className="flex items-center gap-1.5 text-navy-300 hover:text-white">
              <span className="w-2.5 h-2.5 rounded-sm" style={{ background: TYPE_COLOR[k] }} />
              {typeTot[k].label} <span className="text-navy-500">{fmt(typeTot[k].actual)}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Ritmo del gasto */}
      <div className="bg-navy-800 border border-navy-700 rounded-xl p-5">
        <div className="flex items-center justify-between mb-3">
          <p className="text-navy-300 text-sm font-medium">Ritmo de salidas</p>
          <span className={`text-xs font-semibold ${statusColor}`}>{status}</span>
        </div>
        <div className="relative h-5 bg-navy-900 rounded-full overflow-hidden">
          <div className="h-full rounded-full transition-all" style={{ width: `${Math.min(spentPct, 100)}%`, background: barColor }} />
          {isCurrent && (
            <div className="absolute top-0 bottom-0 w-1 bg-champagne rounded" style={{ left: `calc(${markerPct}% - 2px)` }} />
          )}
        </div>
        <div className="flex items-center justify-between mt-1.5 text-xs text-navy-500">
          <span>Gastado <span className="text-white font-medium">{fmt(actual)}</span> de {fmt(budget)}</span>
          {isCurrent && <span className="text-champagne">▲ esperado hoy ({Math.round(markerPct)}%)</span>}
        </div>

        <div className="grid grid-cols-3 gap-3 mt-4">
          <div>
            <p className="text-navy-500 text-xs">Disponible</p>
            <p className={`font-bold ${remaining >= 0 ? "text-green-400" : "text-red-400"}`}>{fmt(remaining)}</p>
          </div>
          <button onClick={() => setShowUpcoming((s) => !s)} className="text-left">
            <p className="text-navy-500 text-xs flex items-center gap-1">Por venir <span className="text-[9px]">{showUpcoming ? "▲" : "▼"}</span></p>
            <p className="text-navy-200 font-bold">{fmt(totalUpcoming)}</p>
          </button>
          <div>
            <p className="text-navy-500 text-xs">{isCurrent ? "Proyección fin" : `Día ${day}/${daysInMonth}`}</p>
            <p className={`font-bold ${isCurrent ? (projection > budget ? "text-red-400" : "text-green-400") : "text-navy-200"}`}>
              {isCurrent ? fmt(projection) : `${Math.round(spentPct)}%`}
            </p>
          </div>
        </div>

        {/* Detalle de "Por venir" */}
        {showUpcoming && (
          <div className="mt-4 pt-3 border-t border-navy-700">
            {upcoming.length === 0 ? (
              <p className="text-navy-500 text-sm text-center py-2">No queda presupuesto por gastar</p>
            ) : (
              <div className="space-y-0.5">
                {upcoming.map((c, i) => {
                  const prev = upcoming[i - 1];
                  const newType = !prev || prev.type_id !== c.type_id;
                  const sub = upcoming.filter((x) => x.type_id === c.type_id).reduce((s, x) => s + x.remaining, 0);
                  return (
                    <Fragment key={`${c.type_id}-${c.category_id}`}>
                      {newType && (
                        <div className="flex items-center justify-between px-2 pt-2 first:pt-0">
                          <span className="text-xs font-bold uppercase tracking-wide" style={{ color: TYPE_COLOR[c.type_id] }}>
                            {c.type_label}
                          </span>
                          <span className="text-navy-500 text-xs">quedan {fmt(sub)}</span>
                        </div>
                      )}
                      <button onClick={() => setSel(c)}
                        className="w-full flex items-center justify-between gap-2 text-sm hover:bg-navy-700/30 rounded-lg px-2 py-1 transition">
                        <span className="flex items-baseline gap-2 truncate text-navy-200">
                          {c.category_icon} {c.category_label}
                          {CLASS_BADGE[c.class_id] && (
                            <span className={`text-[10px] px-1.5 rounded ${CLASS_BADGE[c.class_id].cls}`}>{CLASS_BADGE[c.class_id].label}</span>
                          )}
                          {whenFor(c.category_id) && (
                            <span className="text-[10px] text-champagne whitespace-nowrap">🗓 {whenFor(c.category_id)}</span>
                          )}
                        </span>
                        <span className="text-navy-300 whitespace-nowrap">{fmt(c.remaining)}</span>
                      </button>
                    </Fragment>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Salidas por categoría (todos los tipos · clic → drill-down) */}
      <div className="bg-navy-800 border border-navy-700 rounded-xl p-4">
        <p className="text-navy-300 text-sm font-medium mb-1 px-1">Salidas por categoría</p>
        <p className="text-navy-500 text-xs mb-2 px-1">Gasto · inversión · ahorro · deuda — pulsa para el detalle</p>
        <div className="space-y-1 max-h-[28rem] overflow-y-auto momentum-scroll">
          {allCats.map((c, i) => {
            const prev = allCats[i - 1];
            const newType = !prev || prev.type_id !== c.type_id;
            const newClass = newType || prev.class_id !== c.class_id;
            const tt = typeTot[c.type_id];
            const pct = c.budget > 0 ? Math.min((c.actual / c.budget) * 100, 100) : (c.actual > 0 ? 100 : 0);
            const expPct = c.budget > 0 ? Math.min((c.expected / c.budget) * 100, 100) : 0;
            const open = sel?.category_id === c.category_id && sel?.type_id === c.type_id;
            return (
              <Fragment key={`${c.type_id}-${c.category_id}`}>
                {newType && (
                  <div className="flex items-center justify-between px-1 pt-2 first:pt-0">
                    <span className="text-xs font-bold uppercase tracking-wide" style={{ color: TYPE_COLOR[c.type_id] }}>
                      {c.type_label}
                    </span>
                    <span className="text-navy-500 text-xs">
                      {fmt(tt?.actual || 0)}{tt?.budget > 0 ? <span className="text-navy-600"> / {fmt(tt.budget)}</span> : null}
                    </span>
                  </div>
                )}
                {newClass && CLASS_BADGE[c.class_id] && (
                  <p className={`px-2 pt-0.5 text-[10px] font-semibold uppercase tracking-wide ${c.class_id === "C01"
                    ? "text-blue-300" : "text-amber-300"}`}>{CLASS_BADGE[c.class_id].label}</p>
                )}
                <button onClick={() => setSel(open ? null : c)}
                  className={`w-full text-left py-1.5 px-2 rounded-lg transition ${open ? "bg-navy-700/50" : "hover:bg-navy-700/30"}`}>
                  <div className="flex items-center justify-between gap-2 text-sm">
                    <span className="text-white truncate">{c.category_icon} {c.category_label}</span>
                    <span className="text-xs whitespace-nowrap">
                      {c.budget > 0 && c.actual > c.budget
                        ? <span className="text-red-400">+{fmt(c.actual - c.budget)}</span>
                        : <span className="text-navy-400">{fmt(c.actual)}{c.budget > 0 ? ` / ${fmt(c.budget)}` : ""}</span>}
                    </span>
                  </div>
                  <div className="relative mt-1 h-1.5 bg-navy-900 rounded-full overflow-hidden">
                    <div className="h-full rounded-full" style={{ width: `${pct}%`, background: catColor(c) }} />
                    {isCurrent && c.budget > 0 && (
                      <div className="absolute top-0 bottom-0 w-0.5 bg-champagne" style={{ left: `${expPct}%` }} />
                    )}
                  </div>
                </button>
              </Fragment>
            );
          })}
        </div>
      </div>

      {/* Drill-down */}
      {sel && (
        <div className="bg-navy-800 border border-champagne/40 rounded-xl p-5">
          <div className="flex items-center justify-between mb-3">
            <p className="text-white font-semibold">{sel.category_icon} {sel.category_label}</p>
            <button onClick={() => setSel(null)} className="text-navy-400 hover:text-white text-sm">✕</button>
          </div>

          {/* Histórico 6 meses atrás + 3 adelante */}
          <p className="text-navy-400 text-xs mb-2">Presupuesto vs gasto · 6 meses atrás → 3 adelante</p>
          {loadingTl || !timeline ? (
            <p className="text-navy-500 text-sm py-8 text-center">Cargando…</p>
          ) : (
            <ResponsiveContainer width="100%" height={200}>
              <ComposedChart data={timeline} barGap={2}>
                <CartesianGrid strokeDasharray="3 3" stroke="#21305a" vertical={false} />
                <XAxis dataKey="label" axisLine={false} tickLine={false} interval={0}
                  tick={({ x, y, payload }) => {
                    const cur = payload.value === curLabel;
                    return (
                      <text x={x} y={y + 9} textAnchor="middle" fontSize={cur ? 10 : 9}
                        fontWeight={cur ? 700 : 400} fill={cur ? "#d4af6e" : "#7f94bc"}>
                        {payload.value}
                      </text>
                    );
                  }} />
                <YAxis tick={{ fill: "#7f94bc", fontSize: 10 }} axisLine={false} tickLine={false}
                  width={40} tickFormatter={(v) => v >= 1000 ? `${Math.round(v / 1000)}k` : v} />
                <Tooltip content={<DarkTooltip />} cursor={{ fill: "#ffffff08" }} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Bar dataKey="budget" name="Presupuesto" fill="#3a5490" radius={[2, 2, 0, 0]} />
                <Bar dataKey="actual" name="Gastado" radius={[2, 2, 0, 0]}>
                  {timeline.map((m, i) => (
                    <Cell key={i} fill={m.budget > 0 && m.actual > m.budget ? "#ef4444"
                      : m.current ? "#d4af6e" : "#22c55e"} />
                  ))}
                </Bar>
              </ComposedChart>
            </ResponsiveContainer>
          )}

          {/* Subcategorías */}
          <p className="text-navy-400 text-xs mt-4 mb-2">¿Dónde se va? · subcategorías de {MONTHS[month - 1]}</p>
          {!sel.subcategories || sel.subcategories.length === 0 ? (
            <p className="text-navy-500 text-sm py-4 text-center">Sin subcategorías este mes</p>
          ) : (
            <div className="space-y-1.5">
              {(() => {
                // Para subcategorías sin presupuesto, la barra es su peso sobre el mayor gasto
                const maxActual = Math.max(...sel.subcategories.map((x) => x.actual), 1);
                return [...sel.subcategories].sort((a, b) => b.actual - a.actual).map((s) => {
                  // Con presupuesto → consumo (actual/ppto); sin presupuesto → peso relativo
                  const pct = s.budget > 0
                    ? Math.min((s.actual / s.budget) * 100, 100)
                    : (s.actual / maxActual) * 100;
                  const col = s.budget > 0 ? (s.actual > s.budget ? "#ef4444" : "#22c55e") : "#64748b";
                  return (
                    <div key={s.subcategory_id} className="text-sm">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-navy-200 truncate">{s.subcategory_label}</span>
                        <span className="text-navy-400 text-xs whitespace-nowrap">
                          {fmt(s.actual)}{s.budget > 0 ? <span className="text-navy-600"> / {fmt(s.budget)}</span> : null}
                        </span>
                      </div>
                      <div className="mt-0.5 h-1.5 bg-navy-900 rounded-full overflow-hidden">
                        <div className="h-full rounded-full" style={{ width: `${pct}%`, background: col }} />
                      </div>
                    </div>
                  );
                });
              })()}
            </div>
          )}
          <button onClick={() => goToTx({ type_id: "T02", category_id: sel.category_id, ...monthRange(month) })}
            className="mt-4 text-xs text-champagne hover:text-gold-300">Ver movimientos del mes →</button>
        </div>
      )}
    </div>
  );
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
                                ? "bg-champagne text-[#0a1020] font-semibold"
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
            className="flex-1 bg-champagne hover:bg-champagne-light text-[#0a1020] font-semibold rounded-lg py-2 text-sm transition disabled:opacity-50">
            {saving ? "Guardando…" : "Guardar"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function Budgets() {
  const navigate = useNavigate();
  const now = new Date();
  const curYear = now.getFullYear();
  const curMonth = now.getMonth() + 1;
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1); // null = año completo
  const [view, setView] = useState("month"); // "month" | "summary" | "comparison" | "lines"
  const [comparison, setComparison] = useState(null);
  const [lines, setLines] = useState([]);
  const [annual, setAnnual] = useState(null);
  const [catalogues, setCatalogues] = useState(null);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(null); // "new" | budget object (edit)
  const [expanded, setExpanded] = useState({});

  // Navega a Transacciones con filtros (tipo, categoría y rango de fechas)
  const goToTx = ({ type_id, category_id, date_from, date_to }) => {
    const p = new URLSearchParams();
    if (type_id) p.set("type_id", type_id);
    if (category_id) p.set("category_id", category_id);
    if (date_from) p.set("date_from", date_from);
    if (date_to) p.set("date_to", date_to);
    navigate(`/transactions?${p.toString()}`);
  };
  // Mes → rango de fechas completo; YTD → del 1 enero al 31 diciembre del año
  const monthRange = (m) => ({ date_from: `${year}-${pad2(m)}-01`, date_to: `${year}-${pad2(m)}-${pad2(lastDay(year, m))}` });
  const ytdRange = () => ({ date_from: `${year}-01-01`, date_to: `${year}-12-31` });

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
            className="bg-champagne hover:bg-champagne-light text-[#0a1020] font-semibold rounded-lg px-4 py-2 text-sm transition whitespace-nowrap">
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
      <div className="flex gap-1 bg-navy-800 rounded-lg p-1 border border-navy-700 w-full sm:w-fit overflow-x-auto momentum-scroll mb-4">
        {[["month", "Análisis mes"], ["summary", "Resumen anual"], ["comparison", "Comparativa"], ["lines", "Líneas"]].map(([v, label]) => (
          <button key={v} onClick={() => { setView(v); if (v === "month" && !month) setMonth(curMonth); }}
            className={`px-3 sm:px-4 py-1.5 rounded-md text-sm transition whitespace-nowrap ${view === v
              ? "bg-navy-600 text-white font-medium" : "text-navy-400 hover:text-white"}`}>
            {label}
          </button>
        ))}
      </div>

      {loading ? (
        <p className="text-navy-400">Cargando…</p>
      ) : view === "month" ? (
        /* ── Análisis del mes ── */
        !month ? (
          <p className="text-navy-500 text-sm py-10 text-center">Elige un mes para ver el análisis.</p>
        ) : (
          <MonthAnalysis comparison={comparison} lines={lines} year={year} month={month}
            curYear={curYear} curMonth={curMonth} goToTx={goToTx} monthRange={monthRange} />
        )
      ) : view === "summary" ? (
        /* ── Resumen anual ── */
        !annual ? (
          <p className="text-navy-400">Sin datos.</p>
        ) : (
          <div className="flex flex-col gap-4">
            <div className="order-2 bg-navy-800 border border-navy-700 rounded-xl p-5">
              <p className="text-navy-300 text-sm font-medium mb-1">Balance mensual · {year}</p>
              <p className="text-navy-500 text-xs mb-3">
                Ingresos vs destino del dinero (gasto + inversión + ahorro) · líneas punteadas = presupuesto
              </p>
              <ResponsiveContainer width="100%" height={300}>
                <ComposedChart data={annual.monthly} barGap={2}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#21305a" vertical={false} />
                  <XAxis dataKey="month" tickFormatter={(m) => MONTHS[m - 1]}
                    tick={{ fill: "#7f94bc", fontSize: 11 }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fill: "#7f94bc", fontSize: 11 }} axisLine={false} tickLine={false}
                    tickFormatter={(v) => v >= 1000 ? `${v / 1000}k` : v} />
                  <Tooltip content={<DarkTooltip />} cursor={{ fill: "#ffffff08" }} />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  {/* Columna de ingresos */}
                  <Bar dataKey="income" name="Ingresos" stackId="in" fill="#22c55e" radius={[3, 3, 0, 0]} />
                  {/* Columna de salidas apiladas */}
                  <Bar dataKey="expense" name="Gastos" stackId="out" fill="#ef4444" />
                  <Bar dataKey="investment" name="Inversión" stackId="out" fill="#c9922a" />
                  <Bar dataKey="savings" name="Ahorro" stackId="out" fill="#2dd4bf" radius={[3, 3, 0, 0]} />
                  {/* Presupuestos como líneas punteadas */}
                  <Line type="monotone" dataKey="income_budget" name="Ppto ingresos" stroke="#22c55e"
                    strokeWidth={1.5} strokeDasharray="4 3" dot={false} />
                  <Line type="monotone" dataKey="out_budget" name="Ppto salidas" stroke="#94a3b8"
                    strokeWidth={1.5} strokeDasharray="4 3" dot={false} />
                </ComposedChart>
              </ResponsiveContainer>
            </div>

            <div className="order-3 bg-navy-800 border border-navy-700 rounded-xl p-5">
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
            <div className="order-1 bg-navy-800 border border-navy-700 rounded-xl p-5">
              <p className="text-navy-300 text-sm font-medium mb-1">Estado del presupuesto</p>
              <p className="text-navy-500 text-xs mb-3">
                % gastado sobre presupuesto · pasa el ratón por una celda para ver importes · clic para ver los movimientos
              </p>
              <div className="overflow-x-auto">
                <BudgetMatrix matrix={annual.matrix || []} year={year} curYear={curYear}
                  curMonth={curMonth} goToTx={goToTx} monthRange={monthRange} ytdRange={ytdRange} />
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
                  <th className="text-left px-4 py-3">Clase</th>
                  <th className="text-left px-4 py-3">Categoría</th>
                  <th className="text-left px-4 py-3 hidden md:table-cell">Subcategoría</th>
                  <th className="text-right px-4 py-3">Importe</th>
                  <th className="text-right px-4 py-3">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {[...lines].sort((a, b) => {
                  const TO = { T01: 0, T02: 1, T04: 2, T05: 3, T06: 4 };
                  const ta = TO[a.type_id] ?? 9, tb = TO[b.type_id] ?? 9;
                  if (ta !== tb) return ta - tb;
                  const cla = CLASS_SORT[a.class_id] ?? 9, clb = CLASS_SORT[b.class_id] ?? 9;
                  if (cla !== clb) return cla - clb;
                  const ca = catMap[a.category_id]?.label || "", cb = catMap[b.category_id]?.label || "";
                  if (ca !== cb) return ca.localeCompare(cb);
                  const sa = subMap[a.subcategory_id]?.label || "", sb = subMap[b.subcategory_id]?.label || "";
                  if (sa !== sb) return sa.localeCompare(sb);
                  return (a.month || 0) - (b.month || 0);
                }).map((b, i) => (
                  <tr key={b.id} className={`border-b border-navy-700/50 hover:bg-navy-700/20 ${i % 2 ? "bg-navy-900/20" : ""}`}>
                    <td className="px-4 py-2.5 text-navy-300">
                      {b.month ? `${String(b.day || 1).padStart(2, "0")} ${MONTHS[b.month - 1]}` : "Anual"}
                    </td>
                    <td className="px-4 py-2.5 text-navy-400 text-xs">{typeMap[b.type_id]?.label || "—"}</td>
                    <td className="px-4 py-2.5">
                      {CLASS_BADGE[b.class_id]
                        ? <span className={`text-[10px] px-1.5 py-0.5 rounded ${CLASS_BADGE[b.class_id].cls}`}>{CLASS_BADGE[b.class_id].label}</span>
                        : <span className="text-navy-600 text-xs">—</span>}
                    </td>
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
