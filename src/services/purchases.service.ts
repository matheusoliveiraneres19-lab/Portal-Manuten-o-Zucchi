/**
 * Service de Compras — FONTE ÚNICA dos indicadores de compras do portal.
 *
 * Aplica as regras do painel `acompanhamento_compras_v3 (2).html`. O status
 * operacional é derivado das colunas-base + a data ATUAL (REGRA 10): a fronteira
 * EM_ATRASO/NAO_ENTREGUE acompanha o dia de hoje, sem depender do valor
 * congelado na importação. A coluna `operationalStatus` permanece gravada apenas
 * para auditoria.
 *
 * Mantém as funções consumidas pelo dashboard principal
 * (getPendingPurchasesCount / getPendingPurchases / getPurchasesByMonth).
 */
import { Prisma, PurchaseOperationalStatus, PurchaseStatus, PurchaseType } from "@prisma/client";
import { cache } from "react";
import { prisma } from "@/lib/prisma";
import { getPurchaseRecordReferenceDate, resolvePurchaseValue } from "@/utils/purchases-normalizer";
import {
  PURCHASE_OPERATIONAL_STATUS_COLORS,
  PURCHASE_OPERATIONAL_STATUS_LABELS,
  resolveOperationalStatusFromFlags,
  type PurchaseKind
} from "@/utils/purchase-classification";
import { getTodayDate } from "@/utils/date";
import type { PendingPurchaseData, PurchasesByMonthData } from "@/types/dashboard";
import type {
  CompletedPurchasesPageData,
  PaginatedPurchases,
  PendingPurchasesPageData,
  PurchaseFilterOptions,
  PurchaseGroupCount,
  PurchaseKindFilter,
  PurchaseKpis,
  PurchaseMonthlyPoint,
  PurchaseProcessRankItem,
  PurchaseProcessTimes,
  PurchaseQueryParams,
  PurchaseRequesterCount,
  PurchaseRow,
  PurchaseStatusSlice,
  PurchaseSupplierSlice
} from "@/types/purchases";

const DEFAULT_PAGE_SIZE = 50;
const OS = PurchaseOperationalStatus;

const PENDING_Y01_STATUSES: PurchaseOperationalStatus[] = [OS.PENDENTE_COMPRA, OS.EM_ATRASO, OS.NAO_ENTREGUE];

/** Início do dia atual em UTC — referência da comparação de atraso (dia-calendário). */
function startOfTodayUtc(today: Date): Date {
  return new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));
}

/* ------------------------------------------------------------------ */
/* Predicados de status (dinâmicos por data)                          */
/* ------------------------------------------------------------------ */

/** Base de análise Y01: não bloqueado, não serviço, não Y04. */
const Y01_BASE: Prisma.PurchaseRecordWhereInput = {
  isBlocked: false,
  isService: false,
  NOT: { purchaseType: PurchaseType.REGULARIZACAO }
};

/** Cláusula Prisma para um status operacional, com a data atual. */
function statusWhere(status: PurchaseOperationalStatus, today: Date): Prisma.PurchaseRecordWhereInput {
  const startToday = startOfTodayUtc(today);
  switch (status) {
    case OS.BLOQUEADO:
      return { isBlocked: true };
    case OS.SERVICO:
      return { isService: true, isBlocked: false };
    case OS.REGULARIZACAO:
      return { isBlocked: false, isService: false, purchaseType: PurchaseType.REGULARIZACAO };
    case OS.RECEBIDO:
      return { ...Y01_BASE, receiptDate: { not: null }, isLateReceived: false };
    case OS.RECEBIDO_COM_ATRASO:
      return { ...Y01_BASE, receiptDate: { not: null }, isLateReceived: true };
    case OS.PENDENTE_COMPRA:
      return { ...Y01_BASE, receiptDate: null, hasPurchaseOrder: false };
    case OS.EM_ATRASO:
      return { ...Y01_BASE, receiptDate: null, hasPurchaseOrder: true, expectedDeliveryDate: { lt: startToday } };
    case OS.NAO_ENTREGUE:
      return {
        ...Y01_BASE,
        receiptDate: null,
        hasPurchaseOrder: true,
        OR: [{ expectedDeliveryDate: null }, { expectedDeliveryDate: { gte: startToday } }]
      };
    default:
      return {};
  }
}

/* ------------------------------------------------------------------ */
/* WHERE builders                                                     */
/* ------------------------------------------------------------------ */

