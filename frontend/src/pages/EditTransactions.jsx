import { useEffect, useState, useCallback, useRef } from "react";
import financeApi from "../api/finance";
import useFinanceStore from "../store/financeStore";
import { fmtEUR as fmt } from "../utils/format";
import MultiCategorySelect from "../components/MultiCategorySelect";

const inputCls =
  "w-full bg-navy-900 border border-navy-600 text-white rounded-lg px-3 py-2 text-sm " +
  "focus:outline-none focus:border-champagne focus:ring-1 focus:ring-champagne transition placeholder-navy-500";

const selectCls =
  "bg-navy-900 border border-navy-600 text-white rounded-lg px-3 py-2 text-sm " +
  "focus:outline-none focus:border-champagne transition";

// ── Status badge ──────────────────────────────────────────────────────────────
function StatusBadge({ tx }) {
  if (tx.is_split)
    return <span className="text-xs px-2 py-0.5 rounded-full bg-blue-900/40 text-blue-300">Split</span>;
  if (tx.type_id === "T03")
    return <span className="text-xs px-2 py-0.5 rounded-full bg-sky-900/40 text-sky-300">Transferencia</span>;
  if (tx.deprecated)
    return <span className="text-xs px-2 py-0.5 rounded-full bg-navy-700 text-navy-400">Histórico</span>;
  if (!tx.category_id)
    return <span className="text-xs px-2 py-0.5 rounded-full bg-yellow-900/40 text-yellow-300">Pendiente</span>;
  return <span className="text-xs px-2 py-0.5 rounded-full bg-green-900/40 text-green-400">Categorizado</span>;
}

