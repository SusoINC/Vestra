import { useEffect, useState, useCallback, useMemo } from "react";
import {
  ResponsiveContainer, ComposedChart, Area, Line, XAxis, YAxis, Tooltip, CartesianGrid,
} from "recharts";
import investmentApi from "../api/investment";
import { fmtEUR } from "../utils/format";

const RANGES = [["1m", "1M"], ["3m", "3M"], ["6m", "6M"], ["ytd", "YTD"], ["1y", "1A"], ["max", "Máx"]];
const pct = (n) => (n == null ? "—" : `${n > 0 ? "+" : ""}${n}%`);
const price = (n) => Number(n || 0).toLocaleString("es-ES", { minimumFractionDigits: 2, maximumFractionDigits: 4 });

// "hace X" a partir de una fecha ISO
function timeAgo(iso) {
  if (!iso) return "";
  const days = Math.round((Date.now() - new Date(iso)) / 86400000);
  if (days < 1) return "hoy";
  if (days < 31) return `hace ${days} d`;
  const months = Math.round(days / 30.4);
  if (months < 24) return `hace ${months} mes${months !== 1 ? "es" : ""}`;
  return `hace ${(days / 365).toFixed(1)} años`;
}

// Marcador de operación: disco con anillo blanco + flecha (compra ↑ verde / venta ↓ roja)
function OpDot({ cx, cy, payload }) {
  if (cx == null || cy == null || !payload?.ops?.length) return null;
  const sell = payload.ops[0].side === "sell";
  const color = sell ? "#ef4444" : "#22c55e";
  const arrow = sell
    ? `M ${cx} ${cy + 4.5} L ${cx - 3.5} ${cy - 1} M ${cx} ${cy + 4.5} L ${cx + 3.5} ${cy - 1} M ${cx} ${cy + 4.5} L ${cx} ${cy - 4.5}`
    : `M ${cx} ${cy - 4.5} L ${cx - 3.5} ${cy + 1} M ${cx} ${cy - 4.5} L ${cx + 3.5} ${cy + 1} M ${cx} ${cy - 4.5} L ${cx} ${cy + 4.5}`;
  return (
    <g>
      <circle cx={cx} cy={cy} r={9} fill={color} stroke="#fff" strokeWidth={2} />
      <path d={arrow} stroke="#fff" strokeWidth={1.6} strokeLinecap="round" fill="none" />
    </g>
  );
}

function ChartTooltip({ active, payload, label, mode }) {
  if (!active || !payload?.length) return null;
  const p = payload.find((x) => x.dataKey === "value");
  const row = p?.payload;
  return (
    <div className="bg-navy-950 border border-navy-600 rounded-lg px-3 py-2 text-xs shadow-xl">
      <p className="text-navy-300 mb-0.5">{label}</p>
      <p className="text-champagne font-semibold">
        {mode === "var" ? pct(row?.value) : `${price(row?.value)} €`}
      </p>
      {row?.ops?.map((o, i) => (
        <p key={i} className={o.side === "sell" ? "text-red-400" : "text-green-400"}>
          {o.side === "sell" ? "Venta" : "Compra"}: {price(Math.abs(o.shares))} uds · {fmtEUR(o.amount)}
        </p>
      ))}
    </div>
  );
}

