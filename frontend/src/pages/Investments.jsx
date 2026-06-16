import { useEffect, useState, useCallback, useMemo } from "react";
import { Link } from "react-router-dom";
import {
  ResponsiveContainer, PieChart, Pie, Cell, Tooltip,
  ComposedChart, AreaChart, Area, Line, XAxis, YAxis, CartesianGrid, ReferenceLine,
} from "recharts";
import investmentApi from "../api/investment";
import { fmtEUR } from "../utils/format";

const C_VALUE = "#d4af6e";     // Valor de la cartera (champagne)
const C_INVESTED = "#60a5fa";  // Invertido (azul)
const C_GAIN = "#22c55e";      // Banda de ganancia
const C_LOSS = "#ef4444";      // Banda de pérdida
const TS_RANGES = [["1m", "1M"], ["3m", "3M"], ["6m", "6M"], ["ytd", "YTD"], ["1y", "1A"], ["max", "Máx"]];
const TS_GRAN = [["day", "Día"], ["week", "Semana"], ["month", "Mes"]];
const TS_VIEW = [["abs", "€"], ["var", "Rentabilidad %"]];
// Color coding por tipo de activo (igual que Análisis de símbolos)
const TYPE_COLORS = { CRY: "#f59e0b", ETF: "#3b82f6", FND: "#8b5cf6", STK: "#22c55e" };

function EvoTooltip({ active, payload, label, view }) {
  if (!active || !payload?.length) return null;
  const row = payload[0].payload;
  return (
    <div className="bg-navy-950 border border-navy-600 rounded-lg px-3 py-2 text-xs shadow-xl space-y-0.5">
      <p className="text-navy-300 mb-1">{label}</p>
      {view === "var" ? (
        <p className="font-semibold" style={{ color: row.pnlPct >= 0 ? C_GAIN : C_LOSS }}>
          Rentabilidad: {row.pnlPct > 0 ? "+" : ""}{row.pnlPct}%
        </p>
      ) : (
        <>
          <p style={{ color: C_VALUE }}>Valor: <span className="font-semibold">{fmtEUR(row.value)}</span></p>
          <p style={{ color: C_INVESTED }}>Invertido: <span className="font-semibold">{fmtEUR(row.invested)}</span></p>
          <p className="pt-0.5 border-t border-navy-700" style={{ color: row.pnl >= 0 ? C_GAIN : C_LOSS }}>
            P&L: {row.pnl >= 0 ? "+" : ""}{fmtEUR(row.pnl)} · {row.pnlPct > 0 ? "+" : ""}{row.pnlPct}%
          </p>
        </>
      )}
    </div>
  );
}

const pctFmt = (n) => (n == null ? "—" : `${n > 0 ? "+" : ""}${n}%`);
const numFmt = (n, d = 2) =>
  Number(n || 0).toLocaleString("es-ES", { minimumFractionDigits: d, maximumFractionDigits: d });

function PnlTooltip({ active, payload }) {
  if (!active || !payload?.length) return null;
  const p = payload[0];
  return (
    <div className="bg-navy-950 border border-navy-600 rounded-lg px-3 py-2 text-xs shadow-xl">
      <p style={{ color: p.payload.color }}>{p.name}: <span className="font-semibold">{fmtEUR(p.value)}</span></p>
    </div>
  );
}

