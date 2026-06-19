import { NavLink } from "react-router-dom";

// Barra de pestañas inferior estilo iOS (solo móvil). Accesos principales.
const TABS = [
  { to: "/dashboard", icon: "🏠", label: "Inicio", end: false },
  { to: "/transactions", icon: "📋", label: "Movim.", end: false },
  { to: "/budgets", icon: "📊", label: "Ppto", end: false },
  { to: "/investments", icon: "💼", label: "Cartera", end: true },
  { to: "/vehicles", icon: "🚗", label: "Garaje", end: false },
];

export default function BottomNav() {
  return (
    <nav className="lg:hidden fixed inset-x-0 bottom-0 z-40 bg-navy-900/95 backdrop-blur border-t border-navy-700 pb-safe">
      <div className="flex">
        {TABS.map((t) => (
          <NavLink key={t.to} to={t.to} end={t.end}
            className={({ isActive }) =>
              `flex-1 flex flex-col items-center justify-center gap-0.5 py-2 text-[10px] font-medium transition-colors ${
                isActive ? "text-champagne" : "text-navy-400"}`}>
            <span className="text-xl leading-none">{t.icon}</span>
            <span>{t.label}</span>
          </NavLink>
        ))}
      </div>
    </nav>
  );
}
