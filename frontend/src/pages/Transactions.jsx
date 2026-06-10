import { useEffect, useState, useCallback, useRef } from "react";
import financeApi from "../api/finance";
import { fmtEUR as fmt } from "../utils/format";
import MultiCategorySelect from "../components/MultiCategorySelect";

export default function Transactions() {
  const [data, setData] = useState({ items: [], total: 0, page: 1, pages: 1 });
  const [catalogues, setCatalogues] = useState(null);
  const [accounts, setAccounts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({
    q: "", account_id: "", type_id: "", category_id: "",
    date_from: "", date_to: "", page: 1, per_page: 50,
  });
  const debounceRef = useRef();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = Object.fromEntries(Object.entries(filters).filter(([, v]) => v !== ""));
      const [txRes, catRes, accRes] = await Promise.all([
        financeApi.getTransactions(params),
        catalogues ? Promise.resolve({ data: { data: catalogues } }) : financeApi.getCatalogues(),
        accounts.length ? Promise.resolve({ data: { data: accounts } }) : financeApi.getAccounts(),
      ]);
      setData({ items: txRes.data.data, ...txRes.data.meta });
      if (!catalogues) setCatalogues(catRes.data.data);
      if (!accounts.length) setAccounts(accRes.data.data);
    } finally {
      setLoading(false);
    }
  }, [filters]); // eslint-disable-line

  useEffect(() => { load(); }, [load]);

  const [searchInput, setSearchInput] = useState("");
  const setFilter = (key, val) => setFilters((f) => ({ ...f, [key]: val, page: 1 }));

  const handleSearch = (val) => {
    setSearchInput(val);
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => setFilter("q", val), 350);
  };

  const catMap = Object.fromEntries((catalogues?.categories || []).map((c) => [c.id, c]));
  const typeMap = Object.fromEntries((catalogues?.types || []).map((t) => [t.id, t]));
  const subcatMap = Object.fromEntries((catalogues?.subcategories || []).map((s) => [s.id, s]));
  const accMap = Object.fromEntries(accounts.map((a) => [a.id, a]));

  const selectCls =
    "bg-navy-900 border border-navy-600 text-white rounded-lg px-3 py-2 text-sm " +
    "focus:outline-none focus:border-champagne transition";

  return (
    <div>
      <div className="mb-5">
        <h1 className="text-2xl font-semibold">Transacciones</h1>
        <p className="text-navy-400 text-sm mt-0.5">
          {data.total} movimiento{data.total !== 1 ? "s" : ""} categorizados
        </p>
      </div>

      {/* Búsqueda */}
      <div className="relative mb-3 max-w-md">
        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-navy-500">🔍</span>
        <input value={searchInput} onChange={(e) => handleSearch(e.target.value)}
          placeholder="Buscar por empresa, descripción, comentario o subcategoría…"
          className="w-full bg-navy-900 border border-navy-600 text-white rounded-lg pl-9 pr-3 py-2 text-sm
                     placeholder-navy-500 focus:outline-none focus:border-champagne transition" />
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 mb-5">
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
          onChange={(e) => setFilter("date_from", e.target.value)}
          className={selectCls} />
        <input type="date" value={filters.date_to}
          onChange={(e) => setFilter("date_to", e.target.value)}
          className={selectCls} />

        {Object.values(filters).some((v) => v !== "" && v !== 1 && v !== 50) && (
          <button onClick={() => { setSearchInput(""); setFilters({ q: "", account_id: "", type_id: "", category_id: "", date_from: "", date_to: "", page: 1, per_page: 50 }); }}
            className="text-sm text-navy-400 hover:text-white transition border border-navy-700 rounded-lg px-3 py-2">
            ✕ Limpiar
          </button>
        )}
      </div>

      {loading ? (
        <p className="text-navy-400">Cargando…</p>
      ) : data.items.length === 0 ? (
        <div className="text-center py-16 text-navy-500">
          <p className="text-4xl mb-3">📋</p>
          <p>Sin transacciones categorizadas todavía.</p>
          <p className="text-sm mt-1">Importa un Excel y categoriza los movimientos.</p>
        </div>
      ) : (
        <>
          <div className="bg-navy-800 border border-navy-700 rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-navy-700 text-navy-400 text-xs uppercase tracking-wide">
                  <th className="text-left px-4 py-3">Fecha</th>
                  <th className="text-left px-4 py-3">Descripción</th>
                  <th className="text-left px-4 py-3 hidden lg:table-cell">Cuenta</th>
                  <th className="text-left px-4 py-3 hidden md:table-cell">Categoría</th>
                  <th className="text-left px-4 py-3 hidden md:table-cell">Tipo</th>
                  <th className="text-right px-4 py-3">Importe</th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((tx, i) => {
                  const cat = catMap[tx.category_id];
                  const subcat = subcatMap[tx.subcategory_id];
                  const type = typeMap[tx.type_id];
                  const acc = accMap[tx.account_id];
                  return (
                    <tr key={tx.id}
                      className={`border-b border-navy-700/50 hover:bg-navy-700/30 transition ${i % 2 === 0 ? "" : "bg-navy-900/30"}`}>
                      <td className="px-4 py-3 text-navy-400 whitespace-nowrap">{tx.op_date}</td>
                      <td className="px-4 py-3">
                        <p className="text-white line-clamp-1">{tx.company || tx.description}</p>
                        {tx.company && (
                          <p className="text-navy-500 text-xs line-clamp-1">{tx.description}</p>
                        )}
                      </td>
                      <td className="px-4 py-3 text-navy-400 hidden lg:table-cell">
                        {acc?.name || "—"}
                      </td>
                      <td className="px-4 py-3 hidden md:table-cell">
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
                      <td className="px-4 py-3 text-navy-400 text-xs hidden md:table-cell">
                        {type?.label || "—"}
                      </td>
                      <td className={`px-4 py-3 text-right font-semibold whitespace-nowrap
                        ${tx.amount >= 0 ? "text-green-400" : "text-red-400"}`}>
                        {fmt(tx.amount)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {data.pages > 1 && (
            <div className="flex items-center justify-between mt-4 text-sm">
              <p className="text-navy-400">
                Página {data.page} de {data.pages} ({data.total} total)
              </p>
              <div className="flex gap-2">
                <button disabled={data.page <= 1}
                  onClick={() => setFilters((f) => ({ ...f, page: f.page - 1 }))}
                  className="px-3 py-1.5 border border-navy-600 rounded-lg text-navy-300 hover:text-white disabled:opacity-40 transition">
                  ← Anterior
                </button>
                <button disabled={data.page >= data.pages}
                  onClick={() => setFilters((f) => ({ ...f, page: f.page + 1 }))}
                  className="px-3 py-1.5 border border-navy-600 rounded-lg text-navy-300 hover:text-white disabled:opacity-40 transition">
                  Siguiente →
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
