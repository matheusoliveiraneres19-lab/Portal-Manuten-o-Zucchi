/**
 * Service de Compras — FONTE ÚNICA dos indicadores de compras do portal.
 *
 * Lê SEMPRE de PurchaseRecord (planilha SAP/Fiori importada). Itens bloqueados
 * (ignored = true) NUNCA entram em indicadores/gráficos/tabelas principais.
 *
 * Mantém as 3 funções consumidas pelo dashboard principal
 * (getPendingPurchasesCount / getPendingPurchases / getPurchasesByMonth) com a
 * mesma assinatura — o dashboard continua idêntico, agora alimentado pela nova
 * base. As demais funções alimentam as páginas Compras Pendentes/Realizadas.
 */
import { ItemNature, Prisma, PurchaseStatus, PurchaseType } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { resolvePurchaseValue, purchaseStatusLabel, ITEM_NATURE_LABELS } from "@/utils/purchases-normalizer";
import { toInputDate } from "@/utils/period";
import type { PendingPurchaseData, PurchasesByMonthData } from "@/types/dashboard";
import type {
  CompletedPurchasesPageData,
  LatePurchaseRow,
  LatePurchasesResult,
  PaginatedPurchases,
  PendingPurchasesPageData,
  PurchaseCategoryRow,
  PurchaseFilterOptions,
  PurchaseKpis,
  PurchaseMonthlyPoint,
  PurchaseNatureSlice,
  PurchaseProcessRankItem,
  PurchaseProcessTimes,
  PurchaseQueryParams,
  PurchaseRow,
  PurchaseSupplierSlice,
  PurchaseValueByOrder,
  RegularizationVsNormal,
  ServicesAnalysis
} from "@/types/purchases";

const DEFAULT_PAGE_SIZE = 50;
const NATURE_COLORS: Record<ItemNature, string> = {
  MATERIAL: "#0f4d68",
  SERVICO: "#c49a45"
};

/* ------------------------------------------------------------------ */
/* WHERE builders (filtros no banco)                                  */
/* ------------------------------------------------------------------ */

/** Cláusula base: sempre exclui itens bloqueados/ignorados + aplica filtros. */
function buildBaseWhere(params: PurchaseQueryParams = {}): Prisma.PurchaseRecordWhereInput {
  const where: Prisma.PurchaseRecordWhereInput = { ignored: false };
  const and: Prisma.PurchaseRecordWhereInput[] = [];

  if (params.startDate || params.endDate) {
    const range: Prisma.DateTimeFilter = {};
    if (params.startDate) {
      range.gte = new Date(`${params.startDate}T00:00:00.000Z`);
    }
    if (params.endDate) {
      range.lte = new Date(`${params.endDate}T23:59:59.999Z`);
    }
    // Período sobre a data do pedido; sem pedido, cai para a data da requisição.
    and.push({
      OR: [{ purchaseOrderDate: range }, { purchaseOrderDate: null, requisitionDate: range }]
    });
  }

  if (params.requisition) {
    where.requisitionNumber = { contains: params.requisition, mode: "insensitive" };
  }
  if (params.purchaseOrder) {
    where.purchaseOrderNumber = { contains: params.purchaseOrder, mode: "insensitive" };
  }
  if (params.supplier) {
    where.supplierName = { contains: params.supplier, mode: "insensitive" };
  }
  if (params.category) {
    where.goodsGroupCode = params.category;
  }
  if (params.purchaseType) {
    where.purchaseType = params.purchaseType;
  }
  if (params.nature) {
    where.itemNature = params.nature;
  }
  if (params.requester) {
    where.requester = params.requester;
  }
  if (params.material) {
    and.push({
      OR: [
        { materialCode: { contains: params.material, mode: "insensitive" } },
        { itemDescription: { contains: params.material, mode: "insensitive" } }
      ]
    });
  }
  if (params.search) {
    const term = params.search.trim();
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
  }

  if (and.length) {
    where.AND = and;
  }
  return where;
}

/** Compra concluída: pedido criado + recebida + MIRO lançada. */
const COMPLETED_CLAUSE: Prisma.PurchaseRecordWhereInput = {
  hasPurchaseOrder: true,
  isReceiptCompleted: true,
  hasMiro: true
};

/** Compra pendente: sem pedido OU sem recebimento OU sem MIRO. */
const PENDING_CLAUSE: Prisma.PurchaseRecordWhereInput = {
  OR: [{ hasPurchaseOrder: false }, { isReceiptCompleted: false }, { hasMiro: false }]
};