function buildDateRange(params: PurchaseQueryParams): Prisma.DateTimeFilter | null {
  if (!params.startDate && !params.endDate) {
    return null;
  }
  const range: Prisma.DateTimeFilter = {};
  if (params.startDate) {
    range.gte = new Date(`${params.startDate}T00:00:00.000Z`);
  }
  if (params.endDate) {
    range.lte = new Date(`${params.endDate}T23:59:59.999Z`);
  }
  return range;
}

/** Filtros do usuário (sem escopo de página e sem "Tipo"). AND entre grupos; OR no grupo. */
function buildFilterWhere(params: PurchaseQueryParams = {}, today: Date): Prisma.PurchaseRecordWhereInput {
  const and: Prisma.PurchaseRecordWhereInput[] = [];

  const range = buildDateRange(params);
  if (range) {
    if (params.dateField) {
      and.push({ [params.dateField]: range } as Prisma.PurchaseRecordWhereInput);
    } else {
      and.push({
        OR: [
          { purchaseOrderDate: range },
          { purchaseOrderDate: null, requisitionDate: range },
          { purchaseOrderDate: null, requisitionDate: null, expectedDeliveryDate: range }
        ]
      });
    }
  }

  if (params.suppliers?.length) {
    and.push({ supplierName: { in: params.suppliers } });
  }
  if (params.categories?.length) {
    and.push({ goodsGroupCode: { in: params.categories } });
  }
  if (params.purchasingGroups?.length) {
    and.push({ purchasingGroup: { in: params.purchasingGroups } });
  }
  if (params.requesters?.length) {
    and.push({ requester: { in: params.requesters } });
  }
  if (params.statuses?.length) {
    and.push({ OR: params.statuses.map((status) => statusWhere(status, today)) });
  }

  const term = params.search?.trim();
  if (term) {
    and.push({
      OR: [
        { itemDescription: { contains: term, mode: "insensitive" } },
        { materialCode: { contains: term, mode: "insensitive" } },
        { supplierName: { contains: term, mode: "insensitive" } },
        { requisitionNumber: { contains: term, mode: "insensitive" } },
        { purchaseOrderNumber: { contains: term, mode: "insensitive" } }
      ]
    });
  }

  return and.length ? { AND: and } : {};
}

/** Escopo do filtro "Tipo" para a página de pendentes. */
function kindScopePending(kinds?: PurchaseKindFilter[]): Prisma.PurchaseRecordWhereInput {
  if (!kinds?.length) {
    return { isService: false, isBlocked: false }; // Y01 + Y04 pendentes
  }
  return { OR: kinds.map(mapKind) };
}

/** Escopo do filtro "Tipo" para a página de realizadas. */
function kindScopeCompleted(kinds?: PurchaseKindFilter[]): Prisma.PurchaseRecordWhereInput {
  if (!kinds?.length) {
    return { isBlocked: false };
  }
  return { OR: kinds.map(mapKind) };
}

function mapKind(kind: PurchaseKindFilter): Prisma.PurchaseRecordWhereInput {
  switch (kind) {
    case "material":
      return { isService: false, isBlocked: false, NOT: { purchaseType: PurchaseType.REGULARIZACAO } };
    case "servico":
      return { isService: true, isBlocked: false };
    case "regularizacao":
      return { purchaseType: PurchaseType.REGULARIZACAO, isService: false, isBlocked: false };
    case "bloqueado":
      return { isBlocked: true };
    default:
      return {};
  }
}

function mergeWhere(...clauses: Prisma.PurchaseRecordWhereInput[]): Prisma.PurchaseRecordWhereInput {
  return { AND: clauses };
}

function pendingWhere(params: PurchaseQueryParams, today: Date): Prisma.PurchaseRecordWhereInput {
  return mergeWhere(buildFilterWhere(params, today), { receiptDate: null }, kindScopePending(params.kinds));
}

function completedWhere(params: PurchaseQueryParams, today: Date): Prisma.PurchaseRecordWhereInput {
  return mergeWhere(buildFilterWhere(params, today), { receiptDate: { not: null } }, kindScopeCompleted(params.kinds));
}

/* ------------------------------------------------------------------ */
/* Soma de valor (Total liq, fallback Total bruto)                    */
/* ------------------------------------------------------------------ */

async function sumPurchaseValue(where: Prisma.PurchaseRecordWhereInput): Promise<number> {
  const [net, gross] = await Promise.all([
    prisma.purchaseRecord.aggregate({
      _sum: { netTotal: true },
      where: mergeWhere(where, { NOT: [{ netTotal: null }, { netTotal: 0 }] })
    }),
    prisma.purchaseRecord.aggregate({
      _sum: { grossTotal: true },
      where: mergeWhere(where, { OR: [{ netTotal: null }, { netTotal: 0 }] })
    })
  ]);
  return round((net._sum.netTotal ?? 0) + (gross._sum.grossTotal ?? 0));
}

