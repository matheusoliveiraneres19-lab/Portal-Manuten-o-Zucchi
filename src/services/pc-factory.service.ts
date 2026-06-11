import { cache } from "react";
import { PcFactoryStatus, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  FAILURE_STATUSES,
  PC_FACTORY_STATUS_COLORS,
  PC_FACTORY_STATUS_LABELS,
  PC_FACTORY_STATUS_ORDER,
  STOPPED_STATUSES
} from "@/utils/pc-factory-normalizer";
import type {
  PcFactoryDashboardSummary,
  PcFactoryFilterOptions,
  PcFactoryKpis,
  PcFactoryPageData,
  PcFactoryProductionLineRow,
  PcFactoryQueryParams,
  PcFactoryRecordRow,
  PcFactoryRecordsResult,
  PcFactoryReferencePeriod,
  PcFactoryRecommendation,
  PcFactoryResourceDetails,
  PcFactoryResourceRow,
  PcFactoryStatusSlice,
  PcFactoryTopResource,
  PcFactoryTrendPoint
} from "@/types/pc-factory";

const DEFAULT_PAGE_SIZE = 50;
const STOPPED_SET = new Set<PcFactoryStatus>(STOPPED_STATUSES);
const FAILURE_SET = new Set<PcFactoryStatus>(FAILURE_STATUSES);

/* ------------------------------------------------------------------ */
/* Where + carregamento de registros para análise                    */
/* ------------------------------------------------------------------ */

function buildWhere(params: PcFactoryQueryParams): Prisma.PcFactoryRecordWhereInput {
  const where: Prisma.PcFactoryRecordWhereInput = {};

  if (params.resources?.length) {
    where.resourceName = { in: params.resources };
  }
  if (params.productionLines?.length) {
    where.productionLine = { in: params.productionLines };
  }
  if (params.sectors?.length) {
    where.sector = { in: params.sectors };
  }
  if (params.shifts?.length) {
    where.shift = { in: params.shifts };
  }
  if (params.statuses?.length) {
    where.statusNormalized = { in: params.statuses };
  }
  if (params.startDate || params.endDate) {
    where.startDateTime = {};
    if (params.startDate) {
      where.startDateTime.gte = new Date(`${params.startDate}T00:00:00.000Z`);
    }
    if (params.endDate) {
      where.startDateTime.lte = new Date(`${params.endDate}T23:59:59.999Z`);
    }
  }
  if (params.search) {
    const term = params.search.trim();
    if (term) {
      where.OR = [
        { resourceName: { contains: term, mode: "insensitive" } },
        { resourceCode: { contains: term, mode: "insensitive" } },
        { productionLine: { contains: term, mode: "insensitive" } },
        { orderNumber: { contains: term, mode: "insensitive" } },
        { productDescription: { contains: term, mode: "insensitive" } }
      ];
    }
  }

  return where;
}

type AnalyticsRecord = {
  resourceName: string;
  resourceCode: string | null;
  productionLine: string | null;
  sector: string | null;
  statusNormalized: PcFactoryStatus;
  durationHours: number;
  startDateTime: Date | null;
};

// `cache` deduplica a carga de registros filtrados dentro do MESMO render. O
// orquestrador da página cria UM objeto `params` e o repassa a todas as
// sub-funções; assim a varredura roda uma única vez (padrão dos Lubrificantes).
const loadRecords = cache(async (params: PcFactoryQueryParams): Promise<AnalyticsRecord[]> => {
  return prisma.pcFactoryRecord.findMany({
    where: buildWhere(params),
    select: {
      resourceName: true,
      resourceCode: true,
      productionLine: true,
      sector: true,
      statusNormalized: true,
      durationHours: true,
      startDateTime: true
    }
  });
});

/* ------------------------------------------------------------------ */
/* Agregações puras                                                   */
/* ------------------------------------------------------------------ */

