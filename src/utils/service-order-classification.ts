/**
 * Classificação compartilhada de Ordens de Manutenção quanto a serem
 * PREVENTIVAS PROGRAMADAS (planos "PL -" / "PV -").
 *
 * Fonte ÚNICA da regra para evitar duplicidade (TAREFA 12):
 *  - a aba "Preventivas Programadas" trabalha com `isProgrammedPreventiveOrder === true`;
 *  - a aba "Equipamentos Críticos" trabalha com `isProgrammedPreventiveOrder === false`
 *    (i.e. `isCriticalEquipmentEligibleOrder`).
 *
 * Regra idêntica à do Preventivas: detecta o tipo pelo INÍCIO DO TÍTULO da OS,
 * tolerante a espaços e maiúsculas/minúsculas — aceita "PL -", "PL-", "PV -", "PV-".
 * A verificação é feita SOMENTE no título para garantir que as duas abas sejam
 * exatamente complementares (a OS excluída aqui é a mesma que aparece em Preventivas).
 *
 * Puro: sem Prisma client e sem React — pode ser importado em qualquer camada.
 */

/** Tipo de plano preventivo programado. */
export type ProgrammedOrderType = "PL" | "PV";

/** Subconjunto de campos da OS necessários para a classificação. */
export type ClassifiableServiceOrder = {
  title?: string | null;
};

/**
 * Detecta o tipo do plano programado a partir do título:
 * "PL -", "PL-", "PV -", "PV-" (case-insensitive, tolerante a espaços).
 * Exige o hífen para evitar falso-positivo em palavras como "PLACA".
 * Retorna "PL", "PV" ou `null` quando não é um plano programado.
 */
export function getProgrammedOrderType(order: ClassifiableServiceOrder): ProgrammedOrderType | null {
  const title = order.title;
  if (!title) {
    return null;
  }
  const match = title.match(/^\s*(PL|PV)\s*-/i);
  return match ? (match[1].toUpperCase() as ProgrammedOrderType) : null;
}

/**
 * Verdadeiro quando a OS é uma preventiva/lubrificação PROGRAMADA (PL/PV) e,
 * portanto, deve ser IGNORADA na análise de Equipamentos Críticos e acompanhada
 * na aba Preventivas Programadas.
 */
export function isProgrammedPreventiveOrder(order: ClassifiableServiceOrder): boolean {
  return getProgrammedOrderType(order) !== null;
}

/**
 * Verdadeiro quando a OS é ELEGÍVEL para a análise de Equipamentos Críticos
 * (corretivas/emergenciais/planejadas corretivas/ordens comuns de manutenção),
 * ou seja, quando NÃO é uma preventiva programada PL/PV.
 */
export function isCriticalEquipmentEligibleOrder(order: ClassifiableServiceOrder): boolean {
  return !isProgrammedPreventiveOrder(order);
}
