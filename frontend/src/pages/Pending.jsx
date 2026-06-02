import { useEffect, useState, useCallback } from "react";
import financeApi from "../api/finance";

// ── Helpers ───────────────────────────────────────────────────────────────────
const fmt = (n) =>
  Number(n).toLocaleString("es-ES", { style: "currency", currency: "EUR" });

const inputCls =
  "w-full bg-navy-900 border border-navy-600 text-white rounded-lg px-3 py-2 text-sm " +
  "focus:outline-none focus:border-champagne focus:ring-1 focus:ring-champagne transition";

// ── Categorize Modal ──────────────────────────────────────────────────────────
function CategorizeModal({ tx, catalogues, onClose, onSaved }) {
  const [form, setForm] = useState({
    type_id: tx.type_id || (tx.amount > 0 ? "T01" : "T02"),
    class_id: tx.class_id || "C02",
    category_id: tx.category_id || "",
    company: tx.company || "",
    comment: tx.comment || "",
  });
  const [saving, setSaving] = useState(false);

  const filteredCats = catalogues.categories.filter(
    (c) => !form.class_id || c.class_id === form.class_id
  );

  const onSave = async () => {
    if (!form.type_id || !form.class_id || !form.category_id) return;
    setSaving(true);
    try {
      await financeApi.categorize(tx.id, form);
      onSaved();
    } catch (e) {
      alert(e.response?.data?.error?.message || "Error");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
      <div className="bg-navy-800 border border-navy-700 rounded-2xl w-full max-w-md p-6">
        <h2 className="text-white font-semibold text-lg mb-1">Categorizar</h2>
        <p className="text-navy-400 text-sm mb-4">{tx.description}</p>

        <div className="flex items-center justify-between mb-5 bg-navy-900 rounded-lg px-4 py-3">
          <span className="text-navy-300 text-sm">{tx.op_date}</span>
          <span className={`font-bold text-lg ${tx.amount >= 0 ? "text-green-400" : "text-red-400"}`}>
            {fmt(tx.amount)}
          </span>
        </div>

        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-navy-300 text-xs font-medium mb-1">Tipo *</label>
              <select value={form.type_id} onChange={(e) => setForm({ ...form, type_id: e.target.value })}
                className={inputCls}>
                <option value="">— Tipo —</option>
                {catalogues.types.map((t) => (
                  <option key={t.id} value={t.id}>{t.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-navy-300 text-xs font-medium mb-1">Clase *</label>
              <select value={form.class_id}
                onChange={(e) => setForm({ ...form, class_id: e.target.value, category_id: "" })}
                className={inputCls}>
                <option value="">— Clase —</option>
                {catalogues.classes.map((c) => (
                  <option key={c.id} value={c.id}>{c.label}</option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="block text-navy-300 text-xs font-medium mb-1">Categoría *</label>
            <select value={form.category_id}
              onChange={(e) => setForm({ ...form, category_id: e.target.value })}
              className={inputCls}>
              <option value="">— Categoría —</option>
              {filteredCats.map((c) => (
                <option key={c.id} value={c.id}>{c.icon} {c.label}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-navy-300 text-xs font-medium mb-1">Empresa / Comercio</label>
            <input value={form.company} onChange={(e) => setForm({ ...form, company: e.target.value })}
              className={inputCls} placeholder="Amazon, Carrefour…" />
          </div>

          <div>
            <label className="block text-navy-300 text-xs font-medium mb-1">Comentario</label>
            <input value={form.comment} onChange={(e) => setForm({ ...form, comment: e.target.value })}
              className={inputCls} placeholder="Nota opcional" />
          </div>
        </div>

        <div className="flex gap-3 mt-5">
          <button onClick={onClose}
            className="flex-1 border border-navy-600 text-navy-300 hover:text-white rounded-lg py-2 text-sm transition">
            Cancelar
          </button>
          <button onClick={onSave} disabled={saving || !form.type_id || !form.class_id || !form.category_id}
            className="flex-1 bg-champagne hover:bg-champagne-light text-navy-950 font-semibold rounded-lg py-2 text-sm transition disabled:opacity-50">
            {saving ? "Guardando…" : "Guardar"}
          </button>
        </div>
      </div>
    </div>
  );
}

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
            const filteredCats = catalogues.categories.filter(
              (c) => !sp.class_id || c.class_id === sp.class_id
            );
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
                      onChange={(e) => updateSplit(i, "class_id", e.target.value) || updateSplit(i, "category_id", "")}
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

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function Pending() {
  const [pending, setPending] = useState([]);
  const [catalogues, setCatalogues] = useState(null);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(null); // {type: "categorize"|"split", tx}

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [catRes, pendRes] = await Promise.all([
        financeApi.getCatalogues(),
        financeApi.getPending(),
      ]);
      setCatalogues(catRes.data.data);
      setPending(pendRes.data.data);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleDelete = async (id) => {
    if (!confirm("¿Eliminar este movimiento?")) return;
    await financeApi.deleteTransaction(id);
    load();
  };

  if (loading || !catalogues) return <p className="text-navy-400">Cargando…</p>;

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-semibold">Por categorizar</h1>
        <p className="text-navy-400 text-sm mt-0.5">
          {pending.length} movimiento{pending.length !== 1 ? "s" : ""} pendiente{pending.length !== 1 ? "s" : ""}
        </p>
      </div>

      {pending.length === 0 ? (
        <div className="text-center py-16 text-navy-500">
          <p className="text-4xl mb-3">✅</p>
          <p>Todo categorizado. ¡Bien hecho!</p>
        </div>
      ) : (
        <div className="bg-navy-800 border border-navy-700 rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-navy-700 text-navy-400 text-xs uppercase tracking-wide">
                <th className="text-left px-4 py-3">Fecha</th>
                <th className="text-left px-4 py-3">Descripción</th>
                <th className="text-left px-4 py-3 hidden md:table-cell">Empresa</th>
                <th className="text-right px-4 py-3">Importe</th>
                <th className="text-right px-4 py-3">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {pending.map((tx, i) => (
                <tr key={tx.id}
                  className={`border-b border-navy-700/50 hover:bg-navy-700/30 transition ${i % 2 === 0 ? "" : "bg-navy-800/50"}`}>
                  <td className="px-4 py-3 text-navy-400 whitespace-nowrap">{tx.op_date}</td>
                  <td className="px-4 py-3">
                    <p className="text-white line-clamp-1">{tx.description}</p>
                  </td>
                  <td className="px-4 py-3 text-navy-400 hidden md:table-cell">{tx.company || "—"}</td>
                  <td className={`px-4 py-3 text-right font-semibold whitespace-nowrap
                    ${tx.amount >= 0 ? "text-green-400" : "text-red-400"}`}>
                    {fmt(tx.amount)}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-1">
                      <button onClick={() => setModal({ type: "categorize", tx })}
                        className="px-2 py-1 text-xs bg-champagne/20 hover:bg-champagne/40 text-champagne rounded transition">
                        Categorizar
                      </button>
                      <button onClick={() => setModal({ type: "split", tx })}
                        className="px-2 py-1 text-xs bg-navy-700 hover:bg-navy-600 text-navy-300 rounded transition">
                        Split
                      </button>
                      <button onClick={() => handleDelete(tx.id)}
                        className="px-2 py-1 text-xs text-red-500 hover:text-red-400 transition">
                        ✕
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {modal?.type === "categorize" && (
        <CategorizeModal tx={modal.tx} catalogues={catalogues}
          onClose={() => setModal(null)}
          onSaved={() => { setModal(null); load(); }} />
      )}
      {modal?.type === "split" && (
        <SplitModal tx={modal.tx} catalogues={catalogues}
          onClose={() => setModal(null)}
          onSaved={() => { setModal(null); load(); }} />
      )}
    </div>
  );
}