/* ------------------------------------------------------------------ */
/* Resumo canônico (KPIs) — REGRA 15                                  */
/* ------------------------------------------------------------------ */

export const getPurchaseSummary = cache(async (params: PurchaseQueryParams = {}): Promise<PurchaseKpis> => {
  const today = getTodayDate();
  const base = buildFilterWhere(params, today);
  const y01 = mergeWhere(base, Y01_BASE);
  const count = (where: Prisma.PurchaseRecordWhereInput) => prisma.purchaseRecord.count({ where });

  const [
    received,
    receivedLate,
    openPending,
    pendingPurchase,
    lateOpen,
    regularizationsY04,
    regReceived,
    services,
    svcReceived,
    blocked,
    totalValue,
    pendingValue,
    receivedValue
  ] = await Promise.all([
    count(mergeWhere(y01, { receiptDate: { not: null } })),
    count(mergeWhere(y01, { receiptDate: { not: null }, isLateReceived: true })),
    count(mergeWhere(y01, { receiptDate: null })),
    count(mergeWhere(base, statusWhere(OS.PENDENTE_COMPRA, today))),
    count(mergeWhere(base, statusWhere(OS.EM_ATRASO, today))),
    count(mergeWhere(base, statusWhere(OS.REGULARIZACAO, today))),
    count(mergeWhere(base, statusWhere(OS.REGULARIZACAO, today), { receiptDate: { not: null } })),
    count(mergeWhere(base, statusWhere(OS.SERVICO, today))),
    count(mergeWhere(base, statusWhere(OS.SERVICO, today), { receiptDate: { not: null } })),
    count(mergeWhere(base, { isBlocked: true })),
    sumPurchaseValue(mergeWhere(base, { isBlocked: false })),
    sumPurchaseValue(mergeWhere(y01, { receiptDate: null })),
    sumPurchaseValue(mergeWhere(base, { receiptDate: { not: null }, isBlocked: false }))
  ]);

  const receivedOnTime = received - receivedLate;
  const notDelivered = Math.max(0, openPending - pendingPurchase - lateOpen);
  const baseY01 = received + openPending;

  return {
    totalRecords: baseY01 + services + regularizationsY04,
    baseY01,
    received,
    receivedOnTime,
    receivedLate,
    pendingPurchase,
    lateOpen,
    notDelivered,
    totalPending: pendingPurchase + lateOpen + notDelivered,
    regularizationsY04,
    regularizationsY04Received: regReceived,
    services,
    servicesReceived: svcReceived,
    blocked,
    totalValue,
    pendingValue,
    receivedValue
  };
});

/* ------------------------------------------------------------------ */
/* Listagens paginadas                                                */
/* ------------------------------------------------------------------ */

const rowSelect = {
  id: true,
  purchaseOrderNumber: true,
  requisitionNumber: true,
  supplierName: true,
  materialCode: true,
  itemDescription: true,
  quantity: true,
  pendingQuantity: true,
  unit: true,
  netTotal: true,
  grossTotal: true,
  requisitionDate: true,
  purchaseOrderDate: true,
  expectedDeliveryDate: true,
  receiptDate: true,
  isService: true,
  isBlocked: true,
  isLateReceived: true,
  hasPurchaseOrder: true,
  delayDays: true,
  purchasingGroup: true,
  purchaseType: true,
  goodsGroupCode: true,
  goodsGroupDescription: true,
  itemNature: true,
  requester: true
} satisfies Prisma.PurchaseRecordSelect;

type RowRecord = Prisma.PurchaseRecordGetPayload<{ select: typeof rowSelect }>;

function purchaseKindFromType(type: PurchaseType): PurchaseKind {
  if (type === PurchaseType.NORMAL) return "Y01_NORMAL";
  if (type === PurchaseType.REGULARIZACAO) return "Y04_REGULARIZACAO";
  return "OUTROS";
}