type HoursAggregate = {
  byStatus: Map<PcFactoryStatus, number>;
  total: number;
  production: number;
  stopped: number;
  maintenance: number;
  setup: number;
  waiting: number;
  failureCount: number;
  maintenanceEvents: number;
};

function aggregateHours(records: AnalyticsRecord[]): HoursAggregate {
  const byStatus = new Map<PcFactoryStatus, number>();
  let total = 0;
  let production = 0;
  let stopped = 0;
  let maintenance = 0;
  let setup = 0;
  let waiting = 0;
  let failureCount = 0;
  let maintenanceEvents = 0;

  for (const record of records) {
    const hours = Number.isFinite(record.durationHours) ? record.durationHours : 0;
    total += hours;
    byStatus.set(record.statusNormalized, (byStatus.get(record.statusNormalized) ?? 0) + hours);

    switch (record.statusNormalized) {
      case PcFactoryStatus.PRODUCAO:
        production += hours;
        break;
      case PcFactoryStatus.MANUTENCAO:
        maintenance += hours;
        maintenanceEvents += 1;
        break;
      case PcFactoryStatus.SETUP:
        setup += hours;
        break;
      default:
        break;
    }

    if (STOPPED_SET.has(record.statusNormalized)) {
      stopped += hours;
    }
    if (record.statusNormalized === PcFactoryStatus.AGUARDANDO) {
      waiting += hours;
    }
    if (FAILURE_SET.has(record.statusNormalized)) {
      failureCount += 1;
    }
  }

  return {
    byStatus,
    total: round(total),
    production: round(production),
    stopped: round(stopped),
    maintenance: round(maintenance),
    setup: round(setup),
    waiting: round(waiting),
    failureCount,
    maintenanceEvents
  };
}

function availability(total: number, stopped: number, maintenance: number): number | null {
  if (total <= 0) return null;
  return clampPercent(((total - stopped - maintenance) / total) * 100);
}

function utilization(total: number, production: number): number | null {
  if (total <= 0) return null;
  return clampPercent((production / total) * 100);
}

function maintenanceImpact(total: number, maintenance: number): number | null {
  if (total <= 0) return null;
  return clampPercent((maintenance / total) * 100);
}

/** MTBF = tempo operacional (produção) / nº de eventos de falha (parada+manutenção). */
function mtbf(productionHours: number, failureCount: number): number | null {
  return failureCount > 0 ? safeRound(productionHours / failureCount) : null;
}

/** MTTR = horas em manutenção / nº de eventos de manutenção. */
function mttr(maintenanceHours: number, maintenanceEvents: number): number | null {
  return maintenanceEvents > 0 ? safeRound(maintenanceHours / maintenanceEvents) : null;
}

/** MTTF = tempo em produção / nº de eventos de manutenção (tempo médio até falha). */
function mttf(productionHours: number, maintenanceEvents: number): number | null {
  return maintenanceEvents > 0 ? safeRound(productionHours / maintenanceEvents) : null;
}

/* ------------------------------------------------------------------ */
/* Agrupamento por recurso                                            */
/* ------------------------------------------------------------------ */

function buildResourceRanking(records: AnalyticsRecord[]): PcFactoryResourceRow[] {
  const groups = new Map<string, AnalyticsRecord[]>();
  for (const record of records) {
    const key = record.resourceName;
    const list = groups.get(key);
    if (list) {
      list.push(record);
    } else {
      groups.set(key, [record]);
    }
  }

  const rows: PcFactoryResourceRow[] = [];
  for (const [resourceName, list] of Array.from(groups.entries())) {
    const agg = aggregateHours(list);
    const sample = list.find((item) => item.resourceCode) ?? list[0];
    const line = list.find((item) => item.productionLine)?.productionLine ?? null;

    rows.push({
      resourceName,
      resourceCode: sample.resourceCode ?? null,
      productionLine: line,
      productionHours: agg.production,
      stoppedHours: agg.stopped,
      maintenanceHours: agg.maintenance,
      totalHours: agg.total,
      availabilityPercent: availability(agg.total, agg.stopped, agg.maintenance),
      utilizationPercent: utilization(agg.total, agg.production),
      mtbf: mtbf(agg.production, agg.failureCount),
      mttr: mttr(agg.maintenance, agg.maintenanceEvents),
      failureCount: agg.failureCount
    });
  }

  return rows.sort((a, b) => b.totalHours - a.totalHours);
}

