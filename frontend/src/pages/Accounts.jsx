import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import financeApi from "../api/finance";
import { fmtEUR } from "../utils/format";

const ACCOUNT_TYPES = [
  { value: "checking", label: "Cuenta corriente" },
  { value: "savings",  label: "Cuenta ahorro" },
  { value: "cash",     label: "Efectivo" },
  { value: "card",     label: "Tarjeta" },
];

function AccountModal({ account, onClose, onSaved }) {
  const { register, handleSubmit, formState: { isSubmitting } } = useForm({
    defaultValues: account || { type: "checking", country: "ES", balance: 0 },
  });

  const onSubmit = async (data) => {
    try {
      if (account) {
        await financeApi.updateAccount(account.id, data);
      } else {
        await financeApi.createAccount(data);
      }
      onSaved();
    } catch (e) {
      alert(e.response?.data?.error?.message || "Error guardando cuenta");
    }
  };

  const inputCls = "w-full bg-navy-900 border border-navy-600 text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-champagne focus:ring-1 focus:ring-champagne transition";
  const labelCls = "block text-navy-300 text-sm font-medium mb-1";

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="bg-navy-800 rounded-2xl border border-navy-700 w-full max-w-md p-6">
        <h2 className="text-white font-semibold text-lg mb-5">
          {account ? "Editar cuenta" : "Nueva cuenta"}
        </h2>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div>
            <label className={labelCls}>Nombre *</label>
            <input {...register("name", { required: true })} placeholder="ING Nómina" className={inputCls} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>Tipo</label>
              <select {...register("type")} className={inputCls}>
                {ACCOUNT_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </div>
            <div>
              <label className={labelCls}>País</label>
              <input {...register("country")} placeholder="ES" maxLength={2} className={inputCls} />
            </div>
          </div>
          <div>
            <label className={labelCls}>IBAN</label>
            <input {...register("iban")} placeholder="ES12 1234 5678 9012 3456 7890" className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>Saldo actual (€)</label>
            <input type="number" step="0.01" {...register("balance")} className={inputCls} />
          </div>
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose}
              className="flex-1 border border-navy-600 text-navy-300 hover:text-white rounded-lg py-2 text-sm transition">
              Cancelar
            </button>
            <button type="submit" disabled={isSubmitting}
              className="flex-1 bg-champagne hover:bg-champagne-light text-navy-950 font-semibold rounded-lg py-2 text-sm transition disabled:opacity-60">
              {isSubmitting ? "Guardando…" : "Guardar"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function Accounts() {
  const [accounts, setAccounts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(null); // null | "new" | account object

  const load = async () => {
    setLoading(true);
    try {
      const r = await financeApi.getAccounts();
      setAccounts(r.data.data);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const handleDelete = async (id) => {
    if (!confirm("¿Eliminar esta cuenta?")) return;
    await financeApi.deleteAccount(id);
    load();
  };

  const totalBalance = accounts.reduce((s, a) => s + a.balance, 0);

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold">Cuentas</h1>
          <p className="text-navy-400 text-sm mt-0.5">
            Saldo total:{" "}
            <span className="text-champagne font-semibold">
              {fmtEUR(totalBalance)}
            </span>
          </p>
        </div>
        <button onClick={() => setModal("new")}
          className="bg-champagne hover:bg-champagne-light text-navy-950 font-semibold rounded-lg px-4 py-2 text-sm transition">
          + Nueva cuenta
        </button>
      </div>

      {loading ? (
        <p className="text-navy-400">Cargando…</p>
      ) : accounts.length === 0 ? (
        <div className="text-center py-16 text-navy-500">
          <p className="text-4xl mb-3">🏦</p>
          <p>Sin cuentas todavía. Crea una o importa un Excel.</p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {accounts.map((a) => (
            <div key={a.id} className="bg-navy-800 border border-navy-700 rounded-xl p-5 flex flex-col gap-3">
              <div className="flex items-start justify-between">
                <div>
                  <p className="font-semibold text-white">{a.name}</p>
                  <p className="text-navy-400 text-xs mt-0.5">
                    {ACCOUNT_TYPES.find(t => t.value === a.type)?.label || a.type}
                  </p>
                </div>
                <span className={`text-lg font-bold ${a.balance >= 0 ? "text-green-400" : "text-red-400"}`}>
                  {fmtEUR(a.balance)}
                </span>
              </div>
              {a.iban && (
                <p className="text-navy-500 text-xs font-mono">{a.iban}</p>
              )}
              <div className="flex gap-2 pt-1">
                <button onClick={() => setModal(a)}
                  className="flex-1 text-xs border border-navy-600 text-navy-300 hover:text-white rounded-lg py-1.5 transition">
                  Editar
                </button>
                <button onClick={() => handleDelete(a.id)}
                  className="flex-1 text-xs border border-red-800 text-red-400 hover:text-red-300 rounded-lg py-1.5 transition">
                  Eliminar
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {modal && (
        <AccountModal
          account={modal === "new" ? null : modal}
          onClose={() => setModal(null)}
          onSaved={() => { setModal(null); load(); }}
        />
      )}
    </div>
  );
}
