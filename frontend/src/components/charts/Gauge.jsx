import { RadialBarChart, RadialBar, PolarAngleAxis, ResponsiveContainer } from "recharts";

// Gauge semicircular para el rating de presupuesto (gastos).
// Verde si <=100, ámbar 100-110, rojo >110.
function ratingColor(pct) {
  if (pct == null) return "#64748b";
  if (pct <= 90) return "#22c55e";
  if (pct <= 105) return "#eab308";
  return "#ef4444";
}

export default function Gauge({ value, sublabel }) {
  const capped = Math.min(value == null ? 0 : value, 150);
  const color = ratingColor(value);
  const data = [{ name: "rating", value: capped, fill: color }];

  return (
    <div className="w-full flex flex-col items-center">
      {/* Solo mostramos el semicírculo superior: el chart es 2x alto y se recorta */}
      <div className="relative w-full overflow-hidden" style={{ height: 118 }}>
        <div style={{ height: 236 }}>
          <ResponsiveContainer width="100%" height="100%">
            <RadialBarChart
              innerRadius="70%" outerRadius="94%"
              data={data} startAngle={180} endAngle={0} barSize={16}
            >
              <PolarAngleAxis type="number" domain={[0, 150]} angleAxisId={0} tick={false} />
              <RadialBar background={{ fill: "#2d4275" }} dataKey="value"
                cornerRadius={8} angleAxisId={0} />
            </RadialBarChart>
          </ResponsiveContainer>
        </div>
        {/* Número en el centro-inferior del semicírculo, despejado del arco */}
        <div className="absolute inset-x-0 bottom-1 flex justify-center">
          <span className="text-4xl font-bold" style={{ color }}>
            {value == null ? "—" : `${value}%`}
          </span>
        </div>
      </div>
      {sublabel && (
        <p className="text-navy-400 text-xs text-center mt-2 whitespace-nowrap">{sublabel}</p>
      )}
    </div>
  );
}
