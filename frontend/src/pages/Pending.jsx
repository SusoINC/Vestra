import { useEffect, useState, useCallback, memo } from "react";
import financeApi from "../api/finance";
import useFinanceStore from "../store/financeStore";
import { fmtEUR as fmt } from "../utils/format";

// ── Helpers ───────────────────────────────────────────────────────────────────
const inputCls =
  "w-full bg-navy-900 border border-navy-600 text-white rounded-lg px-3 py-2 text-sm " +
  "focus:outline-none focus:border-champagne focus:ring-1 focus:ring-champagne transition";

const cellSelect =
  "w-full bg-navy-900 border border-navy-700 text-white rounded px-1.5 py-1 text-xs " +
  "focus:outline-none focus:border-champagne transition";

// ── Split Modal ───────────────────────────────────────────────────────────────
function SplitModal({ tx, catalogues, onClose, onSaved }) {
  const total = Math.abs(tx.amount);
  const [splits, setSplits] = useState([
    { amount: "", type_id: "T02", class_id: "C02", category_id: "", company: tx.company || "", comment: "" },
    { amount: "", type_id: "T02", class_id: "C02", category_id: "", company: "", comment: "" },
  ]);
  const [saving, setSaving] = useState(false);

  const assigned = splits.reduce((s, sp) => s + (parseFloat(sp.amount) || 0), 0);
  const remaining = Math.round((total - assigned) * 100) / 100;

  const updateSplit = (i, key, val) => {
    const next = [...splits];
    next[i] = { ...next[i], [key]: val };
    setSplits(next);
  };

  const onSave = async () => {
    if (remaining !== 0) return;
    setSaving(true);
    try {
      await financeApi.split(tx.id, splits.map((s) => ({ ...s, amount: parseFloat(s.amount) })));
      onSaved();
    } catch (e) {
      alert(e.response?.data?.error?.message || "Error");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-navy-800 border border-navy-700 rounded-2xl w-full max-w-lg p-6 my-4">
        <h2 className="text-white font-semibold text-lg mb-1">Dividir transacción</h2>
        <p className="text-navy-400 text-sm mb-4">{tx.description}</p>

        <div className="flex items-center justify-between bg-navy-900 rounded-lg px-4 py-3 mb-5">
          <span className="text-navy-300 text-sm">Total a distribuir</span>
          <span className="font-bold text-lg text-red-400">{fmt(-total)}</span>
        </div>

        <div className="space-y-4">
          {splits.map((sp, i) => {
            const filteredCats = catalogues.categories;
            return (
              <div key={i} className="bg-navy-900 rounded-xl p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-navy-300 text-sm font-medium">Split {i + 1}</span>
                  {splits.length > 2 && (
                    <button onClick={() => setSplits(splits.filter((_, j) => j !== i))}
                      className="text-red-400 hover:text-red-300 text-xs">✕ Eliminar</button>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-navy-500 text-xs mb-1">Importe (€) *</label>
                    <input type="number" step="0.01" min="0" value={sp.amount}
                      onChange={(e) => updateSplit(i, "amount", e.target.value)}
                      className={inputCls} placeholder="0.00" />
                  </div>
                  <div>
                    <label className="block text-navy-500 text-xs mb-1">Tipo</label>
                    <select value={sp.type_id} onChange={(e) => updateSplit(i, "type_id", e.target.value)}
                      className={inputCls}>
                      {catalogues.types.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-navy-500 text-xs mb-1">Clase</label>
                    <select value={sp.class_id}
                      onChange={(e) => updateSplit(i, "class_id", e.target.value)}
                      className={inputCls}>
                      {catalogues.classes.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-navy-500 text-xs mb-1">Categoría *</label>
                    <select value={sp.category_id} onChange={(e) => updateSplit(i, "category_id", e.target.value)}
                      className={inputCls}>
                      <option value="">— Selecciona —</option>
                      {filteredCats.map((c) => <option key={c.id} value={c.id}>{c.icon} {c.label}</option>)}
                    </select>
                  </div>
                </div>
                <input value={sp.company} onChange={(e) => updateSplit(i, "company", e.target.value)}
                  className={inputCls} placeholder="Empresa (opcional)" />
              </div>
            );
          })}
        </div>

        <button onClick={() => setSplits([...splits, { amount: "", type_id: "T02", class_id: "C02", category_id: "", company: "", comment: "" }])}
          className="mt-3 text-champagne hover:text-champagne-light text-sm transition">
          + Añadir split
        </button>

        <div className={`mt-4 flex items-center justify-between rounded-lg px-4 py-3
          ${remaining === 0 ? "bg-green-900/30 border border-green-700" : "bg-yellow-900/30 border border-yellow-700"}`}>
          <span className="text-sm text-navy-300">Restante sin asignar</span>
          <span className={`font-bold ${remaining === 0 ? "text-green-400" : "text-yellow-400"}`}>
            {fmt(-remaining)}
          </span>
        </div>

        <div className="flex gap-3 mt-5">
          <button onClick={onClose}
            className="flex-1 border border-navy-600 text-navy-300 hover:text-white rounded-lg py-2 text-sm transition">
            Cancelar
          </button>
          <button onClick={onSave} disabled={saving || remaining !== 0}
            className="flex-1 bg-champagne hover:bg-champagne-light text-navy-950 font-semibold rounded-lg py-2 text-sm transition disabled:opacity-50">
            {saving ? "Guardando…" : "Guardar splits"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Fila inline (memoizada para no re-renderizar todas al teclear) ──────────────
const PendingRow = memo(function PendingRow({ tx, val, catalogues, onChange, onSplit, onDelete }) {
  const subcatOptions = (catalogues.subcategories || [])
    .filter((s) => s.category_id === val.category_id);
  const isTransfer = val.type_id === "T03";
  const complete = isTransfer || (val.type_id && val.class_id && val.category_id);
  const hasSug = tx.suggestion && (tx.suggestion.type_id || tx.suggestion.category_id);

  return (
    <tr className={`border-b border-navy-700/50 ${complete ? "bg-green-900/10" : "hover:bg-navy-700/20"}`}>
      <td className="px-2 py-2 text-navy-400 whitespace-nowrap text-xs align-middle">{tx.op_date}</td>
      <td className="px-2 py-2 align-middle max-w-[16rem]">
        <p className="text-white text-xs line-clamp-1">{tx.description}</p>
        {hasSug && <span className="text-gold-400/70 text-[10px]">✦ sugerencia ING</span>}
      </td>
      <td className={`px-2 py-2 text-right font-semibold whitespace-nowrap text-xs align-middle
        ${tx.amount >= 0 ? "text-green-400" : "text-red-400"}`}>
        {fmt(tx.amount)}
      </td>
      {/* Tipo */}
      <td className="px-1 py-2 align-middle">
        <select value={val.type_id} onChange={(e) => onChange(tx.id, { type_id: e.target.value })}
          className={cellSelect}>
          <option value="">—</option>
          {catalogues.types.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
        </select>
      </td>
      {/* Clase */}
      <td className="px-1 py-2 align-middle">
        <select value={isTransfer ? "" : val.class_id} disabled={isTransfer}
          onChange={(e) => onChange(tx.id, { class_id: e.target.value })}
          className={cellSelect + " disabled:opacity-30"}>
          <option value="">—</option>
          {catalogues.classes.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
        </select>
      </td>
      {/* Categoría */}
      <td className="px-1 py-2 align-middle">
        <select value={isTransfer ? "" : val.category_id} disabled={isTransfer}
          onChange={(e) => onChange(tx.id, { category_id: e.target.value, subcategory_label: "" })}
          className={cellSelect + " disabled:opacity-30"}>
          <option value="">—</option>
          {catalogues.categories.map((c) => <option key={c.id} value={c.id}>{c.icon} {c.label}</option>)}
        </select>
      </td>
      {/* Subcategoría */}
      <td className="px-1 py-2 align-middle">
        <input list={`sub-${tx.id}`} value={val.subcategory_label}
          onChange={(e) => onChange(tx.id, { subcategory_label: e.target.value })}
          disabled={isTransfer || !val.category_id}
          className={cellSelect + " disabled:opacity-30"} placeholder="—" />
        <datalist id={`sub-${tx.id}`}>
          {subcatOptions.map((s) => <option key={s.id} value={s.label} />)}
        </datalist>
      </td>
      {/* Empresa */}
      <td className="px-1 py-2 align-middle">
        <input list="company-opts-pending" value={val.company}
          onChange={(e) => onChange(tx.id, { company: e.target.value })}
          className={cellSelect} placeholder="—" autoComplete="off" />
      </td>
      {/* Detalles / comentario */}
      <td className="px-1 py-2 align-middle">
        <input value={val.comment}
          onChange={(e) => onChange(tx.id, { comment: e.target.value })}
          className={cellSelect} placeholder="—" />
      </td>
      {/* Acciones */}
      <td className="px-2 py-2 text-right whitespace-nowrap align-middle">
        <button onClick={() => onSplit(tx)}
          className="px-2 py-1 text-xs bg-navy-700 hover:bg-navy-600 text-navy-300 rounded transition mr-1">
          Split
        </button>
        <button onClick={() => onDelete(tx.id)}
          className="px-1.5 py-1 text-xs text-red-500 hover:text-red-400 transition">✕</button>
      </td>
    </tr>
  );
});

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function Pending() {
  const [pending, setPending] = useState([]);
  const [catalogues, setCatalogues] = useState(null);
  const [rows, setRows] = useState({});       // { txId: {type_id, class_id, category_id, subcategory_label} }
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [splitTx, setSplitTx] = useState(null);
  const { setPendingCount, decrementPending } = useFinanceStore();

  const buildRows = (items) => {
    const r = {};
    items.forEach((tx) => {
      const s = tx.suggestion || {};
      r[tx.id] = {
        type_id: s.type_id || (tx.amount > 0 ? "T01" : "T02"),
        class_id: s.class_id || "C02",
        category_id: s.category_id || "",
        subcategory_label: "",
        company: (tx.company && tx.company !== ".") ? tx.company : "",
        comment: tx.comment || "",
      };
    });
    return r;
  };

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [catRes, pendRes] = await Promise.all([
        financeApi.getCatalogues(),
        financeApi.getPending(),
      ]);
      setCatalogues(catRes.data.data);
      setPending(pendRes.data.data);
      setRows(buildRows(pendRes.data.data));
      setPendingCount(pendRes.data.meta?.total ?? 0);
    } finally {
      setLoading(false);
    }
  }, [setPendingCount]);

  useEffect(() => { load(); }, [load]);

  const onChange = useCallback((id, patch) => {
    setRows((r) => ({ ...r, [id]: { ...r[id], ...patch } }));
  }, []);

  const onDelete = useCallback(async (id) => {
    if (!confirm("¿Eliminar este movimiento?")) return;
    await financeApi.deleteTransaction(id);
    decrementPending();
    load();
  }, [decrementPending, load]);

  const onSplit = useCallback((tx) => setSplitTx(tx), []);

  // Lista para guardar: transferencia (T03) basta con el tipo; resto requiere todo
  const isReady = (v) => v.type_id === "T03" || (v.type_id && v.class_id && v.category_id);
  const readyCount = Object.values(rows).filter(isReady).length;

  const saveAll = async () => {
    const items = Object.entries(rows)
      .filter(([, v]) => isReady(v))
      .map(([id, v]) => ({ id, ...v }));
    if (!items.length) return;
    setSaving(true);
    try {
      const r = await financeApi.categorizeBulk(items);
      const n = r.data.data.categorized;
      setPendingCount(Math.max(0, (useFinanceStore.getState().pendingCount) - n));
      await load();
    } catch (e) {
      alert(e.response?.data?.error?.message || "Error guardando");
    } finally {
      setSaving(false);
    }
  };

  if (loading || !catalogues) return <p className="text-navy-400">Cargando…</p>;

  return (
    <div className="pb-20">
      {/* Datalist compartido de empresas (autocompletado) */}
      <datalist id="company-opts-pending">
        {(catalogues.companies || []).map((c) => <option key={c} value={c} />)}
      </datalist>

      <div className="mb-5">
        <h1 className="text-2xl font-semibold">Por categorizar</h1>
        <p className="text-navy-400 text-sm mt-0.5">
          {pending.length} pendiente{pending.length !== 1 ? "s" : ""} · rellena en línea y guarda todo de golpe
        </p>
      </div>

      {pending.length === 0 ? (
        <div className="text-center py-16 text-navy-500">
          <p className="text-4xl mb-3">✅</p>
          <p>Todo categorizado. ¡Bien hecho!</p>
        </div>
      ) : (
        <div className="bg-navy-800 border border-navy-700 rounded-xl overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-navy-700 text-navy-400 text-xs uppercase tracking-wide">
                <th className="text-left px-2 py-3">Fecha</th>
                <th className="text-left px-2 py-3">Descripción</th>
                <th className="text-right px-2 py-3">Importe</th>
                <th className="text-left px-1 py-3 w-24">Tipo</th>
                <th className="text-left px-1 py-3 w-24">Clase</th>
                <th className="text-left px-1 py-3 w-32">Categoría</th>
                <th className="text-left px-1 py-3 w-32">Subcategoría</th>
                <th className="text-left px-1 py-3 w-32">Empresa</th>
                <th className="text-left px-1 py-3 w-32">Detalles</th>
                <th className="text-right px-2 py-3">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {pending.map((tx) => (
                <PendingRow key={tx.id} tx={tx} val={rows[tx.id]} catalogues={catalogues}
                  onChange={onChange} onSplit={onSplit} onDelete={onDelete} />
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Barra de guardado fija abajo */}
      {pending.length > 0 && (
        <div className="fixed bottom-0 left-56 right-0 bg-navy-900/95 backdrop-blur border-t border-navy-700 px-6 py-3 flex items-center justify-between z-30">
          <span className="text-navy-300 text-sm">
            {readyCount} de {pending.length} listas para guardar
          </span>
          <button onClick={saveAll} disabled={saving || readyCount === 0}
            className="bg-champagne hover:bg-champagne-light text-navy-950 font-semibold rounded-lg px-6 py-2 text-sm transition disabled:opacity-50">
            {saving ? "Guardando…" : `Guardar ${readyCount} categorizados`}
          </button>
        </div>
      )}

      {splitTx && (
        <SplitModal tx={splitTx} catalogues={catalogues}
          onClose={() => setSplitTx(null)}
          onSaved={() => { setSplitTx(null); decrementPending(); load(); }} />
      )}
    </div>
  );
}
