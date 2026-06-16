import { Outlet, useNavigate } from "react-router-dom";
import useAuthStore from "../store/authStore";
import useThemeStore from "../store/themeStore";
import authApi from "../api/auth";
import Sidebar from "../components/Sidebar";

const THEME_OPTIONS = [
  ["light", "☀️", "Claro"],
  ["dark", "🌙", "Oscuro"],
  ["system", "🖥️", "Sistema"],
];

function ThemeToggle() {
  const { mode, setMode } = useThemeStore();
  return (
    <div className="flex gap-0.5 bg-navy-800 rounded-lg p-0.5 border border-navy-700">
      {THEME_OPTIONS.map(([v, icon, title]) => (
        <button key={v} onClick={() => setMode(v)} title={title} aria-label={title}
          className={`px-2 py-1 rounded text-sm transition ${mode === v
            ? "bg-navy-600 text-white" : "text-navy-400 hover:text-white"}`}>
          {icon}
        </button>
      ))}
    </div>
  );
}

export default function AppLayout() {
  const { user, clearAuth } = useAuthStore();
  const navigate = useNavigate();

  const handleLogout = async () => {
    try { await authApi.logout(); } catch (_) {}
    clearAuth();
    navigate("/login");
  };

  return (
    <div className="flex min-h-screen bg-navy-950 text-white">
      <Sidebar />

      <div className="flex-1 flex flex-col min-w-0">
        {/* Topbar */}
        <header className="h-14 border-b border-navy-700 bg-navy-900 flex items-center justify-end px-6 gap-4 shrink-0">
          <ThemeToggle />
          <span className="text-navy-300 text-sm">{user?.name}</span>
          <button
            onClick={handleLogout}
            className="text-xs text-navy-400 hover:text-white border border-navy-600
                       hover:border-navy-400 rounded-lg px-3 py-1.5 transition"
          >
            Salir
          </button>
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-y-auto p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
