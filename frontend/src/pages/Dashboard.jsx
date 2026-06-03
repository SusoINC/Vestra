import useAuthStore from "../store/authStore";

export default function Dashboard() {
  const user = useAuthStore((s) => s.user);

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-2xl font-semibold">
          Bienvenido{user ? `, ${user.name}` : ""}
        </h1>
        <p className="text-navy-400 text-sm mt-1">
          Vestra v1 — Dashboard en construcción
        </p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {["Finanzas", "Inversiones", "Gastos", "Vehículos"].map((m) => (
          <div
            key={m}
            className="bg-navy-800 border border-navy-700 rounded-xl p-6 flex flex-col
                       items-center justify-center gap-2 opacity-40 cursor-not-allowed"
          >
            <span className="text-champagne text-2xl">—</span>
            <span className="text-navy-300 text-sm font-medium">{m}</span>
            <span className="text-navy-500 text-xs">Próximamente</span>
          </div>
        ))}
      </div>
    </div>
  );
}
