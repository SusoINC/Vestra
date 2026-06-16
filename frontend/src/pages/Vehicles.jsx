import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import vehicleApi from "../api/vehicle";
import { fmtEUR } from "../utils/format";

const FUEL_TYPES = [
  ["diesel", "Diésel"], ["gasoline", "Gasolina"],
  ["hybrid", "Híbrido"], ["electric", "Eléctrico"],
];
const num = (n, d = 2) =>
  n == null ? "—" : Number(n).toLocaleString("es-ES", { minimumFractionDigits: d, maximumFractionDigits: d });

const emptyForm = { nickname: "", make: "", model: "", year: "", plate: "", fuel_type: "diesel" };

export default function Vehicles() {
  const [vehicles, setVehicles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const navigate = useNavigate();

  const load = async () => {
    setLoading(true);
    try {
      const r = await vehicleApi.list();
      setVehicles(r.data.data);
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { load(); }, []);

  const save = async () => {
    if (!form.nickname) return;
    setSaving(true);
    try {
      await vehicleApi.create({ ...form, year: form.year ? Number(form.year) : null });
      setForm(emptyForm);
      setShowForm(false);
      load();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
        <div>
          <h1 className="text-2xl font-semibold">Vehículos</h1>
          <p className="text-navy-400 text-sm mt-0.5">Repostajes, consumo y mantenimiento</p>
        </div>
        <button onClick={() => setShowForm((s) => !s)}
          className="bg-champagne text-[#0a1020] font-semibold rounded-lg px-4 py-2 text-sm hover:bg-gold-400 transition">
          {showForm ? "Cancelar" : "➕ Añadir vehículo"}
        </button>
      </div>

      {showForm && (
        <div className="bg-navy-800 border border-navy-700 rounded-xl p-5 mb-5">
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            <Field label="Nombre *"><input value={form.nickname} onChange={(e) => setForm({ ...form, nickname: e.target.value })}
              placeholder="BMW 320d" className="inp" /></Field>
            <Field label="Marca"><input value={form.make} onChange={(e) => setForm({ ...form, make: e.target.value })} className="inp" /></Field>
            <Field label="Modelo"><input value={form.model} onChange={(e) => setForm({ ...form, model: e.target.value })} className="inp" /></Field>
            <Field label="Matrícula"><input value={form.plate} onChange={(e) => setForm({ ...form, plate: e.target.value })} className="inp" /></Field>
            <Field label="Año"><input type="number" value={form.year} onChange={(e) => setForm({ ...form, year: e.target.value })} className="inp" /></Field>
            <Field label="Combustible">
              <select value={form.fuel_type} onChange={(e) => setForm({ ...form, fuel_type: e.target.value })} className="inp">
                {FUEL_TYPES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </Field>
          </div>
          <div className="mt-3 flex justify-end">
            <button onClick={save} disabled={saving || !form.nickname}
              className="bg-champagne text-[#0a1020] font-semibold rounded-lg px-5 py-2 text-sm hover:bg-gold-400 transition disabled:opacity-40">
              {saving ? "Guardando…" : "Guardar"}
            </button>
          </div>
        </div>
      )}

      {loading ? (
        <p className="text-navy-400">Cargando…</p>
      ) : vehicles.length === 0 ? (
        <div className="text-center py-16 text-navy-500">
          <p className="text-4xl mb-3">🚗</p>
          <p>Aún no tienes vehículos. Añade uno para empezar.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {vehicles.map((v) => (
            <button key={v.id} onClick={() => navigate(`/vehicles/${v.id}`)}
              className="text-left bg-navy-800 border border-navy-700 rounded-xl p-5 hover:border-champagne transition">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-white text-lg font-semibold">{v.nickname}</p>
                  <p className="text-navy-500 text-xs font-mono">{v.plate || "—"}</p>
                </div>
                <span className="text-2xl">🚗</span>
              </div>
              <div className="grid grid-cols-2 gap-3 mt-4 text-sm">
                <Kpi label="Consumo medio" value={v.avg_l100 != null ? `${num(v.avg_l100)} l/100` : "—"} />
                <Kpi label="Km" value={v.current_km != null ? `${v.current_km.toLocaleString("es-ES")} km` : "—"} />
                <Kpi label="Gasto combustible" value={fmtEUR(v.total_cost)} />
                <Kpi label="Repostajes" value={v.fills} />
              </div>
              {v.last_refuel && (
                <p className="text-navy-500 text-xs mt-3">Último repostaje: {v.last_refuel}</p>
              )}
            </button>
          ))}
        </div>
      )}

      <style>{`.inp{width:100%;background:rgb(var(--navy-900));border:1px solid rgb(var(--navy-600));border-radius:.5rem;padding:.5rem .65rem;font-size:.875rem;color:rgb(var(--c-white))}`}</style>
    </div>
  );
}

function Field({ label, children }) {
  return (
    <label className="block">
      <span className="text-navy-400 text-xs block mb-1">{label}</span>
      {children}
    </label>
  );
}
function Kpi({ label, value }) {
  return (
    <div>
      <p className="text-navy-500 text-xs">{label}</p>
      <p className="text-white font-medium mt-0.5">{value}</p>
    </div>
  );
}