/** Aplica o filtro de status específico da página de pendentes. */
function pendingStatusClause(params: PurchaseQueryParams): Prisma.PurchaseRecordWhereInput {
  switch (params.pendingStatus) {
    case "sem-pedido":
      return { hasPurchaseOrder: false };
    case "pendente-migo":
      return { hasPurchaseOrder: true, hasMigo: false };
    case "pendente-miro":
      return { hasMiro: false };
    case "atrasado":
      return { isLateOpen: true };
    case "recebido-atraso":
      return { isLateReceived: true };
    default:
      return PENDING_CLAUSE;
  }
}

function mergeWhere(...clauses: Prisma.PurchaseRecordWhereInput[]): Prisma.PurchaseRecordWhereInput {
  return { AND: clauses };
}

/* ------------------------------------------------------------------ */
/* Soma de valor (Total liq, fallback Total bruto) sem coalesce no SQL */
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
/* Dashboard principal — assinaturas preservadas                      */
/* ------------------------------------------------------------------ */

/** Quantidade de compras pendentes (KPI "Compras Pendentes" do dashboard). */
export async function getPendingPurchasesCount(): Promise<number> {
  return prisma.purchaseRecord.count({ where: mergeWhere(buildBaseWhere(), PENDING_CLAUSE) });
}

/** Lista de compras pendentes para a tabela do dashboard. */
export async function getPendingPurchases(limit = 5): Promise<PendingPurchaseData[]> {
  const records = await prisma.purchaseRecord.findMany({
    where: mergeWhere(buildBaseWhere(), PENDING_CLAUSE),
    select: {
      itemDescription: true,
      supplierName: true,
      expectedDeliveryDate: true,
      netTotal: true,
      grossTotal: true,
      isLateOpen: true
    },
    orderBy: [{ isLateOpen: "desc" }, { expectedDeliveryDate: "asc" }],
    take: limit
  });

  return records.map((record) => ({
    item: record.itemDescription,
    supplier: record.supplierName,
    expectedDate: record.expectedDeliveryDate,
    totalValue: resolvePurchaseValue(record.netTotal, record.grossTotal),
    status: record.isLateOpen ? PurchaseStatus.ATRASADA : PurchaseStatus.SOLICITADA
  }));
}

/** Total de compras por mês (R$) de um ano — alimenta "Compras por mês". */
export async function getPurchasesByMonth(year: number): Promise<PurchasesByMonthData[]> {
  const start = new Date(Date.UTC(year, 0, 1, 0, 0, 0, 0));
  const end = new Date(Date.UTC(year, 11, 31, 23, 59, 59, 999));
  const records = await prisma.purchaseRecord.findMany({
    where: mergeWhere(buildBaseWhere(), {
      OR: [
        { purchaseOrderDate: { gte: start, lte: end } },
        { purchaseOrderDate: null, requisitionDate: { gte: start, lte: end } }
      ]
    }),
    select: { purchaseOrderDate: true, requisitionDate: true, netTotal: true, grossTotal: true }
  });

  const totals = Array.from({ length: 12 }, (_, index) => ({ month: index + 1, value: 0 }));
  for (const record of records) {
    const reference = record.purchaseOrderDate ?? record.requisitionDate;
    if (reference) {
      totals[reference.getUTCMonth()].value += resolvePurchaseValue(record.netTotal, record.grossTotal) ?? 0;
    }
  }
  return totals.map((item) => ({ ...item, value: round(item.value) }));
}

/* ------------------------------------------------------------------ */
/* TAREFA 4.1 — KPIs                                                  */
/* ------------------------------------------------------------------ */