function toRow(record: RowRecord, today: Date): PurchaseRow {
  const operationalStatus = resolveOperationalStatusFromFlags(
    {
      isBlocked: record.isBlocked,
      isService: record.isService,
      purchaseType: record.purchaseType,
      hasPurchaseOrder: record.hasPurchaseOrder,
      receiptDate: record.receiptDate,
      expectedDeliveryDate: record.expectedDeliveryDate,
      isLateReceived: record.isLateReceived
    },
    today
  );
  return {
    id: record.id,
    purchaseOrderNumber: record.purchaseOrderNumber,
    requisitionNumber: record.requisitionNumber,
    supplierName: record.supplierName,
    materialCode: record.materialCode,
    itemDescription: record.itemDescription,
    quantity: record.quantity,
    pendingQuantity: record.pendingQuantity,
    unit: record.unit,
    value: resolvePurchaseValue(record.netTotal, record.grossTotal),
    requisitionDate: toIso(record.requisitionDate),
    purchaseOrderDate: toIso(record.purchaseOrderDate),
    expectedDeliveryDate: toIso(record.expectedDeliveryDate),
    receiptDate: toIso(record.receiptDate),
    operationalStatus,
    statusLabel: PURCHASE_OPERATIONAL_STATUS_LABELS[operationalStatus],
    isService: record.isService,
    isBlocked: record.isBlocked,
    isRegularization: record.purchaseType === PurchaseType.REGULARIZACAO,
    purchaseKind: purchaseKindFromType(record.purchaseType),
    delayDays: record.delayDays,
    hasPurchaseOrder: record.hasPurchaseOrder,
    purchasingGroup: record.purchasingGroup,
    purchaseType: record.purchaseType,
    goodsGroupCode: record.goodsGroupCode,
    goodsGroupDescription: record.goodsGroupDescription,
    itemNature: record.itemNature,
    requester: record.requester
  };
}

async function paginate(
  where: Prisma.PurchaseRecordWhereInput,
  params: PurchaseQueryParams,
  today: Date,
  orderBy: Prisma.PurchaseRecordOrderByWithRelationInput[]
): Promise<PaginatedPurchases> {
  const page = Math.max(1, params.page ?? 1);
  const pageSize = clampPageSize(params.pageSize);

  const [total, records] = await Promise.all([
    prisma.purchaseRecord.count({ where }),
    prisma.purchaseRecord.findMany({ where, orderBy, skip: (page - 1) * pageSize, take: pageSize, select: rowSelect })
  ]);

  return {
    data: records.map((record) => toRow(record, today)),
    total,
    page,
    pageSize,
    totalPages: Math.max(1, Math.ceil(total / pageSize))
  };
}

/** Compras pendentes (paginadas) — REGRA 11. */
export async function getPendingPurchasesList(params: PurchaseQueryParams = {}, today: Date = getTodayDate()): Promise<PaginatedPurchases> {
  return paginate(pendingWhere(params, today), params, today, [{ expectedDeliveryDate: "asc" }, { requisitionDate: "desc" }]);
}

/** Compras realizadas (paginadas) — REGRA 12. */
export async function getCompletedPurchasesList(params: PurchaseQueryParams = {}, today: Date = getTodayDate()): Promise<PaginatedPurchases> {
  return paginate(completedWhere(params, today), params, today, [{ receiptDate: "desc" }]);
}

/* ------------------------------------------------------------------ */
/* Carregadores memoizados (1 varredura por escopo/request)           */
/* ------------------------------------------------------------------ */

const analysisSelect = {
  supplierName: true,
  requester: true,
  goodsGroupCode: true,
  goodsGroupDescription: true,
  expectedDeliveryDate: true,
  receiptDate: true,
  netTotal: true,
  grossTotal: true,
  isService: true,
  isBlocked: true,
  hasPurchaseOrder: true,
  isLateReceived: true,
  purchaseType: true
} satisfies Prisma.PurchaseRecordSelect;

type AnalysisRow = Prisma.PurchaseRecordGetPayload<{ select: typeof analysisSelect }>;

type StatusFlags = {
  isBlocked: boolean;
  isService: boolean;
  purchaseType: PurchaseType;
  hasPurchaseOrder: boolean;
  receiptDate: Date | null;
  expectedDeliveryDate: Date | null;
  isLateReceived: boolean;
};

function effStatus(row: StatusFlags, today: Date): PurchaseOperationalStatus {
  return resolveOperationalStatusFromFlags(row, today);
}

const loadPendingAnalysisRows = cache(async (params: PurchaseQueryParams = {}): Promise<AnalysisRow[]> =>
  prisma.purchaseRecord.findMany({
    where: mergeWhere(buildFilterWhere(params, getTodayDate()), { receiptDate: null, isBlocked: false }),
    select: analysisSelect
  })
);

