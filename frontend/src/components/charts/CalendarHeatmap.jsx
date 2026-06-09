import { useMemo, useState } from "react";

const fmt = (n) =>
  Number(n || 0).toLocaleString("es-ES", { maximumFractionDigits: 0 }) + " €";

const DOW = ["L", "M", "X", "J", "V", "S", "D"];
const MONTH_LABELS = ["Ene", "Feb", "Mar", "Abr", "May", "Jun",
                      "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];

// Escala de color (navy → champagne/dorado) según intensidad de gasto
function colorFor(amount, max) {
  if (!amount) return "#1b2a4a"; // navy-800, sin gasto
  const t = Math.min(amount / max, 1);
  // interpolar de navy-700 a un dorado intenso
  const stops = [
    [33, 48, 90],     // navy-700
    [120, 90, 50],    // ámbar oscuro
    [201, 146, 42],   // gold-500
    [232, 207, 162],  // champagne claro
  ];
  const seg = t * (stops.length - 1);
  const i = Math.min(Math.floor(seg), stops.length - 2);
  const f = seg - i;
  const c = stops[i].map((v, k) => Math.round(v + (stops[i + 1][k] - v) * f));
  return `rgb(${c[0]},${c[1]},${c[2]})`;
}

export default function CalendarHeatmap({ data, year, max }) {
  const [hover, setHover] = useState(null);

  // mapa fecha → importe
  const byDate = useMemo(() => {
    const m = {};
    (data || []).forEach((d) => { m[d.date] = d.amount; });
    return m;
  }, [data]);

  // Construir semanas (columnas) × días (filas, L-D)
  const weeks = useMemo(() => {
    const first = new Date(year, 0, 1);
    const last = new Date(year, 11, 31);
    const cols = [];
    let cur = new Date(first);
    // retroceder al lunes de la primera semana
    const dow = (cur.getDay() + 6) % 7; // 0=lunes
    cur.setDate(cur.getDate() - dow);
    while (cur <= last) {
      const col = [];
      for (let d = 0; d < 7; d++) {
        const inYear = cur.getFullYear() === year;
        const iso = `${cur.getFullYear()}-${String(cur.getMonth() + 1).padStart(2, "0")}-${String(cur.getDate()).padStart(2, "0")}`;
        col.push(inYear ? { iso, month: cur.getMonth(), amount: byDate[iso] || 0 } : null);
        cur.setDate(cur.getDate() + 1);
      }
      cols.push(col);
    }
    return cols;
  }, [byDate, year]);

  const cell = 13, gap = 3;

  return (
    <div className="relative">
      <div className="flex gap-1 overflow-x-auto pb-1">
        {/* etiquetas días */}
        <div className="flex flex-col gap-[3px] pr-1 pt-[18px]">
          {DOW.map((d, i) => (
            <div key={i} style={{ height: cell }} className="text-[9px] text-navy-500 leading-none flex items-center">
              {i % 2 === 1 ? d : ""}
            </div>
          ))}
        </div>
        <div>
          {/* etiquetas meses */}
          <div className="flex" style={{ height: 16 }}>
            {weeks.map((col, ci) => {
              const firstReal = col.find((c) => c && c.iso.endsWith("01"));
              return (
                <div key={ci} style={{ width: cell + gap }} className="text-[9px] text-navy-500">
                  {firstReal ? MONTH_LABELS[firstReal.month] : ""}
                </div>
              );
            })}
          </div>
          {/* grid */}
          <div className="flex" style={{ gap }}>
            {weeks.map((col, ci) => (
              <div key={ci} className="flex flex-col" style={{ gap }}>
                {col.map((c, ri) => (
                  <div key={ri}
                    style={{
                      width: cell, height: cell, borderRadius: 2,
                      backgroundColor: c ? colorFor(c.amount, max) : "transparent",
                    }}
                    onMouseEnter={() => c && c.amount > 0 && setHover(c)}
                    onMouseLeave={() => setHover(null)}
                    className="transition-transform hover:scale-125 cursor-default"
                  />
                ))}
              </div>
            ))}
          </div>
        </div>
      </div>
      {hover && (
        <div className="absolute top-0 right-0 bg-navy-950 border border-navy-600 rounded-lg px-3 py-1.5 text-xs shadow-xl pointer-events-none">
          <span className="text-champagne font-semibold">{fmt(hover.amount)}</span>
          <span className="text-navy-400 ml-2">{hover.iso}</span>
        </div>
      )}
    </div>
  );
}