export async function getPurchasesDashboardKPIs(params: PurchaseQueryParams = {}): Promise<PurchaseKpis> {
  const base = buildBaseWhere(params);
  const count = (clause: Prisma.PurchaseRecordWhereInput) =>
    prisma.purchaseRecord.count({ where: mergeWhere(base, clause) });

  const [
    totalRecords,
    requisitionsWithoutPurchaseOrder,
    requisitionsWithPurchaseOrder,
    completedWithMigo,
    completedWithMiro,
    lateOpenOrders,
    lateReceivedOrders,
    regularizationsY04,
    normalPurchasesY01,
    totalServices,
    totalMaterials,
    pendingServices,
    totalValue,
    pendingValue,
    averages
  ] = await Promise.all([
    prisma.purchaseRecord.count({ where: base }),
    count({ hasPurchaseOrder: false }),
    count({ hasPurchaseOrder: true }),
    count({ hasMigo: true }),
    count({ hasMiro: true }),
    count({ isLateOpen: true }),
    count({ isLateReceived: true }),
    count({ purchaseType: PurchaseType.REGULARIZACAO }),
    count({ purchaseType: PurchaseType.NORMAL }),
    count({ itemNature: ItemNature.SERVICO }),
    count({ itemNature: ItemNature.MATERIAL }),
    count(mergeWhere(PENDING_CLAUSE, { itemNature: ItemNature.SERVICO })),
    sumPurchaseValue(base),
    sumPurchaseValue(mergeWhere(base, PENDING_CLAUSE)),
    prisma.purchaseRecord.aggregate({
      where: base,
      _avg: {
        requisitionToOrderDays: true,
        orderToReceiptDays: true,
        migoToMiroDays: true,
        totalProcessDays: true
      }
    })
  ]);

  return {
    totalRecords,
    requisitionsWithoutPurchaseOrder,
    requisitionsWithPurchaseOrder,
    completedWithMigo,
    completedWithMiro,
    lateOrders: lateOpenOrders + lateReceivedOrders,
    lateOpenOrders,
    lateReceivedOrders,
    regularizationsY04,
    normalPurchasesY01,
    totalValue,
    totalServices,
    totalMaterials,
    pendingValue,
    pendingServices,
    averageRequisitionToOrderDays: roundOrNull(averages._avg.requisitionToOrderDays),
    averageOrderToReceiptDays: roundOrNull(averages._avg.orderToReceiptDays),
    averageMigoToMiroDays: roundOrNull(averages._avg.migoToMiroDays),
    averageTotalProcessDays: roundOrNull(averages._avg.totalProcessDays)
  };
}

/* ------------------------------------------------------------------ */
/* TAREFA 4.2/4.3 — Listagens paginadas (pendentes / realizadas)      */
/* ------------------------------------------------------------------ */

const rowSelect = {
  id: true,
  purchaseOrderNumber: true,
  requisitionNumber: true,
  supplierName: true,
  materialCode: true,
  itemDescription: true,
  quantity: true,
  unit: true,
  netTotal: true,
  grossTotal: true,
  requisitionDate: true,
  purchaseOrderDate: true,
  expectedDeliveryDate: true,
  receiptDate: true,
  migoNumber: true,
  miroNumber: true,
  hasMigo: true,
  hasMiro: true,
  hasPurchaseOrder: true,
  isReceiptCompleted: true,
  isLateOpen: true,
  isLateReceived: true,
  delayDays: true,
  purchasingGroup: true,
  purchaseType: true,
  goodsGroupCode: true,
  goodsGroupDescription: true,
  itemNature: true,
  requester: true
} satisfies Prisma.PurchaseRecordSelect;

type RowRecord = Prisma.PurchaseRecordGetPayload<{ select: typeof rowSelect }>;

function toRow(record: RowRecord): PurchaseRow {
  return {
    id: record.id,
    purchaseOrderNumber: record.purchaseOrderNumber,
    requisitionNumber: record.requisitionNumber,
    supplierName: record.supplierName,
    materialCode: record.materialCode,
    itemDescription: record.itemDescription,
    quantity: record.quantity,
    unit: record.unit,
    value: resolvePurchaseValue(record.netTotal, record.grossTotal),
    requisitionDate: toIso(record.requisitionDate),
    purchaseOrderDate: toIso(record.purchaseOrderDate),
    expectedDeliveryDate: toIso(record.expectedDeliveryDate),
    receiptDate: toIso(record.receiptDate),
    migoNumber: record.migoNumber,
    miroNumber: record.miroNumber,
    hasMigo: record.hasMigo,
    hasMiro: record.hasMiro,
    hasPurchaseOrder: record.hasPurchaseOrder,
    isReceiptCompleted: record.isReceiptCompleted,
    isLateOpen: record.isLateOpen,
    isLateReceived: record.isLateReceived,
    delayDays: record.delayDays,
    purchasingGroup: record.purchasingGroup,
    purchaseType: record.purchaseType,
    goodsGroupCode: record.goodsGroupCode,
    goodsGroupDescription: record.goodsGroupDescription,
    itemNature: record.itemNature,
    requester: record.requester,
    statusLabel: purchaseStatusLabel(record)
  };
}

