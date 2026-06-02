import { Outlet, useNavigate } from "react-router-dom";
import useAuthStore from "../store/authStore";
import authApi from "../api/auth";
import Sidebar from "../components/Sidebar";

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
