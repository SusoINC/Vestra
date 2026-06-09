// Formateo de moneda EUR con separador de miles "." y decimal ","
// garantizado (no depende del locale del navegador).
// Ej: 2370.59 → "2.370,59 €"   ·   -1234 → "-1.234,00 €"
export function fmtEUR(n) {
  const num = Number(n || 0);
  const [intPart, decPart] = Math.abs(num).toFixed(2).split(".");
  const grouped = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return `${num < 0 ? "-" : ""}${grouped},${decPart} €`;
}