// ── Edit Modal ────────────────────────────────────────────────────────────────
function EditModal({ tx, catalogues, onClose, onSaved }) {
  // Label inicial de la subcategoría (mapea id → label desde el catálogo)
  const initialSubLabel =
    (catalogues.subcategories || []).find((s) => s.id === tx.subcategory_id)?.label || "";

  const [form, setForm] = useState({
    op_date:     tx.op_date || "",
    amount:      tx.amount ?? "",
    company:     tx.company || "",
    comment:     tx.comment || "",
    description: tx.description || "",
    type_id:     tx.type_id || "",
    class_id:    tx.class_id || "",
    category_id: tx.category_id || "",
    subcategory_label: initialSubLabel,
  });
  const [saving, setSaving] = useState(false);

  // Clase y categoría son independientes → se muestran todas las categorías
  const filteredCats = catalogues.categories;
  const subcatOptions = (catalogues.subcategories || [])
    .filter((s) => s.category_id === form.category_id);

  const onSave = async () => {
    setSaving(true);
    try {
      await financeApi.updateTransaction(tx.id, {
        ...form,
        amount: parseFloat(form.amount),
        // empty string → clear categorisation
        category_id: form.category_id || null,
        type_id:     form.type_id     || null,
        class_id:    form.class_id    || null,
      });
      onSaved();
    } catch (e) {
      alert(e.response?.data?.error?.message || "Error guardando");
    } finally {
      setSaving(false);
    }
  };

  const field = (label, key, type = "text", extra = {}) => (
    <div>
      <label className="block text-navy-400 text-xs font-medium mb-1">{label}</label>
      <input
        type={type}
        value={form[key]}
        onChange={(e) => setForm({ ...form, [key]: e.target.value })}
        className={inputCls}
        {...extra}
      />
    </div>
  );

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-navy-800 border border-navy-700 rounded-2xl w-full max-w-lg p-6 my-4">
        <h2 className="text-white font-semibold text-lg mb-4">Editar movimiento</h2>

        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            {field("Fecha", "op_date", "date")}
            {field("Importe (€)", "amount", "number", { step: "0.01" })}
          </div>
          <div>
            <label className="block text-navy-400 text-xs font-medium mb-1">Empresa / Comercio</label>
            <input list="company-options-edit" value={form.company}
              onChange={(e) => setForm({ ...form, company: e.target.value })}
              className={inputCls} placeholder="Amazon, Mercadona…" autoComplete="off" />
            <datalist id="company-options-edit">
              {(catalogues.companies || []).map((c) => <option key={c} value={c} />)}
            </datalist>
          </div>
          {field("Descripción (ING)", "description", "text")}
          {field("Comentario / nota", "comment", "text", { placeholder: "Nota libre" })}

          <hr className="border-navy-700" />

          {/* Categorisation — optional, clearing it reverts to pending */}
          <p className="text-navy-400 text-xs">
            Categorización{" "}
            <span className="text-navy-600">(vacía = vuelve a pendiente)</span>
          </p>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-navy-400 text-xs font-medium mb-1">Tipo</label>
              <select value={form.type_id}
                onChange={(e) => setForm({ ...form, type_id: e.target.value })}
                className={selectCls + " w-full"}>
                <option value="">— Sin tipo —</option>
                {catalogues.types.map((t) => (
                  <option key={t.id} value={t.id}>{t.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-navy-400 text-xs font-medium mb-1">Clase</label>
              <select value={form.class_id}
                onChange={(e) => setForm({ ...form, class_id: e.target.value })}
                className={selectCls + " w-full"}>
                <option value="">— Sin clase —</option>
                {catalogues.classes.map((c) => (
                  <option key={c.id} value={c.id}>{c.label}</option>
                ))}
              </select>
            </div>
          </div>
          <div>
            <label className="block text-navy-400 text-xs font-medium mb-1">Categoría</label>
            <select value={form.category_id}
              onChange={(e) => setForm({ ...form, category_id: e.target.value, subcategory_label: "" })}
              className={selectCls + " w-full"}>
              <option value="">— Sin categoría —</option>
              {filteredCats.map((c) => (
                <option key={c.id} value={c.id}>{c.icon} {c.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-navy-400 text-xs font-medium mb-1">Subcategoría</label>
            <input
              list="subcat-options-edit"
              value={form.subcategory_label}
              onChange={(e) => setForm({ ...form, subcategory_label: e.target.value })}
              disabled={!form.category_id}
              className={inputCls + " disabled:opacity-40"}
              placeholder={form.category_id ? "Ej: Gasoil… (o escribe una nueva)" : "Elige categoría primero"}
            />
            <datalist id="subcat-options-edit">
              {subcatOptions.map((s) => <option key={s.id} value={s.label} />)}
            </datalist>
          </div>
        </div>

        <div className="flex gap-3 mt-6">
          <button onClick={onClose}
            className="flex-1 border border-navy-600 text-navy-300 hover:text-white rounded-lg py-2 text-sm transition">
            Cancelar
          </button>
          <button onClick={onSave} disabled={saving}
            className="flex-1 bg-champagne hover:bg-champagne-light text-[#0a1020] font-semibold rounded-lg py-2 text-sm transition disabled:opacity-50">
            {saving ? "Guardando…" : "Guardar cambios"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Split children row ────────────────────────────────────────────────────────
function SplitChildren({ splits, catalogues, onEdit }) {
  const catMap = Object.fromEntries(catalogues.categories.map((c) => [c.id, c]));
  return (
    <div className="bg-navy-950/60 border-l-2 border-blue-600 ml-8 mr-2 rounded-r-lg overflow-hidden mb-1">
      {splits.map((s, i) => {
        const cat = catMap[s.category_id];
        return (
          <div key={s.id} className="flex items-center gap-3 px-4 py-2 text-sm border-b border-navy-800/50 last:border-0">
            <span className="text-navy-500 text-xs w-4">{i + 1}</span>
            <span className="text-navy-400 flex-1">{s.company || s.description || "—"}</span>
            {cat && (
              <span className="text-xs px-2 py-0.5 rounded-full"
                style={{ backgroundColor: `${cat.color}20`, color: cat.color }}>
                {cat.icon} {cat.label}
              </span>
            )}
            <span className={`font-medium w-20 text-right ${s.amount >= 0 ? "text-green-400" : "text-red-400"}`}>
              {fmt(s.amount)}
            </span>
            <button onClick={() => onEdit(s)}
              className="text-xs text-navy-400 hover:text-white border border-navy-700 rounded px-2 py-0.5 transition">
              Editar
            </button>
          </div>
        );
      })}
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
const TABS = [
  { value: "all",         label: "Todos" },
  { value: "pending",     label: "Pendientes" },
  { value: "categorized", label: "Categorizados" },
  { value: "deprecated",  label: "Históricos" },
];

export default function EditTransactions() {
  const [data, setData] = useState({ items: [], total: 0, page: 1, pages: 1 });
  const [catalogues, setCatalogues] = useState(null);
  const [accounts, setAccounts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState({}); // tx.id → bool
  const [editModal, setEditModal] = useState(null); // tx object
  const [filters, setFilters] = useState({
    q: "", status: "all", account_id: "", type_id: "",
    category_id: "", date_from: "", date_to: "",
    amount_min: "", amount_max: "",
    page: 1, per_page: 50,
  });
  const searchRef = useRef();
  const debounceRef = useRef();
  const setPendingCount = useFinanceStore((s) => s.setPendingCount);

  const catMap = Object.fromEntries((catalogues?.categories || []).map((c) => [c.id, c]));
  const typeMap = Object.fromEntries((catalogues?.types    || []).map((t) => [t.id, t]));
  const subcatMap = Object.fromEntries((catalogues?.subcategories || []).map((s) => [s.id, s]));

  // Refresca el badge "Por categorizar" del menú tras cualquier cambio
  const refreshBadge = useCallback(() => {
    financeApi.getPending()
      .then((r) => setPendingCount(r.data.meta?.total ?? 0))
      .catch(() => {});
  }, [setPendingCount]);

  // Recarga el catálogo (empresas/subcategorías nuevas se reflejan al instante)
  const refreshCatalogues = useCallback(() => {
    financeApi.getCatalogues()
      .then((r) => setCatalogues(r.data.data))
      .catch(() => {});
  }, []);

  const load = useCallback(async (currentFilters) => {
    setLoading(true);
    try {
      const params = Object.fromEntries(
        Object.entries(currentFilters).filter(([, v]) => v !== "" && v !== "all")
      );
      const [txRes, catRes, accRes] = await Promise.all([
        financeApi.getAllTransactions(params),
        catalogues ? null : financeApi.getCatalogues(),
        accounts.length ? null : financeApi.getAccounts(),
      ]);
      setData({ items: txRes.data.data, ...txRes.data.meta });
      if (catRes) setCatalogues(catRes.data.data);
      if (accRes) setAccounts(accRes.data.data);
    } finally {
      setLoading(false);
    }
  }, [catalogues, accounts]); // eslint-disable-line

  useEffect(() => { load(filters); }, []); // eslint-disable-line

  const applyFilters = (next) => {
    setFilters(next);
    load(next);
  };

  const setFilter = (key, val) => {
    const next = { ...filters, [key]: val, page: 1 };
    applyFilters(next);
  };

  // Cambio de página: NO resetea a 1 (a diferencia de setFilter)
  const goToPage = (p) => applyFilters({ ...filters, page: p });

  const handleSearch = (val) => {
    setFilters((f) => ({ ...f, q: val, page: 1 }));
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      load({ ...filters, q: val, page: 1 });
    }, 400);
  };

  const handleDelete = async (id) => {
    if (!confirm("¿Eliminar este movimiento?")) return;
    await financeApi.deleteTransaction(id);
    load(filters);
    refreshBadge();
  };

  const handleUnsplit = async (id) => {
    if (!confirm("¿Fusionar los splits y volver a estado pendiente?")) return;
    await financeApi.unsplit(id);
    load(filters);
    refreshBadge();
  };

  const toggleExpand = (id) =>
    setExpanded((e) => ({ ...e, [id]: !e[id] }));

  return (
    <div>
      {/* Header */}
      <div className="mb-5">
        <h1 className="text-2xl font-semibold">Editar movimientos</h1>
        <p className="text-navy-400 text-sm mt-0.5">
          {data.total} movimiento{data.total !== 1 ? "s" : ""}
        </p>
      </div>

      {/* Search + status tabs */}
      <div className="flex flex-col sm:flex-row gap-3 mb-4">
        <div className="relative flex-1">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-navy-500">🔍</span>
          <input
            ref={searchRef}
            value={filters.q}
            onChange={(e) => handleSearch(e.target.value)}
            placeholder="Buscar por empresa, descripción, comentario o subcategoría…"
            className={inputCls + " pl-9"}
          />
        </div>
        <div className="flex gap-1 bg-navy-800 rounded-lg p-1 border border-navy-700">
          {TABS.map((tab) => (
            <button key={tab.value}
              onClick={() => setFilter("status", tab.value)}
              className={`px-3 py-1.5 rounded-md text-sm transition
                ${filters.status === tab.value
                  ? "bg-navy-600 text-white font-medium"
                  : "text-navy-400 hover:text-white"}`}>
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Filter row */}
      <div className="flex flex-wrap gap-2 mb-5">
        <select value={filters.account_id} onChange={(e) => setFilter("account_id", e.target.value)}
          className={selectCls}>
          <option value="">Todas las cuentas</option>
          {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
        </select>
        <select value={filters.type_id} onChange={(e) => setFilter("type_id", e.target.value)}
          className={selectCls}>
          <option value="">Todos los tipos</option>
          {(catalogues?.types || []).map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
        </select>
        <MultiCategorySelect categories={catalogues?.categories || []}
          value={filters.category_id ? filters.category_id.split(",") : []}
          onChange={(arr) => setFilter("category_id", arr.join(","))} />
        <input type="date" value={filters.date_from}
          onChange={(e) => setFilter("date_from", e.target.value)} className={selectCls} />
        <input type="date" value={filters.date_to}
          onChange={(e) => setFilter("date_to", e.target.value)} className={selectCls} />
        <input type="number" step="0.01" min="0" value={filters.amount_min}
          onChange={(e) => setFilter("amount_min", e.target.value)}
          placeholder="Importe ≥ €" className={selectCls + " w-32"} />
        <input type="number" step="0.01" min="0" value={filters.amount_max}
          onChange={(e) => setFilter("amount_max", e.target.value)}
          placeholder="Importe ≤ €" className={selectCls + " w-32"} />
        {Object.entries(filters).some(([k, v]) => v !== "" && v !== "all" && k !== "page" && k !== "per_page") && (
          <button onClick={() => applyFilters({ q: "", status: "all", account_id: "", type_id: "", category_id: "", date_from: "", date_to: "", amount_min: "", amount_max: "", page: 1, per_page: 50 })}
            className="text-sm text-navy-400 hover:text-white border border-navy-700 rounded-lg px-3 py-2 transition">
            ✕ Limpiar
          </button>
        )}
      </div>

      {/* Table */}
      {loading ? (
        <p className="text-navy-400">Cargando…</p>
      ) : data.items.length === 0 ? (
        <div className="text-center py-16 text-navy-500">
          <p className="text-4xl mb-3">🔍</p>
          <p>Sin resultados para este filtro.</p>
        </div>
      ) : (
        <>
          <div className="bg-navy-800 border border-navy-700 rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-navy-700 text-navy-400 text-xs uppercase tracking-wide">
                  <th className="w-8 px-2 py-3"></th>
                  <th className="text-left px-3 py-3">Fecha</th>
                  <th className="text-left px-3 py-3">Descripción / Empresa</th>
                  <th className="text-left px-3 py-3 hidden md:table-cell">Categoría</th>
                  <th className="text-left px-3 py-3 hidden lg:table-cell">Tipo</th>
                  <th className="text-center px-3 py-3">Estado</th>
                  <th className="text-right px-3 py-3">Importe</th>
                  <th className="text-right px-3 py-3">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((tx, i) => {
                  const cat = catMap[tx.category_id];
                  const subcat = subcatMap[tx.subcategory_id];
                  const type = typeMap[tx.type_id];
                  const isOpen = expanded[tx.id];
                  return (
                    <>
                      <tr key={tx.id}
                        className={`border-b border-navy-700/50 hover:bg-navy-700/20 transition
                          ${i % 2 === 0 ? "" : "bg-navy-900/20"}`}>
                        {/* Expand toggle (only for splits) */}
                        <td className="px-2 py-3 text-center">
                          {tx.is_split ? (
                            <button onClick={() => toggleExpand(tx.id)}
                              className="text-blue-400 hover:text-blue-200 transition text-xs">
                              {isOpen ? "▼" : "▶"}
                            </button>
                          ) : null}
                        </td>

                        <td className="px-3 py-3 text-navy-400 whitespace-nowrap text-xs">
                          {tx.op_date}
                        </td>

                        <td className="px-3 py-3 max-w-xs">
                          <p className="text-white font-medium line-clamp-1">
                            {tx.company || tx.description || "—"}
                          </p>
                          {tx.company && tx.description && (
                            <p className="text-navy-500 text-xs line-clamp-1">{tx.description}</p>
                          )}
                          {tx.comment && (
                            <p className="text-navy-600 text-xs italic line-clamp-1">{tx.comment}</p>
                          )}
                        </td>

                        <td className="px-3 py-3 hidden md:table-cell">
                          {cat ? (
                            <div className="flex flex-col gap-0.5 items-start">
                              <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full"
                                style={{ backgroundColor: `${cat.color}20`, color: cat.color }}>
                                {cat.icon} {cat.label}
                              </span>
                              {subcat && (
                                <span className="text-navy-400 text-xs pl-1">› {subcat.label}</span>
                              )}
                            </div>
                          ) : "—"}
                        </td>

                        <td className="px-3 py-3 text-navy-500 text-xs hidden lg:table-cell">
                          {type?.label || "—"}
                        </td>

                        <td className="px-3 py-3 text-center">
                          <StatusBadge tx={tx} />
                        </td>

                        <td className={`px-3 py-3 text-right font-semibold whitespace-nowrap
                          ${tx.amount >= 0 ? "text-green-400" : "text-red-400"}`}>
                          {fmt(tx.amount)}
                        </td>

                        <td className="px-3 py-3 text-right">
                          <div className="flex items-center justify-end gap-1">
                            {!tx.is_split && (
                              <button onClick={() => setEditModal(tx)}
                                className="px-2 py-1 text-xs bg-champagne/20 hover:bg-champagne/40 text-champagne rounded transition">
                                Editar
                              </button>
                            )}
                            {tx.is_split && (
                              <button onClick={() => handleUnsplit(tx.id)}
                                title="Fusionar splits y volver a pendiente"
                                className="px-2 py-1 text-xs bg-blue-900/30 hover:bg-blue-900/60 text-blue-300 rounded transition">
                                Fusionar
                              </button>
                            )}
                            <button onClick={() => handleDelete(tx.id)}
                              className="px-2 py-1 text-xs text-red-500 hover:text-red-300 transition border border-red-900/50 hover:border-red-700 rounded">
                              ✕
                            </button>
                          </div>
                        </td>
                      </tr>

                      {/* Split children (expandable) */}
                      {tx.is_split && isOpen && tx.splits && (
                        <tr key={`${tx.id}-splits`}>
                          <td colSpan={8} className="px-2 py-1">
                            <SplitChildren
                              splits={tx.splits}
                              catalogues={catalogues}
                              onEdit={(child) => setEditModal(child)}
                            />
                          </td>
                        </tr>
                      )}
                    </>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {data.pages > 1 && (
            <div className="flex items-center justify-between mt-4 text-sm">
              <p className="text-navy-400">
                Página {data.page} / {data.pages} — {data.total} movimientos
              </p>
              <div className="flex gap-2">
                <button disabled={data.page <= 1}
                  onClick={() => goToPage(data.page - 1)}
                  className="px-3 py-1.5 border border-navy-600 rounded-lg text-navy-300 hover:text-white disabled:opacity-40 transition">
                  ← Anterior
                </button>
                <button disabled={data.page >= data.pages}
                  onClick={() => goToPage(data.page + 1)}
                  className="px-3 py-1.5 border border-navy-600 rounded-lg text-navy-300 hover:text-white disabled:opacity-40 transition">
                  Siguiente →
                </button>
              </div>
            </div>
          )}
        </>
      )}

      {/* Edit modal */}
      {editModal && catalogues && (
        <EditModal
          tx={editModal}
          catalogues={catalogues}
          onClose={() => setEditModal(null)}
          onSaved={() => { setEditModal(null); load(filters); refreshBadge(); refreshCatalogues(); }}
        />
      )}
    </div>
  );
}
