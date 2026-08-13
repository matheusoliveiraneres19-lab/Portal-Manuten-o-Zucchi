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
 * Fuso de EXIBIÇÃO do portal. Zucchi opera em horário de Brasília.
 *
 * Declarar o fuso é OBRIGATÓRIO em qualquer formatação de TIMESTAMP renderizada
 * pelo React, e não um detalhe de estilo: sem ele, `toLocaleString` usa o fuso do
 * ambiente — a função serverless da Vercel roda em UTC e o navegador do usuário em
 * UTC−3. O servidor emite "16:31", o cliente hidrata "13:31", os textos não batem e
 * o React descarta o HTML do servidor com erro de hidratação (#425/#422).
 *
 * Foi exatamente o que aconteceu na aba Configurações: 183 datas divergindo entre
 * servidor e navegador.
 *
 * Use para TIMESTAMPS (auditoria, importação, "agora"). Para datas PURAS vindas do
 * SAP (gravadas à meia-noite UTC), continue usando `timeZone: "UTC"` como o resto
 * do portal — converter para Brasília voltaria um dia.
 */
export const PORTAL_TIME_ZONE = "America/Sao_Paulo";

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
    timeZone: PORTAL_TIME_ZONE,
    day: "2-digit",
    month: "2-digit",
    year: "numeric"
  });
}

/**
 * Formata um TIMESTAMP no padrão pt-BR (dd/mm/yyyy hh:mm) no fuso do portal.
 * Valores inválidos viram "--/--/---- --:--".
 */
export function formatDateTimePtBr(value: Date | string): string {
  const date = value instanceof Date ? value : new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "--/--/---- --:--";
  }

  return date.toLocaleString("pt-BR", {
    timeZone: PORTAL_TIME_ZONE,
    dateStyle: "short",
    timeStyle: "short"
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
