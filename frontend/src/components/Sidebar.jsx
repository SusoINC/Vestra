import { NavLink } from "react-router-dom";
import useFinanceStore from "../store/financeStore";

const navItem = "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors";
const active = "bg-navy-700 text-white font-medium";
const inactive = "text-navy-400 hover:text-white hover:bg-navy-800";
const sectionCls = "text-navy-500 text-xs font-semibold uppercase tracking-widest px-3 pb-1 pt-4";

// Contenido de navegación (logo + enlaces). Se usa en el sidebar de escritorio
// y en el drawer deslizante del móvil. onNavigate cierra el drawer al pulsar.
export function SidebarNav({ onNavigate }) {
  const pendingCount = useFinanceStore((s) => s.pendingCount);
  const link = ({ isActive }) => `${navItem} ${isActive ? active : inactive}`;
  const close = () => onNavigate && onNavigate();

  return (
    <>
      <div className="px-5 py-5 border-b border-navy-700 flex items-center justify-between">
        <span className="text-champagne font-bold tracking-widest text-base">VESTRA</span>
      </div>

      <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto momentum-scroll">
        <NavLink to="/dashboard" onClick={close} className={link}><span>🏠</span> Inicio</NavLink>

        <div className="border-t border-navy-700/50 my-2" />
        <p className={sectionCls}>Finanzas</p>

        <NavLink to="/accounts" onClick={close} className={link}><span>🏦</span> Cuentas</NavLink>
        <NavLink to="/transactions" onClick={close} className={link}><span>📋</span> Transacciones</NavLink>
        <NavLink to="/pending" onClick={close} className={({ isActive }) => `${link({ isActive })} justify-between`}>
          <span className="flex items-center gap-3"><span>⏳</span> Por categorizar</span>
          {pendingCount > 0 && (
            <span className="bg-gold-500 text-white text-xs font-bold rounded-full px-1.5 py-0.5 min-w-[1.2rem] text-center">
              {pendingCount}
            </span>
          )}
        </NavLink>
        <NavLink to="/edit-transactions" onClick={close} className={link}><span>✏️</span> Editar movimientos</NavLink>
        <NavLink to="/budgets" onClick={close} className={link}><span>📊</span> Presupuestos</NavLink>
        <NavLink to="/import" onClick={close} className={link}><span>📥</span> Importar</NavLink>

        <p className={sectionCls}>Inversiones</p>
        <NavLink to="/investments" end onClick={close} className={link}><span>💼</span> Cartera</NavLink>
        <NavLink to="/investments/new" onClick={close} className={link}><span>➕</span> Registrar</NavLink>
        <NavLink to="/symbol-analysis" onClick={close} className={link}><span>🔎</span> Análisis símbolos</NavLink>

        <p className={sectionCls}>Vehículos</p>
        <NavLink to="/vehicles" onClick={close} className={link}><span>🚗</span> Garaje</NavLink>

        <p className={sectionCls}>Próximamente</p>
        <div className={`${navItem} text-navy-600 cursor-not-allowed`}><span>🔧 Proyectos</span></div>
      </nav>
    </>
  );
}

// Sidebar fijo de escritorio
export default function Sidebar() {
  return (
    <aside className="hidden lg:flex w-56 shrink-0 bg-navy-900 border-r border-navy-700 flex-col h-screen sticky top-0">
      <SidebarNav />
    </aside>
  );
}
