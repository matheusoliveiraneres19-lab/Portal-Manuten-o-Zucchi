/**
 * Helpers de intervalo de datas em UTC — fonte única usada por TODOS os services.
 *
 * Antes, `toStartOfDay` / `toEndOfDay` estavam reimplementados (idênticos) em
 * dashboard.service, service-orders.service e critical-equipments.service.
 * Centralizar evita que um ajuste de fuso/limite divirja entre módulos.
 *
 * Puro: sem Prisma e sem React — pode ser importado em qualquer camada.
 */

export type DateRange = {
  startDate: Date;
  endDate: Date;
};

/** Início do dia (00:00:00.000) em UTC para a data informada. */
export function toStartOfDay(value: Date | string): Date {
  const date = new Date(value);
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), 0, 0, 0, 0));
}

/** Fim do dia (23:59:59.999) em UTC para a data informada. */
export function toEndOfDay(value: Date | string): Date {
  const date = new Date(value);
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), 23, 59, 59, 999));
}

/** Filtro Prisma `{ gte, lte }` para um intervalo de datas. */
export function withinPeriod(period: DateRange) {
  return {
    gte: period.startDate,
    lte: period.endDate
  };
}

/** Verdadeiro quando a data está dentro do intervalo (inclusive). */
export function isWithinPeriod(date: Date, period: DateRange): boolean {
  return date >= period.startDate && date <= period.endDate;
}

/** Chave de dia (YYYY-MM-DD) em UTC, usada para agrupar séries diárias. */
export function dayKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** Intervalo UTC cobrindo um mês inteiro (month: 1-12). */
export function monthRange(year: number, month: number): DateRange {
  return {
    startDate: new Date(Date.UTC(year, month - 1, 1, 0, 0, 0, 0)),
    endDate: new Date(Date.UTC(year, month, 0, 23, 59, 59, 999))
  };
}

/** Intervalo UTC cobrindo um ano inteiro. */
export function yearRange(year: number): DateRange {
  return {
    startDate: new Date(Date.UTC(year, 0, 1, 0, 0, 0, 0)),
    endDate: new Date(Date.UTC(year, 11, 31, 23, 59, 59, 999))
  };
}
