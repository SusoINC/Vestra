import { useEffect, useState, useCallback } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import {
  ResponsiveContainer, AreaChart, Area, BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip,
} from "recharts";
import vehicleApi from "../api/vehicle";
import { fmtEUR } from "../utils/format";

const num = (n, d = 2) =>
  n == null ? "—" : Number(n).toLocaleString("es-ES", { minimumFractionDigits: d, maximumFractionDigits: d });
const today = () => new Date().toISOString().slice(0, 10);
const blankFuel = () => ({ log_date: today(), station: "", liters: "", total_cost: "", odometer_km: "" });

export default function VehicleDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [stats, setStats] = useState(null);
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState(blankFuel());
  const [saving, setSaving] = useState(false);
  const [editId, setEditId] = useState(null);
  const [editForm, setEditForm] = useState(null);
  const [editVeh, setEditVeh] = useState(null);

  const FUEL_TYPES = [
    ["diesel", "Diésel"], ["gasoline", "Gasolina"], ["hybrid", "Híbrido"], ["electric", "Eléctrico"],
  ];

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [sRes, fRes] = await Promise.all([vehicleApi.get(id), vehicleApi.listFuel(id)]);
      setStats(sRes.data.data);
      setLogs(fRes.data.data);
    } finally {
      setLoading(false);
    }
  }, [id]);
  useEffect(() => { load(); }, [load]);

  const addFuel = async () => {
    if (!form.log_date || !form.total_cost) return;
    setSaving(true);
    try {
      await vehicleApi.createFuel(id, {
        log_date: form.log_date, station: form.station || null,
        liters: form.liters ? Number(form.liters) : null,
        total_cost: Number(form.total_cost),
        odometer_km: form.odometer_km ? Number(form.odometer_km) : null,
      });
      setForm(blankFuel());
      load();
    } finally {
      setSaving(false);
    }
  };

  const startEdit = (l) => {
    setEditId(l.id);
    setEditForm({
      log_date: l.log_date, station: l.station || "",
      liters: l.liters ?? "", total_cost: l.total_cost ?? "", odometer_km: l.odometer_km ?? "",
    });
  };
  const saveEdit = async (logId) => {
    await vehicleApi.updateFuel(logId, {
      log_date: editForm.log_date, station: editForm.station || null,
      liters: editForm.liters === "" ? null : Number(editForm.liters),
      total_cost: editForm.total_cost === "" ? null : Number(editForm.total_cost),
      odometer_km: editForm.odometer_km === "" ? null : Number(editForm.odometer_km),
    });
    setEditId(null); setEditForm(null);
    load();
  };
  const removeFuel = async (l) => {
    if (!window.confirm(`¿Eliminar el repostaje del ${l.log_date}?`)) return;
    await vehicleApi.deleteFuel(l.id);
    load();
  };
  const removeVehicle = async () => {
    if (!window.confirm("¿Eliminar este vehículo y todos sus repostajes?")) return;
    await vehicleApi.remove(id);
    navigate("/vehicles");
  };
  const openEditVeh = () => {
    const v = stats.vehicle;
    setEditVeh({
      nickname: v.nickname, make: v.make || "", model: v.model || "",
      year: v.year || "", plate: v.plate || "", fuel_type: v.fuel_type || "diesel",
    });
  };
  const saveVeh = async () => {
    await vehicleApi.update(id, { ...editVeh, year: editVeh.year ? Number(editVeh.year) : null });
    setEditVeh(null);
    load();
  };

  if (loading || !stats) return <p className="text-navy-400">Cargando…</p>;
  const v = stats.vehicle;
  const k = stats.kpis;

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
        <div>
          <Link to="/vehicles" className="text-navy-400 hover:text-white text-sm">← Vehículos</Link>
          <h1 className="text-2xl font-semibold mt-1">{v.nickname}</h1>
          <p className="text-navy-500 text-sm">
            {[v.make, v.model, v.year].filter(Boolean).join(" · ") || "—"}
            {v.plate ? <span className="font-mono ml-2">{v.plate}</span> : null}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={openEditVeh}
            className="text-navy-300 hover:text-white text-sm border border-navy-700 rounded-lg px-3 py-1.5">
            ✏️ Editar
          </button>
          <button onClick={removeVehicle}
            className="text-navy-500 hover:text-red-400 text-sm border border-navy-700 rounded-lg px-3 py-1.5">
            Eliminar
          </button>
        </div>
      </div>

      {editVeh && (
        <div className="bg-navy-800 border border-navy-700 rounded-xl p-5 mb-5">
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            <FF label="Nombre"><input value={editVeh.nickname} onChange={(e) => setEditVeh({ ...editVeh, nickname: e.target.value })} className="inp" /></FF>
            <FF label="Marca"><input value={editVeh.make} onChange={(e) => setEditVeh({ ...editVeh, make: e.target.value })} className="inp" /></FF>
            <FF label="Modelo"><input value={editVeh.model} onChange={(e) => setEditVeh({ ...editVeh, model: e.target.value })} className="inp" /></FF>
            <FF label="Matrícula"><input value={editVeh.plate} onChange={(e) => setEditVeh({ ...editVeh, plate: e.target.value })} className="inp" /></FF>
            <FF label="Año"><input type="number" value={editVeh.year} onChange={(e) => setEditVeh({ ...editVeh, year: e.target.value })} className="inp" /></FF>
            <FF label="Combustible">
              <select value={editVeh.fuel_type} onChange={(e) => setEditVeh({ ...editVeh, fuel_type: e.target.value })} className="inp">
                {FUEL_TYPES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </FF>
          </div>
          <div className="mt-3 flex justify-end gap-2">
            <button onClick={() => setEditVeh(null)} className="text-navy-400 hover:text-white text-sm px-3 py-2">Cancelar</button>
            <button onClick={saveVeh} className="bg-champagne text-[#0a1020] font-semibold rounded-lg px-5 py-2 text-sm hover:bg-gold-400 transition">Guardar</button>
          </div>
        </div>
      )}

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 mb-5">
        <Kpi label="Consumo medio" value={k.avg_l100 != null ? `${num(k.avg_l100)}` : "—"} unit="l/100" big />
        <Kpi label="Coste / 100 km" value={k.eur_100km != null ? num(k.eur_100km) : "—"} unit="€" />
        <Kpi label="Precio medio" value={k.avg_price != null ? num(k.avg_price, 3) : "—"} unit="€/l" />
        <Kpi label="Gasto total" value={fmtEUR(k.total_cost)} />
        <Kpi label="Km recorridos" value={k.total_km != null ? k.total_km.toLocaleString("es-ES") : "—"} unit="km" />
        <Kpi label="Repostajes" value={k.fills} />
      </div>

      {/* Gráficos */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-5">
        <ChartCard title="Consumo (l/100 km)">
          {stats.consumption_series.length === 0 ? <Empty /> : (
            <ResponsiveContainer width="100%" height={220}>
              <AreaChart data={stats.consumption_series}>
                <defs><linearGradient id="cons" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.35} />
                  <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                </linearGradient></defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#21305a" vertical={false} />
                <XAxis dataKey="date" tick={{ fill: "#7f94bc", fontSize: 10 }} axisLine={false} tickLine={false}
                  minTickGap={40} tickFormatter={(d) => d.slice(0, 7)} />
                <YAxis tick={{ fill: "#7f94bc", fontSize: 10 }} axisLine={false} tickLine={false} width={35} domain={["auto", "auto"]} />
                <Tooltip content={<TT unit="l/100" />} />
                <Area type="monotone" dataKey="l100" stroke="#3b82f6" strokeWidth={2} fill="url(#cons)" isAnimationActive={false} />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </ChartCard>

        <ChartCard title="Precio del combustible (€/l)">
          {stats.price_series.length === 0 ? <Empty /> : (
            <ResponsiveContainer width="100%" height={220}>
              <AreaChart data={stats.price_series}>
                <defs><linearGradient id="price" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#d4af6e" stopOpacity={0.35} />
                  <stop offset="95%" stopColor="#d4af6e" stopOpacity={0} />
                </linearGradient></defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#21305a" vertical={false} />
                <XAxis dataKey="date" tick={{ fill: "#7f94bc", fontSize: 10 }} axisLine={false} tickLine={false}
                  minTickGap={40} tickFormatter={(d) => d.slice(0, 7)} />
                <YAxis tick={{ fill: "#7f94bc", fontSize: 10 }} axisLine={false} tickLine={false} width={42} domain={["auto", "auto"]} />
                <Tooltip content={<TT unit="€/l" dec={3} />} />
                <Area type="monotone" dataKey="price" stroke="#d4af6e" strokeWidth={2} fill="url(#price)" isAnimationActive={false} />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </ChartCard>
      </div>

      <ChartCard title="Gasto mensual en combustible" className="mb-5">
        {stats.cost_series.length === 0 ? <Empty /> : (
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={stats.cost_series}>
              <CartesianGrid strokeDasharray="3 3" stroke="#21305a" vertical={false} />
              <XAxis dataKey="month" tick={{ fill: "#7f94bc", fontSize: 10 }} axisLine={false} tickLine={false} minTickGap={30} />
              <YAxis tick={{ fill: "#7f94bc", fontSize: 10 }} axisLine={false} tickLine={false} width={42}
                tickFormatter={(x) => `${Math.round(x)}`} />
              <Tooltip content={<TT unit="€" money />} />
              <Bar dataKey="cost" fill="#8b5cf6" radius={[3, 3, 0, 0]} isAnimationActive={false} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </ChartCard>

      {/* Registrar repostaje */}
      <div className="bg-navy-800 border border-navy-700 rounded-xl p-4 mb-5">
        <p className="text-navy-300 text-sm font-medium mb-3">Registrar repostaje</p>
        <div className="grid grid-cols-2 md:grid-cols-6 gap-2 items-end">
          <FF label="Fecha"><input type="date" value={form.log_date} onChange={(e) => setForm({ ...form, log_date: e.target.value })} className="inp" /></FF>
          <FF label="Estación"><input value={form.station} onChange={(e) => setForm({ ...form, station: e.target.value })} className="inp" placeholder="Repsol…" /></FF>
          <FF label="Litros"><input type="number" step="0.01" value={form.liters} onChange={(e) => setForm({ ...form, liters: e.target.value })} className="inp text-right" /></FF>
          <FF label="Importe €"><input type="number" step="0.01" value={form.total_cost} onChange={(e) => setForm({ ...form, total_cost: e.target.value })} className="inp text-right" /></FF>
          <FF label="Odómetro km"><input type="number" value={form.odometer_km} onChange={(e) => setForm({ ...form, odometer_km: e.target.value })} className="inp text-right" /></FF>
          <button onClick={addFuel} disabled={saving || !form.total_cost}
            className="bg-champagne text-[#0a1020] font-semibold rounded-lg px-4 py-2 text-sm hover:bg-gold-400 transition disabled:opacity-40">
            {saving ? "…" : "Añadir"}
          </button>
        </div>
      </div>

      {/* Histórico de repostajes */}
      <div className="bg-navy-800 border border-navy-700 rounded-xl overflow-hidden">
        <p className="text-navy-300 text-sm font-medium px-5 pt-4 pb-2">Repostajes ({logs.length})</p>
        <div className="overflow-x-auto max-h-[32rem] overflow-y-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-navy-800">
              <tr className="border-b border-navy-700 text-navy-400 text-xs uppercase tracking-wide">
                <th className="text-left px-4 py-2.5">Fecha</th>
                <th className="text-left px-3 py-2.5">Estación</th>
                <th className="text-right px-3 py-2.5">Litros</th>
                <th className="text-right px-3 py-2.5">Importe</th>
                <th className="text-right px-3 py-2.5 hidden sm:table-cell">€/l</th>
                <th className="text-right px-3 py-2.5">Odómetro</th>
                <th className="text-right px-3 py-2.5 hidden md:table-cell">km</th>
                <th className="text-right px-3 py-2.5">l/100</th>
                <th className="text-right px-3 py-2.5 w-20"></th>
              </tr>
            </thead>
            <tbody>
              {logs.map((l) => editId === l.id ? (
                <tr key={l.id} className="border-b border-navy-700/40 bg-navy-900/40">
                  <td className="px-3 py-1.5"><input type="date" value={editForm.log_date} onChange={(e) => setEditForm({ ...editForm, log_date: e.target.value })} className="inp" /></td>
                  <td className="px-3 py-1.5"><input value={editForm.station} onChange={(e) => setEditForm({ ...editForm, station: e.target.value })} className="inp" /></td>
                  <td className="px-3 py-1.5"><input type="number" step="0.01" value={editForm.liters} onChange={(e) => setEditForm({ ...editForm, liters: e.target.value })} className="inp text-right" /></td>
                  <td className="px-3 py-1.5"><input type="number" step="0.01" value={editForm.total_cost} onChange={(e) => setEditForm({ ...editForm, total_cost: e.target.value })} className="inp text-right" /></td>
                  <td className="hidden sm:table-cell" />
                  <td className="px-3 py-1.5"><input type="number" value={editForm.odometer_km} onChange={(e) => setEditForm({ ...editForm, odometer_km: e.target.value })} className="inp text-right" /></td>
                  <td className="hidden md:table-cell" /><td />
                  <td className="px-3 py-1.5 text-right whitespace-nowrap">
                    <button onClick={() => saveEdit(l.id)} className="text-green-400 hover:text-green-300 px-1.5">✓</button>
                    <button onClick={() => { setEditId(null); setEditForm(null); }} className="text-navy-400 hover:text-white px-1.5">×</button>
                  </td>
                </tr>
              ) : (
                <tr key={l.id} className="border-b border-navy-700/40 hover:bg-navy-700/20">
                  <td className="px-4 py-2 text-navy-400 whitespace-nowrap">{l.log_date}</td>
                  <td className="px-3 py-2 text-white">{l.station || "—"}</td>
                  <td className="px-3 py-2 text-right text-navy-300">{num(l.liters)}</td>
                  <td className="px-3 py-2 text-right text-white">{fmtEUR(l.total_cost)}</td>
                  <td className="px-3 py-2 text-right text-navy-400 hidden sm:table-cell">{num(l.price_per_liter, 3)}</td>
                  <td className="px-3 py-2 text-right text-navy-300">{l.odometer_km != null ? l.odometer_km.toLocaleString("es-ES") : "—"}</td>
                  <td className="px-3 py-2 text-right text-navy-500 hidden md:table-cell">{l.distance != null ? l.distance.toLocaleString("es-ES") : "—"}</td>
                  <td className="px-3 py-2 text-right text-navy-300">{l.consumption_l100 != null ? num(l.consumption_l100) : "—"}</td>
                  <td className="px-3 py-2 text-right whitespace-nowrap">
                    <button onClick={() => startEdit(l)} title="Editar" className="text-navy-400 hover:text-champagne px-1.5">✏️</button>
                    <button onClick={() => removeFuel(l)} title="Eliminar" className="text-navy-400 hover:text-red-400 px-1.5">🗑️</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <style>{`.inp{width:100%;background:rgb(var(--navy-900));border:1px solid rgb(var(--navy-600));border-radius:.4rem;padding:.4rem .55rem;font-size:.8rem;color:rgb(var(--c-white))}`}</style>
    </div>
  );
}

function Kpi({ label, value, unit, big }) {
  return (
    <div className="bg-navy-800 border border-navy-700 rounded-xl p-4">
      <p className="text-navy-400 text-xs">{label}</p>
      <p className={`font-bold text-white mt-1 ${big ? "text-2xl" : "text-xl"}`}>
        {value}{unit && value !== "—" ? <span className="text-sm text-navy-400 font-normal ml-1">{unit}</span> : null}
      </p>
    </div>
  );
}
function ChartCard({ title, children, className = "" }) {
  return (
    <div className={`bg-navy-800 border border-navy-700 rounded-xl p-5 ${className}`}>
      <p className="text-navy-300 text-sm font-medium mb-3">{title}</p>
      {children}
    </div>
  );
}
function Empty() {
  return <p className="text-navy-500 text-sm py-12 text-center">Sin datos suficientes</p>;
}
function FF({ label, children }) {
  return <label className="block"><span className="text-navy-500 text-xs block mb-1">{label}</span>{children}</label>;
}
function TT({ active, payload, label, unit, dec = 2, money }) {
  if (!active || !payload?.length) return null;
  const v = payload[0].value;
  return (
    <div className="bg-navy-950 border border-navy-600 rounded-lg px-3 py-2 text-xs shadow-xl">
      <p className="text-navy-300">{label}</p>
      <p className="text-white font-semibold">
        {money ? fmtEUR(v) : `${num(v, dec)} ${unit}`}
      </p>
    </div>
  );
}