function topResource(rows: PcFactoryResourceRow[], pick: (row: PcFactoryResourceRow) => number): PcFactoryTopResource {
  let best: PcFactoryResourceRow | null = null;
  let bestValue = 0;
  for (const row of rows) {
    const value = pick(row);
    if (value > bestValue) {
      bestValue = value;
      best = row;
    }
  }
  return best && bestValue > 0
    ? { resourceName: best.resourceName, resourceCode: best.resourceCode, hours: round(bestValue) }
    : null;
}

/* ------------------------------------------------------------------ */
/* 1. KPIs                                                            */
/* ------------------------------------------------------------------ */

export async function getPcFactoryDashboardKPIs(params: PcFactoryQueryParams): Promise<PcFactoryKpis> {
  const records = await loadRecords(params);
  const agg = aggregateHours(records);
  const ranking = buildResourceRanking(records);

  const resourceNames = new Set(records.map((record) => record.resourceName));
  const productionLines = new Set(records.map((record) => record.productionLine).filter(Boolean) as string[]);

  return {
    totalRecords: records.length,
    totalResources: resourceNames.size,
    totalProductionLines: productionLines.size,
    totalAnalyzedHours: agg.total,
    productionHours: agg.production,
    stoppedHours: agg.stopped,
    maintenanceHours: agg.maintenance,
    setupHours: agg.setup,
    waitingHours: agg.waiting,
    availabilityPercent: availability(agg.total, agg.stopped, agg.maintenance),
    utilizationPercent: utilization(agg.total, agg.production),
    maintenanceImpactPercent: maintenanceImpact(agg.total, agg.maintenance),
    mtbf: mtbf(agg.production, agg.failureCount),
    mttr: mttr(agg.maintenance, agg.maintenanceEvents),
    mttf: mttf(agg.production, agg.maintenanceEvents),
    topStoppedResource: topResource(ranking, (row) => row.stoppedHours),
    topMaintenanceResource: topResource(ranking, (row) => row.maintenanceHours),
    topFailureResource: topResource(ranking, (row) => row.failureCount)
  };
}

/* ------------------------------------------------------------------ */
/* 2. Distribuição por status                                         */
/* ------------------------------------------------------------------ */

export async function getPcFactoryStatusDistribution(params: PcFactoryQueryParams): Promise<PcFactoryStatusSlice[]> {
  const records = await loadRecords(params);
  return statusDistributionFromAggregate(aggregateHours(records));
}

function statusDistributionFromAggregate(agg: HoursAggregate): PcFactoryStatusSlice[] {
  return PC_FACTORY_STATUS_ORDER.map((status) => {
    const totalHours = round(agg.byStatus.get(status) ?? 0);
    return {
      status,
      label: PC_FACTORY_STATUS_LABELS[status],
      color: PC_FACTORY_STATUS_COLORS[status],
      totalHours,
      percent: agg.total > 0 ? clampPercent((totalHours / agg.total) * 100) ?? 0 : 0
    };
  }).filter((slice) => slice.totalHours > 0);
}

/* ------------------------------------------------------------------ */
/* 3. Ranking por recurso                                             */
/* ------------------------------------------------------------------ */

export async function getPcFactoryResourceRanking(params: PcFactoryQueryParams): Promise<PcFactoryResourceRow[]> {
  const records = await loadRecords(params);
  return buildResourceRanking(records);
}

/* ------------------------------------------------------------------ */
/* 4. Resumo por linha de produção                                    */
/* ------------------------------------------------------------------ */