const loadCompletedAnalysisRows = cache(async (params: PurchaseQueryParams = {}): Promise<AnalysisRow[]> =>
  prisma.purchaseRecord.findMany({
    where: mergeWhere(buildFilterWhere(params, getTodayDate()), { receiptDate: { not: null }, isBlocked: false }),
    select: analysisSelect
  })
);

/** Y04 (todas, recebidas ou não) — gráfico de Regularização por grupo. */
const loadRegularizationRows = cache(async (params: PurchaseQueryParams = {}): Promise<AnalysisRow[]> =>
  prisma.purchaseRecord.findMany({
    where: mergeWhere(buildFilterWhere(params, getTodayDate()), {
      isBlocked: false,
      isService: false,
      purchaseType: PurchaseType.REGULARIZACAO
    }),
    select: analysisSelect
  })
);

/* ------------------------------------------------------------------ */
/* Agregadores em memória                                             */
/* ------------------------------------------------------------------ */

function valueOf(record: AnalysisRow): number {
  return resolvePurchaseValue(record.netTotal, record.grossTotal) ?? 0;
}

function bucketByMonth(records: AnalysisRow[], field: "expectedDeliveryDate" | "receiptDate"): PurchaseMonthlyPoint[] {
  const totals = new Map<string, { value: number; count: number }>();
  for (const record of records) {
    const date = record[field];
    if (!date) continue;
    const key = `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
    const entry = totals.get(key) ?? { value: 0, count: 0 };
    entry.value += valueOf(record);
    entry.count += 1;
    totals.set(key, entry);
  }
  return Array.from(totals.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([period, entry]) => {
      const [year, month] = period.split("-").map(Number);
      const label = new Date(Date.UTC(year, month - 1, 1))
        .toLocaleDateString("pt-BR", { month: "short", year: "2-digit", timeZone: "UTC" })
        .replace(".", "");
      return { period, label: label.charAt(0).toUpperCase() + label.slice(1), value: round(entry.value), count: entry.count };
    });
}

function topSuppliersByCount(records: AnalysisRow[], limit = 7): PurchaseSupplierSlice[] {
  const totals = new Map<string, { totalValue: number; count: number }>();
  for (const record of records) {
    if (!record.supplierName) continue;
    const entry = totals.get(record.supplierName) ?? { totalValue: 0, count: 0 };
    entry.totalValue += valueOf(record);
    entry.count += 1;
    totals.set(record.supplierName, entry);
  }
  return Array.from(totals.entries())
    .map(([supplierName, entry]) => ({ supplierName, totalValue: round(entry.totalValue), count: entry.count }))
    .sort((a, b) => b.count - a.count || b.totalValue - a.totalValue)
    .slice(0, limit);
}

function groupCountByGoodsGroup(records: AnalysisRow[], limit = 12): PurchaseGroupCount[] {
  const totals = new Map<string, PurchaseGroupCount>();
  for (const record of records) {
    const code = record.goodsGroupCode ?? "—";
    const entry = totals.get(code) ?? { code, description: record.goodsGroupDescription ?? code, count: 0 };
    entry.count += 1;
    if (!entry.description || entry.description === code) {
      entry.description = record.goodsGroupDescription ?? code;
    }
    totals.set(code, entry);
  }
  return Array.from(totals.values())
    .sort((a, b) => b.count - a.count)
    .slice(0, limit);
}

function topRequesters(records: AnalysisRow[], limit = 7): PurchaseRequesterCount[] {
  const totals = new Map<string, number>();
  for (const record of records) {
    if (!record.requester) continue;
    totals.set(record.requester, (totals.get(record.requester) ?? 0) + 1);
  }
  return Array.from(totals.entries())
    .map(([requester, count]) => ({ requester, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, limit);
}

function statusDistribution(records: AnalysisRow[], today: Date, statuses: PurchaseOperationalStatus[]): PurchaseStatusSlice[] {
  const counts = new Map<PurchaseOperationalStatus, number>();
  for (const record of records) {
    const status = effStatus(record, today);
    counts.set(status, (counts.get(status) ?? 0) + 1);
  }
  return statuses
    .map((status) => ({
      status,
      label: PURCHASE_OPERATIONAL_STATUS_LABELS[status],
      count: counts.get(status) ?? 0,
      color: PURCHASE_OPERATIONAL_STATUS_COLORS[status]
    }))
    .filter((slice) => slice.count > 0);
}

/* ------------------------------------------------------------------ */
/* Tempos de processo (mantido — bônus em Realizadas)                 */
/* ------------------------------------------------------------------ */

export async function getPurchaseProcessTimes(params: PurchaseQueryParams = {}): Promise<PurchaseProcessTimes> {
  const base = mergeWhere(buildFilterWhere(params, getTodayDate()), { isBlocked: false });
  const [averages, slowestReqToOrder, slowestTotal] = await Promise.all([
    prisma.purchaseRecord.aggregate({
      where: base,
      _avg: { requisitionToOrderDays: true, orderToReceiptDays: true, migoToMiroDays: true, totalProcessDays: true }
    }),
    prisma.purchaseRecord.findMany({
      where: mergeWhere(base, { requisitionToOrderDays: { not: null } }),
      orderBy: { requisitionToOrderDays: "desc" },
      take: 10,
      select: { id: true, purchaseOrderNumber: true, requisitionNumber: true, supplierName: true, itemDescription: true, requisitionToOrderDays: true }
    }),
    prisma.purchaseRecord.findMany({
      where: mergeWhere(base, { totalProcessDays: { not: null } }),
      orderBy: { totalProcessDays: "desc" },
      take: 10,
      select: { id: true, purchaseOrderNumber: true, requisitionNumber: true, supplierName: true, itemDescription: true, totalProcessDays: true }
    })
  ]);

  const toRank = (
    record: { id: string; purchaseOrderNumber: string | null; requisitionNumber: string | null; supplierName: string | null; itemDescription: string },
    days: number | null
  ): PurchaseProcessRankItem => ({
    id: record.id,
    reference: record.purchaseOrderNumber ?? record.requisitionNumber ?? "—",
    supplierName: record.supplierName,
    itemDescription: record.itemDescription,
    days: days ?? 0
  });

  return {
    averageRequisitionToOrderDays: roundOrNull(averages._avg.requisitionToOrderDays),
    averageOrderToReceiptDays: roundOrNull(averages._avg.orderToReceiptDays),
    averageMigoToMiroDays: roundOrNull(averages._avg.migoToMiroDays),
    averageTotalProcessDays: roundOrNull(averages._avg.totalProcessDays),
    slowestRequisitionToOrder: slowestReqToOrder.map((record) => toRank(record, record.requisitionToOrderDays)),
    slowestTotalProcess: slowestTotal.map((record) => toRank(record, record.totalProcessDays))
  };
}

/* ------------------------------------------------------------------ */
/* Opções de filtro                                                   */
/* ------------------------------------------------------------------ */

export async function getPurchaseFilterOptions(): Promise<PurchaseFilterOptions> {
  const [suppliers, categories, purchasingGroups, requesters, range] = await Promise.all([
    prisma.purchaseRecord.findMany({ where: { supplierName: { not: null } }, select: { supplierName: true }, distinct: ["supplierName"], orderBy: { supplierName: "asc" } }),
    prisma.purchaseRecord.findMany({ where: { goodsGroupCode: { not: null } }, select: { goodsGroupCode: true, goodsGroupDescription: true }, distinct: ["goodsGroupCode"], orderBy: { goodsGroupCode: "asc" } }),
    prisma.purchaseRecord.findMany({ where: { purchasingGroup: { not: null } }, select: { purchasingGroup: true }, distinct: ["purchasingGroup"], orderBy: { purchasingGroup: "asc" } }),
    prisma.purchaseRecord.findMany({ where: { requester: { not: null } }, select: { requester: true }, distinct: ["requester"], orderBy: { requester: "asc" } }),
    prisma.purchaseRecord.aggregate({ _min: { requisitionDate: true, purchaseOrderDate: true }, _max: { requisitionDate: true, purchaseOrderDate: true } })
  ]);

  const minYear = minDate(range._min.purchaseOrderDate, range._min.requisitionDate)?.getUTCFullYear();
  const maxYear = maxDate(range._max.purchaseOrderDate, range._max.requisitionDate)?.getUTCFullYear();
  const years: number[] = [];
  if (minYear && maxYear) {
    for (let year = maxYear; year >= minYear; year -= 1) years.push(year);
  }

  return {
    suppliers: suppliers.map((item) => item.supplierName!).filter(Boolean).map((name) => ({ value: name, label: name })),
    categories: categories
      .filter((item) => item.goodsGroupCode)
      .map((item) => ({ value: item.goodsGroupCode!, label: item.goodsGroupDescription ? `${item.goodsGroupCode} — ${item.goodsGroupDescription}` : item.goodsGroupCode! })),
    purchasingGroups: purchasingGroups.map((item) => item.purchasingGroup!).filter(Boolean).map((group) => ({ value: group, label: group })),
    requesters: requesters.map((item) => item.requester!).filter(Boolean),
    statuses: [
      OS.EM_ATRASO,
      OS.PENDENTE_COMPRA,
      OS.NAO_ENTREGUE,
      OS.RECEBIDO,
      OS.RECEBIDO_COM_ATRASO,
      OS.REGULARIZACAO,
      OS.SERVICO,
      OS.BLOQUEADO
    ],
    years
  };
}

/* ------------------------------------------------------------------ */
/* Dashboard principal — assinaturas preservadas                      */
/* ------------------------------------------------------------------ */

/** Quantidade de compras pendentes Y01 (KPI do dashboard). */
export async function getPendingPurchasesCount(): Promise<number> {
  const today = getTodayDate();
  return prisma.purchaseRecord.count({
    where: { OR: PENDING_Y01_STATUSES.map((status) => statusWhere(status, today)) }
  });
}

/** Lista de compras pendentes para a tabela do dashboard. */
export async function getPendingPurchases(limit = 5): Promise<PendingPurchaseData[]> {
  const today = getTodayDate();
  const records = await prisma.purchaseRecord.findMany({
    where: { OR: PENDING_Y01_STATUSES.map((status) => statusWhere(status, today)) },
    select: { itemDescription: true, supplierName: true, expectedDeliveryDate: true, netTotal: true, grossTotal: true, hasPurchaseOrder: true, receiptDate: true, isService: true, isBlocked: true, isLateReceived: true, purchaseType: true },
    orderBy: [{ expectedDeliveryDate: "asc" }, { requisitionDate: "desc" }],
    take: limit
  });

  return records.map((record) => ({
    item: record.itemDescription,
    supplier: record.supplierName,
    expectedDate: record.expectedDeliveryDate,
    totalValue: resolvePurchaseValue(record.netTotal, record.grossTotal),
    status: effStatus(record, today) === OS.EM_ATRASO ? PurchaseStatus.ATRASADA : PurchaseStatus.SOLICITADA
  }));
}

/** Total de compras por mês (R$) de um ano — alimenta "Compras por mês". */
export async function getPurchasesByMonth(year: number): Promise<PurchasesByMonthData[]> {
  const start = new Date(Date.UTC(year, 0, 1, 0, 0, 0, 0));
  const end = new Date(Date.UTC(year, 11, 31, 23, 59, 59, 999));
  const records = await prisma.purchaseRecord.findMany({
    where: mergeWhere(
      { isBlocked: false },
      {
        OR: [
          { purchaseOrderDate: { gte: start, lte: end } },
          { purchaseOrderDate: null, requisitionDate: { gte: start, lte: end } },
          { purchaseOrderDate: null, requisitionDate: null, expectedDeliveryDate: { gte: start, lte: end } }
        ]
      }
    ),
    select: { purchaseOrderDate: true, requisitionDate: true, expectedDeliveryDate: true, netTotal: true, grossTotal: true }
  });

  const totals = Array.from({ length: 12 }, (_, index) => ({ month: index + 1, value: 0 }));
  for (const record of records) {
    const reference = getPurchaseRecordReferenceDate(record);
    if (reference) {
      totals[reference.getUTCMonth()].value += resolvePurchaseValue(record.netTotal, record.grossTotal) ?? 0;
    }
  }
  return totals.map((item) => ({ ...item, value: round(item.value) }));
}

/* ------------------------------------------------------------------ */
/* Orquestradores de página                                           */
/* ------------------------------------------------------------------ */

export async function getPendingPurchasesPageData(params: PurchaseQueryParams = {}): Promise<PendingPurchasesPageData> {
  const today = getTodayDate();
  const total = await prisma.purchaseRecord.count();
  const period = resolvePeriodWindow(params);
  if (total === 0) {
    return {
      period,
      kpis: emptyKpis(),
      lateByMonth: [],
      topLateSuppliers: [],
      pendingByGoodsGroup: [],
      statusDistribution: [],
      topRequesters: [],
      purchases: emptyPage(params),
      filterOptions: emptyFilterOptions(),
      source: "empty"
    };
  }

  const [kpis, analysisRows, purchases, filterOptions] = await Promise.all([
    getPurchaseSummary(params),
    loadPendingAnalysisRows(params),
    getPendingPurchasesList(params, today),
    getPurchaseFilterOptions()
  ]);

  const lateRows = analysisRows.filter((row) => effStatus(row, today) === OS.EM_ATRASO);
  const pendingForGroups = analysisRows.filter((row) => {
    const status = effStatus(row, today);
    return PENDING_Y01_STATUSES.includes(status) || status === OS.REGULARIZACAO;
  });
  const pendingY01Rows = analysisRows.filter((row) => PENDING_Y01_STATUSES.includes(effStatus(row, today)));

  return {
    period,
    kpis,
    lateByMonth: bucketByMonth(lateRows, "expectedDeliveryDate"),
    topLateSuppliers: topSuppliersByCount(lateRows),
    pendingByGoodsGroup: groupCountByGoodsGroup(pendingForGroups),
    statusDistribution: statusDistribution(analysisRows, today, PENDING_Y01_STATUSES),
    topRequesters: topRequesters(pendingY01Rows),
    purchases,
    filterOptions,
    source: "database"
  };
}

export async function getCompletedPurchasesPageData(params: PurchaseQueryParams = {}): Promise<CompletedPurchasesPageData> {
  const today = getTodayDate();
  const total = await prisma.purchaseRecord.count();
  const period = resolvePeriodWindow(params);
  if (total === 0) {
    return {
      period,
      kpis: emptyKpis(),
      receivedByMonth: [],
      receivedLateByMonth: [],
      topDelayedReceiptSuppliers: [],
      receivedByGoodsGroup: [],
      regularizationByGoodsGroup: [],
      processTimes: emptyProcessTimes(),
      purchases: emptyPage(params),
      filterOptions: emptyFilterOptions(),
      source: "empty"
    };
  }

  const [kpis, receivedRows, regularizationRows, processTimes, purchases, filterOptions] = await Promise.all([
    getPurchaseSummary(params),
    loadCompletedAnalysisRows(params),
    loadRegularizationRows(params),
    getPurchaseProcessTimes(params),
    getCompletedPurchasesList(params, today),
    getPurchaseFilterOptions()
  ]);

  const lateReceived = receivedRows.filter((row) => effStatus(row, today) === OS.RECEBIDO_COM_ATRASO);

  return {
    period,
    kpis,
    receivedByMonth: bucketByMonth(receivedRows, "receiptDate"),
    receivedLateByMonth: bucketByMonth(lateReceived, "receiptDate"),
    topDelayedReceiptSuppliers: topSuppliersByCount(lateReceived),
    receivedByGoodsGroup: groupCountByGoodsGroup(receivedRows),
    regularizationByGoodsGroup: groupCountByGoodsGroup(regularizationRows),
    processTimes,
    purchases,
    filterOptions,
    source: "database"
  };
}

/* ------------------------------------------------------------------ */
/* Helpers                                                            */
/* ------------------------------------------------------------------ */

function resolvePeriodWindow(params: PurchaseQueryParams): { startDate: string; endDate: string } {
  return { startDate: params.startDate ?? "", endDate: params.endDate ?? "" };
}

function clampPageSize(value?: number): number {
  const allowed = [25, 50, 100];
  return value && allowed.includes(value) ? value : DEFAULT_PAGE_SIZE;
}

function toIso(date: Date | null): string | null {
  return date ? date.toISOString() : null;
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}

function roundOrNull(value: number | null): number | null {
  return value === null ? null : round(value);
}

function minDate(a: Date | null, b: Date | null): Date | null {
  if (!a) return b;
  if (!b) return a;
  return a < b ? a : b;
}

function maxDate(a: Date | null, b: Date | null): Date | null {
  if (!a) return b;
  if (!b) return a;
  return a > b ? a : b;
}

function emptyKpis(): PurchaseKpis {
  return {
    totalRecords: 0,
    baseY01: 0,
    received: 0,
    receivedOnTime: 0,
    receivedLate: 0,
    pendingPurchase: 0,
    lateOpen: 0,
    notDelivered: 0,
    totalPending: 0,
    regularizationsY04: 0,
    regularizationsY04Received: 0,
    services: 0,
    servicesReceived: 0,
    blocked: 0,
    totalValue: 0,
    pendingValue: 0,
    receivedValue: 0
  };
}

function emptyPage(params: PurchaseQueryParams): PaginatedPurchases {
  return { data: [], total: 0, page: Math.max(1, params.page ?? 1), pageSize: clampPageSize(params.pageSize), totalPages: 1 };
}

function emptyProcessTimes(): PurchaseProcessTimes {
  return {
    averageRequisitionToOrderDays: null,
    averageOrderToReceiptDays: null,
    averageMigoToMiroDays: null,
    averageTotalProcessDays: null,
    slowestRequisitionToOrder: [],
    slowestTotalProcess: []
  };
}

function emptyFilterOptions(): PurchaseFilterOptions {
  return { suppliers: [], categories: [], purchasingGroups: [], requesters: [], statuses: [], years: [] };
}
