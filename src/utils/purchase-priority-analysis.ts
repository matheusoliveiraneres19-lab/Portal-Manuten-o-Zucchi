/**
 * Agregação por PRIORIDADE das compras pendentes — TAREFAS 3 a 7.
 *
 * Funções PURAS, sem Prisma e sem React: recebem as linhas já recortadas pela
 * regra da aba (`pendente_compra` da v3.1 + filtros da tela) e devolvem os
 * cards, os gráficos e o ranking crítico prontos. É impossível um card somar
 * item comprado, serviço, Y04 ou recebido — o recorte vem de quem chama.
 *
 * Vive fora de `purchases.service.ts` por dois motivos: o service importa
 * `react/cache` (só carrega dentro do Next) e esta é a matemática dos dashboards
 * — precisa ser testável em isolamento, como já é `purchases-normalizer`.
 */
import {
  NO_PURCHASE_PRIORITY,
  PURCHASE_PRIORITY_COLORS,
  PURCHASE_PRIORITY_KEYS,
  PURCHASE_PRIORITY_LABELS,
  purchasePriorityKey,
  type PurchasePriorityKey
} from "@/utils/purchases-normalizer";
import type {
  PendingPriorityAnalysis,
  PurchaseCriticalItem,
  PurchasePriorityBreakdown,
  PurchasePrioritySlice
} from "@/types/purchases";

const DAY_IN_MS = 24 * 60 * 60 * 1000;

/**
 * Forma MÍNIMA de linha que as agregações precisam — estrutural, não o payload
 * do Prisma: assim o teste monta linhas à mão e o service passa as suas sem
 * conversão.
 */
export type PriorityAnalysisRow = {
  id: string;
  purchasePriority: string | null;
  trackingNumber: string | null;
  requisitionNumber: string | null;
  materialCode: string | null;
  itemDescription: string;
  quantity: number | null;
  pendingQuantity: number | null;
  unit: string | null;
  requisitionDate: Date | null;
  requester: string | null;
  goodsGroupCode: string | null;
  goodsGroupDescription: string | null;
};

/** Peso de ordenação: N1 primeiro, N4 depois, "sem prioridade" no fim. */
const PRIORITY_RANK: Record<PurchasePriorityKey, number> = {
  N1: 1,
  N2: 2,
  N3: 3,
  N4: 4,
  SEM_PRIORIDADE: 5
};

/** Contagem por prioridade de um conjunto de linhas (sempre as 5 chaves). */
export function countByPriority(records: PriorityAnalysisRow[]): Record<PurchasePriorityKey, number> {
  const totals: Record<PurchasePriorityKey, number> = {
    N1: 0,
    N2: 0,
    N3: 0,
    N4: 0,
    SEM_PRIORIDADE: 0
  };
  for (const record of records) {
    totals[purchasePriorityKey(record.purchasePriority)] += 1;
  }
  return totals;
}

/**
 * Fatias do gráfico "Compras Pendentes por Prioridade" (TAREFA 4) — sempre nas
 * cinco chaves, na ordem N1 → N4 → Sem prioridade, com percentual sobre o total
 * do recorte. `total = 0` devolve 0% (nunca NaN/Infinity).
 */
export function prioritySlices(records: PriorityAnalysisRow[]): PurchasePrioritySlice[] {
  const totals = countByPriority(records);
  const total = records.length;
  return PURCHASE_PRIORITY_KEYS.map((priority) => ({
    priority,
    label: PURCHASE_PRIORITY_LABELS[priority],
    count: totals[priority],
    percentage: total > 0 ? round((totals[priority] / total) * 100) : 0,
    color: PURCHASE_PRIORITY_COLORS[priority]
  }));
}

/**
 * Barras empilhadas por prioridade, agrupadas por um campo textual —
 * requisitante (TAREFA 5) ou grupo de mercadoria (TAREFA 6).
 *
 * A ordenação destaca a CRITICIDADE, não o volume: primeiro quem tem mais N1,
 * depois mais N2, e só então o total — é isso que responde "quem concentra as
 * pendências críticas?". Um requisitante com 3 N1 aparece antes de um com 50 N3.
 */
export function priorityBreakdownBy(
  records: PriorityAnalysisRow[],
  labelOf: (record: PriorityAnalysisRow) => string | null,
  limit: number
): PurchasePriorityBreakdown[] {
  const groups = new Map<string, PurchasePriorityBreakdown>();
  for (const record of records) {
    const label = labelOf(record);
    if (!label) {
      continue; // sem agrupador: entra nos cards, mas não vira uma barra "—"
    }
    const entry = groups.get(label) ?? { label, n1: 0, n2: 0, n3: 0, n4: 0, withoutPriority: 0, total: 0 };
    const priority = purchasePriorityKey(record.purchasePriority);
    if (priority === NO_PURCHASE_PRIORITY) {
      entry.withoutPriority += 1;
    } else {
      entry[priority.toLowerCase() as "n1" | "n2" | "n3" | "n4"] += 1;
    }
    entry.total += 1;
    groups.set(label, entry);
  }

  return Array.from(groups.values())
    .sort((a, b) => b.n1 - a.n1 || b.n2 - a.n2 || b.total - a.total || a.label.localeCompare(b.label, "pt-BR"))
    .slice(0, limit);
}

