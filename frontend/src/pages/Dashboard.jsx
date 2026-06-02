import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import useAuthStore from "../store/authStore";
import authApi from "../api/auth";

export default function Dashboard() {
  const { user, setUser, clearAuth } = useAuthStore();
  const navigate = useNavigate();

  // Cargar datos del usuario si el store no los tiene aún
  useEffect(() => {
    if (!user) {
      authApi.me()
        .then((res) => setUser(res.data.data.user))
        .catch(() => {
          clearAuth();
          navigate("/login");
        });
    }
  }, [user, setUser, clearAuth, navigate]);

  const handleLogout = async () => {
    try { await authApi.logout(); } catch (_) {}
    clearAuth();
    navigate("/login");
  };

  return (
    <div className="min-h-screen bg-navy-950 text-white">

      {/* Topbar */}
      <header className="bg-navy-800 border-b border-navy-700 px-6 py-4 flex items-center justify-between">
        <span className="text-champagne font-bold tracking-widest text-lg">VESTRA</span>
        <div className="flex items-center gap-4">
          <span className="text-navy-300 text-sm">{user?.name || "…"}</span>
          <button
            onClick={handleLogout}
            className="text-sm text-navy-400 hover:text-white transition border border-navy-600
                       hover:border-navy-400 rounded-lg px-3 py-1.5"
          >
            Salir
          </button>
        </div>
      </header>

      {/* Content placeholder */}
      <main className="max-w-5xl mx-auto px-6 py-12">
        <h2 className="text-2xl font-semibold mb-2">
          Bienvenido{user ? `, ${user.name}` : ""}
        </h2>
        <p className="text-navy-400 text-sm mb-10">
          Vestra v1 — Dashboard en construcción. Auth funcionando ✓
        </p>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {["Finanzas", "Inversiones", "Gastos", "Vehículos"].map((m) => (
            <div
              key={m}
              className="bg-navy-800 border border-navy-700 rounded-xl p-6 flex flex-col
                         items-center justify-center gap-2 opacity-50 cursor-not-allowed"
            >
              <span className="text-champagne text-2xl">—</span>
              <span className="text-navy-300 text-sm font-medium">{m}</span>
              <span className="text-navy-500 text-xs">Próximamente</span>
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}