async function paginate(
  where: Prisma.PurchaseRecordWhereInput,
  params: PurchaseQueryParams,
  orderBy: Prisma.PurchaseRecordOrderByWithRelationInput[]
): Promise<PaginatedPurchases> {
  const page = Math.max(1, params.page ?? 1);
  const pageSize = clampPageSize(params.pageSize);

  const [total, records] = await Promise.all([
    prisma.purchaseRecord.count({ where }),
    prisma.purchaseRecord.findMany({
      where,
      orderBy,
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: rowSelect
    })
  ]);

  return {
    data: records.map(toRow),
    total,
    page,
    pageSize,
    totalPages: Math.max(1, Math.ceil(total / pageSize))
  };
}

/** TAREFA 4.2 — Compras pendentes (paginadas). */
export async function getPendingPurchasesList(params: PurchaseQueryParams = {}): Promise<PaginatedPurchases> {
  const where = mergeWhere(buildBaseWhere(params), pendingStatusClause(params));
  return paginate(where, params, [
    { isLateOpen: "desc" },
    { expectedDeliveryDate: "asc" },
    { requisitionDate: "desc" }
  ]);
}

/** TAREFA 4.3 — Compras realizadas/concluídas (paginadas). */
export async function getCompletedPurchasesList(params: PurchaseQueryParams = {}): Promise<PaginatedPurchases> {
  const where = mergeWhere(buildBaseWhere(params), COMPLETED_CLAUSE);
  return paginate(where, params, [{ purchaseOrderDate: "desc" }, { miroNumber: "desc" }]);
}

/* ------------------------------------------------------------------ */
/* TAREFA 4.4 — Valor por pedido                                      */
/* ------------------------------------------------------------------ */

export async function getPurchaseValuesByOrder(params: PurchaseQueryParams = {}, limit = 100): Promise<PurchaseValueByOrder[]> {
  const records = await prisma.purchaseRecord.findMany({
    where: mergeWhere(buildBaseWhere(params), { hasPurchaseOrder: true }),
    select: {
      purchaseOrderNumber: true,
      supplierName: true,
      netTotal: true,
      grossTotal: true,
      isReceiptCompleted: true,
      hasMiro: true
    }
  });

  const byOrder = new Map<string, PurchaseValueByOrder & { _completed: number; _total: number }>();
  for (const record of records) {
    const key = record.purchaseOrderNumber ?? "—";
    const entry =
      byOrder.get(key) ??
      ({
        purchaseOrderNumber: key,
        supplierName: record.supplierName,
        totalValue: 0,
        itemCount: 0,
        status: "",
        _completed: 0,
        _total: 0
      } as PurchaseValueByOrder & { _completed: number; _total: number });
    entry.totalValue += resolvePurchaseValue(record.netTotal, record.grossTotal) ?? 0;
    entry.itemCount += 1;
    entry._total += 1;
    if (record.isReceiptCompleted && record.hasMiro) {
      entry._completed += 1;
    }
    if (!entry.supplierName && record.supplierName) {
      entry.supplierName = record.supplierName;
    }
    byOrder.set(key, entry);
  }

  return Array.from(byOrder.values())
    .map((entry) => ({
      purchaseOrderNumber: entry.purchaseOrderNumber,
      supplierName: entry.supplierName,
      totalValue: round(entry.totalValue),
      itemCount: entry.itemCount,
      status: entry._completed === entry._total ? "Concluído" : entry._completed > 0 ? "Parcial" : "Em aberto"
    }))
    .sort((a, b) => b.totalValue - a.totalValue)
    .slice(0, limit);
}

/* ------------------------------------------------------------------ */
/* TAREFA 4.5 — Compras por categoria (Grupo Merc)                    */
/* ------------------------------------------------------------------ */