/** Dias em aberto desde a data da requisição (nunca negativo, nunca NaN). */
export function daysOpenFrom(date: Date | null, today: Date): number | null {
  if (!date) {
    return null;
  }
  const days = Math.floor((today.getTime() - date.getTime()) / DAY_IN_MS);
  return Number.isFinite(days) ? Math.max(0, days) : null;
}

/**
 * Ranking "Top Compras Pendentes Críticas" (TAREFA 7).
 *
 * Ordem OBRIGATÓRIA: N1 → N2 → N3 → N4 → sem prioridade e, dentro de cada
 * prioridade, a requisição MAIS ANTIGA primeiro; empate resolve pela maior
 * quantidade pendente. Requisições sem data vão para o fim do próprio bloco de
 * prioridade — não podem furar a fila de quem tem idade comprovada.
 */
export function buildCriticalItems(
  records: PriorityAnalysisRow[],
  today: Date,
  limit = 25
): PurchaseCriticalItem[] {
  return records
    .slice()
    .sort((a, b) => {
      const rank =
        PRIORITY_RANK[purchasePriorityKey(a.purchasePriority)] -
        PRIORITY_RANK[purchasePriorityKey(b.purchasePriority)];
      if (rank !== 0) {
        return rank;
      }
      const dateA = a.requisitionDate?.getTime() ?? Number.POSITIVE_INFINITY;
      const dateB = b.requisitionDate?.getTime() ?? Number.POSITIVE_INFINITY;
      if (dateA !== dateB) {
        return dateA - dateB;
      }
      return (b.pendingQuantity ?? 0) - (a.pendingQuantity ?? 0);
    })
    .slice(0, limit)
    .map((record) => {
      const priority = purchasePriorityKey(record.purchasePriority);
      return {
        id: record.id,
        priority,
        priorityLabel: PURCHASE_PRIORITY_LABELS[priority],
        requisition: record.requisitionNumber ?? "—",
        // O export do SAP não traz número de item da requisição; o material é o
        // identificador do item dentro dela.
        item: record.materialCode ?? "—",
        material: record.materialCode ?? "—",
        shortText: record.itemDescription,
        requestedQuantity: record.quantity,
        pendingQuantity: record.pendingQuantity,
        unit: record.unit,
        requestDate: record.requisitionDate ? record.requisitionDate.toISOString() : null,
        requester: record.requester ?? "—",
        merchandiseGroup: record.goodsGroupDescription ?? record.goodsGroupCode ?? "—",
        daysOpen: daysOpenFrom(record.requisitionDate, today),
        trackingNumberRaw: record.trackingNumber
      };
    });
}

/** Quantas linhas cada barra empilhada mostra, no máximo. */
const BREAKDOWN_LIMIT = 10;

/**
 * TAREFA 13 — bloco completo de análise por prioridade das compras PENDENTES.
 * `available` vem de fora (é uma pergunta sobre a base inteira, não sobre o
 * recorte): sem prioridade em lugar nenhum, a aba mostra o aviso.
 */
export function buildPendingPriorityAnalysis(
  records: PriorityAnalysisRow[],
  available: boolean,
  today: Date
): PendingPriorityAnalysis {
  const totals = countByPriority(records);
  return {
    available,
    summary: {
      totalPending: records.length,
      n1: totals.N1,
      n2: totals.N2,
      n3: totals.N3,
      n4: totals.N4,
      withoutPriority: totals.SEM_PRIORIDADE
    },
    byPriority: prioritySlices(records),
    byRequester: priorityBreakdownBy(records, (record) => record.requester, BREAKDOWN_LIMIT),
    byMerchandiseGroup: priorityBreakdownBy(
      records,
      (record) => record.goodsGroupDescription ?? record.goodsGroupCode,
      BREAKDOWN_LIMIT
    ),
    criticalItems: buildCriticalItems(records, today)
  };
}

/** Estado vazio da análise (sem importação ou falha de banco). */
export function emptyPriorityAnalysis(available = false): PendingPriorityAnalysis {
  return {
    available,
    summary: { totalPending: 0, n1: 0, n2: 0, n3: 0, n4: 0, withoutPriority: 0 },
    byPriority: PURCHASE_PRIORITY_KEYS.map((priority) => ({
      priority,
      label: PURCHASE_PRIORITY_LABELS[priority],
      count: 0,
      percentage: 0,
      color: PURCHASE_PRIORITY_COLORS[priority]
    })),
    byRequester: [],
    byMerchandiseGroup: [],
    criticalItems: []
  };
}

/** Arredonda em 2 casas — evita 33.33333333333333 no percentual. */
function round(value: number): number {
  return Number.isFinite(value) ? Math.round(value * 100) / 100 : 0;
}
