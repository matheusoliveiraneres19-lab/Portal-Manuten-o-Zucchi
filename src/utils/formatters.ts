export function formatCurrency(value: number) {
  return value.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL"
  });
}

/**
 * Moeda ABREVIADA para card de KPI: "R$ 10,36 mi", "R$ 812,4 mil".
 *
 * Os cards do portal têm coluna estreita e `truncate`, então um valor por extenso
 * ("R$ 10.357.563,90") aparecia cortado — o número mais importante da aba Compras
 * Realizadas terminava ilegível. A forma abreviada cabe inteira; o valor exato vai no
 * tooltip (ver `formatCurrency`), que é onde se confere, não onde se lê de relance.
 *
 * Abaixo de mil não abrevia: "R$ 847,20" já cabe e arredondar ali só perderia precisão.
 */
export function formatCompactCurrency(value: number): string {
  if (!Number.isFinite(value)) return "—";

  const abs = Math.abs(value);
  const sinal = value < 0 ? "-" : "";
  const num = (valor: number, casas: number) =>
    valor.toLocaleString("pt-BR", { minimumFractionDigits: casas, maximumFractionDigits: casas });

  if (abs >= 1_000_000_000) return `${sinal}R$ ${num(abs / 1_000_000_000, 2)} bi`;
  if (abs >= 1_000_000) return `${sinal}R$ ${num(abs / 1_000_000, 2)} mi`;
  if (abs >= 1_000) return `${sinal}R$ ${num(abs / 1_000, 1)} mil`;
  return formatCurrency(value);
}

export function formatVolume(value: number, unit = "L") {
  return `${value.toLocaleString("pt-BR", { maximumFractionDigits: 0 })} ${unit}`;
}

export function formatPercent(value: number) {
  return `${value.toLocaleString("pt-BR", {
    minimumFractionDigits: value % 1 === 0 ? 0 : 1,
    maximumFractionDigits: 1
  })}%`;
}

export function formatShortDate(date: Date) {
  return date.toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit"
  });
}

export function formatDate(date?: Date | null) {
  return date ? date.toLocaleDateString("pt-BR") : "-";
}

export function formatMonthName(date: Date) {
  const month = date.toLocaleDateString("pt-BR", { month: "short" }).replace(".", "");
  return month.charAt(0).toUpperCase() + month.slice(1);
}