export async function getPurchasesByCategory(params: PurchaseQueryParams = {}): Promise<PurchaseCategoryRow[]> {
  const records = await prisma.purchaseRecord.findMany({
    where: buildBaseWhere(params),
    select: {
      goodsGroupCode: true,
      goodsGroupDescription: true,
      purchaseType: true,
      itemNature: true,
      netTotal: true,
      grossTotal: true
    }
  });

  const byCategory = new Map<string, PurchaseCategoryRow>();
  for (const record of records) {
    const code = record.goodsGroupCode ?? "—";
    const entry =
      byCategory.get(code) ??
      ({
        code,
        description: record.goodsGroupDescription ?? code,
        quantity: 0,
        totalValue: 0,
        regularizationCount: 0,
        regularizationValue: 0,
        normalPurchaseCount: 0,
        normalPurchaseValue: 0,
        servicesCount: 0,
        materialsCount: 0
      } as PurchaseCategoryRow);

    const value = resolvePurchaseValue(record.netTotal, record.grossTotal) ?? 0;
    entry.quantity += 1;
    entry.totalValue += value;
    if (record.purchaseType === PurchaseType.REGULARIZACAO) {
      entry.regularizationCount += 1;
      entry.regularizationValue += value;
    } else if (record.purchaseType === PurchaseType.NORMAL) {
      entry.normalPurchaseCount += 1;
      entry.normalPurchaseValue += value;
    }
    if (record.itemNature === ItemNature.SERVICO) {
      entry.servicesCount += 1;
    } else {
      entry.materialsCount += 1;
    }
    if (!entry.description || entry.description === code) {
      entry.description = record.goodsGroupDescription ?? code;
    }
    byCategory.set(code, entry);
  }

  return Array.from(byCategory.values())
    .map((entry) => ({
      ...entry,
      totalValue: round(entry.totalValue),
      regularizationValue: round(entry.regularizationValue),
      normalPurchaseValue: round(entry.normalPurchaseValue)
    }))
    .sort((a, b) => b.totalValue - a.totalValue);
}

/* ------------------------------------------------------------------ */
/* TAREFA 4.6 — Regularizações x compras normais                      */
/* ------------------------------------------------------------------ */

export async function getRegularizationVsNormal(params: PurchaseQueryParams = {}): Promise<RegularizationVsNormal> {
  const records = await prisma.purchaseRecord.findMany({
    where: buildBaseWhere(params),
    select: { purchaseType: true, netTotal: true, grossTotal: true }
  });

  const totals = {
    regularizationCount: 0,
    regularizationValue: 0,
    normalCount: 0,
    normalValue: 0,
    otherCount: 0,
    otherValue: 0
  };

  for (const record of records) {
    const value = resolvePurchaseValue(record.netTotal, record.grossTotal) ?? 0;
    if (record.purchaseType === PurchaseType.REGULARIZACAO) {
      totals.regularizationCount += 1;
      totals.regularizationValue += value;
    } else if (record.purchaseType === PurchaseType.NORMAL) {
      totals.normalCount += 1;
      totals.normalValue += value;
    } else {
      totals.otherCount += 1;
      totals.otherValue += value;
    }
  }

  const totalCount = totals.regularizationCount + totals.normalCount + totals.otherCount;
  return {
    regularizationCount: totals.regularizationCount,
    regularizationValue: round(totals.regularizationValue),
    normalCount: totals.normalCount,
    normalValue: round(totals.normalValue),
    otherCount: totals.otherCount,
    otherValue: round(totals.otherValue),
    regularizationPercent: totalCount ? roundPercent((totals.regularizationCount / totalCount) * 100) : 0,
    normalPercent: totalCount ? roundPercent((totals.normalCount / totalCount) * 100) : 0
  };
}

/* ------------------------------------------------------------------ */
/* TAREFA 4.7 — Análise de serviços                                   */
/* ------------------------------------------------------------------ */

export async function getServicesAnalysis(params: PurchaseQueryParams = {}): Promise<ServicesAnalysis> {
  const where = mergeWhere(buildBaseWhere(params), { itemNature: ItemNature.SERVICO });
  const records = await prisma.purchaseRecord.findMany({
    where,
    select: {
      supplierName: true,
      netTotal: true,
      grossTotal: true,
      hasPurchaseOrder: true,
      isReceiptCompleted: true,
      hasMiro: true
    }
  });

  let serviceValue = 0;
  let pendingServices = 0;
  let completedServices = 0;
  let servicesWithMiro = 0;
  const supplierTotals = new Map<string, { totalValue: number; count: number }>();

  for (const record of records) {
    const value = resolvePurchaseValue(record.netTotal, record.grossTotal) ?? 0;
    serviceValue += value;
    const completed = record.hasPurchaseOrder && record.isReceiptCompleted && record.hasMiro;
    if (completed) {
      completedServices += 1;
    } else {
      pendingServices += 1;
    }
    if (record.hasMiro) {
      servicesWithMiro += 1;
    }
    if (record.supplierName) {
      const entry = supplierTotals.get(record.supplierName) ?? { totalValue: 0, count: 0 };
      entry.totalValue += value;
      entry.count += 1;
      supplierTotals.set(record.supplierName, entry);
    }
  }

  const topServiceSuppliers = Array.from(supplierTotals.entries())
    .map(([supplierName, entry]) => ({ supplierName, totalValue: round(entry.totalValue), count: entry.count }))
    .sort((a, b) => b.totalValue - a.totalValue)
    .slice(0, 10);

  return {
    totalServices: records.length,
    serviceValue: round(serviceValue),
    pendingServices,
    completedServices,
    servicesWithMiro,
    servicesWithoutMiro: records.length - servicesWithMiro,
    topServiceSuppliers
  };
}

