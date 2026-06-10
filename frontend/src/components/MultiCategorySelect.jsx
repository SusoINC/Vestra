import { useState, useRef, useEffect } from "react";

// Selector de varias categorías (checklist en dropdown).
// value = array de ids · onChange(array)
export default function MultiCategorySelect({ categories, value, onChange }) {
  const [open, setOpen] = useState(false);
  const ref = useRef();

  useEffect(() => {
    const h = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);

  const toggle = (id) =>
    onChange(value.includes(id) ? value.filter((x) => x !== id) : [...value, id]);

  const label = value.length === 0
    ? "Todas las categorías"
    : value.length === 1
      ? (categories.find((c) => c.id === value[0])?.label || "1 categoría")
      : `${value.length} categorías`;

  return (
    <div className="relative" ref={ref}>
      <button type="button" onClick={() => setOpen((o) => !o)}
        className="bg-navy-900 border border-navy-600 text-white rounded-lg px-3 py-2 text-sm
                   focus:outline-none focus:border-champagne transition flex items-center gap-2 whitespace-nowrap">
        <span className={value.length ? "text-white" : "text-navy-300"}>{label}</span>
        <span className="text-navy-500 text-xs">▾</span>
      </button>
      {open && (
        <div className="absolute z-30 mt-1 bg-navy-900 border border-navy-600 rounded-lg p-1.5 w-60 max-h-72 overflow-y-auto shadow-2xl">
          {value.length > 0 && (
            <button onClick={() => onChange([])}
              className="w-full text-left text-xs text-champagne hover:text-champagne-light px-2 py-1">
              ✕ Limpiar selección
            </button>
          )}
          {categories.map((c) => (
            <label key={c.id}
              className="flex items-center gap-2 px-2 py-1.5 hover:bg-navy-800 rounded cursor-pointer text-sm text-navy-200">
              <input type="checkbox" checked={value.includes(c.id)} onChange={() => toggle(c.id)}
                className="accent-champagne" />
              <span>{c.icon} {c.label}</span>
            </label>
          ))}
        </div>
      )}
    </div>
  );
}
