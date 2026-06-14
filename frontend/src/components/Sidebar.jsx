import { NavLink } from "react-router-dom";
import { useEffect } from "react";
import financeApi from "../api/finance";
import useFinanceStore from "../store/financeStore";

const navItem = "flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors";
const active = "bg-navy-700 text-white font-medium";
const inactive = "text-navy-400 hover:text-white hover:bg-navy-800";

export default function Sidebar() {
  const { pendingCount, setPendingCount } = useFinanceStore();

  // Carga inicial del contador
  useEffect(() => {
    financeApi.getPending()
      .then((r) => setPendingCount(r.data.meta?.total ?? 0))
      .catch(() => {});
  }, [setPendingCount]);

  return (
    <aside className="w-56 shrink-0 bg-navy-900 border-r border-navy-700 flex flex-col h-screen sticky top-0">
      {/* Logo */}
      <div className="px-5 py-5 border-b border-navy-700">
        <span className="text-champagne font-bold tracking-widest text-base">VESTRA</span>
      </div>

      <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
        <NavLink to="/dashboard" className={({ isActive }) => `${navItem} ${isActive ? active : inactive}`}>
          <span>🏠</span> Inicio
        </NavLink>

        <div className="border-t border-navy-700/50 my-2" />

        {/* Finanzas */}
        <p className="text-navy-500 text-xs font-semibold uppercase tracking-widest px-3 pb-1 pt-1">
          Finanzas
        </p>

        <NavLink to="/accounts" className={({ isActive }) => `${navItem} ${isActive ? active : inactive}`}>
          <span>🏦</span> Cuentas
        </NavLink>

        <NavLink to="/transactions" className={({ isActive }) => `${navItem} ${isActive ? active : inactive}`}>
          <span>📋</span> Transacciones
        </NavLink>

        <NavLink to="/pending" className={({ isActive }) => `${navItem} ${isActive ? active : inactive} justify-between`}>
          <span className="flex items-center gap-3">
            <span>⏳</span> Por categorizar
          </span>
          {pendingCount > 0 && (
            <span className="bg-gold-500 text-white text-xs font-bold rounded-full px-1.5 py-0.5 min-w-[1.2rem] text-center">
              {pendingCount}
            </span>
          )}
        </NavLink>

        <NavLink to="/edit-transactions" className={({ isActive }) => `${navItem} ${isActive ? active : inactive}`}>
          <span>✏️</span> Editar movimientos
        </NavLink>

        <NavLink to="/budgets" className={({ isActive }) => `${navItem} ${isActive ? active : inactive}`}>
          <span>📊</span> Presupuestos
        </NavLink>

        <NavLink to="/import" className={({ isActive }) => `${navItem} ${isActive ? active : inactive}`}>
          <span>📥</span> Importar
        </NavLink>

        {/* Inversiones */}
        <p className="text-navy-500 text-xs font-semibold uppercase tracking-widest px-3 pb-1 pt-4">
          Inversiones
        </p>
        <NavLink to="/investments" className={({ isActive }) => `${navItem} ${isActive ? active : inactive}`}>
          <span>💼</span> Cartera
        </NavLink>

        <NavLink to="/symbol-analysis" className={({ isActive }) => `${navItem} ${isActive ? active : inactive}`}>
          <span>🔎</span> Análisis símbolos
        </NavLink>

        {/* Coming soon */}
        <p className="text-navy-500 text-xs font-semibold uppercase tracking-widest px-3 pb-1 pt-4">
          Próximamente
        </p>
        {["🚗 Vehículos", "🔧 Proyectos"].map((label) => (
          <div key={label} className={`${navItem} text-navy-600 cursor-not-allowed`}>
            <span>{label}</span>
          </div>
        ))}
      </nav>
    </aside>
  );
}
