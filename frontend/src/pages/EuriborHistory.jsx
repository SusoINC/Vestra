import { useEffect, useState, useMemo } from "react";
import { Link } from "react-router-dom";
import {
  ResponsiveContainer, AreaChart, Area, Line, XAxis, YAxis, CartesianGrid, Tooltip, ReferenceLine,
} from "recharts";
import loanApi from "../api/loan";

const RANGES = [["12", "1A"], ["60", "5A"], ["120", "10A"], ["all", "Máx"]];
const pct = (n) => (n == null ? "—" : `${n > 0 ? "+" : ""}${Number(n).toLocaleString("es-ES", { minimumFractionDigits: 2, maximumFractionDigits: 3 })}%`);
const val = (n) => (n == null ? "—" : `${Number(n).toLocaleString("es-ES", { minimumFractionDigits: 2, maximumFractionDigits: 3 })}%`);

function TT({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  const p = payload.find((x) => x.value != null);
  return (
    <div className="bg-navy-950 border border-navy-600 rounded-lg px-3 py-2 text-xs shadow-xl">
      <p className="text-navy-300">{label}</p>
      <p className="text-champagne font-semibold">{val(p?.value)}{p?.dataKey === "proj" ? " (estim.)" : ""}</p>
    </div>
  );
}

export default function EuriborHistory() {
  const [data, setData] = useState(null);
  const [range, setRange] = useState("60");
  const [loading, setLoading] = useState(true);
  const [showHelp, setShowHelp] = useState(false);

  useEffect(() => {
    loanApi.euriborHistory().then((r) => setData(r.data.data)).finally(() => setLoading(false));
  }, []);

  const chartData = useMemo(() => {
    if (!data) return [];
    let s = data.series;
    if (range !== "all") s = s.slice(-Number(range));
    const rows = s.map((x) => ({ month: x.month.slice(0, 7), rate: x.rate, proj: null }));
    if (rows.length) {
      rows[rows.length - 1].proj = rows[rows.length - 1].rate;   // conecta con la proyección
      (data.projection || []).forEach((p) => rows.push({ month: p.month.slice(0, 7), rate: null, proj: p.rate }));
    }
    return rows;
  }, [data, range]);

  if (loading || !data) return <p className="text-navy-400">Cargando…</p>;
  const i = data.insight;
  const longRange = range === "all" || Number(range) >= 60;

  return (
    <div>
      <div className="mb-5">
        <Link to="/loans" className="text-navy-400 hover:text-white text-sm">← Préstamos</Link>
        <h1 className="text-2xl font-semibold mt-1">Euríbor a 1 año</h1>
        <p className="text-navy-500 text-sm">Histórico mensual (BCE / Refinitiv) e insights</p>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 mb-5">
        <Kpi label="Actual" value={val(i.current)} big />
        <Kpi label="vs mes ant." value={pct(i.mom)} color={i.mom > 0 ? "text-red-400" : "text-green-400"} />
        <Kpi label="vs hace 1 año" value={pct(i.yoy)} color={i.yoy > 0 ? "text-red-400" : "text-green-400"} />
        <Kpi label="Tipo BCE (depósito)" value={val(i.dfr)} />
        <Kpi label="Máximo" value={val(i.max.rate)} sub={i.max.month.slice(0, 7)} />
        <Kpi label="Mínimo" value={val(i.min.rate)} sub={i.min.month.slice(0, 7)} />
      </div>

      {/* Insight */}
      <div className="bg-navy-800 border border-navy-700 rounded-xl p-5 mb-5">
        <div className="flex items-center gap-2 mb-2">
          <span className="text-lg">{i.trend === "subiendo" ? "📈" : i.trend === "bajando" ? "📉" : "➡️"}</span>
          <p className="text-white font-medium">
            El Euríbor está <span className={i.trend === "subiendo" ? "text-red-400" : i.trend === "bajando" ? "text-green-400" : "text-navy-200"}>{i.trend}</span> (últimos 6 meses)
          </p>
          <button onClick={() => setShowHelp((s) => !s)} aria-label="Qué significa"
            className="ml-auto w-6 h-6 flex items-center justify-center rounded-full border border-navy-600 text-navy-300 hover:text-white hover:border-navy-400 text-xs">
            ℹ️
          </button>
        </div>

        {showHelp && (
          <div className="mb-3 rounded-lg bg-navy-900/60 border border-navy-700 p-3 text-sm text-navy-300 space-y-1.5">
            <p><span className="text-white font-medium">¿Qué dice el tipo del BCE frente al Euríbor?</span></p>
            <p>El <span className="text-white">tipo del BCE</span> ({val(i.dfr)}) es el tipo ancla de <em>hoy</em>. El <span className="text-white">Euríbor 12M</span> ({val(i.current)}) es a lo que se prestan los bancos a 1 año, y refleja <span className="text-white">lo que el mercado espera que sea el tipo medio del BCE durante los próximos 12 meses</span> + una pequeña prima de plazo (~0,1–0,2%).</p>
            <p>Regla rápida:</p>
            <ul className="list-disc list-inside text-navy-400 space-y-0.5">
              <li>Euríbor <span className="text-green-400">por debajo</span> del BCE → el mercado espera <span className="text-green-400">bajadas</span>.</li>
              <li>Euríbor <span className="text-navy-200">≈</span> BCE → espera <span className="text-navy-200">estabilidad</span>.</li>
              <li>Euríbor <span className="text-red-400">por encima</span> (como ahora) → <span className="text-red-400">no descuenta bajadas</span> a corto.</li>
            </ul>
            <p className="text-navy-500 text-xs">Es una lectura de expectativas, no una certeza: un dato de inflación puede darle la vuelta.</p>
          </div>
        )}
        <p className="text-navy-300 text-sm">
          {i.vs_dfr != null && (
            <>Cotiza <span className="text-white font-medium">{Math.abs(Math.round(i.vs_dfr * 100))} pb {i.vs_dfr >= 0 ? "por encima" : "por debajo"}</span> del
            tipo de depósito del BCE ({val(i.dfr)}). El Euríbor 12M anticipa las decisiones del BCE:
            {i.vs_dfr < -0.05 ? " el mercado descuenta bajadas de tipos." : i.vs_dfr > 0.05 ? " el mercado no espera bajadas a corto." : " el mercado espera estabilidad."}</>
          )}
        </p>
        <p className="text-navy-500 text-xs mt-2">
          Proyección a 6 meses (línea discontinua): estimación orientativa por tendencia reciente, no es una predicción fiable.
        </p>
      </div>

      {/* Gráfico */}
      <div className="bg-navy-800 border border-navy-700 rounded-xl p-5">
        <div className="flex items-center justify-between mb-3">
          <p className="text-navy-300 text-sm font-medium">Evolución del Euríbor</p>
          <div className="flex gap-1 bg-navy-900 rounded-lg p-1 border border-navy-700">
            {RANGES.map(([v, l]) => (
              <button key={v} onClick={() => setRange(v)}
                className={`px-2.5 py-1 rounded text-xs transition ${range === v ? "bg-navy-600 text-white font-medium" : "text-navy-400 hover:text-white"}`}>
                {l}
              </button>
            ))}
          </div>
        </div>
        <ResponsiveContainer width="100%" height={300}>
          <AreaChart data={chartData}>
            <defs><linearGradient id="euGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#d4af6e" stopOpacity={0.35} /><stop offset="95%" stopColor="#d4af6e" stopOpacity={0} />
            </linearGradient></defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#21305a" vertical={false} />
            <XAxis dataKey="month" tick={{ fill: "#7f94bc", fontSize: 10 }} axisLine={false} tickLine={false}
              minTickGap={40} tickFormatter={(d) => longRange ? d.slice(0, 4) : d} />
            <YAxis tick={{ fill: "#7f94bc", fontSize: 10 }} axisLine={false} tickLine={false}
              width={42} domain={["auto", "auto"]} tickFormatter={(v) => `${v}%`} />
            <Tooltip content={<TT />} />
            {i.dfr != null && (
              <ReferenceLine y={i.dfr} stroke="#60a5fa" strokeDasharray="4 3"
                label={{ value: `BCE ${i.dfr}%`, fill: "#60a5fa", fontSize: 10, position: "insideTopLeft" }} />
            )}
            <Area type="monotone" dataKey="rate" stroke="#d4af6e" strokeWidth={2} fill="url(#euGrad)" isAnimationActive={false} connectNulls={false} />
            <Line type="monotone" dataKey="proj" stroke="#d4af6e" strokeWidth={2} strokeDasharray="5 4" dot={false} isAnimationActive={false} connectNulls />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

function Kpi({ label, value, sub, color = "text-white", big }) {
  return (
    <div className="bg-navy-800 border border-navy-700 rounded-xl p-4">
      <p className="text-navy-400 text-xs">{label}</p>
      <p className={`font-bold mt-1 ${big ? "text-2xl" : "text-xl"} ${color}`}>{value}</p>
      {sub && <p className="text-navy-500 text-xs mt-0.5">{sub}</p>}
    </div>
  );
}
