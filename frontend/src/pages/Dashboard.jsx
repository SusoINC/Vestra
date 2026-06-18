import { useEffect, useState, useMemo } from "react";
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid,
  PieChart, Pie, Cell, Legend, Area, AreaChart,
} from "recharts";
import useAuthStore from "../store/authStore";
import financeApi from "../api/finance";
import investmentApi from "../api/investment";
import { fmtEUR } from "../utils/format";
import CalendarHeatmap from "../components/charts/CalendarHeatmap";
import Gauge from "../components/charts/Gauge";

const MONTHS = ["Ene", "Feb", "Mar", "Abr", "May", "Jun",
                "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];

// Tooltip oscuro reutilizable
function DarkTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-navy-950 border border-navy-600 rounded-lg px-3 py-2 text-xs shadow-xl">
      {label != null && <p className="text-navy-300 mb-1">{typeof label === "number" ? MONTHS[label - 1] : label}</p>}
      {payload.map((p, i) => (
        <p key={i} style={{ color: p.color || p.fill }}>
          {p.name}: <span className="font-semibold">{fmtEUR(p.value)}</span>
        </p>
      ))}
    </div>
  );
}

// ── KPI card ────────────────────────────────────────────────────────────────
function Kpi({ label, value, sub, accent = "text-white", icon, placeholder }) {
  return (
    <div className="bg-navy-800 border border-navy-700 rounded-xl p-4 relative overflow-hidden">
      {icon && <span className="absolute right-3 top-3 text-2xl opacity-20">{icon}</span>}
      <p className="text-navy-400 text-xs">{label}</p>
      <p className={`text-2xl font-bold mt-1 ${accent}`}>{value}</p>
      {sub && <p className="text-navy-500 text-xs mt-0.5">{sub}</p>}
      {placeholder && (
        <span className="absolute right-3 bottom-2 text-[9px] text-navy-600 uppercase tracking-wide">próximamente</span>
      )}
    </div>
  );
}

