import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { Link } from "react-router-dom";
import investmentApi from "../api/investment";
import { fmtEUR } from "../utils/format";

const today = () => new Date().toISOString().slice(0, 10);
const num = (v) => (v === "" || v == null ? NaN : Number(v));
const price = (n) => Number(n || 0).toLocaleString("es-ES", { minimumFractionDigits: 2, maximumFractionDigits: 4 });

let _rid = 0;
const blankRow = (date) => ({ id: ++_rid, date: date || today(), ticker: "", side: "buy", amount: "", shares: "", fee: "" });

const rowDirty = (r) => r.amount !== "" || r.shares !== "" || r.fee !== "" || r.ticker !== "";
const rowValid = (r) => r.date && r.ticker && num(r.amount) > 0 && num(r.shares) > 0;

export default function InvestmentEntry() {
  const [cat, setCat] = useState(null);
  const [walletId, setWalletId] = useState(localStorage.getItem("inv_wallet") || "");
  const [platformId, setPlatformId] = useState(localStorage.getItem("inv_platform") || "");
  const [defaultDate, setDefaultDate] = useState(today());
  const [rows, setRows] = useState([blankRow()]);
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState(null);
  const [history, setHistory] = useState([]);
  const [loadingHist, setLoadingHist] = useState(false);
  const [editId, setEditId] = useState(null);
  const [editForm, setEditForm] = useState(null);
  const [rowBusy, setRowBusy] = useState(false);
  const resetTimer = useRef(null);

  useEffect(() => {
    investmentApi.getCatalogues().then((r) => {
      const d = r.data.data;
      setCat(d);
      if (!walletId && d.wallets[0]) setWalletId(d.wallets[0].id);
      if (!platformId && d.platforms[0]) setPlatformId(d.platforms[0].id);
    });
  }, []); // eslint-disable-line

  useEffect(() => { if (walletId) localStorage.setItem("inv_wallet", walletId); }, [walletId]);
  useEffect(() => { if (platformId) localStorage.setItem("inv_platform", platformId); }, [platformId]);

  // Histórico ya registrado para la cartera + plataforma seleccionadas
  const loadHistory = useCallback(async () => {
    if (!walletId || !platformId) { setHistory([]); return; }
    setLoadingHist(true);
    try {
      const r = await investmentApi.getOperations({ wallet_id: walletId, platform_id: platformId, per_page: 100 });
      setHistory(r.data.data);
    } finally {
      setLoadingHist(false);
    }
  }, [walletId, platformId]);

  useEffect(() => { loadHistory(); }, [loadHistory]);

  // Símbolos agrupados por tipo para el <select>
  const groups = useMemo(() => {
    const g = {};
    (cat?.symbols || []).forEach((s) => { (g[s.type_label || s.type] = g[s.type_label || s.type] || []).push(s); });
    return g;
  }, [cat]);

  const prices = cat?.prices || {};
  const symMap = useMemo(
    () => Object.fromEntries((cat?.symbols || []).map((s) => [s.ticker, s])), [cat]);
  const walletName = cat?.wallets.find((w) => w.id === walletId)?.name;
  const platformName = cat?.platforms.find((p) => p.id === platformId)?.name;

  const updateRow = (id, patch) => {
    setRows((prev) => {
      let next = prev.map((r) => (r.id === id ? { ...r, ...patch } : r));
      // Auto-añadir fila en blanco al ensuciar la última
      const last = next[next.length - 1];
      if (rowDirty(last)) next = [...next, blankRow(defaultDate)];
      return next;
    });
  };
  const removeRow = (id) =>
    setRows((prev) => {
      const next = prev.filter((r) => r.id !== id);
      return next.length ? next : [blankRow(defaultDate)];
    });

  const validRows = rows.filter(rowValid);
  const totals = validRows.reduce(
    (a, r) => {
      const sign = r.side === "sell" ? -1 : 1;
      a.amount += sign * num(r.amount);
      a.fee += num(r.fee) || 0;
      return a;
    },
    { amount: 0, fee: 0 }
  );

  const applyDefaultDate = () =>
    setRows((prev) => prev.map((r) => (rowDirty(r) && !r.date ? { ...r, date: defaultDate } : r)));

  const save = async () => {
    if (!validRows.length || !walletId || !platformId) return;
    setSaving(true);
    setResult(null);
    try {
      const operations = validRows.map((r) => {
        const sign = r.side === "sell" ? -1 : 1;
        return {
          wallet_id: walletId,
          platform_id: platformId,
          ticker: r.ticker,
          op_date: r.date,
          amount: sign * num(r.amount),
          shares: sign * num(r.shares),
          fee: num(r.fee) || 0,
        };
      });
      const res = await investmentApi.createOperationsBulk(operations);
      const data = res.data.data;
      setResult({ ok: true, ...data });
      if (data.created > 0) {
        setRows([blankRow(defaultDate)]);
        loadHistory();
        clearTimeout(resetTimer.current);
        resetTimer.current = setTimeout(() => setResult(null), 6000);
      }
    } catch (e) {
      setResult({ ok: false, msg: e?.response?.data?.error?.message || "Error al guardar" });
    } finally {
      setSaving(false);
    }
  };

  // Edición / borrado de una operación ya registrada
  const startEdit = (o) => {
    setEditId(o.id);
    setEditForm({
      date: o.op_date, ticker: o.ticker, side: o.shares < 0 ? "sell" : "buy",
      amount: String(Math.abs(o.amount)), shares: String(Math.abs(o.shares)), fee: String(o.fee || 0),
    });
  };
  const cancelEdit = () => { setEditId(null); setEditForm(null); };

  const saveEdit = async (id) => {
    if (!editForm?.date || !editForm.ticker || !(num(editForm.amount) > 0) || !(num(editForm.shares) > 0)) return;
    setRowBusy(true);
    try {
      const sign = editForm.side === "sell" ? -1 : 1;
      await investmentApi.updateOperation(id, {
        op_date: editForm.date, ticker: editForm.ticker,
        amount: sign * num(editForm.amount), shares: sign * num(editForm.shares),
        fee: num(editForm.fee) || 0,
      });
      cancelEdit();
      loadHistory();
    } finally {
      setRowBusy(false);
    }
  };

  const removeOp = async (o) => {
    const desc = symMap[o.ticker]?.description || o.ticker;
    if (!window.confirm(`¿Eliminar la operación de ${desc} del ${o.op_date} (${fmtEUR(o.amount)})?`)) return;
    setRowBusy(true);
    try {
      await investmentApi.deleteOperation(o.id);
      loadHistory();
    } finally {
      setRowBusy(false);
    }
  };

  if (!cat) return <p className="text-navy-400">Cargando…</p>;

  const noWallets = cat.wallets.length === 0;

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
        <div>
          <h1 className="text-2xl font-semibold">Registrar operaciones</h1>
          <p className="text-navy-400 text-sm mt-0.5">Alta rápida de compras y ventas</p>
        </div>
        <Link to="/investments" className="text-sm text-navy-300 hover:text-white">← Volver a la cartera</Link>
      </div>

      {/* Contexto: cartera / plataforma / fecha por defecto */}
      <div className="bg-navy-800 border border-navy-700 rounded-xl p-4 mb-4 grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div>
          <label className="text-navy-400 text-xs block mb-1">Cartera</label>
          <select value={walletId} onChange={(e) => setWalletId(e.target.value)}
            className="w-full bg-navy-900 border border-navy-600 text-white rounded-lg px-3 py-2 text-sm">
            {cat.wallets.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
          </select>
        </div>
        <div>
          <label className="text-navy-400 text-xs block mb-1">Plataforma</label>
          <select value={platformId} onChange={(e) => setPlatformId(e.target.value)}
            className="w-full bg-navy-900 border border-navy-600 text-white rounded-lg px-3 py-2 text-sm">
            {cat.platforms.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </div>
        <div>
          <label className="text-navy-400 text-xs block mb-1">Fecha por defecto</label>
          <input type="date" value={defaultDate}
            onChange={(e) => { setDefaultDate(e.target.value); }} onBlur={applyDefaultDate}
            className="w-full bg-navy-900 border border-navy-600 text-white rounded-lg px-3 py-2 text-sm" />
        </div>
      </div>

      {noWallets && (
        <p className="text-amber-400 text-sm mb-4">No tienes carteras creadas todavía.</p>
      )}

      {/* Rejilla de entrada */}
      <div className="bg-navy-800 border border-navy-700 rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-navy-700 text-navy-400 text-xs uppercase tracking-wide">
                <th className="text-left px-3 py-2.5 w-36">Fecha</th>
                <th className="text-left px-3 py-2.5">Símbolo</th>
                <th className="text-left px-3 py-2.5 w-28">Tipo</th>
                <th className="text-right px-3 py-2.5 w-32">Importe</th>
                <th className="text-right px-3 py-2.5 w-32">Títulos</th>
                <th className="text-right px-3 py-2.5 w-28">Comisión</th>
                <th className="text-right px-3 py-2.5 w-40">Precio implícito</th>
                <th className="w-10"></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const implied = num(r.amount) > 0 && num(r.shares) > 0 ? num(r.amount) / num(r.shares) : null;
                const mkt = r.ticker ? prices[r.ticker] : null;
                const dev = implied != null && mkt ? (implied - mkt) / mkt : null;
                const warn = dev != null && Math.abs(dev) > 0.15;
                const valid = rowValid(r);
                return (
                  <tr key={r.id} className={`border-b border-navy-700/40 ${valid ? "bg-green-500/5" : ""}`}>
                    <td className="px-3 py-1.5">
                      <input type="date" value={r.date} onChange={(e) => updateRow(r.id, { date: e.target.value })}
                        className="w-full bg-navy-900 border border-navy-700 rounded px-2 py-1.5 text-white" />
                    </td>
                    <td className="px-3 py-1.5">
                      <select value={r.ticker} onChange={(e) => updateRow(r.id, { ticker: e.target.value })}
                        className="w-full bg-navy-900 border border-navy-700 rounded px-2 py-1.5 text-white">
                        <option value="">—</option>
                        {Object.entries(groups).map(([label, syms]) => (
                          <optgroup key={label} label={label}>
                            {syms.map((s) => <option key={s.ticker} value={s.ticker}>{s.description}</option>)}
                          </optgroup>
                        ))}
                      </select>
                    </td>
                    <td className="px-3 py-1.5">
                      <div className="flex rounded overflow-hidden border border-navy-700">
                        {[["buy", "Compra"], ["sell", "Venta"]].map(([v, lbl]) => (
                          <button key={v} type="button" onClick={() => updateRow(r.id, { side: v })}
                            className={`flex-1 px-2 py-1.5 text-xs transition ${r.side === v
                              ? (v === "sell" ? "bg-red-500/80 text-white" : "bg-green-500/80 text-white")
                              : "bg-navy-900 text-navy-400 hover:text-white"}`}>
                            {lbl}
                          </button>
                        ))}
                      </div>
                    </td>
                    <td className="px-3 py-1.5">
                      <input type="number" step="0.01" inputMode="decimal" value={r.amount} placeholder="0,00"
                        onChange={(e) => updateRow(r.id, { amount: e.target.value })}
                        className="w-full bg-navy-900 border border-navy-700 rounded px-2 py-1.5 text-white text-right" />
                    </td>
                    <td className="px-3 py-1.5">
                      <input type="number" step="0.0000000001" inputMode="decimal" value={r.shares} placeholder="0"
                        onChange={(e) => updateRow(r.id, { shares: e.target.value })}
                        className="w-full bg-navy-900 border border-navy-700 rounded px-2 py-1.5 text-white text-right" />
                    </td>
                    <td className="px-3 py-1.5">
                      <input type="number" step="0.0001" inputMode="decimal" value={r.fee} placeholder="0"
                        onChange={(e) => updateRow(r.id, { fee: e.target.value })}
                        className="w-full bg-navy-900 border border-navy-700 rounded px-2 py-1.5 text-white text-right" />
                    </td>
                    <td className="px-3 py-1.5 text-right">
                      {implied == null ? (
                        <span className="text-navy-600">—</span>
                      ) : (
                        <div className={warn ? "text-amber-400" : "text-navy-300"}>
                          <span className="font-medium">{price(implied)} €</span>
                          {mkt != null && (
                            <span className="block text-[11px] text-navy-500">
                              mkt {price(mkt)} €{dev != null ? ` · ${dev > 0 ? "+" : ""}${(dev * 100).toFixed(1)}%` : ""}
                            </span>
                          )}
                        </div>
                      )}
                    </td>
                    <td className="px-2 py-1.5 text-center">
                      <button type="button" onClick={() => removeRow(r.id)} title="Eliminar fila"
                        className="text-navy-500 hover:text-red-400 text-lg leading-none">×</button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Pie: totales + guardar */}
        <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 border-t border-navy-700 bg-navy-900/40">
          <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm">
            <span className="text-navy-400">Válidas: <span className="text-white font-medium">{validRows.length}</span></span>
            <span className="text-navy-400">Importe neto: <span className="text-white font-medium">{fmtEUR(totals.amount)}</span></span>
            <span className="text-navy-400">Comisiones: <span className="text-white font-medium">{fmtEUR(totals.fee)}</span></span>
          </div>
          <button onClick={save} disabled={saving || !validRows.length || noWallets}
            className="bg-champagne text-[#0a1020] font-semibold rounded-lg px-5 py-2 text-sm hover:bg-gold-400 transition disabled:opacity-40 disabled:cursor-not-allowed">
            {saving ? "Guardando…" : `Guardar ${validRows.length || ""}`.trim()}
          </button>
        </div>
      </div>

      <p className="text-navy-500 text-xs mt-3">
        Se guardan solo las filas con fecha, símbolo, importe y títulos. El <span className="text-navy-400">precio implícito</span> (importe ÷ títulos)
        se compara con el último precio de mercado para avisarte de posibles erratas. Una venta resta títulos e importe de tu posición.
      </p>

      {/* Resultado */}
      {result && (
        <div className={`mt-4 rounded-lg px-4 py-3 text-sm border ${result.ok && !result.errors?.length
          ? "bg-green-500/10 border-green-500/40 text-green-300"
          : result.ok ? "bg-amber-500/10 border-amber-500/40 text-amber-300"
            : "bg-red-500/10 border-red-500/40 text-red-300"}`}>
          {result.ok ? (
            <>
              <p>{result.created} operación{result.created !== 1 ? "es" : ""} guardada{result.created !== 1 ? "s" : ""}.</p>
              {result.errors?.length > 0 && (
                <ul className="mt-1 list-disc list-inside text-xs">
                  {result.errors.map((e, i) => <li key={i}>Fila {e.row + 1}: {e.msg}</li>)}
                </ul>
              )}
            </>
          ) : <p>{result.msg}</p>}
        </div>
      )}

      {/* Histórico ya registrado en esta cartera + plataforma */}
      <div className="mt-8">
        <div className="flex items-baseline justify-between mb-2">
          <h2 className="text-lg font-semibold">Ya registrado</h2>
          <span className="text-navy-500 text-xs">
            {walletName} · {platformName}{history.length ? ` · ${history.length}` : ""}
          </span>
        </div>
        <div className="bg-navy-800 border border-navy-700 rounded-xl overflow-hidden">
          {loadingHist ? (
            <p className="text-navy-400 text-sm px-4 py-6">Cargando…</p>
          ) : history.length === 0 ? (
            <p className="text-navy-500 text-sm px-4 py-6 text-center">
              Sin operaciones en esta cartera y plataforma todavía.
            </p>
          ) : (
            <div className="overflow-x-auto max-h-[28rem] overflow-y-auto">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-navy-800">
                  <tr className="border-b border-navy-700 text-navy-400 text-xs uppercase tracking-wide">
                    <th className="text-left px-4 py-2.5">Fecha</th>
                    <th className="text-left px-3 py-2.5">Símbolo</th>
                    <th className="text-left px-3 py-2.5 w-24">Tipo</th>
                    <th className="text-right px-3 py-2.5">Títulos</th>
                    <th className="text-right px-3 py-2.5 hidden sm:table-cell">Comisión</th>
                    <th className="text-right px-4 py-2.5">Importe</th>
                    <th className="text-right px-3 py-2.5 w-24">Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {history.map((o) => {
                    const sell = o.shares < 0;
                    const editing = editId === o.id;
                    if (editing) {
                      const ef = editForm;
                      const set = (patch) => setEditForm((p) => ({ ...p, ...patch }));
                      return (
                        <tr key={o.id} className="border-b border-navy-700/40 bg-navy-900/40">
                          <td className="px-3 py-1.5">
                            <input type="date" value={ef.date} onChange={(e) => set({ date: e.target.value })}
                              className="w-full bg-navy-900 border border-navy-700 rounded px-2 py-1.5 text-white" />
                          </td>
                          <td className="px-3 py-1.5">
                            <select value={ef.ticker} onChange={(e) => set({ ticker: e.target.value })}
                              className="w-full bg-navy-900 border border-navy-700 rounded px-2 py-1.5 text-white">
                              {Object.entries(groups).map(([label, syms]) => (
                                <optgroup key={label} label={label}>
                                  {syms.map((s) => <option key={s.ticker} value={s.ticker}>{s.description}</option>)}
                                </optgroup>
                              ))}
                            </select>
                          </td>
                          <td className="px-3 py-1.5">
                            <div className="flex rounded overflow-hidden border border-navy-700">
                              {[["buy", "Compra"], ["sell", "Venta"]].map(([v, lbl]) => (
                                <button key={v} type="button" onClick={() => set({ side: v })}
                                  className={`flex-1 px-1.5 py-1.5 text-xs transition ${ef.side === v
                                    ? (v === "sell" ? "bg-red-500/80 text-white" : "bg-green-500/80 text-white")
                                    : "bg-navy-900 text-navy-400 hover:text-white"}`}>{lbl}</button>
                              ))}
                            </div>
                          </td>
                          <td className="px-3 py-1.5">
                            <input type="number" step="0.0000000001" value={ef.shares} onChange={(e) => set({ shares: e.target.value })}
                              className="w-full bg-navy-900 border border-navy-700 rounded px-2 py-1.5 text-white text-right" />
                          </td>
                          <td className="px-3 py-1.5 hidden sm:table-cell">
                            <input type="number" step="0.0001" value={ef.fee} onChange={(e) => set({ fee: e.target.value })}
                              className="w-full bg-navy-900 border border-navy-700 rounded px-2 py-1.5 text-white text-right" />
                          </td>
                          <td className="px-3 py-1.5">
                            <input type="number" step="0.01" value={ef.amount} onChange={(e) => set({ amount: e.target.value })}
                              className="w-full bg-navy-900 border border-navy-700 rounded px-2 py-1.5 text-white text-right" />
                          </td>
                          <td className="px-3 py-1.5 text-right whitespace-nowrap">
                            <button onClick={() => saveEdit(o.id)} disabled={rowBusy} title="Guardar"
                              className="text-green-400 hover:text-green-300 px-1.5 disabled:opacity-40">✓</button>
                            <button onClick={cancelEdit} disabled={rowBusy} title="Cancelar"
                              className="text-navy-400 hover:text-white px-1.5">×</button>
                          </td>
                        </tr>
                      );
                    }
                    return (
                      <tr key={o.id} className="border-b border-navy-700/40 hover:bg-navy-700/20">
                        <td className="px-4 py-2 text-navy-400 whitespace-nowrap">{o.op_date}</td>
                        <td className="px-3 py-2 text-white">{symMap[o.ticker]?.description || o.ticker}</td>
                        <td className="px-3 py-2">
                          <span className={`text-xs px-2 py-0.5 rounded-full ${sell
                            ? "bg-red-500/15 text-red-400" : "bg-green-500/15 text-green-400"}`}>
                            {sell ? "Venta" : "Compra"}
                          </span>
                        </td>
                        <td className="px-3 py-2 text-right text-navy-300">{price(Math.abs(o.shares))}</td>
                        <td className="px-3 py-2 text-right text-navy-400 hidden sm:table-cell">{fmtEUR(o.fee)}</td>
                        <td className={`px-4 py-2 text-right font-medium ${sell ? "text-red-300" : "text-white"}`}>
                          {fmtEUR(o.amount)}
                        </td>
                        <td className="px-3 py-2 text-right whitespace-nowrap">
                          <button onClick={() => startEdit(o)} disabled={rowBusy || editId} title="Editar"
                            className="text-navy-400 hover:text-champagne px-1.5 disabled:opacity-40">✏️</button>
                          <button onClick={() => removeOp(o)} disabled={rowBusy || editId} title="Eliminar"
                            className="text-navy-400 hover:text-red-400 px-1.5 disabled:opacity-40">🗑️</button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