export async function getPcFactoryProductionLineSummary(
  params: PcFactoryQueryParams
): Promise<PcFactoryProductionLineRow[]> {
  const records = await loadRecords(params);
  const groups = new Map<string, AnalyticsRecord[]>();

  for (const record of records) {
    const key = record.productionLine?.trim() || "Sem linha";
    const list = groups.get(key);
    if (list) {
      list.push(record);
    } else {
      groups.set(key, [record]);
    }
  }

  const rows: PcFactoryProductionLineRow[] = [];
  for (const [productionLine, list] of Array.from(groups.entries())) {
    const agg = aggregateHours(list);
    const resources = new Set(list.map((item) => item.resourceName));

    // Status (≠ produção) com maior impacto de horas.
    let mainImpact: PcFactoryProductionLineRow["mainImpactStatus"] = null;
    let bestHours = 0;
    for (const [status, hours] of Array.from(agg.byStatus.entries())) {
      if (status === PcFactoryStatus.PRODUCAO) continue;
      if (hours > bestHours) {
        bestHours = hours;
        mainImpact = { status, label: PC_FACTORY_STATUS_LABELS[status], hours: round(hours) };
      }
    }

    rows.push({
      productionLine,
      resourcesCount: resources.size,
      productionHours: agg.production,
      stoppedHours: agg.stopped,
      maintenanceHours: agg.maintenance,
      totalHours: agg.total,
      availabilityPercent: availability(agg.total, agg.stopped, agg.maintenance),
      utilizationPercent: utilization(agg.total, agg.production),
      mainImpactStatus: mainImpact
    });
  }

  return rows.sort((a, b) => b.totalHours - a.totalHours);
}

/* ------------------------------------------------------------------ */
/* 5. Evolução por período (tendência mensal)                         */
/* ------------------------------------------------------------------ */

