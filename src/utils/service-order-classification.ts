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
 * Também concentra a regra de EXCLUSÃO de registros de teste sem equipamento
 * (rotulados na UI como "Equipamento não informado"). Ver `isInvalidTestEquipmentOrder`
 * (memória) e `excludeInvalidTestEquipmentWhere` (fragmento Prisma p/ SQL).
 *
 * Importa apenas o namespace de tipos `Prisma` (sem runtime pesado), no mesmo
 * padrão de `service-order-filters.ts`.
 */
import { Prisma } from "@prisma/client";

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

/* ------------------------------------------------------------------ */
/* Reconhecimento de OS FECHADA/CONCLUÍDA                             */
/* ------------------------------------------------------------------ */

/**
 * Tokens (sem acento, minúsculo) que indicam OS fechada/concluída/encerrada no
 * texto de status cru do SAP (`statusSapRaw`). Usado como rede de segurança além
 * do enum, cobrindo variações: Fechada/Concluída/Encerrada/Finalizada/Tecnicamente
 * concluída/TECO/CONF/CNF.
 */
const CLOSED_STATUS_TOKENS = ["fechad", "conclu", "encerr", "finaliz", "teco", "conf", "cnf"];

/** Subconjunto de campos necessários para reconhecer o status de fechamento. */
export type ClosableServiceOrder = {
  status?: string | null;
  statusSapRaw?: string | null;
};

/**
 * Verdadeiro quando a OS está FECHADA/concluída. Reconhece pelo enum oficial
 * (`status === "FECHADA"`, resultado do mapeamento do importador) OU, como rede
 * de segurança, pelo texto cru `statusSapRaw` (variações SAP não mapeadas).
 * Normaliza (sem acento, minúsculo) antes de comparar.
 */
export function isClosedServiceOrder(order: ClosableServiceOrder): boolean {
  if ((order.status ?? "") === "FECHADA") {
    return true;
  }
  const raw = stripAccentsUpper(order.statusSapRaw ?? "").toLowerCase();
  if (!raw) {
    return false;
  }
  return CLOSED_STATUS_TOKENS.some((token) => raw.includes(token));
}

/* ------------------------------------------------------------------ */
/* Exclusão de registros de teste sem equipamento                     */
/* ------------------------------------------------------------------ */

/** Texto (normalizado, sem acento, maiúsculo) que marca equipamento não informado. */
const INVALID_EQUIPMENT_TEXT = "EQUIPAMENTO NAO INFORMADO";

/** Subconjunto de campos da OS necessários para checar equipamento inválido/teste. */
export type EquipmentCheckableOrder = {
  equipmentName?: string | null;
  equipmentCode?: string | null;
  technicalObjectRaw?: string | null;
  title?: string | null;
  description?: string | null;
};

function stripAccentsUpper(value: string): string {
  return value.normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase();
}

/**
 * Verdadeiro quando a OS é um registro INVÁLIDO/de teste quanto ao equipamento —
 * deve ser IGNORADA em todos os indicadores do portal. Cobre dois casos:
 *
 *  (a) o texto literal "Equipamento não informado" aparece em qualquer campo de
 *      equipamento/título (defensivo p/ importações futuras — tolerante a acento,
 *      caixa e espaços);
 *  (b) a OS não tem NENHUM identificador de equipamento/local de instalação
 *      (equipmentName + equipmentCode + technicalObjectRaw todos vazios) — o caso
 *      real dos registros de seed que a UI rotula como "Equipamento não informado".
 */
export function isInvalidTestEquipmentOrder(order: EquipmentCheckableOrder): boolean {
  const joined = [order.equipmentName, order.equipmentCode, order.technicalObjectRaw, order.title, order.description]
    .filter(Boolean)
    .join(" ");
  if (stripAccentsUpper(joined).includes(INVALID_EQUIPMENT_TEXT)) {
    return true;
  }

  const hasIdentifier =
    (order.equipmentName ?? "").trim() !== "" ||
    (order.equipmentCode ?? "").trim() !== "" ||
    (order.technicalObjectRaw ?? "").trim() !== "";
  return !hasIdentifier;
}

/**
 * Fragmento Prisma que SELECIONA (positivo) os registros de teste sem equipamento.
 * Espelha `isInvalidTestEquipmentOrder`. Use no script de limpeza; para a exclusão
 * nas análises, use `excludeInvalidTestEquipmentWhere`.
 */
export function matchInvalidTestEquipmentWhere(): Prisma.ServiceOrderWhereInput {
  return {
    OR: [
      // (a) sem NENHUM identificador de equipamento/local de instalação
      {
        AND: [
          { OR: [{ equipmentName: null }, { equipmentName: "" }] },
          { OR: [{ equipmentCode: null }, { equipmentCode: "" }] },
          { OR: [{ technicalObjectRaw: null }, { technicalObjectRaw: "" }] }
        ]
      },
      // (b) texto literal em campos de equipamento (defensivo; hoje 0 registros)
      { equipmentName: { contains: "equipamento não informado", mode: "insensitive" } },
      { equipmentName: { contains: "equipamento nao informado", mode: "insensitive" } },
      { technicalObjectRaw: { contains: "equipamento não informado", mode: "insensitive" } },
      { technicalObjectRaw: { contains: "equipamento nao informado", mode: "insensitive" } }
    ]
  };
}

/**
 * Fragmento Prisma para EXCLUIR registros de teste sem equipamento direto no banco
 * (eficiente em count/groupBy/aggregate). Espelha `isInvalidTestEquipmentOrder`.
 * Combine via spread OU empilhando em um array `AND` — atenção: usa `NOT` no topo,
 * então quando houver outro fragmento com `NOT` (ex.: exclusão de lubrificação),
 * combine ambos via `AND: [...]` em vez de dar spread nos dois.
 *   `where: { status: ..., ...excludeInvalidTestEquipmentWhere() }`.
 */
export function excludeInvalidTestEquipmentWhere(): Prisma.ServiceOrderWhereInput {
  return { NOT: matchInvalidTestEquipmentWhere() };
}
