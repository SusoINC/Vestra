import { useEffect, useState, useCallback } from "react";
import { ResponsiveContainer, PieChart, Pie, Cell, Tooltip } from "recharts";
import investmentApi from "../api/investment";
import { fmtEUR } from "../utils/format";

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
  const [data, setData] = useState(null);
  const [wallets, setWallets] = useState([]);
  const [ops, setOps] = useState([]);
  const [catalogues, setCatalogues] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [pRes, wRes, oRes, cRes] = await Promise.all([
        investmentApi.getPortfolio(walletId ? { wallet_id: walletId } : {}),
        investmentApi.getWalletsSummary(),
        investmentApi.getOperations(walletId ? { wallet_id: walletId, per_page: 15 } : { per_page: 15 }),
        catalogues ? null : investmentApi.getCatalogues(),
      ]);
      setData(pRes.data.data);
      setWallets(wRes.data.data);
      setOps(oRes.data.data);
      if (cRes) setCatalogues(cRes.data.data);
    } finally {
      setLoading(false);
    }
  }, [walletId]); // eslint-disable-line

  useEffect(() => { load(); }, [load]);

  const t = data?.totals;
  const symMap = Object.fromEntries((catalogues?.symbols || []).map((s) => [s.ticker, s]));
  const walletMap = Object.fromEntries((catalogues?.wallets || []).map((w) => [w.id, w.name]));

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
        <div>
          <h1 className="text-2xl font-semibold">Inversiones</h1>
          <p className="text-navy-400 text-sm mt-0.5">Cartera y rendimiento</p>
        </div>
        <select value={walletId} onChange={(e) => setWalletId(e.target.value)}
          className="bg-navy-900 border border-navy-600 text-white rounded-lg px-3 py-2 text-sm">
          <option value="">Todas las carteras</option>
          {wallets.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
        </select>
      </div>

      {loading || !data ? (
        <p className="text-navy-400">Cargando…</p>
      ) : (
        <div className="space-y-5">
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

            {/* Carteras */}
            <div className="lg:col-span-2 bg-navy-800 border border-navy-700 rounded-xl p-5">
              <p className="text-navy-300 text-sm font-medium mb-3">Carteras</p>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {wallets.map((w) => (
                  <button key={w.id} onClick={() => setWalletId(walletId === w.id ? "" : w.id)}
                    className={`text-left rounded-lg p-3 border transition ${walletId === w.id
                      ? "border-champagne bg-navy-700" : "border-navy-700 bg-navy-900 hover:border-navy-500"}`}>
                    <p className="text-white text-sm font-medium">{w.name}</p>
                    <p className="text-navy-200 text-sm mt-1">{fmtEUR(w.value)}</p>
                    <p className={`text-xs ${w.pnl >= 0 ? "text-green-400" : "text-red-400"}`}>
                      {pctFmt(w.pnl_pct)}
                    </p>
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Posiciones */}
          <div className="bg-navy-800 border border-navy-700 rounded-xl overflow-hidden">
            <p className="text-navy-300 text-sm font-medium px-5 pt-4 pb-2">Posiciones</p>
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
                  {data.positions.map((p) => (
                    <tr key={p.ticker} className="border-b border-navy-700/50 hover:bg-navy-700/20">
                      <td className="px-4 py-2.5">
                        <p className="text-white line-clamp-1">{p.description}</p>
                        <span className="text-navy-500 text-xs">{p.type_label} · {p.ticker}</span>
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
                  ))}
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
