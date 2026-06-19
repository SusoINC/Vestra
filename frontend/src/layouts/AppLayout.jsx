import { useEffect, useState } from "react";
import { Outlet, useNavigate, useLocation } from "react-router-dom";
import useAuthStore from "../store/authStore";
import useThemeStore from "../store/themeStore";
import useFinanceStore from "../store/financeStore";
import authApi from "../api/auth";
import financeApi from "../api/finance";
import Sidebar, { SidebarNav } from "../components/Sidebar";
import BottomNav from "../components/BottomNav";

const THEME_OPTIONS = [
  ["light", "☀️", "Claro"],
  ["dark", "🌙", "Oscuro"],
  ["system", "🖥️", "Sistema"],
];

function ThemeToggle({ compact }) {
  const { mode, setMode } = useThemeStore();
  return (
    <div className="flex gap-0.5 bg-navy-800 rounded-lg p-0.5 border border-navy-700">
      {THEME_OPTIONS.map(([v, icon, title]) => (
        <button key={v} onClick={() => setMode(v)} title={title} aria-label={title}
          className={`rounded text-sm transition ${compact ? "px-1.5 py-1" : "px-2 py-1"} ${mode === v
            ? "bg-navy-600 text-white" : "text-navy-400 hover:text-white"}`}>
          {icon}
        </button>
      ))}
    </div>
  );
}

export default function AppLayout() {
  const { user, clearAuth } = useAuthStore();
  const setPendingCount = useFinanceStore((s) => s.setPendingCount);
  const navigate = useNavigate();
  const location = useLocation();
  const [drawer, setDrawer] = useState(false);

  // Contador "por categorizar" (una vez, compartido por sidebar y drawer)
  useEffect(() => {
    financeApi.getPending()
      .then((r) => setPendingCount(r.data.meta?.total ?? 0))
      .catch(() => {});
  }, [setPendingCount]);

  // Cierra el drawer al navegar
  useEffect(() => { setDrawer(false); }, [location.pathname]);

  const handleLogout = async () => {
    try { await authApi.logout(); } catch (_) {}
    clearAuth();
    navigate("/login");
  };

  return (
    <div className="flex min-h-screen bg-navy-950 text-white">
      {/* Sidebar fijo (escritorio) */}
      <Sidebar />

      {/* Drawer móvil + backdrop */}
      <div className={`lg:hidden fixed inset-0 z-50 transition-opacity duration-200 ${
        drawer ? "opacity-100" : "opacity-0 pointer-events-none"}`}>
        <div className="absolute inset-0 bg-black/60" onClick={() => setDrawer(false)} />
        <aside className={`absolute left-0 top-0 h-full w-72 max-w-[80%] bg-navy-900 border-r border-navy-700
          flex flex-col pt-safe shadow-2xl transition-transform duration-300 ease-out ${
          drawer ? "translate-x-0" : "-translate-x-full"}`}>
          <SidebarNav onNavigate={() => setDrawer(false)} />
          <div className="border-t border-navy-700 px-4 py-3 pb-safe flex items-center justify-between">
            <span className="text-navy-300 text-sm truncate">{user?.name}</span>
            <button onClick={handleLogout}
              className="text-xs text-navy-400 hover:text-white border border-navy-600 rounded-lg px-3 py-1.5">
              Salir
            </button>
          </div>
        </aside>
      </div>

      <div className="flex-1 flex flex-col min-w-0">
        {/* Topbar escritorio */}
        <header className="hidden lg:flex h-14 border-b border-navy-700 bg-navy-900 items-center justify-end px-6 gap-4 shrink-0">
          <ThemeToggle />
          <span className="text-navy-300 text-sm">{user?.name}</span>
          <button onClick={handleLogout}
            className="text-xs text-navy-400 hover:text-white border border-navy-600 hover:border-navy-400 rounded-lg px-3 py-1.5 transition">
            Salir
          </button>
        </header>

        {/* Topbar móvil (sticky, bajo el notch) */}
        <header className="lg:hidden sticky top-0 z-30 bg-navy-900/95 backdrop-blur border-b border-navy-700 pt-safe">
          <div className="h-14 flex items-center justify-between px-3">
            <button onClick={() => setDrawer(true)} aria-label="Menú"
              className="w-10 h-10 flex items-center justify-center rounded-lg text-navy-200 hover:bg-navy-800 active:bg-navy-700 text-xl">
              ☰
            </button>
            <span className="text-champagne font-bold tracking-widest">VESTRA</span>
            <div className="flex items-center gap-1">
              <ThemeToggle compact />
            </div>
          </div>
        </header>

        {/* Contenido */}
        <main className="flex-1 overflow-y-auto momentum-scroll p-4 lg:p-6 pb-24 lg:pb-6">
          <Outlet />
        </main>
      </div>

      {/* Barra inferior (móvil) */}
      <BottomNav />
    </div>
  );
}
