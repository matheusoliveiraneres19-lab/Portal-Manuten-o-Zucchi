/**
 * Utilitários de data DINÂMICA do portal (pt-BR), sem dependência de Prisma/React.
 *
 * Fonte única para "hoje" e para o período padrão do portal. Mantém a mesma
 * convenção UTC de `date-range.ts` para não divergir dos filtros dos services.
 *
 * IMPORTANTE: nada aqui pode ser uma data fixa/hardcoded — o portal deve sempre
 * refletir o dia em que o usuário abre a página.
 */

import { toEndOfDay, toStartOfDay, type DateRange } from "@/utils/date-range";

/** Data/hora atual (fuso do servidor/navegador). Centralizada para facilitar testes. */
export function getTodayDate(): Date {
  return new Date();
}

/**
 * Formata uma data no padrão pt-BR (dd/mm/yyyy). Aceita `Date` ou string
 * (ISO ou yyyy-mm-dd). Datas inválidas viram "--/--/----" para nunca quebrar a UI.
 */
export function formatDatePtBr(value: Date | string = getTodayDate()): string {
  const date = value instanceof Date ? value : new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "--/--/----";
  }

  return date.toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric"
  });
}

/**
 * Período padrão do portal quando NÃO há período selecionado na URL:
 * - início = primeiro dia do mês atual;
 * - fim = hoje (dinâmico).
 *
 * Datas em UTC, alinhadas a `date-range.ts`. O `reference` permite testar/derivar
 * a partir de outra data sem travar em valor fixo.
 */
export function getDefaultPortalPeriod(reference: Date = getTodayDate()): DateRange {
  const startDate = new Date(
    Date.UTC(reference.getUTCFullYear(), reference.getUTCMonth(), 1, 0, 0, 0, 0)
  );

  return {
    startDate,
    endDate: toEndOfDay(reference)
  };
}

/**
 * Interpreta um par start/end (yyyy-mm-dd) em um `DateRange` UTC.
 * Sem datas válidas, cai no período padrão do portal (mês atual → hoje).
 * Garante ordem cronológica mesmo se as datas vierem invertidas.
 */
export function parsePortalDateRange(startDate?: string | null, endDate?: string | null): DateRange {
  if (startDate && endDate) {
    const start = toStartOfDay(startDate);
    const end = toEndOfDay(endDate);

    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
      return getDefaultPortalPeriod();
    }

    return start <= end
      ? { startDate: start, endDate: end }
      : { startDate: toStartOfDay(endDate), endDate: toEndOfDay(startDate) };
  }

  return getDefaultPortalPeriod();
}
