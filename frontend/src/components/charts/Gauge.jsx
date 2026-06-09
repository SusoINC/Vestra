import { RadialBarChart, RadialBar, PolarAngleAxis, ResponsiveContainer } from "recharts";

// Gauge semicircular para el rating de presupuesto.
// Verde si <=100, ámbar 100-110, rojo >110 (gastar por encima del presupuesto es malo).
function ratingColor(pct) {
  if (pct == null) return "#475569";
  if (pct <= 90) return "#22c55e";
  if (pct <= 105) return "#eab308";
  return "#ef4444";
}

export default function Gauge({ value, label, sublabel }) {
  const pct = value == null ? 0 : value;
  const capped = Math.min(pct, 150); // tope visual
  const color = ratingColor(value);
  const data = [{ name: "rating", value: capped, fill: color }];

  return (
    <div className="relative flex flex-col items-center">
      <ResponsiveContainer width="100%" height={150}>
        <RadialBarChart
          innerRadius="72%" outerRadius="100%"
          data={data} startAngle={210} endAngle={-30}
          barSize={16}
        >
          <PolarAngleAxis type="number" domain={[0, 150]} angleAxisId={0} tick={false} />
          <RadialBar background={{ fill: "#1b2a4a" }} dataKey="value" cornerRadius={8} angleAxisId={0} />
        </RadialBarChart>
      </ResponsiveContainer>
      <div className="absolute inset-0 flex flex-col items-center justify-center mt-3">
        <span className="text-3xl font-bold" style={{ color }}>
          {value == null ? "—" : `${value}%`}
        </span>
        {sublabel && <span className="text-navy-400 text-xs mt-0.5">{sublabel}</span>}
      </div>
      {label && <span className="text-navy-300 text-sm font-medium mt-1">{label}</span>}
    </div>
  );
}