export default function Dashboard() {
  const user = useAuthStore((s) => s.user);
  const [year, setYear] = useState(new Date().getFullYear());
  const [data, setData] = useState(null);
  const [invest, setInvest] = useState(null);
  const [loading, setLoading] = useState(true);
  const [donutMode, setDonutMode] = useState("all"); // all | fixed | variable

  useEffect(() => {
    setLoading(true);
    financeApi.getDashboard({ year })
      .then((r) => setData(r.data.data))
      .finally(() => setLoading(false));
  }, [year]);

  useEffect(() => {
    investmentApi.getPortfolio()
      .then((r) => setInvest(r.data.data.totals))
      .catch(() => {});
  }, []);

  const k = data?.kpis;

  // Máximo de gasto diario para escalar ambos heatmaps con la misma escala
  const heatMax = useMemo(() => {
    if (!data) return 1;
    const all = [...data.heatmap.current, ...data.heatmap.previous].map((d) => d.amount);
    return Math.max(1, ...all);
  }, [data]);

  const DONUT_KEY = { all: "top_categories", fixed: "top_categories_fixed", variable: "top_categories_variable" };
  const pieData = (data?.[DONUT_KEY[donutMode]] || []).map((c) => ({
    name: c.label, value: c.amount, fill: c.color,
  }));

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold">Hola, {user?.name?.split(" ")[0] || ""} 👋</h1>
          <p className="text-navy-400 text-sm mt-0.5">Tu resumen financiero de {year}</p>
        </div>
        <select value={year} onChange={(e) => setYear(parseInt(e.target.value))}
          className="bg-navy-900 border border-navy-600 text-white rounded-lg px-3 py-2 text-sm">
          {[2023, 2024, 2025, 2026, 2027].map((y) => <option key={y} value={y}>{y}</option>)}
        </select>
      </div>

      {loading || !data ? (
        <p className="text-navy-400">Cargando…</p>
      ) : (
        <div className="space-y-6">
          {/* KPIs */}
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
            <Kpi label="Ingresos YTD" icon="💶" accent="text-green-400"
              value={fmtEUR(k.income_ytd)} />
            <Kpi label="Gastos YTD" icon="💸" accent="text-red-400"
              value={fmtEUR(k.expense_ytd)} />
            <Kpi label="Ahorro YTD" icon="🐖"
              accent={k.net_ytd >= 0 ? "text-green-400" : "text-red-400"}
              value={fmtEUR(k.net_ytd)}
              sub={k.savings_rate != null ? `Tasa ahorro ${k.savings_rate}%` : null} />
            <Kpi label="Inversiones" icon="📈" accent="text-champagne"
              value={invest ? fmtEUR(invest.value) : "—"}
              sub={invest && invest.pnl_pct != null
                ? `${invest.pnl >= 0 ? "+" : ""}${invest.pnl_pct}% rentab.` : null} />
            <Kpi label="Vehículos" icon="🚗" accent="text-champagne"
              value="—" placeholder />
          </div>

          {/* Fila: Gauge rating + Ingresos/Gastos/Inversión */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <div className="bg-navy-800 border border-navy-700 rounded-xl p-5 flex flex-col items-center justify-center">
              <p className="text-navy-300 text-sm font-medium mb-1 self-start">Rating presupuesto YTD</p>
              <Gauge value={k.rating_ytd}
                sublabel={k.rating_ytd != null ? `${fmtEUR(k.expense_ytd)} / ${fmtEUR(k.budget_expense_ytd)}` : "sin presupuesto"} />
              <p className="text-navy-500 text-xs text-center mt-2">
                100% = justo en presupuesto · &lt;100% vas sobrado
              </p>
            </div>

            <div className="lg:col-span-2 bg-navy-800 border border-navy-700 rounded-xl p-5">
              <p className="text-navy-300 text-sm font-medium mb-1">Entradas vs salidas por mes</p>
              <p className="text-navy-500 text-xs mb-3">
                Ingresos frente a gastos + inversión + ahorro apilados · idealmente a la misma altura
              </p>
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={data.monthly} barGap={2}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#21305a" vertical={false} />
                  <XAxis dataKey="month" tickFormatter={(m) => MONTHS[m - 1]}
                    tick={{ fill: "#7f94bc", fontSize: 11 }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fill: "#7f94bc", fontSize: 11 }} axisLine={false} tickLine={false}
                    tickFormatter={(v) => v >= 1000 ? `${v / 1000}k` : v} />
                  <Tooltip content={<DarkTooltip />} cursor={{ fill: "#ffffff08" }} />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Bar dataKey="income" name="Ingresos" stackId="in" fill="#22c55e" radius={[3, 3, 0, 0]} />
                  <Bar dataKey="expense" name="Gastos" stackId="out" fill="#ef4444" />
                  <Bar dataKey="investment" name="Inversión" stackId="out" fill="#c9922a" />
                  <Bar dataKey="savings" name="Ahorro" stackId="out" fill="#2dd4bf" radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Fila: evolución ahorro + donut categorías */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <div className="lg:col-span-2 bg-navy-800 border border-navy-700 rounded-xl p-5">
              <p className="text-navy-300 text-sm font-medium mb-3">Ahorro mensual (inversión + ahorro)</p>
              <ResponsiveContainer width="100%" height={220}>
                <AreaChart data={data.monthly}>
                  <defs>
                    <linearGradient id="netGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#c9922a" stopOpacity={0.5} />
                      <stop offset="95%" stopColor="#c9922a" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#21305a" vertical={false} />
                  <XAxis dataKey="month" tickFormatter={(m) => MONTHS[m - 1]}
                    tick={{ fill: "#7f94bc", fontSize: 11 }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fill: "#7f94bc", fontSize: 11 }} axisLine={false} tickLine={false}
                    tickFormatter={(v) => v >= 1000 || v <= -1000 ? `${v / 1000}k` : v} />
                  <Tooltip content={<DarkTooltip />} cursor={{ stroke: "#c9922a" }} />
                  <Area type="monotone" dataKey="saved" name="Ahorro" stroke="#c9922a"
                    strokeWidth={2} fill="url(#netGrad)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>

            <div className="bg-navy-800 border border-navy-700 rounded-xl p-5">
              <div className="flex items-center justify-between mb-3 gap-2">
                <p className="text-navy-300 text-sm font-medium">Gasto por categoría</p>
                <div className="flex gap-0.5 bg-navy-900 rounded-lg p-0.5 border border-navy-700">
                  {[["all", "Todo"], ["fixed", "Fijo"], ["variable", "Variable"]].map(([v, lbl]) => (
                    <button key={v} onClick={() => setDonutMode(v)}
                      className={`px-2 py-1 rounded text-xs transition ${donutMode === v
                        ? "bg-navy-600 text-white font-medium" : "text-navy-400 hover:text-white"}`}>
                      {lbl}
                    </button>
                  ))}
                </div>
              </div>
              {pieData.length === 0 ? (
                <p className="text-navy-500 text-sm py-12 text-center">Sin datos</p>
              ) : (
                <ResponsiveContainer width="100%" height={220}>
                  <PieChart>
                    <Pie data={pieData} dataKey="value" nameKey="name"
                      innerRadius={50} outerRadius={85} paddingAngle={2} stroke="none">
                      {pieData.map((e, i) => <Cell key={i} fill={e.fill} />)}
                    </Pie>
                    <Tooltip content={<DarkTooltip />} />
                  </PieChart>
                </ResponsiveContainer>
              )}
              <div className="space-y-1 mt-2">
                {pieData.slice(0, 5).map((e, i) => (
                  <div key={i} className="flex items-center justify-between text-xs">
                    <span className="flex items-center gap-2 text-navy-300">
                      <span className="w-2.5 h-2.5 rounded-sm" style={{ background: e.fill }} />
                      {e.name}
                    </span>
                    <span className="text-navy-400">{fmtEUR(e.value)}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Heatmaps de gasto diario */}
          <div className="bg-navy-800 border border-navy-700 rounded-xl p-5">
            <p className="text-navy-300 text-sm font-medium mb-4">Mapa de calor de gasto diario</p>
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
              <div>
                <p className="text-navy-400 text-xs mb-2 font-medium">{year}</p>
                <CalendarHeatmap data={data.heatmap.current} year={year} max={heatMax} />
              </div>
              <div>
                <p className="text-navy-400 text-xs mb-2 font-medium">{year - 1}</p>
                <CalendarHeatmap data={data.heatmap.previous} year={year - 1} max={heatMax} />
              </div>
            </div>
            <div className="flex items-center gap-2 mt-4 justify-end">
              <span className="text-navy-500 text-xs">Menos</span>
              {["#1b2a4a", "#3a5490", "#78564a", "#c9922a", "#e8cfa2"].map((c, i) => (
                <span key={i} className="w-3 h-3 rounded-sm" style={{ background: c }} />
              ))}
              <span className="text-navy-500 text-xs">Más</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
