/**
 * Utilitários puros (sem Prisma / sem React) para o período global do dashboard.
 * Usados tanto no servidor (services e páginas) quanto no cliente (header).
 */

export type KPITrendDirection = "up" | "down" | "stable";

export type PeriodVariation =
  | { status: "unavailable" }
  | { status: "available"; percentage: number; direction: KPITrendDirection };

/**
 * Calcula a variação percentual entre o valor do período atual e o anterior.
 *
 * Regras:
 * - Se `previousValue` for null, undefined ou 0, não há base de comparação
 *   confiável -> retorna `{ status: "unavailable" }`.
 * - Caso contrário, retorna a variação percentual (absoluta) e a direção.
 */
export function calculatePeriodVariation(
  currentValue: number,
  previousValue: number | null | undefined
): PeriodVariation {
  if (previousValue === null || previousValue === undefined || previousValue === 0) {
    return { status: "unavailable" };
  }

  if (!Number.isFinite(currentValue) || !Number.isFinite(previousValue)) {
    return { status: "unavailable" };
  }

  const change = ((currentValue - previousValue) / previousValue) * 100;
  const percentage = Number(Math.abs(change).toFixed(1));
  const direction: KPITrendDirection = change > 0 ? "up" : change < 0 ? "down" : "stable";

  return { status: "available", percentage, direction };
}

const DAY_IN_MS = 24 * 60 * 60 * 1000;

/**
 * Retorna a janela imediatamente anterior, com a mesma duração do período atual.
 * Ex.: 01/05 a 31/05 -> 31/03 a 30/04 (mesma quantidade de dias, terminando 1ms antes do início).
 */
export function getPreviousPeriod(startDate: Date, endDate: Date): { startDate: Date; endDate: Date } {
  const durationMs = Math.max(DAY_IN_MS, endDate.getTime() - startDate.getTime());
  const previousEnd = new Date(startDate.getTime() - 1);
  const previousStart = new Date(previousEnd.getTime() - durationMs);

  return { startDate: previousStart, endDate: previousEnd };
}

/** Converte uma data para o formato aceito por <input type="date"> (yyyy-mm-dd, em UTC). */
export function toInputDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** Formata um intervalo para exibição no header: "01/05/2026 - 30/06/2026". */
export function formatPeriodRange(start: Date | string, end: Date | string): string {
  const startDate = typeof start === "string" ? parseInputDate(start) : start;
  const endDate = typeof end === "string" ? parseInputDate(end) : end;

  return `${formatBrDate(startDate)} - ${formatBrDate(endDate)}`;
}

/** Interpreta uma string yyyy-mm-dd como data local (sem deslocar por fuso). */
export function parseInputDate(value: string): Date {
  const [year, month, day] = value.split("-").map(Number);

  if (!year || !month || !day) {
    return new Date(value);
  }

  return new Date(year, month - 1, day);
}

function formatBrDate(date: Date): string {
  if (Number.isNaN(date.getTime())) {
    return "--/--/----";
  }

  return date.toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric"
  });
}
