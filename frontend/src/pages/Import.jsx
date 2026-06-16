import { useRef, useState } from "react";
import { Link } from "react-router-dom";
import financeApi from "../api/finance";

export default function Import() {
  const [dragging, setDragging] = useState(false);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");
  const inputRef = useRef();

  const handleFile = async (file) => {
    if (!file) return;
    setLoading(true);
    setError("");
    setResult(null);
    try {
      const r = await financeApi.importExcel(file);
      setResult(r.data.data);
    } catch (e) {
      setError(e.response?.data?.error?.message || "Error procesando el fichero");
    } finally {
      setLoading(false);
    }
  };

  const onDrop = (e) => {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  };

  return (
    <div className="max-w-xl">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold">Importar movimientos</h1>
        <p className="text-navy-400 text-sm mt-1">
          Sube el fichero .xls que descargas desde ING → Mis productos → Ver movimientos → Exportar.
        </p>
      </div>

      {/* Drop zone */}
      <div
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        onClick={() => inputRef.current?.click()}
        className={`border-2 border-dashed rounded-xl p-12 text-center cursor-pointer transition
          ${dragging ? "border-champagne bg-champagne/5" : "border-navy-600 hover:border-navy-500"}`}
      >
        <p className="text-4xl mb-3">📥</p>
        <p className="text-white font-medium">
          {loading ? "Procesando…" : "Arrastra tu .xls aquí"}
        </p>
        <p className="text-navy-400 text-sm mt-1">o haz clic para seleccionar</p>
        <input
          ref={inputRef}
          type="file"
          accept=".xls,.xlsx"
          className="hidden"
          onChange={(e) => handleFile(e.target.files[0])}
        />
      </div>

      {/* Error */}
      {error && (
        <div className="mt-4 bg-red-900/30 border border-red-700 rounded-lg p-4">
          <p className="text-red-400 text-sm">{error}</p>
        </div>
      )}

      {/* Result */}
      {result && (
        <div className="mt-6 bg-navy-800 border border-navy-700 rounded-xl p-6 space-y-4">
          <h2 className="font-semibold text-white">Import completado</h2>

          <div className="grid grid-cols-3 gap-3">
            <div className="bg-navy-900 rounded-lg p-3 text-center">
              <p className="text-2xl font-bold text-green-400">{result.imported}</p>
              <p className="text-navy-400 text-xs mt-1">Importados</p>
            </div>
            <div className="bg-navy-900 rounded-lg p-3 text-center">
              <p className="text-2xl font-bold text-navy-400">{result.skipped}</p>
              <p className="text-navy-400 text-xs mt-1">Duplicados</p>
            </div>
            <div className="bg-navy-900 rounded-lg p-3 text-center">
              <p className="text-2xl font-bold text-white">{result.total}</p>
              <p className="text-navy-400 text-xs mt-1">Total</p>
            </div>
          </div>

          <div className="bg-navy-900 rounded-lg p-3">
            <p className="text-navy-400 text-xs mb-1">Cuenta</p>
            <p className="text-white text-sm font-medium">{result.account.name}</p>
            <p className="text-navy-500 text-xs font-mono">{result.account.iban}</p>
          </div>

          <Link to="/pending"
            className="block w-full text-center bg-champagne hover:bg-champagne-light
                       text-[#0a1020] font-semibold rounded-lg py-2.5 text-sm transition">
            Ver movimientos por categorizar →
          </Link>
        </div>
      )}
    </div>
  );
}
