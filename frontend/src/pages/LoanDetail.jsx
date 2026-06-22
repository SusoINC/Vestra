import { useEffect, useState, useCallback, useMemo } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import {
  ResponsiveContainer, ComposedChart, Bar, Line, Area, AreaChart,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend,
} from "recharts";
import loanApi from "../api/loan";
import { fmtEUR } from "../utils/format";

const RATE_LABEL = { fixed: "Fijo", variable: "Variable", mixed: "Mixto" };
const SCENARIOS = [["0", "Euríbor actual"], ["0.5", "+0,5%"], ["-0.5", "−0,5%"]];

function TT({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-navy-950 border border-navy-600 rounded-lg px-3 py-2 text-xs shadow-xl">
      <p className="text-navy-300 mb-1">{label}</p>
      {payload.map((p, i) => (
        <p key={i} style={{ color: p.color || p.fill }}>{p.name}: <span className="font-semibold">{fmtEUR(p.value)}</span></p>
      ))}
    </div>
  );
}

// Tooltip de la composición de la letra (cuota = interés + capital)
function CuotaTT({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  const r = payload[0].payload;
  return (
    <div className="bg-navy-950 border border-navy-600 rounded-lg px-3 py-2 text-xs shadow-xl space-y-0.5">
      <p className="text-navy-300">{label}</p>
      <p className="text-white font-semibold">Letra: {fmtEUR(r.payment)} <span className="text-navy-400 font-normal">· {r.rate}%</span></p>
      <p style={{ color: "#ef4444" }}>Interés: {fmtEUR(r.interest)}</p>
      <p style={{ color: "#22c55e" }}>Capital: {fmtEUR(r.principal)}</p>
    </div>
  );
}

export default function LoanDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [scenario, setScenario] = useState("0");
  const [loading, setLoading] = useState(true);
  const [showTable, setShowTable] = useState(false);

  // Simulador
  const [amount, setAmount] = useState("");
  const [mode, setMode] = useState("plazo");
  const [ret, setRet] = useState("5");
  const [sim, setSim] = useState(null);
  const [simBusy, setSimBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try { setData((await loanApi.get(id, { scenario })).data.data); } finally { setLoading(false); }
  }, [id, scenario]);
  useEffect(() => { load(); }, [load]);

  const runSim = async () => {
    if (!amount) return;
    setSimBusy(true);
    try {
      setSim((await loanApi.simulate(id, { amount: Number(amount), mode, return: Number(ret) || 0 })).data.data);
    } finally { setSimBusy(false); }
  };
  const removeLoan = async () => {
    if (!window.confirm("¿Eliminar este préstamo?")) return;
    await loanApi.remove(id); navigate("/loans");
  };

  // Agregado anual: capital vs intereses + saldo a fin de año
  const yearly = useMemo(() => {
    if (!data) return [];
    const by = {};
    data.schedule.forEach((r) => {
      const y = r.year;
      (by[y] ||= { year: y, interest: 0, principal: 0, balance: 0 });
      by[y].interest += r.interest;
      by[y].principal += r.principal + r.extra;
      by[y].balance = r.balance;
    });
    return Object.values(by).map((x) => ({
      ...x, interest: Math.round(x.interest), principal: Math.round(x.principal),
    }));
  }, [data]);

  // Composición de la letra mes a mes (interés + capital)
  const monthly = useMemo(() => !data ? [] : data.schedule.map((r) => ({
    date: r.date.slice(0, 7), payment: r.payment, interest: r.interest,
    principal: Math.round((r.principal + r.extra) * 100) / 100, rate: r.rate,
  })), [data]);

  if (loading || !data) return <p className="text-navy-400">Cargando…</p>;
  const { loan, summary, euribor } = data;
  const isVar = loan.rate_kind !== "fixed";

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
        <div>
          <Link to="/loans" className="text-navy-400 hover:text-white text-sm">← Préstamos</Link>
          <h1 className="text-2xl font-semibold mt-1">{loan.kind === "mortgage" ? "🏠" : "🏦"} {loan.name}</h1>
          <p className="text-navy-500 text-sm">
            {[loan.lender, RATE_LABEL[loan.rate_kind], `${fmtEUR(loan.principal)} · ${loan.term_months} meses`].filter(Boolean).join(" · ")}
            {loan.rate_kind === "mixed" && ` · ${loan.mixed_fixed_months}m al ${loan.tin_fixed}% luego Eur+${loan.spread}`}
            {loan.rate_kind === "variable" && ` · Eur+${loan.spread}`}
            {loan.rate_kind === "fixed" && ` · ${loan.tin_fixed}%`}
          </p>
        </div>
        <button onClick={removeLoan} className="text-navy-500 hover:text-red-400 text-sm border border-navy-700 rounded-lg px-3 py-1.5">Eliminar</button>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 mb-5">
        <Kpi label="Cuota actual" value={fmtEUR(summary.monthly_payment)} sub={`${summary.current_rate}%`} big />
        <Kpi label="Capital pendiente" value={fmtEUR(summary.pending)} />
        <Kpi label="Amortizado" value={`${summary.pct_amortized}%`} />
        <Kpi label="Intereses pagados" value={fmtEUR(summary.interest_paid)} />
        <Kpi label="Intereses totales" value={fmtEUR(summary.interest_total)} />
        <Kpi label="Fin" value={summary.end_date ? summary.end_date.slice(0, 7) : "—"} sub={`${summary.months_left} meses`} />
      </div>

      {isVar && (
        <div className="flex items-center gap-2 mb-4 flex-wrap">
          <span className="text-navy-400 text-xs">Escenario Euríbor (tramo variable):</span>
          <div className="flex gap-1 bg-navy-800 rounded-lg p-1 border border-navy-700">
            {SCENARIOS.map(([v, l]) => (
              <button key={v} onClick={() => setScenario(v)}
                className={`px-2.5 py-1 rounded text-xs transition ${scenario === v ? "bg-navy-600 text-white font-medium" : "text-navy-400 hover:text-white"}`}>
                {l}
              </button>
            ))}
          </div>
          <span className="text-navy-500 text-xs">Euríbor {euribor.last_month?.slice(0, 7)}: {euribor.last_rate}%</span>
        </div>
      )}

      {/* Capital vs intereses por año */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-5">
        <div className="bg-navy-800 border border-navy-700 rounded-xl p-5">
          <p className="text-navy-300 text-sm font-medium mb-3">Capital vs intereses por año</p>
          <ResponsiveContainer width="100%" height={240}>
            <ComposedChart data={yearly}>
              <CartesianGrid strokeDasharray="3 3" stroke="#21305a" vertical={false} />
              <XAxis dataKey="year" tick={{ fill: "#7f94bc", fontSize: 10 }} axisLine={false} tickLine={false} minTickGap={20} />
              <YAxis tick={{ fill: "#7f94bc", fontSize: 10 }} axisLine={false} tickLine={false} width={42}
                tickFormatter={(v) => v >= 1000 ? `${Math.round(v / 1000)}k` : v} />
              <Tooltip content={<TT />} cursor={{ fill: "#ffffff08" }} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Bar dataKey="principal" name="Capital" stackId="a" fill="#22c55e" radius={[0, 0, 0, 0]} />
              <Bar dataKey="interest" name="Intereses" stackId="a" fill="#ef4444" radius={[3, 3, 0, 0]} />
            </ComposedChart>
          </ResponsiveContainer>
        </div>

        <div className="bg-navy-800 border border-navy-700 rounded-xl p-5">
          <p className="text-navy-300 text-sm font-medium mb-3">Capital pendiente</p>
          <ResponsiveContainer width="100%" height={240}>
            <AreaChart data={yearly}>
              <defs><linearGradient id="balGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#d4af6e" stopOpacity={0.4} /><stop offset="95%" stopColor="#d4af6e" stopOpacity={0} />
              </linearGradient></defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#21305a" vertical={false} />
              <XAxis dataKey="year" tick={{ fill: "#7f94bc", fontSize: 10 }} axisLine={false} tickLine={false} minTickGap={20} />
              <YAxis tick={{ fill: "#7f94bc", fontSize: 10 }} axisLine={false} tickLine={false} width={42}
                tickFormatter={(v) => v >= 1000 ? `${Math.round(v / 1000)}k` : v} />
              <Tooltip content={<TT />} />
              <Area type="monotone" dataKey="balance" name="Pendiente" stroke="#d4af6e" strokeWidth={2} fill="url(#balGrad)" isAnimationActive={false} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Composición de la letra (mensual) */}
      <div className="bg-navy-800 border border-navy-700 rounded-xl p-5 mb-5">
        <p className="text-navy-300 text-sm font-medium mb-1">Composición de la letra (mes a mes)</p>
        <p className="text-navy-500 text-xs mb-3">La altura es la cuota; se reparte en interés (rojo) y capital (verde)</p>
        <ResponsiveContainer width="100%" height={240}>
          <AreaChart data={monthly}>
            <defs>
              <linearGradient id="intGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#ef4444" stopOpacity={0.5} /><stop offset="95%" stopColor="#ef4444" stopOpacity={0.1} />
              </linearGradient>
              <linearGradient id="capGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#22c55e" stopOpacity={0.5} /><stop offset="95%" stopColor="#22c55e" stopOpacity={0.1} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#21305a" vertical={false} />
            <XAxis dataKey="date" tick={{ fill: "#7f94bc", fontSize: 10 }} axisLine={false} tickLine={false}
              minTickGap={48} tickFormatter={(d) => d.slice(0, 4)} />
            <YAxis tick={{ fill: "#7f94bc", fontSize: 10 }} axisLine={false} tickLine={false} width={42}
              tickFormatter={(v) => v >= 1000 ? `${Math.round(v / 1000)}k` : v} />
            <Tooltip content={<CuotaTT />} />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            <Area type="monotone" dataKey="interest" name="Interés" stackId="c" stroke="#ef4444" strokeWidth={1.5} fill="url(#intGrad)" isAnimationActive={false} />
            <Area type="monotone" dataKey="principal" name="Capital" stackId="c" stroke="#22c55e" strokeWidth={1.5} fill="url(#capGrad)" isAnimationActive={false} />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      {/* Simulador de amortización anticipada */}
      <div className="bg-navy-800 border border-navy-700 rounded-xl p-5 mb-5">
        <p className="text-navy-300 text-sm font-medium mb-3">Simulador de amortización anticipada</p>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 items-end">
          <F label="Importe (€)"><input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} className="inp text-right" /></F>
          <F label="Modo">
            <select value={mode} onChange={(e) => setMode(e.target.value)} className="inp">
              <option value="plazo">Reducir plazo</option><option value="cuota">Reducir cuota</option>
            </select>
          </F>
          <F label="Rentab. inversión (%)"><input type="number" step="0.1" value={ret} onChange={(e) => setRet(e.target.value)} className="inp text-right" /></F>
          <button onClick={runSim} disabled={simBusy || !amount}
            className="bg-champagne text-[#0a1020] font-semibold rounded-lg px-4 py-2 text-sm hover:bg-gold-400 transition disabled:opacity-40">
            {simBusy ? "…" : "Simular"}
          </button>
        </div>
        {sim && (
          <div className="mt-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <Stat label="Intereses ahorrados" value={fmtEUR(sim.interest_saved)} color="text-green-400" />
              <Stat label={mode === "plazo" ? "Meses ahorrados" : "Nueva cuota"}
                value={mode === "plazo" ? `${sim.months_saved}` : fmtEUR(sim.new_payment)} color="text-white" />
              <Stat label="Comisión" value={fmtEUR(sim.early_fee)} color="text-navy-200" />
              <Stat label="Ahorro neto" value={fmtEUR(sim.net_saved)} color={sim.net_saved >= 0 ? "text-green-400" : "text-red-400"} />
            </div>
            <div className={`mt-3 rounded-lg px-4 py-3 text-sm border ${sim.worth_it
              ? "bg-green-500/10 border-green-500/40 text-green-300" : "bg-amber-500/10 border-amber-500/40 text-amber-300"}`}>
              {sim.worth_it
                ? `✅ Merece la pena amortizar: ahorras ${fmtEUR(sim.net_saved)} en intereses (neto), más que los ${fmtEUR(sim.invest_gain)} que ganarías invirtiendo ese importe al ${sim.annual_return}% durante ${sim.horizon_years} años.`
                : `🤔 Quizá compense invertir: ganarías ~${fmtEUR(sim.invest_gain)} invirtiendo al ${sim.annual_return}% (${sim.horizon_years} años) frente a ${fmtEUR(sim.net_saved)} de ahorro neto amortizando.`}
            </div>
          </div>
        )}
      </div>

      {/* Cuadro de amortización */}
      <div className="bg-navy-800 border border-navy-700 rounded-xl overflow-hidden">
        <button onClick={() => setShowTable((s) => !s)} className="w-full flex items-center justify-between px-5 py-3 text-navy-300 text-sm font-medium">
          <span>Cuadro de amortización ({data.schedule.length} cuotas)</span>
          <span>{showTable ? "▲" : "▼"}</span>
        </button>
        {showTable && (
          <div className="overflow-x-auto max-h-[28rem] overflow-y-auto momentum-scroll">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-navy-800">
                <tr className="border-y border-navy-700 text-navy-400 text-xs uppercase tracking-wide">
                  <th className="text-left px-4 py-2">#</th>
                  <th className="text-left px-3 py-2">Fecha</th>
                  <th className="text-right px-3 py-2 hidden sm:table-cell">Tipo</th>
                  <th className="text-right px-3 py-2">Cuota</th>
                  <th className="text-right px-3 py-2">Interés</th>
                  <th className="text-right px-3 py-2">Capital</th>
                  <th className="text-right px-4 py-2">Pendiente</th>
                </tr>
              </thead>
              <tbody>
                {data.schedule.map((r) => (
                  <tr key={r.n} className="border-b border-navy-700/40">
                    <td className="px-4 py-1.5 text-navy-500">{r.n}</td>
                    <td className="px-3 py-1.5 text-navy-300">{r.date.slice(0, 7)}</td>
                    <td className="px-3 py-1.5 text-right text-navy-400 hidden sm:table-cell">{r.rate}%</td>
                    <td className="px-3 py-1.5 text-right text-white">{fmtEUR(r.payment)}</td>
                    <td className="px-3 py-1.5 text-right text-red-300">{fmtEUR(r.interest)}</td>
                    <td className="px-3 py-1.5 text-right text-green-300">{fmtEUR(r.principal)}</td>
                    <td className="px-4 py-1.5 text-right text-navy-300">{fmtEUR(r.balance)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <style>{`.inp{width:100%;background:rgb(var(--navy-900));border:1px solid rgb(var(--navy-600));border-radius:.5rem;padding:.5rem .65rem;font-size:.875rem;color:rgb(var(--c-white))}`}</style>
    </div>
  );
}

function Kpi({ label, value, sub, big }) {
  return (
    <div className="bg-navy-800 border border-navy-700 rounded-xl p-4">
      <p className="text-navy-400 text-xs">{label}</p>
      <p className={`font-bold text-white mt-1 ${big ? "text-2xl" : "text-xl"}`}>{value}</p>
      {sub && <p className="text-navy-500 text-xs mt-0.5">{sub}</p>}
    </div>
  );
}
function Stat({ label, value, color }) {
  return <div className="bg-navy-900 rounded-lg p-3"><p className="text-navy-500 text-xs">{label}</p><p className={`font-bold mt-0.5 ${color}`}>{value}</p></div>;
}
function F({ label, children }) {
  return <label className="block"><span className="text-navy-500 text-xs block mb-1">{label}</span>{children}</label>;
}