/* ------------------------------------------------------------------ */
/* TAREFA 4.8 — Atrasos                                               */
/* ------------------------------------------------------------------ */

export async function getLatePurchases(params: PurchaseQueryParams = {}, limit = 50): Promise<LatePurchasesResult> {
  const base = buildBaseWhere(params);
  const select = {
    id: true,
    purchaseOrderNumber: true,
    supplierName: true,
    itemDescription: true,
    expectedDeliveryDate: true,
    receiptDate: true,
    migoDate: true,
    delayDays: true,
    netTotal: true,
    grossTotal: true
  } satisfies Prisma.PurchaseRecordSelect;

  const [open, received] = await Promise.all([
    prisma.purchaseRecord.findMany({
      where: mergeWhere(base, { isLateOpen: true }),
      orderBy: { delayDays: "desc" },
      take: limit,
      select
    }),
    prisma.purchaseRecord.findMany({
      where: mergeWhere(base, { isLateReceived: true }),
      orderBy: { delayDays: "desc" },
      take: limit,
      select
    })
  ]);

  const toLateRow = (record: (typeof open)[number], kind: LatePurchaseRow["kind"]): LatePurchaseRow => ({
    id: record.id,
    purchaseOrderNumber: record.purchaseOrderNumber,
    supplierName: record.supplierName,
    itemDescription: record.itemDescription,
    expectedDeliveryDate: toIso(record.expectedDeliveryDate),
    receiptDate: toIso(record.receiptDate),
    migoDate: toIso(record.migoDate),
    delayDays: record.delayDays,
    value: resolvePurchaseValue(record.netTotal, record.grossTotal),
    kind
  });

  return {
    lateOpen: open.map((record) => toLateRow(record, "aberto")),
    lateReceived: received.map((record) => toLateRow(record, "recebido-atraso"))
  };
}

/* ------------------------------------------------------------------ */
/* TAREFA 4.9 — Tempos de processo                                    */
/* ------------------------------------------------------------------ */