export default function Investments() {
  const [walletId, setWalletId] = useState("");      // "" = todas
  const [platformId, setPlatformId] = useState("");  // filtro por card de plataforma
  const [typeFilter, setTypeFilter] = useState("");  // filtro por card de tipo
  const [tickerFilter, setTickerFilter] = useState(""); // filtro por activo (fila de Posiciones)
  const [data, setData] = useState(null);
  const [positionsData, setPositionsData] = useState([]); // posiciones del selector (sin filtro de activo)
  const [platforms, setPlatforms] = useState([]);
  const [types, setTypes] = useState([]);
  const [ops, setOps] = useState([]);
  const [series, setSeries] = useState([]);
  const [tsView, setTsView] = useState("abs");
  const [tsRange, setTsRange] = useState("max");
  const [tsGran, setTsGran] = useState("month");
  const [tsLoading, setTsLoading] = useState(false);
  const [catalogues, setCatalogues] = useState(null);
  const [loading, setLoading] = useState(true);

  // Filtros completos (cartera + plataforma + tipo + activo) → KPIs, donut, operaciones, serie
  const filterParams = useCallback((extra = {}) => {
    const p = { ...extra };
    if (walletId) p.wallet_id = walletId;
    if (platformId) p.platform_id = platformId;
    if (typeFilter) p.type = typeFilter;
    if (tickerFilter) p.ticker = tickerFilter;
    return p;
  }, [walletId, platformId, typeFilter, tickerFilter]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const W = walletId ? { wallet_id: walletId } : {};
      const P = platformId ? { platform_id: platformId } : {};
      const T = typeFilter ? { type: typeFilter } : {};
      const A = tickerFilter ? { ticker: tickerFilter } : {};
      // Cada selector ignora su propia dimensión pero refleja las demás (para poder seguir cambiando).
      const baseScope = { ...W, ...P, ...T };              // sin activo → tabla de posiciones (selector)
      const platScope = { ...W, ...T, ...A };              // cards plataforma: sin plataforma
      const typeScope = { ...W, ...P, ...A };              // cards tipo: sin tipo
      const [pRes, posRes, platRes, typeRes, oRes, cRes] = await Promise.all([
        investmentApi.getPortfolio(filterParams()),
        tickerFilter ? investmentApi.getPortfolio(baseScope) : null,
        investmentApi.getPlatformsSummary(platScope),
        investmentApi.getTypesSummary(typeScope),
        investmentApi.getOperations(filterParams({ per_page: 15 })),
        catalogues ? null : investmentApi.getCatalogues(),
      ]);
      setData(pRes.data.data);
      // Las posiciones del selector ignoran el filtro de activo (si no hay, son las mismas)
      setPositionsData((posRes ? posRes.data.data : pRes.data.data).positions);
      setPlatforms(platRes.data.data);
      setTypes(typeRes.data.data);
      setOps(oRes.data.data);
      if (cRes) setCatalogues(cRes.data.data);
    } finally {
      setLoading(false);
    }
  }, [filterParams]); // eslint-disable-line

  useEffect(() => { load(); }, [load]);

  // Serie temporal: depende de los filtros + rango + granularidad
  const loadSeries = useCallback(async () => {
    setTsLoading(true);
    try {
      const r = await investmentApi.getPortfolioTimeseries(
        filterParams({ granularity: tsGran, range: tsRange }));
      setSeries(r.data.data);
    } finally {
      setTsLoading(false);
    }
  }, [filterParams, tsRange, tsGran]);

  useEffect(() => { loadSeries(); }, [loadSeries]);

  const t = data?.totals;
  const wallets = catalogues?.wallets || [];
  const symMap = Object.fromEntries((catalogues?.symbols || []).map((s) => [s.ticker, s]));
  const walletMap = Object.fromEntries((catalogues?.wallets || []).map((w) => [w.id, w.name]));

  // Serie del gráfico: valor + invertido con banda P&L (verde/roja), y rentabilidad % para la vista "var"
  const chartData = useMemo(() => series.map((p) => {
    const pnl = p.value - p.invested;
    return {
      date: p.date,
      value: p.value,
      invested: p.invested,
      pnl: Math.round(pnl * 100) / 100,
      pnlPct: p.invested ? Math.round((pnl / p.invested) * 1000) / 10 : 0,
      base: Math.min(p.value, p.invested),
      gain: Math.max(0, pnl),
      loss: Math.max(0, -pnl),
    };
  }), [series]);

  // Offset del gradiente donde la rentabilidad % cruza el 0 (verde arriba, rojo abajo)
  const zeroOffset = useMemo(() => {
    const vals = chartData.map((d) => d.pnlPct);
    if (!vals.length) return 0;
    const max = Math.max(...vals), min = Math.min(...vals);
    if (max <= 0) return 0;
    if (min >= 0) return 1;
    return max / (max - min);
  }, [chartData]);

  // Posiciones (selector de activo) ordenadas por rendimiento (P&L %) descendente
  const positions = useMemo(
    () => [...positionsData].sort((a, b) => (b.pnl_pct ?? -Infinity) - (a.pnl_pct ?? -Infinity)),
    [positionsData]);

  // Handlers de filtro: al elegir un nivel superior se limpia el activo (nivel más específico)
  const selectPlatform = (id) => { setPlatformId(platformId === id ? "" : id); setTickerFilter(""); };
  const selectType = (ty) => { setTypeFilter(typeFilter === ty ? "" : ty); setTickerFilter(""); };
  const selectTicker = (tk) => setTickerFilter(tickerFilter === tk ? "" : tk);

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
        <div>
          <h1 className="text-2xl font-semibold">Inversiones</h1>
          <p className="text-navy-400 text-sm mt-0.5">Cartera y rendimiento</p>
        </div>
        <div className="flex items-center gap-2">
          <select value={walletId}
            onChange={(e) => { setWalletId(e.target.value); setPlatformId(""); setTypeFilter(""); setTickerFilter(""); }}
            className="bg-navy-900 border border-navy-600 text-white rounded-lg px-3 py-2 text-sm">
            <option value="">Todas las carteras</option>
            {wallets.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
          </select>
          <Link to="/investments/new"
            className="bg-champagne text-[#0a1020] font-semibold rounded-lg px-4 py-2 text-sm hover:bg-gold-400 transition whitespace-nowrap">
            ➕ Registrar
          </Link>
        </div>
      </div>

      {!data ? (
        <p className="text-navy-400">Cargando…</p>
      ) : (
        <div className={`space-y-5 transition-opacity duration-200 ${loading ? "opacity-60" : "opacity-100"}`}>
          {/* KPIs */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="bg-navy-800 border border-navy-700 rounded-xl p-4">
              <p className="text-navy-400 text-xs">Valor actual</p>
              <p className="text-2xl font-bold text-white mt-1">{fmtEUR(t.value)}</p>
            </div>
            <div className="bg-navy-800 border border-navy-700 rounded-xl p-4">
              <p className="text-navy-400 text-xs">Invertido</p>
              <p className="text-2xl font-bold text-navy-200 mt-1">{fmtEUR(t.cost)}</p>
            </div>
            <div className="bg-navy-800 border border-navy-700 rounded-xl p-4">
              <p className="text-navy-400 text-xs">Ganancia / Pérdida</p>
              <p className={`text-2xl font-bold mt-1 ${t.pnl >= 0 ? "text-green-400" : "text-red-400"}`}>
                {t.pnl >= 0 ? "+" : ""}{fmtEUR(t.pnl)}
              </p>
            </div>
            <div className="bg-navy-800 border border-navy-700 rounded-xl p-4">
              <p className="text-navy-400 text-xs">Rentabilidad</p>
              <p className={`text-2xl font-bold mt-1 ${t.pnl >= 0 ? "text-green-400" : "text-red-400"}`}>
                {pctFmt(t.pnl_pct)}
              </p>
            </div>
          </div>

          {/* Evolución de la cartera */}
          <div className="bg-navy-800 border border-navy-700 rounded-xl p-5">
            <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
              <div className="flex flex-wrap items-center gap-3">
                <p className="text-navy-300 text-sm font-medium">Evolución de la cartera</p>
                <div className="flex gap-1 bg-navy-900 rounded-lg p-1 border border-navy-700">
                  {TS_VIEW.map(([v, label]) => (
                    <button key={v} onClick={() => setTsView(v)}
                      className={`px-2.5 py-1 rounded text-xs transition ${tsView === v
                        ? "bg-navy-600 text-white font-medium" : "text-navy-400 hover:text-white"}`}>
                      {label}
                    </button>
                  ))}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <div className="flex gap-1 bg-navy-900 rounded-lg p-1 border border-navy-700">
                  {TS_GRAN.map(([v, label]) => (
                    <button key={v} onClick={() => setTsGran(v)}
                      className={`px-2.5 py-1 rounded text-xs transition ${tsGran === v
                        ? "bg-navy-600 text-white font-medium" : "text-navy-400 hover:text-white"}`}>
                      {label}
                    </button>
                  ))}
                </div>
                <div className="flex gap-1 bg-navy-900 rounded-lg p-1 border border-navy-700">
                  {TS_RANGES.map(([v, label]) => (
                    <button key={v} onClick={() => setTsRange(v)}
                      className={`px-2.5 py-1 rounded text-xs transition ${tsRange === v
                        ? "bg-navy-600 text-white font-medium" : "text-navy-400 hover:text-white"}`}>
                      {label}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Leyenda */}
            {tsView === "abs" && (
              <div className="flex flex-wrap items-center gap-4 mb-2 text-xs text-navy-400">
                <span className="flex items-center gap-1.5"><span className="w-4 h-0.5 rounded" style={{ background: C_VALUE }} /> Valor</span>
                <span className="flex items-center gap-1.5"><span className="w-4 h-0.5 rounded" style={{ background: C_INVESTED, borderTop: `2px dashed ${C_INVESTED}` }} /> Invertido</span>
                <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm" style={{ background: `${C_GAIN}55` }} /> Ganancia</span>
                <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm" style={{ background: `${C_LOSS}55` }} /> Pérdida</span>
              </div>
            )}

            <div className={`transition-opacity duration-200 ${tsLoading ? "opacity-50" : "opacity-100"}`}>
            {series.length === 0 ? (
              <p className="text-navy-500 text-sm py-16 text-center">
                {tsLoading ? "Cargando…" : "Sin histórico disponible"}
              </p>
            ) : tsView === "abs" ? (
              <ResponsiveContainer width="100%" height={280}>
                <ComposedChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#21305a" vertical={false} />
                  <XAxis dataKey="date" tick={{ fill: "#7f94bc", fontSize: 10 }}
                    axisLine={false} tickLine={false} minTickGap={40}
                    tickFormatter={(d) => tsGran === "month" ? d.slice(0, 7) : d.slice(5)} />
                  <YAxis tick={{ fill: "#7f94bc", fontSize: 10 }} axisLine={false} tickLine={false}
                    width={55} domain={["auto", "auto"]}
                    tickFormatter={(v) => v >= 1000 ? `${Math.round(v / 1000)}k` : v} />
                  <Tooltip content={<EvoTooltip view={tsView} />} />
                  {/* Banda P&L entre las dos líneas (verde ganancia / rojo pérdida) */}
                  <Area type="monotone" dataKey="base" stackId="pl" stroke="none" fill="transparent" isAnimationActive={false} />
                  <Area type="monotone" dataKey="gain" stackId="pl" stroke="none" fill={C_GAIN} fillOpacity={0.3} isAnimationActive={false} />
                  <Area type="monotone" dataKey="loss" stackId="pl" stroke="none" fill={C_LOSS} fillOpacity={0.3} isAnimationActive={false} />
                  <Line type="monotone" dataKey="invested" stroke={C_INVESTED} strokeWidth={2}
                    strokeDasharray="5 4" dot={false} isAnimationActive={false} />
                  <Line type="monotone" dataKey="value" stroke={C_VALUE} strokeWidth={2.5}
                    dot={false} isAnimationActive={false} />
                </ComposedChart>
              </ResponsiveContainer>
            ) : (
              <ResponsiveContainer width="100%" height={280}>
                <AreaChart data={chartData}>
                  <defs>
                    <linearGradient id="plPctFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset={zeroOffset} stopColor={C_GAIN} stopOpacity={0.35} />
                      <stop offset={zeroOffset} stopColor={C_LOSS} stopOpacity={0.35} />
                    </linearGradient>
                    <linearGradient id="plPctStroke" x1="0" y1="0" x2="0" y2="1">
                      <stop offset={zeroOffset} stopColor={C_GAIN} />
                      <stop offset={zeroOffset} stopColor={C_LOSS} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#21305a" vertical={false} />
                  <XAxis dataKey="date" tick={{ fill: "#7f94bc", fontSize: 10 }}
                    axisLine={false} tickLine={false} minTickGap={40}
                    tickFormatter={(d) => tsGran === "month" ? d.slice(0, 7) : d.slice(5)} />
                  <YAxis tick={{ fill: "#7f94bc", fontSize: 10 }} axisLine={false} tickLine={false}
                    width={45} domain={["auto", "auto"]} tickFormatter={(v) => `${v}%`} />
                  <Tooltip content={<EvoTooltip view={tsView} />} />
                  <ReferenceLine y={0} stroke="#7f94bc" strokeWidth={1} />
                  <Area type="monotone" dataKey="pnlPct" stroke="url(#plPctStroke)" strokeWidth={2.5}
                    fill="url(#plPctFill)" isAnimationActive={false} />
                </AreaChart>
              </ResponsiveContainer>
            )}
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {/* Asignación */}
            <div className="bg-navy-800 border border-navy-700 rounded-xl p-5">
              <p className="text-navy-300 text-sm font-medium mb-3">Distribución por tipo</p>
              {data.allocation.length === 0 ? (
                <p className="text-navy-500 text-sm py-12 text-center">Sin posiciones</p>
              ) : (
                <>
                  <ResponsiveContainer width="100%" height={180}>
                    <PieChart>
                      <Pie data={data.allocation} dataKey="value" nameKey="label"
                        innerRadius={45} outerRadius={75} paddingAngle={2} stroke="none">
                        {data.allocation.map((e, i) => <Cell key={i} fill={e.color} />)}
                      </Pie>
                      <Tooltip content={<PnlTooltip />} />
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="space-y-1 mt-2">
                    {data.allocation.map((a) => (
                      <div key={a.type} className="flex items-center justify-between text-xs">
                        <span className="flex items-center gap-2 text-navy-300">
                          <span className="w-2.5 h-2.5 rounded-sm" style={{ background: a.color }} />
                          {a.label}
                        </span>
                        <span className="text-navy-400">{fmtEUR(a.value)}</span>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>

            {/* Plataformas */}
            <div className="lg:col-span-2 bg-navy-800 border border-navy-700 rounded-xl p-5">
              <p className="text-navy-300 text-sm font-medium mb-3">Plataformas</p>
              {platforms.length === 0 ? (
                <p className="text-navy-500 text-sm py-12 text-center">Sin posiciones</p>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  {platforms.map((p) => (
                    <button key={p.id} onClick={() => selectPlatform(p.id)}
                      className={`text-left rounded-lg p-3 border transition ${platformId === p.id
                        ? "border-champagne bg-navy-700" : "border-navy-700 bg-navy-900 hover:border-navy-500"}`}>
                      <p className="text-white text-sm font-medium">{p.name}</p>
                      <p className="text-navy-200 text-sm mt-1">{fmtEUR(p.value)}</p>
                      <p className={`text-xs ${p.pnl >= 0 ? "text-green-400" : "text-red-400"}`}>
                        {pctFmt(p.pnl_pct)}
                      </p>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Tipo de inversión */}
          <div className="bg-navy-800 border border-navy-700 rounded-xl p-5">
            <p className="text-navy-300 text-sm font-medium mb-3">Tipo de inversión</p>
            {types.length === 0 ? (
              <p className="text-navy-500 text-sm py-8 text-center">Sin posiciones</p>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {types.map((ty) => (
                  <button key={ty.type} onClick={() => selectType(ty.type)}
                    className={`text-left rounded-lg p-3 border transition ${typeFilter === ty.type
                      ? "border-champagne bg-navy-700" : "border-navy-700 bg-navy-900 hover:border-navy-500"}`}>
                    <span className="flex items-center gap-1.5">
                      <span className="w-2.5 h-2.5 rounded-sm" style={{ background: ty.color }} />
                      <span className="text-white text-sm font-medium">{ty.label}</span>
                    </span>
                    <p className="text-navy-200 text-sm mt-1">{fmtEUR(ty.value)}</p>
                    <p className={`text-xs ${ty.pnl >= 0 ? "text-green-400" : "text-red-400"}`}>
                      {pctFmt(ty.pnl_pct)}
                    </p>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Posiciones (selector de activo) */}
          <div className="bg-navy-800 border border-navy-700 rounded-xl overflow-hidden">
            <div className="flex items-center justify-between px-5 pt-4 pb-2">
              <p className="text-navy-300 text-sm font-medium">Posiciones</p>
              {tickerFilter
                ? <button onClick={() => setTickerFilter("")}
                    className="text-xs text-champagne hover:text-gold-300">✕ Quitar filtro de activo</button>
                : <span className="text-navy-600 text-xs">Pulsa una fila para filtrar por activo</span>}
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-y border-navy-700 text-navy-400 text-xs uppercase tracking-wide">
                    <th className="text-left px-4 py-2.5">Activo</th>
                    <th className="text-right px-3 py-2.5 hidden md:table-cell">Participaciones</th>
                    <th className="text-right px-3 py-2.5 hidden lg:table-cell">Precio</th>
                    <th className="text-right px-3 py-2.5">Invertido</th>
                    <th className="text-right px-3 py-2.5">Valor</th>
                    <th className="text-right px-4 py-2.5">P&L</th>
                  </tr>
                </thead>
                <tbody>
                  {positions.map((p) => {
                    const color = TYPE_COLORS[p.type] || "#888";
                    const selected = tickerFilter === p.ticker;
                    return (
                    <tr key={p.ticker} onClick={() => selectTicker(p.ticker)}
                      className={`border-b border-navy-700/50 cursor-pointer transition ${selected
                        ? "bg-navy-700/60" : "hover:bg-navy-700/30"}`}
                      style={selected ? { boxShadow: `inset 3px 0 0 ${color}` } : undefined}>
                      <td className="px-4 py-2.5">
                        <p className="text-white line-clamp-1">{p.description}</p>
                        <span className="flex items-center gap-1.5 mt-0.5">
                          <span className="text-xs px-2 py-0.5 rounded-full font-medium"
                            style={{ backgroundColor: `${color}25`, color }}>{p.type_label}</span>
                          <span className="text-navy-500 text-xs font-mono">{p.ticker}</span>
                        </span>
                      </td>
                      <td className="px-3 py-2.5 text-right text-navy-300 hidden md:table-cell">{numFmt(p.shares, 4)}</td>
                      <td className="px-3 py-2.5 text-right text-navy-300 hidden lg:table-cell">{numFmt(p.price, 2)} €</td>
                      <td className="px-3 py-2.5 text-right text-navy-300">{fmtEUR(p.cost)}</td>
                      <td className="px-3 py-2.5 text-right text-white font-medium">{fmtEUR(p.value)}</td>
                      <td className={`px-4 py-2.5 text-right font-semibold ${p.pnl >= 0 ? "text-green-400" : "text-red-400"}`}>
                        {p.pnl >= 0 ? "+" : ""}{fmtEUR(p.pnl)}
                        <span className="block text-xs font-normal">{pctFmt(p.pnl_pct)}</span>
                      </td>
                    </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Operaciones recientes */}
          <div className="bg-navy-800 border border-navy-700 rounded-xl overflow-hidden">
            <p className="text-navy-300 text-sm font-medium px-5 pt-4 pb-2">Operaciones recientes</p>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-y border-navy-700 text-navy-400 text-xs uppercase tracking-wide">
                    <th className="text-left px-4 py-2.5">Fecha</th>
                    <th className="text-left px-3 py-2.5">Activo</th>
                    <th className="text-left px-3 py-2.5 hidden md:table-cell">Cartera</th>
                    <th className="text-right px-3 py-2.5">Participaciones</th>
                    <th className="text-right px-4 py-2.5">Importe</th>
                  </tr>
                </thead>
                <tbody>
                  {ops.map((o) => (
                    <tr key={o.id} className="border-b border-navy-700/50 hover:bg-navy-700/20">
                      <td className="px-4 py-2.5 text-navy-400 whitespace-nowrap">{o.op_date}</td>
                      <td className="px-3 py-2.5 text-white">{symMap[o.ticker]?.description || o.ticker}</td>
                      <td className="px-3 py-2.5 text-navy-400 hidden md:table-cell">{walletMap[o.wallet_id] || o.wallet_id}</td>
                      <td className="px-3 py-2.5 text-right text-navy-300">{numFmt(o.shares, 4)}</td>
                      <td className="px-4 py-2.5 text-right text-white">{fmtEUR(o.amount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