export async function getPcFactoryTrend(params: PcFactoryQueryParams): Promise<PcFactoryTrendPoint[]> {
  const records = await loadRecords(params);
  const buckets = new Map<string, AnalyticsRecord[]>();

  for (const record of records) {
    if (!record.startDateTime) continue;
    const date = record.startDateTime;
    const key = `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
    const list = buckets.get(key);
    if (list) {
      list.push(record);
    } else {
      buckets.set(key, [record]);
    }
  }

  return Array.from(buckets.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([period, list]) => {
      const agg = aggregateHours(list);
      const [year, month] = period.split("-").map(Number);
      const label = new Date(Date.UTC(year, month - 1, 1))
        .toLocaleDateString("pt-BR", { month: "short", year: "2-digit", timeZone: "UTC" })
        .replace(".", "");
      return {
        period,
        label,
        availabilityPercent: availability(agg.total, agg.stopped, agg.maintenance),
        utilizationPercent: utilization(agg.total, agg.production),
        productionHours: agg.production,
        stoppedHours: agg.stopped,
        maintenanceHours: agg.maintenance
      };
    });
}

/* ------------------------------------------------------------------ */
/* 6. Registros paginados (tabela detalhada)                          */
/* ------------------------------------------------------------------ */

export async function getPcFactoryRecords(params: PcFactoryQueryParams): Promise<PcFactoryRecordsResult> {
  const page = Math.max(1, params.page ?? 1);
  const pageSize = clampPageSize(params.pageSize);
  const where = buildWhere(params);

  const [total, rows] = await Promise.all([
    prisma.pcFactoryRecord.count({ where }),
    prisma.pcFactoryRecord.findMany({
      where,
      orderBy: [{ startDateTime: "desc" }, { createdAt: "desc" }],
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: recordSelect
    })
  ]);

  return {
    data: rows.map(toRecordRow),
    total,
    page,
    pageSize,
    totalPages: Math.max(1, Math.ceil(total / pageSize))
  };
}

const recordSelect = {
  id: true,
  resourceName: true,
  resourceCode: true,
  productionLine: true,
  sector: true,
  statusNormalized: true,
  statusRaw: true,
  startDateTime: true,
  endDateTime: true,
  durationHours: true,
  shift: true,
  orderNumber: true,
  productDescription: true,
  observation: true
} satisfies Prisma.PcFactoryRecordSelect;

type RecordPayload = Prisma.PcFactoryRecordGetPayload<{ select: typeof recordSelect }>;

function toRecordRow(record: RecordPayload): PcFactoryRecordRow {
  return {
    id: record.id,
    resourceName: record.resourceName,
    resourceCode: record.resourceCode,
    productionLine: record.productionLine,
    sector: record.sector,
    status: record.statusNormalized,
    statusRaw: record.statusRaw,
    startDateTime: record.startDateTime ? record.startDateTime.toISOString() : null,
    endDateTime: record.endDateTime ? record.endDateTime.toISOString() : null,
    durationHours: round(record.durationHours),
    shift: record.shift,
    orderNumber: record.orderNumber,
    productDescription: record.productDescription,
    observation: record.observation
  };
}

function clampPageSize(value?: number): number {
  const allowed = [25, 50, 100];
  return value && allowed.includes(value) ? value : DEFAULT_PAGE_SIZE;
}

/* ------------------------------------------------------------------ */
/* 7. Detalhe da máquina/recurso                                      */
/* ------------------------------------------------------------------ */

export async function getPcFactoryResourceDetails(resourceCodeOrName: string): Promise<PcFactoryResourceDetails | null> {
  const term = resourceCodeOrName.trim();
  if (!term) return null;

  const where: Prisma.PcFactoryRecordWhereInput = {
    OR: [{ resourceName: term }, { resourceCode: term }]
  };

  const [analytics, recent, maintenance] = await Promise.all([
    prisma.pcFactoryRecord.findMany({
      where,
      select: {
        resourceName: true,
        resourceCode: true,
        productionLine: true,
        sector: true,
        statusNormalized: true,
        durationHours: true,
        startDateTime: true
      }
    }),
    prisma.pcFactoryRecord.findMany({
      where,
      orderBy: [{ startDateTime: "desc" }, { createdAt: "desc" }],
      take: 25,
      select: recordSelect
    }),
    prisma.pcFactoryRecord.findMany({
      where: { ...where, statusNormalized: PcFactoryStatus.MANUTENCAO },
      orderBy: [{ startDateTime: "desc" }, { createdAt: "desc" }],
      take: 25,
      select: recordSelect
    })
  ]);

  if (analytics.length === 0) {
    return null;
  }

  const agg = aggregateHours(analytics);
  const sample = analytics.find((item) => item.resourceCode) ?? analytics[0];
  const productionLine = analytics.find((item) => item.productionLine)?.productionLine ?? null;
  const sector = analytics.find((item) => item.sector)?.sector ?? null;

  const availabilityPercent = availability(agg.total, agg.stopped, agg.maintenance);
  const utilizationPercent = utilization(agg.total, agg.production);

  return {
    resourceName: sample.resourceName,
    resourceCode: sample.resourceCode ?? null,
    productionLine,
    sector,
    totalHours: agg.total,
    productionHours: agg.production,
    stoppedHours: agg.stopped,
    maintenanceHours: agg.maintenance,
    availabilityPercent,
    utilizationPercent,
    mtbf: mtbf(agg.production, agg.failureCount),
    mttr: mttr(agg.maintenance, agg.maintenanceEvents),
    mttf: mttf(agg.production, agg.maintenanceEvents),
    statusDistribution: statusDistributionFromAggregate(agg),
    recentRecords: recent.map(toRecordRow),
    maintenanceEvents: maintenance.map(toRecordRow),
    recommendations: buildRecommendations(agg, availabilityPercent)
  };
}

function buildRecommendations(agg: HoursAggregate, availabilityPercent: number | null): PcFactoryRecommendation[] {
  const recommendations: PcFactoryRecommendation[] = [];
  const stoppedShare = agg.total > 0 ? (agg.stopped / agg.total) * 100 : 0;
  const maintenanceShare = agg.total > 0 ? (agg.maintenance / agg.total) * 100 : 0;

  if (stoppedShare >= 25) {
    recommendations.push({ tone: "danger", message: "Máquina com alto tempo parado." });
  }
  if (availabilityPercent !== null && availabilityPercent < 70) {
    recommendations.push({ tone: "warning", message: "Recurso com baixa disponibilidade." });
  }
  if (maintenanceShare >= 15) {
    recommendations.push({ tone: "warning", message: "Recurso com alto impacto de manutenção." });
  }
  if (agg.failureCount >= 5) {
    recommendations.push({ tone: "info", message: "Monitorar recorrência de paradas." });
  }
  if (recommendations.length === 0) {
    recommendations.push({ tone: "info", message: "Operação dentro dos parâmetros no período analisado." });
  }
  return recommendations;
}

/* ------------------------------------------------------------------ */
/* Opções de filtro                                                   */
/* ------------------------------------------------------------------ */

export async function getPcFactoryFilterOptions(): Promise<PcFactoryFilterOptions> {
  const [resources, lines, sectors, shifts] = await Promise.all([
    prisma.pcFactoryRecord.findMany({ select: { resourceName: true }, distinct: ["resourceName"], orderBy: { resourceName: "asc" } }),
    prisma.pcFactoryRecord.findMany({ select: { productionLine: true }, distinct: ["productionLine"], orderBy: { productionLine: "asc" } }),
    prisma.pcFactoryRecord.findMany({ select: { sector: true }, distinct: ["sector"], orderBy: { sector: "asc" } }),
    prisma.pcFactoryRecord.findMany({ select: { shift: true }, distinct: ["shift"], orderBy: { shift: "asc" } })
  ]);

  return {
    resources: resources.map((item) => ({ value: item.resourceName, label: item.resourceName })),
    productionLines: lines
      .map((item) => item.productionLine)
      .filter((value): value is string => Boolean(value))
      .map((value) => ({ value, label: value })),
    sectors: sectors
      .map((item) => item.sector)
      .filter((value): value is string => Boolean(value))
      .map((value) => ({ value, label: value })),
    shifts: shifts
      .map((item) => item.shift)
      .filter((value): value is string => Boolean(value))
      .map((value) => ({ value, label: value })),
    statuses: PC_FACTORY_STATUS_ORDER.map((status) => ({ value: status, label: PC_FACTORY_STATUS_LABELS[status] }))
  };
}

/* ------------------------------------------------------------------ */
/* Orquestrador da página                                             */
/* ------------------------------------------------------------------ */

export async function getPcFactoryPageData(params: PcFactoryQueryParams = {}): Promise<PcFactoryPageData> {
  const reference = resolveReference(params);
  const totalRecords = await prisma.pcFactoryRecord.count();

  if (totalRecords === 0) {
    return emptyPageData(reference);
  }

  const [kpis, statusDistribution, ranking, productionLines, trend, records, filterOptions] = await Promise.all([
    getPcFactoryDashboardKPIs(params),
    getPcFactoryStatusDistribution(params),
    getPcFactoryResourceRanking(params),
    getPcFactoryProductionLineSummary(params),
    getPcFactoryTrend(params),
    getPcFactoryRecords(params),
    getPcFactoryFilterOptions()
  ]);

  // Caso os filtros zerem o resultado, ainda renderizamos a estrutura (não "empty").
  const topStopped = [...ranking].filter((row) => row.stoppedHours > 0).sort((a, b) => b.stoppedHours - a.stoppedHours).slice(0, 10);
  const topMaintenance = [...ranking]
    .filter((row) => row.maintenanceHours > 0)
    .sort((a, b) => b.maintenanceHours - a.maintenanceHours)
    .slice(0, 10);

  return {
    reference,
    kpis,
    statusDistribution,
    topStopped,
    topMaintenance,
    resourceRanking: ranking.slice(0, 20),
    productionLines,
    trend,
    records,
    filterOptions,
    source: "database"
  };
}

function resolveReference(params: PcFactoryQueryParams): PcFactoryReferencePeriod {
  if (params.startDate && params.endDate) {
    return {
      startDate: params.startDate,
      endDate: params.endDate,
      label: `${formatBr(params.startDate)} a ${formatBr(params.endDate)}`
    };
  }
  return { startDate: "", endDate: "", label: "Todo o período importado" };
}

/** Resumo enxuto para futura integração com o dashboard principal (TAREFA 12). */
export async function getPcFactoryDashboardSummary(): Promise<PcFactoryDashboardSummary> {
  const totalRecords = await prisma.pcFactoryRecord.count();
  if (totalRecords === 0) {
    return {
      hasData: false,
      availabilityPercent: null,
      utilizationPercent: null,
      maintenanceImpactPercent: null,
      topStoppedResources: [],
      topMaintenanceResources: []
    };
  }

  const kpis = await getPcFactoryDashboardKPIs({});
  return {
    hasData: true,
    availabilityPercent: kpis.availabilityPercent,
    utilizationPercent: kpis.utilizationPercent,
    maintenanceImpactPercent: kpis.maintenanceImpactPercent,
    topStoppedResources: kpis.topStoppedResource
      ? [{ resourceName: kpis.topStoppedResource.resourceName, hours: kpis.topStoppedResource.hours }]
      : [],
    topMaintenanceResources: kpis.topMaintenanceResource
      ? [{ resourceName: kpis.topMaintenanceResource.resourceName, hours: kpis.topMaintenanceResource.hours }]
      : []
  };
}

function emptyPageData(reference: PcFactoryReferencePeriod): PcFactoryPageData {
  return {
    reference,
    kpis: {
      totalRecords: 0,
      totalResources: 0,
      totalProductionLines: 0,
      totalAnalyzedHours: 0,
      productionHours: 0,
      stoppedHours: 0,
      maintenanceHours: 0,
      setupHours: 0,
      waitingHours: 0,
      availabilityPercent: null,
      utilizationPercent: null,
      maintenanceImpactPercent: null,
      mtbf: null,
      mttr: null,
      mttf: null,
      topStoppedResource: null,
      topMaintenanceResource: null,
      topFailureResource: null
    },
    statusDistribution: [],
    topStopped: [],
    topMaintenance: [],
    resourceRanking: [],
    productionLines: [],
    trend: [],
    records: { data: [], total: 0, page: 1, pageSize: DEFAULT_PAGE_SIZE, totalPages: 1 },
    filterOptions: {
      resources: [],
      productionLines: [],
      sectors: [],
      shifts: [],
      statuses: PC_FACTORY_STATUS_ORDER.map((status) => ({ value: status, label: PC_FACTORY_STATUS_LABELS[status] }))
    },
    source: "empty"
  };
}

/* ------------------------------------------------------------------ */
/* Helpers                                                            */
/* ------------------------------------------------------------------ */

function round(value: number): number {
  return Math.round(value * 100) / 100;
}

/** Arredonda garantindo número finito (nunca NaN/Infinity). */
function safeRound(value: number): number | null {
  return Number.isFinite(value) ? round(value) : null;
}

/** Mantém o percentual finito e dentro de [0, 100]. */
function clampPercent(value: number): number | null {
  if (!Number.isFinite(value)) return null;
  return round(Math.min(100, Math.max(0, value)));
}

function formatBr(iso: string): string {
  const date = new Date(`${iso}T00:00:00.000Z`);
  return Number.isNaN(date.getTime()) ? iso : date.toLocaleDateString("pt-BR", { timeZone: "UTC" });
}