export async function getPurchaseProcessTimes(params: PurchaseQueryParams = {}): Promise<PurchaseProcessTimes> {
  const base = buildBaseWhere(params);
  const [averages, slowestReqToOrder, slowestTotal] = await Promise.all([
    prisma.purchaseRecord.aggregate({
      where: base,
      _avg: {
        requisitionToOrderDays: true,
        orderToReceiptDays: true,
        migoToMiroDays: true,
        totalProcessDays: true
      }
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

  const toRank = (record: { id: string; purchaseOrderNumber: string | null; requisitionNumber: string | null; supplierName: string | null; itemDescription: string }, days: number | null): PurchaseProcessRankItem => ({
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
/* Gráficos auxiliares (mês, natureza, top fornecedores)              */
/* ------------------------------------------------------------------ */

async function getMonthlyPurchaseValue(params: PurchaseQueryParams = {}): Promise<PurchaseMonthlyPoint[]> {
  const records = await prisma.purchaseRecord.findMany({
    where: buildBaseWhere(params),
    select: { purchaseOrderDate: true, requisitionDate: true, netTotal: true, grossTotal: true }
  });

  const totals = new Map<string, number>();
  for (const record of records) {
    const reference = record.purchaseOrderDate ?? record.requisitionDate;
    if (!reference) {
      continue;
    }
    const key = `${reference.getUTCFullYear()}-${String(reference.getUTCMonth() + 1).padStart(2, "0")}`;
    totals.set(key, (totals.get(key) ?? 0) + (resolvePurchaseValue(record.netTotal, record.grossTotal) ?? 0));
  }

  return Array.from(totals.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([period, value]) => {
      const [year, month] = period.split("-").map(Number);
      const label = new Date(Date.UTC(year, month - 1, 1))
        .toLocaleDateString("pt-BR", { month: "short", year: "2-digit", timeZone: "UTC" })
        .replace(".", "");
      return { period, label: label.charAt(0).toUpperCase() + label.slice(1), value: round(value) };
    });
}

async function getNatureDistribution(params: PurchaseQueryParams = {}): Promise<PurchaseNatureSlice[]> {
  const records = await prisma.purchaseRecord.findMany({
    where: buildBaseWhere(params),
    select: { itemNature: true, netTotal: true, grossTotal: true }
  });

  const totals = new Map<ItemNature, { value: number; count: number }>();
  for (const record of records) {
    const entry = totals.get(record.itemNature) ?? { value: 0, count: 0 };
    entry.value += resolvePurchaseValue(record.netTotal, record.grossTotal) ?? 0;
    entry.count += 1;
    totals.set(record.itemNature, entry);
  }

  return ([ItemNature.MATERIAL, ItemNature.SERVICO] as ItemNature[])
    .map((nature) => {
      const entry = totals.get(nature) ?? { value: 0, count: 0 };
      return {
        nature,
        label: ITEM_NATURE_LABELS[nature],
        value: round(entry.value),
        count: entry.count,
        color: NATURE_COLORS[nature]
      };
    })
    .filter((slice) => slice.count > 0);
}

async function getTopSuppliers(params: PurchaseQueryParams = {}, limit = 10): Promise<PurchaseSupplierSlice[]> {
  const records = await prisma.purchaseRecord.findMany({
    where: mergeWhere(buildBaseWhere(params), { supplierName: { not: null } }),
    select: { supplierName: true, netTotal: true, grossTotal: true }
  });

  const totals = new Map<string, { totalValue: number; count: number }>();
  for (const record of records) {
    const name = record.supplierName!;
    const entry = totals.get(name) ?? { totalValue: 0, count: 0 };
    entry.totalValue += resolvePurchaseValue(record.netTotal, record.grossTotal) ?? 0;
    entry.count += 1;
    totals.set(name, entry);
  }

  return Array.from(totals.entries())
    .map(([supplierName, entry]) => ({ supplierName, totalValue: round(entry.totalValue), count: entry.count }))
    .sort((a, b) => b.totalValue - a.totalValue)
    .slice(0, limit);
}

/* ------------------------------------------------------------------ */
/* Opções de filtro                                                   */
/* ------------------------------------------------------------------ */

export async function getPurchaseFilterOptions(): Promise<PurchaseFilterOptions> {
  const [suppliers, categories, requesters, range] = await Promise.all([
    prisma.purchaseRecord.findMany({
      where: { ignored: false, supplierName: { not: null } },
      select: { supplierName: true },
      distinct: ["supplierName"],
      orderBy: { supplierName: "asc" }
    }),
    prisma.purchaseRecord.findMany({
      where: { ignored: false, goodsGroupCode: { not: null } },
      select: { goodsGroupCode: true, goodsGroupDescription: true },
      distinct: ["goodsGroupCode"],
      orderBy: { goodsGroupCode: "asc" }
    }),
    prisma.purchaseRecord.findMany({
      where: { ignored: false, requester: { not: null } },
      select: { requester: true },
      distinct: ["requester"],
      orderBy: { requester: "asc" }
    }),
    prisma.purchaseRecord.aggregate({
      where: { ignored: false },
      _min: { requisitionDate: true, purchaseOrderDate: true },
      _max: { requisitionDate: true, purchaseOrderDate: true }
    })
  ]);

  const minYear = minDate(range._min.purchaseOrderDate, range._min.requisitionDate)?.getUTCFullYear();
  const maxYear = maxDate(range._max.purchaseOrderDate, range._max.requisitionDate)?.getUTCFullYear();
  const years: number[] = [];
  if (minYear && maxYear) {
    for (let year = maxYear; year >= minYear; year -= 1) {
      years.push(year);
    }
  }

  return {
    suppliers: suppliers
      .map((item) => item.supplierName!)
      .filter(Boolean)
      .map((name) => ({ value: name, label: name })),
    categories: categories
      .filter((item) => item.goodsGroupCode)
      .map((item) => ({
        value: item.goodsGroupCode!,
        label: item.goodsGroupDescription ? `${item.goodsGroupCode} — ${item.goodsGroupDescription}` : item.goodsGroupCode!
      })),
    requesters: requesters.map((item) => item.requester!).filter(Boolean),
    purchaseTypes: [PurchaseType.NORMAL, PurchaseType.REGULARIZACAO, PurchaseType.OUTROS],
    natures: [ItemNature.MATERIAL, ItemNature.SERVICO],
    years
  };
}

/* ------------------------------------------------------------------ */
/* Orquestradores de página                                           */
/* ------------------------------------------------------------------ */

export async function getPendingPurchasesPageData(params: PurchaseQueryParams = {}): Promise<PendingPurchasesPageData> {
  const total = await prisma.purchaseRecord.count({ where: { ignored: false } });
  const period = resolvePeriodWindow(params);
  if (total === 0) {
    return { period, kpis: emptyKpis(), late: { lateOpen: [], lateReceived: [] }, purchases: emptyPage(params), filterOptions: emptyFilterOptions(), source: "empty" };
  }

  const [kpis, late, purchases, filterOptions] = await Promise.all([
    getPurchasesDashboardKPIs(params),
    getLatePurchases(params),
    getPendingPurchasesList(params),
    getPurchaseFilterOptions()
  ]);

  return { period, kpis, late, purchases, filterOptions, source: "database" };
}

export async function getCompletedPurchasesPageData(params: PurchaseQueryParams = {}): Promise<CompletedPurchasesPageData> {
  const total = await prisma.purchaseRecord.count({ where: { ignored: false } });
  const period = resolvePeriodWindow(params);
  if (total === 0) {
    return {
      period,
      kpis: emptyKpis(),
      monthly: [],
      byCategory: [],
      regularizationVsNormal: emptyRegularization(),
      natureDistribution: [],
      topSuppliers: [],
      processTimes: emptyProcessTimes(),
      purchases: emptyPage(params),
      filterOptions: emptyFilterOptions(),
      source: "empty"
    };
  }

  const [kpis, monthly, byCategory, regularizationVsNormal, natureDistribution, topSuppliers, processTimes, purchases, filterOptions] =
    await Promise.all([
      getPurchasesDashboardKPIs(params),
      getMonthlyPurchaseValue(params),
      getPurchasesByCategory(params),
      getRegularizationVsNormal(params),
      getNatureDistribution(params),
      getTopSuppliers(params),
      getPurchaseProcessTimes(params),
      getCompletedPurchasesList(params),
      getPurchaseFilterOptions()
    ]);

  return {
    period,
    kpis,
    monthly,
    byCategory: byCategory.slice(0, 12),
    regularizationVsNormal,
    natureDistribution,
    topSuppliers,
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

function roundPercent(value: number): number {
  return Number(value.toFixed(1));
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
    requisitionsWithoutPurchaseOrder: 0,
    requisitionsWithPurchaseOrder: 0,
    completedWithMigo: 0,
    completedWithMiro: 0,
    lateOrders: 0,
    lateOpenOrders: 0,
    lateReceivedOrders: 0,
    regularizationsY04: 0,
    normalPurchasesY01: 0,
    totalValue: 0,
    totalServices: 0,
    totalMaterials: 0,
    pendingValue: 0,
    pendingServices: 0,
    averageRequisitionToOrderDays: null,
    averageOrderToReceiptDays: null,
    averageMigoToMiroDays: null,
    averageTotalProcessDays: null
  };
}

function emptyPage(params: PurchaseQueryParams): PaginatedPurchases {
  return { data: [], total: 0, page: Math.max(1, params.page ?? 1), pageSize: clampPageSize(params.pageSize), totalPages: 1 };
}

function emptyRegularization(): RegularizationVsNormal {
  return {
    regularizationCount: 0,
    regularizationValue: 0,
    normalCount: 0,
    normalValue: 0,
    otherCount: 0,
    otherValue: 0,
    regularizationPercent: 0,
    normalPercent: 0
  };
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
  return {
    suppliers: [],
    categories: [],
    requesters: [],
    purchaseTypes: [PurchaseType.NORMAL, PurchaseType.REGULARIZACAO, PurchaseType.OUTROS],
    natures: [ItemNature.MATERIAL, ItemNature.SERVICO],
    years: []
  };
}
