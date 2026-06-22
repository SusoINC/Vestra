import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import loanApi from "../api/loan";
import { fmtEUR } from "../utils/format";

const RATE_KINDS = [["fixed", "Fijo"], ["variable", "Variable"], ["mixed", "Mixto"]];
const empty = {
  name: "", kind: "loan", lender: "", principal: "", start_date: new Date().toISOString().slice(0, 10),
  term_months: "", payment_day: "1", rate_kind: "fixed", tin_fixed: "", mixed_fixed_months: "",
  spread: "", revision_months: "12", opening_fee: "", early_fee_pct: "",
};

export default function Loans() {
  const [loans, setLoans] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(empty);
  const [saving, setSaving] = useState(false);
  const navigate = useNavigate();

  const load = async () => {
    setLoading(true);
    try { setLoans((await loanApi.list()).data.data); } finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const save = async () => {
    if (!form.name || !form.principal || !form.term_months) return;
    setSaving(true);
    try {
      await loanApi.create({
        ...form,
        principal: Number(form.principal), term_months: Number(form.term_months),
        payment_day: Number(form.payment_day), revision_months: Number(form.revision_months),
        mixed_fixed_months: form.mixed_fixed_months ? Number(form.mixed_fixed_months) : null,
      });
      setForm(empty); setShowForm(false); load();
    } finally { setSaving(false); }
  };

  const isVar = form.rate_kind === "variable" || form.rate_kind === "mixed";

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
        <div>
          <h1 className="text-2xl font-semibold">Préstamos e hipotecas</h1>
          <p className="text-navy-400 text-sm mt-0.5">Condiciones, amortización e intereses</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => navigate("/loans/euribor")}
            className="border border-navy-600 text-navy-200 hover:text-white hover:border-navy-400 rounded-lg px-4 py-2 text-sm transition whitespace-nowrap">
            📈 Histórico Euríbor
          </button>
          <button onClick={() => setShowForm((s) => !s)}
            className="bg-champagne text-[#0a1020] font-semibold rounded-lg px-4 py-2 text-sm hover:bg-gold-400 transition">
            {showForm ? "Cancelar" : "➕ Nuevo préstamo"}
          </button>
        </div>
      </div>

      {showForm && (
        <div className="bg-navy-800 border border-navy-700 rounded-xl p-5 mb-5">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <F label="Nombre *"><input value={form.name} onChange={(e) => set("name", e.target.value)} className="inp" placeholder="Hipoteca casa" /></F>
            <F label="Tipo">
              <select value={form.kind} onChange={(e) => set("kind", e.target.value)} className="inp">
                <option value="loan">Préstamo</option><option value="mortgage">Hipoteca</option>
              </select>
            </F>
            <F label="Entidad"><input value={form.lender} onChange={(e) => set("lender", e.target.value)} className="inp" /></F>
            <F label="Capital (€) *"><input type="number" value={form.principal} onChange={(e) => set("principal", e.target.value)} className="inp text-right" /></F>
            <F label="Inicio"><input type="date" value={form.start_date} onChange={(e) => set("start_date", e.target.value)} className="inp" /></F>
            <F label="Plazo (meses) *"><input type="number" value={form.term_months} onChange={(e) => set("term_months", e.target.value)} className="inp text-right" /></F>
            <F label="Día de pago"><input type="number" min="1" max="31" value={form.payment_day} onChange={(e) => set("payment_day", e.target.value)} className="inp text-right" /></F>
            <F label="Interés">
              <select value={form.rate_kind} onChange={(e) => set("rate_kind", e.target.value)} className="inp">
                {RATE_KINDS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </F>
            {(form.rate_kind === "fixed" || form.rate_kind === "mixed") && (
              <F label="TIN fijo (%)"><input type="number" step="0.001" value={form.tin_fixed} onChange={(e) => set("tin_fixed", e.target.value)} className="inp text-right" /></F>
            )}
            {form.rate_kind === "mixed" && (
              <F label="Meses tramo fijo"><input type="number" value={form.mixed_fixed_months} onChange={(e) => set("mixed_fixed_months", e.target.value)} className="inp text-right" placeholder="60" /></F>
            )}
            {isVar && (
              <F label="Diferencial s/ Euríbor (%)"><input type="number" step="0.001" value={form.spread} onChange={(e) => set("spread", e.target.value)} className="inp text-right" placeholder="0.60" /></F>
            )}
            {isVar && (
              <F label="Revisión (meses)">
                <select value={form.revision_months} onChange={(e) => set("revision_months", e.target.value)} className="inp">
                  <option value="6">6</option><option value="12">12</option>
                </select>
              </F>
            )}
            <F label="Comisión apertura (€)"><input type="number" step="0.01" value={form.opening_fee} onChange={(e) => set("opening_fee", e.target.value)} className="inp text-right" /></F>
            <F label="Comisión amortización (%)"><input type="number" step="0.01" value={form.early_fee_pct} onChange={(e) => set("early_fee_pct", e.target.value)} className="inp text-right" /></F>
          </div>
          <div className="mt-3 flex justify-end">
            <button onClick={save} disabled={saving || !form.name || !form.principal || !form.term_months}
              className="bg-champagne text-[#0a1020] font-semibold rounded-lg px-5 py-2 text-sm hover:bg-gold-400 transition disabled:opacity-40">
              {saving ? "Guardando…" : "Guardar"}
            </button>
          </div>
        </div>
      )}

      {loading ? (
        <p className="text-navy-400">Cargando…</p>
      ) : loans.length === 0 ? (
        <div className="text-center py-16 text-navy-500">
          <p className="text-4xl mb-3">🏦</p>
          <p>Sin préstamos. Añade uno para ver su cuadro de amortización.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {loans.map((l) => (
            <button key={l.id} onClick={() => navigate(`/loans/${l.id}`)}
              className="text-left bg-navy-800 border border-navy-700 rounded-xl p-5 hover:border-champagne transition">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-white text-lg font-semibold">{l.name}</p>
                  <p className="text-navy-500 text-xs">{l.lender || "—"} · {l.rate_kind === "fixed" ? "Fijo" : l.rate_kind === "variable" ? "Variable" : "Mixto"}</p>
                </div>
                <span className="text-2xl">{l.kind === "mortgage" ? "🏠" : "🏦"}</span>
              </div>
              <div className="mt-3">
                <div className="flex justify-between text-xs text-navy-400 mb-1">
                  <span>Pendiente {fmtEUR(l.pending)}</span><span>{l.pct_amortized}%</span>
                </div>
                <div className="h-2 bg-navy-900 rounded-full overflow-hidden">
                  <div className="h-full bg-champagne rounded-full" style={{ width: `${l.pct_amortized}%` }} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2 mt-3 text-sm">
                <Kpi label="Cuota" value={fmtEUR(l.monthly_payment)} />
                <Kpi label="Capital" value={fmtEUR(l.principal)} />
                <Kpi label="Intereses tot." value={fmtEUR(l.interest_total)} />
                <Kpi label="Fin" value={l.end_date ? l.end_date.slice(0, 7) : "—"} />
              </div>
            </button>
          ))}
        </div>
      )}

      <style>{`.inp{width:100%;background:rgb(var(--navy-900));border:1px solid rgb(var(--navy-600));border-radius:.5rem;padding:.5rem .65rem;font-size:.875rem;color:rgb(var(--c-white))}`}</style>
    </div>
  );
}

function F({ label, children }) {
  return <label className="block"><span className="text-navy-400 text-xs block mb-1">{label}</span>{children}</label>;
}
function Kpi({ label, value }) {
  return <div><p className="text-navy-500 text-xs">{label}</p><p className="text-white font-medium mt-0.5">{value}</p></div>;
}
