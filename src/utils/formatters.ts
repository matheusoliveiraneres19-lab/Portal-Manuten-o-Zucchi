export function formatCurrency(value: number) {
  return value.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL"
  });
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