export default function SymbolAnalysis() {
  const [symbols, setSymbols] = useState([]);
  const [ticker, setTicker] = useState("");
  const [range, setRange] = useState("1y");
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [mode, setMode] = useState("value"); // "value" | "var"

  // Cargar lista de símbolos
  useEffect(() => {
    investmentApi.getCatalogues().then((r) => {
      const syms = r.data.data.symbols;
      setSymbols(syms);
      if (syms.length && !ticker) setTicker(syms[0].ticker);
    });
  }, []); // eslint-disable-line

  const load = useCallback(async () => {
    if (!ticker) return;
    setLoading(true);
    try {
      const r = await investmentApi.getSymbolDetail(ticker, { range });
      setData(r.data.data);
    } finally {
      setLoading(false);
    }
  }, [ticker, range]);

  useEffect(() => { load(); }, [load]);

  const s = data?.stats;
  const sym = data?.symbol;
  const pos = data?.position;
  const up = s && s.range_pct != null && s.range_pct >= 0;

  // Símbolos agrupados por tipo para el selector
  const symbolGroups = useMemo(() => {
    const g = {};
    symbols.forEach((x) => { (g[x.type_label || x.type] = g[x.type_label || x.type] || []).push(x); });
    return g;
  }, [symbols]);

  // Serie del gráfico: valor o variación base-0, con operaciones ancladas a su fecha más cercana
  const chartData = useMemo(() => {
    const hist = data?.history || [];
    if (!hist.length) return [];
    const base = hist[0].close || 1;
    const dates = hist.map((h) => +new Date(h.date));
    const minT = dates[0], maxT = dates[dates.length - 1];
    const opByDate = {};
    (data.operations || []).forEach((o) => {
      const t = +new Date(o.date);
      // Solo operaciones dentro de la ventana mostrada (ancladas al día más cercano de la serie)
      if (t < minT || t > maxT) return;
      let bi = 0, bd = Infinity;
      dates.forEach((d, i) => { const diff = Math.abs(d - t); if (diff < bd) { bd = diff; bi = i; } });
      const key = hist[bi].date;
      (opByDate[key] = opByDate[key] || []).push(o);
    });
    return hist.map((h) => {
      const value = mode === "var" ? Math.round(((h.close - base) / base) * 1000) / 10 : h.close;
      return { date: h.date, value, ops: opByDate[h.date] || null, op: opByDate[h.date] ? value : null };
    });
  }, [data, mode]);

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
        <div>
          <h1 className="text-2xl font-semibold">Análisis de símbolos</h1>
          <p className="text-navy-400 text-sm mt-0.5">Histórico, rendimiento y tu posición</p>
        </div>
        <select value={ticker} onChange={(e) => setTicker(e.target.value)}
          className="bg-navy-900 border border-navy-600 text-white rounded-lg px-3 py-2 text-sm max-w-xs">
          {Object.entries(symbolGroups).map(([label, syms]) => (
            <optgroup key={label} label={label}>
              {syms.map((x) => <option key={x.ticker} value={x.ticker}>{x.description}</option>)}
            </optgroup>
          ))}
        </select>
      </div>

      {loading || !data ? (
        <p className="text-navy-400">Cargando…</p>
      ) : !s ? (
        <div className="text-center py-16 text-navy-500">
          <p className="text-4xl mb-3">📉</p>
          <p>Sin datos de precio para {sym?.description}.</p>
        </div>
      ) : (
        <div className="space-y-5">
          {/* Cabecera del símbolo */}
          <div className="bg-navy-800 border border-navy-700 rounded-xl p-5 flex flex-wrap items-end justify-between gap-4">
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs px-2 py-0.5 rounded-full font-medium"
                  style={{ backgroundColor: `${sym.color}25`, color: sym.color }}>
                  {sym.type_label}
                </span>
                <span className="text-navy-500 text-xs font-mono">{sym.ticker}</span>
              </div>
              <h2 className="text-xl font-semibold text-white mt-1">{sym.description}</h2>
              {sym.isin && <p className="text-navy-500 text-xs mt-0.5">ISIN {sym.isin}</p>}
            </div>
            <div className="text-right">
              <p className="text-3xl font-bold text-white">{price(s.price)} €</p>
              <p className={`text-sm font-medium ${up ? "text-green-400" : "text-red-400"}`}>
                {s.range_change >= 0 ? "+" : ""}{price(s.range_change)} € · {pct(s.range_pct)}
              </p>
              <p className="text-navy-500 text-xs">a {s.price_date}</p>
            </div>
          </div>

          {/* Gráfico de precio */}
          <div className="bg-navy-800 border border-navy-700 rounded-xl p-5">
            <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
              <div className="flex items-center gap-3">
                <p className="text-navy-300 text-sm font-medium">Evolución del precio</p>
                <div className="flex gap-1 bg-navy-900 rounded-lg p-1 border border-navy-700">
                  {[["value", "Valor"], ["var", "Variación"]].map(([v, label]) => (
                    <button key={v} onClick={() => setMode(v)}
                      className={`px-2.5 py-1 rounded text-xs transition ${mode === v
                        ? "bg-navy-600 text-white font-medium" : "text-navy-400 hover:text-white"}`}>
                      {label}
                    </button>
                  ))}
                </div>
              </div>
              <div className="flex gap-1 bg-navy-900 rounded-lg p-1 border border-navy-700">
                {RANGES.map(([v, label]) => (
                  <button key={v} onClick={() => setRange(v)}
                    className={`px-2.5 py-1 rounded text-xs transition ${range === v
                      ? "bg-navy-600 text-white font-medium" : "text-navy-400 hover:text-white"}`}>
                    {label}
                  </button>
                ))}
              </div>
            </div>
            <ResponsiveContainer width="100%" height={300}>
              <ComposedChart data={chartData}>
                <defs>
                  <linearGradient id="priceGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={up ? "#22c55e" : "#ef4444"} stopOpacity={0.4} />
                    <stop offset="95%" stopColor={up ? "#22c55e" : "#ef4444"} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#21305a" vertical={false} />
                <XAxis dataKey="date" tick={{ fill: "#7f94bc", fontSize: 10 }}
                  axisLine={false} tickLine={false} minTickGap={40}
                  tickFormatter={(d) => d.slice(5)} />
                <YAxis tick={{ fill: "#7f94bc", fontSize: 10 }} axisLine={false} tickLine={false}
                  domain={["auto", "auto"]} width={55}
                  tickFormatter={(v) => mode === "var" ? `${v}%` : (v >= 1000 ? `${Math.round(v / 1000)}k` : v)} />
                <Tooltip content={<ChartTooltip mode={mode} />} />
                <Area type="monotone" dataKey="value" stroke={up ? "#22c55e" : "#ef4444"}
                  strokeWidth={2} fill="url(#priceGrad)" />
                <Line dataKey="op" stroke="none" isAnimationActive={false}
                  dot={<OpDot />} activeDot={false} legendType="none" />
              </ComposedChart>
            </ResponsiveContainer>
            <div className="flex items-center gap-4 mt-2 text-xs text-navy-400">
              <span className="flex items-center gap-1.5">
                <span className="inline-block w-3 h-3 rounded-full bg-green-500 ring-2 ring-white/80" /> Compra
              </span>
              <span className="flex items-center gap-1.5">
                <span className="inline-block w-3 h-3 rounded-full bg-red-500 ring-2 ring-white/80" /> Venta
              </span>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {/* Rendimiento por período */}
            <div className="lg:col-span-2 bg-navy-800 border border-navy-700 rounded-xl p-5">
              <p className="text-navy-300 text-sm font-medium mb-3">Rendimiento</p>
              <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
                {data.performance.map((p) => (
                  <div key={p.label} className="bg-navy-900 rounded-lg p-3 text-center">
                    <p className="text-navy-500 text-xs">{p.label}</p>
                    <p className={`text-sm font-bold mt-1 ${p.pct == null ? "text-navy-500"
                      : p.pct >= 0 ? "text-green-400" : "text-red-400"}`}>
                      {pct(p.pct)}
                    </p>
                  </div>
                ))}
              </div>
              <div className="grid grid-cols-2 gap-3 mt-4">
                <div className="bg-navy-900 rounded-lg p-3">
                  <p className="text-navy-500 text-xs">Máximo histórico</p>
                  <p className="text-white font-semibold mt-1">{price(s.ath)} €</p>
                  {s.ath_date && (
                    <p className="text-navy-500 text-xs mt-0.5">{s.ath_date} · {timeAgo(s.ath_date)}</p>
                  )}
                </div>
                <div className="bg-navy-900 rounded-lg p-3">
                  <p className="text-navy-500 text-xs">Mínimo histórico</p>
                  <p className="text-white font-semibold mt-1">{price(s.atl)} €</p>
                  {s.atl_date && (
                    <p className="text-navy-500 text-xs mt-0.5">{s.atl_date} · {timeAgo(s.atl_date)}</p>
                  )}
                </div>
              </div>
            </div>

            {/* Tu posición */}
            <div className="bg-navy-800 border border-navy-700 rounded-xl p-5">
              <p className="text-navy-300 text-sm font-medium mb-3">Tu posición</p>
              {!pos ? (
                <p className="text-navy-500 text-sm py-8 text-center">No tienes este activo</p>
              ) : (
                <div className="space-y-2.5 text-sm">
                  <Row label="Participaciones" value={price(pos.shares)} />
                  <Row label="Coste medio" value={`${price(pos.avg_cost)} €`} />
                  <Row label="Invertido" value={fmtEUR(pos.cost)} />
                  <Row label="Valor actual" value={fmtEUR(pos.value)} strong />
                  <div className="border-t border-navy-700 pt-2.5 flex items-center justify-between">
                    <span className="text-navy-400">Ganancia / Pérdida</span>
                    <span className={`font-bold ${pos.pnl >= 0 ? "text-green-400" : "text-red-400"}`}>
                      {pos.pnl >= 0 ? "+" : ""}{fmtEUR(pos.pnl)} · {pct(pos.pnl_pct)}
                    </span>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Row({ label, value, strong }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-navy-400">{label}</span>
      <span className={strong ? "text-white font-semibold" : "text-navy-200"}>{value}</span>
    </div>
  );
}
