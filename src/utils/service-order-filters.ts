/**
 * Filtros de Ordem de Serviço compartilhados — identificação de ordens de
 * LUBRIFICAÇÃO (prefixo "PL") para excluí-las das análises de QUEBRA/corretiva.
 *
 * Regra de negócio (TAREFA 6): nas análises de quebra/manutenção corretiva
 * (alertas de alto volume, índice de quebra, quebra recorrente), as ordens de
 * lubrificação não representam falha do equipamento e devem ser excluídas.
 * NÃO usar em análises específicas de lubrificantes.
 *
 * Puro: sem Prisma client e sem React. O fragmento `excludeLubricationOrderWhere`
 * apenas monta um WhereInput (tipo), para exclusão eficiente no banco.
 */
import { MaintenanceArea, Prisma } from "@prisma/client";

/** Subconjunto de campos da OS necessários para classificar como lubrificação. */
export type LubricationCheckableOrder = {
  osNumber?: string | null;
  title?: string | null;
  operation?: string | null;
  planningGroup?: string | null;
  planningGroupCode?: string | null;
  area?: MaintenanceArea | null;
};

const PL_PREFIX = /^\s*pl/i; // osNumber/title que começam com "PL"
const LUBRIF_TEXT = /lubrif/i; // grupo de planejamento / operação de lubrificação

/**
 * Verdadeiro quando a ordem é de lubrificação:
 *  - osNumber começa com "PL"; ou
 *  - title começa com "PL"; ou
 *  - área = LUBRIFICACAO; ou
 *  - planningGroup / planningGroupCode contém "LUBRIF"; ou
 *  - operation contém padrão de lubrificação.
 */
export function isLubricationOrder(order: LubricationCheckableOrder): boolean {
  if (PL_PREFIX.test(order.osNumber ?? "")) {
    return true;
  }
  if (PL_PREFIX.test(order.title ?? "")) {
    return true;
  }
  if (order.area === MaintenanceArea.LUBRIFICACAO) {
    return true;
  }
  if (LUBRIF_TEXT.test(order.planningGroup ?? "") || LUBRIF_TEXT.test(order.planningGroupCode ?? "")) {
    return true;
  }
  if (LUBRIF_TEXT.test(order.operation ?? "")) {
    return true;
  }
  return false;
}

/** Remove ordens de lubrificação de uma lista (análises de quebra/corretiva). */
export function filterMaintenanceBreakOrders<T extends LubricationCheckableOrder>(orders: T[]): T[] {
  return orders.filter((order) => !isLubricationOrder(order));
}

/**
 * Fragmento Prisma para EXCLUIR ordens de lubrificação direto no banco (eficiente
 * em groupBy/count). Espelha `isLubricationOrder` nos campos consultáveis.
 * Combine via spread: `where: { type: CORRETIVA, ...excludeLubricationOrderWhere() }`.
 */
export function excludeLubricationOrderWhere(): Prisma.ServiceOrderWhereInput {
  return {
    NOT: {
      OR: [
        { osNumber: { startsWith: "PL", mode: "insensitive" } },
        { title: { startsWith: "PL", mode: "insensitive" } },
        { area: MaintenanceArea.LUBRIFICACAO },
        { planningGroup: { contains: "LUBRIF", mode: "insensitive" } },
        { planningGroupCode: { contains: "LUBRIF", mode: "insensitive" } },
        { operation: { contains: "lubrif", mode: "insensitive" } }
      ]
    }
  };
}
