import { cache } from "react";
import { PcFactoryStatusCategory, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  PC_FACTORY_CATEGORY_COLORS,
  PC_FACTORY_CATEGORY_LABELS,
  PC_FACTORY_CATEGORY_ORDER,
  maintenanceKind
} from "@/utils/pc-factory-normalizer";
import type {
  PcFactoryCategorySlice,
  PcFactoryDashboardSummary,
  PcFactoryFilterOptions,
  PcFactoryKpis,
  PcFactoryMaintenanceSplit,
  PcFactoryPageData,
  PcFactoryProductionLineRow,
  PcFactoryQueryParams,
  PcFactoryRecommendation,
  PcFactoryRecordRow,
  PcFactoryRecordsResult,
  PcFactoryReferencePeriod,
  PcFactoryResourceDetails,
  PcFactoryResourceRow,
  PcFactoryTopResource,
  PcFactoryTrendPoint
} from "@/types/pc-factory";

const DEFAULT_PAGE_SIZE = 50;

/**
 * Decisão de negócio (confirmada): Setup conta como parada/perda operacional e,
 * portanto, reduz a disponibilidade. Para tratar Setup como tempo neutro, basta
 * mudar esta constante para false.
 */
const SETUP_COUNTS_AS_LOSS = true;

/* ------------------------------------------------------------------ */
/* Where + carregamento de registros                                  */
/* ------------------------------------------------------------------ */

function buildWhere(params: PcFactoryQueryParams): Prisma.PcFactoryRecordWhereInput {
  const and: Prisma.PcFactoryRecordWhereInput[] = [];

  if (params.resources?.length) and.push({ resourceName: { in: params.resources } });
  if (params.productionLines?.length) and.push({ productionLine: { in: params.productionLines } });
  if (params.sectors?.length) and.push({ sector: { in: params.sectors } });
  if (params.shifts?.length) and.push({ shift: { in: params.shifts } });
  if (params.statusNames?.length) and.push({ statusRaw: { in: params.statusNames } });
  if (params.categories?.length) and.push({ statusCategory: { in: params.categories } });

  // Toggles de manutenção (escopados à categoria MANUTENCAO, que contém só os 3 status).
  if (params.onlyMaintenance) and.push({ statusCategory: PcFactoryStatusCategory.MANUTENCAO });
  if (params.onlyMechanical) {
    and.push({ statusCategory: PcFactoryStatusCategory.MANUTENCAO, statusRaw: { contains: "mec", mode: "insensitive" } });
  }
  if (params.onlyElectrical) {
    and.push({ statusCategory: PcFactoryStatusCategory.MANUTENCAO, statusRaw: { contains: "trica", mode: "insensitive" } });
  }
  if (params.onlyWaiting) {
    and.push({ statusCategory: PcFactoryStatusCategory.MANUTENCAO, statusRaw: { contains: "guard", mode: "insensitive" } });
  }
  if (params.excludeOutOfPlanned) {
    and.push({ NOT: { statusCategory: PcFactoryStatusCategory.EXCLUIR_TEMPO_PLANEJADO } });
  }

  if (params.startDate || params.endDate) {
    const range: Prisma.DateTimeNullableFilter = {};
    if (params.startDate) range.gte = new Date(`${params.startDate}T00:00:00.000Z`);
    if (params.endDate) range.lte = new Date(`${params.endDate}T23:59:59.999Z`);
    and.push({ startDateTime: range });
  }

  if (params.search) {
    const term = params.search.trim();
    if (term) {
      and.push({
        OR: [
          { resourceName: { contains: term, mode: "insensitive" } },
          { resourceCode: { contains: term, mode: "insensitive" } },
          { productionLine: { contains: term, mode: "insensitive" } },
          { orderNumber: { contains: term, mode: "insensitive" } },
          { productDescription: { contains: term, mode: "insensitive" } },
          { statusRaw: { contains: term, mode: "insensitive" } }
        ]
      });
    }
  }

  return and.length ? { AND: and } : {};
}

type AnalyticsRecord = {
  resourceName: string;
  resourceCode: string | null;
  productionLine: string | null;
  sector: string | null;
  statusRaw: string | null;
  statusCategory: PcFactoryStatusCategory;
  durationHours: number;
  startDateTime: Date | null;
};

// `cache` deduplica a carga de registros filtrados no MESMO render — o orquestrador
// cria UM objeto `params` e o repassa a todas as sub-funções.
const loadRecords = cache(async (params: PcFactoryQueryParams): Promise<AnalyticsRecord[]> => {
  return prisma.pcFactoryRecord.findMany({
    where: buildWhere(params),
    select: {
      resourceName: true,
      resourceCode: true,
      productionLine: true,
      sector: true,
      statusRaw: true,
      statusCategory: true,
      durationHours: true,
      startDateTime: true
    }
  });
});

/* ------------------------------------------------------------------ */
/* Agregação pura                                                     */
/* ------------------------------------------------------------------ */

type HoursAggregate = {
  byCategory: Map<PcFactoryStatusCategory, number>;
  totalHours: number;
  plannedHours: number;
  productionHours: number;
  maintenanceHours: number;
  mechanicalHours: number;
  electricalHours: number;
  waitingHours: number;
  setupHours: number;
  lossHours: number;
  operationalHours: number;
  excludedHours: number;
  stoppedHours: number;
  maintenanceEvents: number;
  mechanicalEvents: number;
  electricalEvents: number;
  waitingEvents: number;
};

function aggregateHours(records: AnalyticsRecord[]): HoursAggregate {
  const byCategory = new Map<PcFactoryStatusCategory, number>();
  let totalHours = 0;
  let plannedHours = 0;
  let productionHours = 0;
  let maintenanceHours = 0;
  let mechanicalHours = 0;
  let electricalHours = 0;
  let waitingHours = 0;
  let setupHours = 0;
  let paradaPerdaHours = 0;
  let operationalHours = 0;
  let excludedHours = 0;
  let maintenanceEvents = 0;
  let mechanicalEvents = 0;
  let electricalEvents = 0;
  let waitingEvents = 0;

  for (const record of records) {
    const hours = Number.isFinite(record.durationHours) ? record.durationHours : 0;
    const cat = record.statusCategory;
    totalHours += hours;
    byCategory.set(cat, (byCategory.get(cat) ?? 0) + hours);

    if (cat === PcFactoryStatusCategory.EXCLUIR_TEMPO_PLANEJADO) {
      excludedHours += hours;
      continue; // fora do tempo planejado — não entra em nenhum cálculo de planejado/parada
    }

    plannedHours += hours;

    switch (cat) {
      case PcFactoryStatusCategory.MANUTENCAO: {
        maintenanceHours += hours;
        maintenanceEvents += 1;
        const kind = maintenanceKind(record.statusRaw);
        if (kind === "MECANICA") {
          mechanicalHours += hours;
          mechanicalEvents += 1;
        } else if (kind === "ELETRICA") {
          electricalHours += hours;
          electricalEvents += 1;
        } else if (kind === "AGUARDANDO") {
          waitingHours += hours;
          waitingEvents += 1;
        }
        break;
      }
      case PcFactoryStatusCategory.PRODUCAO:
        productionHours += hours;
        break;
      case PcFactoryStatusCategory.SETUP:
        setupHours += hours;
        break;
      case PcFactoryStatusCategory.PARADA_PERDA:
        paradaPerdaHours += hours;
        break;
      case PcFactoryStatusCategory.OPERACIONAL:
      case PcFactoryStatusCategory.OUTROS:
        operationalHours += hours;
        break;
      default:
        break;
    }
  }

  const lossHours = paradaPerdaHours + (SETUP_COUNTS_AS_LOSS ? setupHours : 0);
  const stoppedHours = maintenanceHours + lossHours;

  return {
    byCategory,
    totalHours: round(totalHours),
    plannedHours: round(plannedHours),
    productionHours: round(productionHours),
    maintenanceHours: round(maintenanceHours),
    mechanicalHours: round(mechanicalHours),
    electricalHours: round(electricalHours),
    waitingHours: round(waitingHours),
    setupHours: round(setupHours),
    lossHours: round(lossHours),
    operationalHours: round(operationalHours),
    excludedHours: round(excludedHours),
    stoppedHours: round(stoppedHours),
    maintenanceEvents,
    mechanicalEvents,
    electricalEvents,
    waitingEvents
  };
}

function availability(plannedHours: number, stoppedHours: number): number | null {
  if (plannedHours <= 0) return null;
  return clampPercent(((plannedHours - stoppedHours) / plannedHours) * 100);
}

function mttr(maintenanceHours: number, maintenanceEvents: number): number | null {
  return maintenanceEvents > 0 ? safeRound(maintenanceHours / maintenanceEvents) : null;
}

function maintenancePercent(plannedHours: number, maintenanceHours: number): number | null {
  if (plannedHours <= 0) return null;
  return clampPercent((maintenanceHours / plannedHours) * 100);
}

/* ------------------------------------------------------------------ */
/* Ranking por recurso                                                */
/* ------------------------------------------------------------------ */

function buildResourceRanking(records: AnalyticsRecord[]): PcFactoryResourceRow[] {
  const groups = new Map<string, AnalyticsRecord[]>();
  for (const record of records) {
    const list = groups.get(record.resourceName);
    if (list) list.push(record);
    else groups.set(record.resourceName, [record]);
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
      plannedHours: agg.plannedHours,
      productionHours: agg.productionHours,
      maintenanceHours: agg.maintenanceHours,
      mechanicalHours: agg.mechanicalHours,
      electricalHours: agg.electricalHours,
      waitingHours: agg.waitingHours,
      lossHours: agg.lossHours,
      stoppedHours: agg.stoppedHours,
      maintenanceEvents: agg.maintenanceEvents,
      mttr: mttr(agg.maintenanceHours, agg.maintenanceEvents),
      availabilityPercent: availability(agg.plannedHours, agg.stoppedHours)
    });
  }
  return rows;
}

function topByMaintenance(rows: PcFactoryResourceRow[]): PcFactoryTopResource {
  let best: PcFactoryResourceRow | null = null;
  for (const row of rows) {
    if (row.maintenanceHours > 0 && (!best || row.maintenanceHours > best.maintenanceHours)) best = row;
  }
  return best ? { resourceName: best.resourceName, resourceCode: best.resourceCode, hours: best.maintenanceHours } : null;
}

/* ------------------------------------------------------------------ */
/* 1. KPIs                                                            */
/* ------------------------------------------------------------------ */

export async function getPcFactoryDashboardKPIs(params: PcFactoryQueryParams): Promise<PcFactoryKpis> {
  const records = await loadRecords(params);
  const agg = aggregateHours(records);
  const ranking = buildResourceRanking(records);

  const resourceNames = new Set(records.map((r) => r.resourceName));
  const lines = new Set(records.map((r) => r.productionLine).filter(Boolean) as string[]);

  return {
    totalRecords: records.length,
    totalResources: resourceNames.size,
    totalProductionLines: lines.size,
    totalHours: agg.totalHours,
    plannedHours: agg.plannedHours,
    productionHours: agg.productionHours,
    maintenanceHours: agg.maintenanceHours,
    mechanicalMaintenanceHours: agg.mechanicalHours,
    electricalMaintenanceHours: agg.electricalHours,
    waitingMaintenanceHours: agg.waitingHours,
    setupHours: agg.setupHours,
    lossHours: agg.lossHours,
    operationalHours: agg.operationalHours,
    excludedHours: agg.excludedHours,
    stoppedHours: agg.stoppedHours,
    maintenanceEvents: agg.maintenanceEvents,
    mechanicalEvents: agg.mechanicalEvents,
    electricalEvents: agg.electricalEvents,
    waitingEvents: agg.waitingEvents,
    mttr: mttr(agg.maintenanceHours, agg.maintenanceEvents),
    maintenancePercentOfPlanned: maintenancePercent(agg.plannedHours, agg.maintenanceHours),
    availabilityPercent: availability(agg.plannedHours, agg.stoppedHours),
    topMaintenanceResource: topByMaintenance(ranking)
  };
}

/* ------------------------------------------------------------------ */
/* 2. Distribuição por categoria                                      */
/* ------------------------------------------------------------------ */

export async function getPcFactoryCategoryDistribution(params: PcFactoryQueryParams): Promise<PcFactoryCategorySlice[]> {
  const records = await loadRecords(params);
  return categoryDistributionFromAggregate(aggregateHours(records));
}

function categoryDistributionFromAggregate(agg: HoursAggregate): PcFactoryCategorySlice[] {
  return PC_FACTORY_CATEGORY_ORDER.map((category) => {
    const totalHours = round(agg.byCategory.get(category) ?? 0);
    return {
      category,
      label: PC_FACTORY_CATEGORY_LABELS[category],
      color: PC_FACTORY_CATEGORY_COLORS[category],
      totalHours,
      percent: agg.totalHours > 0 ? clampPercent((totalHours / agg.totalHours) * 100) ?? 0 : 0
    };
  }).filter((slice) => slice.totalHours > 0);
}

function maintenanceSplitFromAggregate(agg: HoursAggregate): PcFactoryMaintenanceSplit[] {
  return [
    { key: "MECANICA" as const, label: "Manutenção Mecânica", hours: agg.mechanicalHours, events: agg.mechanicalEvents, color: "#c49a45" },
    { key: "ELETRICA" as const, label: "Manutenção Elétrica", hours: agg.electricalHours, events: agg.electricalEvents, color: "#0f4d68" },
    { key: "AGUARDANDO" as const, label: "Aguardando Manutenção", hours: agg.waitingHours, events: agg.waitingEvents, color: "#a6192e" }
  ].filter((item) => item.hours > 0);
}

/* ------------------------------------------------------------------ */
/* 3-4. Rankings e linhas                                             */
/* ------------------------------------------------------------------ */

export async function getPcFactoryResourceRanking(params: PcFactoryQueryParams): Promise<PcFactoryResourceRow[]> {
  return buildResourceRanking(await loadRecords(params)).sort((a, b) => b.maintenanceHours - a.maintenanceHours);
}

export async function getPcFactoryProductionLineSummary(params: PcFactoryQueryParams): Promise<PcFactoryProductionLineRow[]> {
  const records = await loadRecords(params);
  const groups = new Map<string, AnalyticsRecord[]>();
  for (const record of records) {
    const key = record.productionLine?.trim() || "Sem linha";
    const list = groups.get(key);
    if (list) list.push(record);
    else groups.set(key, [record]);
  }

  const rows: PcFactoryProductionLineRow[] = [];
  for (const [productionLine, list] of Array.from(groups.entries())) {
    const agg = aggregateHours(list);
    rows.push({
      productionLine,
      resourcesCount: new Set(list.map((item) => item.resourceName)).size,
      plannedHours: agg.plannedHours,
      productionHours: agg.productionHours,
      maintenanceHours: agg.maintenanceHours,
      lossHours: agg.lossHours,
      stoppedHours: agg.stoppedHours,
      availabilityPercent: availability(agg.plannedHours, agg.stoppedHours)
    });
  }
  return rows.sort((a, b) => b.maintenanceHours - a.maintenanceHours);
}

/* ------------------------------------------------------------------ */
/* 5. Tendência (dia se curto, mês se longo)                          */
/* ------------------------------------------------------------------ */

export async function getPcFactoryTrend(params: PcFactoryQueryParams): Promise<PcFactoryTrendPoint[]> {
  const records = (await loadRecords(params)).filter((r) => r.startDateTime);
  if (records.length === 0) return [];

  let min = records[0].startDateTime as Date;
  let max = records[0].startDateTime as Date;
  for (const r of records) {
    const d = r.startDateTime as Date;
    if (d < min) min = d;
    if (d > max) max = d;
  }
  const spanDays = (max.getTime() - min.getTime()) / 86_400_000;
  const daily = spanDays <= 62;

  const buckets = new Map<string, AnalyticsRecord[]>();
  for (const r of records) {
    const d = r.startDateTime as Date;
    const key = daily
      ? `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`
      : `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}`;
    const list = buckets.get(key);
    if (list) list.push(r);
    else buckets.set(key, [r]);
  }

  return Array.from(buckets.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([period, list]) => {
      const agg = aggregateHours(list);
      const label = daily ? period.slice(8) + "/" + period.slice(5, 7) : monthLabel(period);
      return {
        period,
        label,
        maintenanceHours: agg.maintenanceHours,
        plannedHours: agg.plannedHours,
        availabilityPercent: availability(agg.plannedHours, agg.stoppedHours)
      };
    });
}

/* ------------------------------------------------------------------ */
/* 6. Registros paginados                                             */
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
  statusRaw: true,
  statusCategory: true,
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
    statusRaw: record.statusRaw,
    statusCategory: record.statusCategory,
    classificationLabel: PC_FACTORY_CATEGORY_LABELS[record.statusCategory],
    isMaintenance: record.statusCategory === PcFactoryStatusCategory.MANUTENCAO,
    isInPlannedTime: record.statusCategory !== PcFactoryStatusCategory.EXCLUIR_TEMPO_PLANEJADO,
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

  const where: Prisma.PcFactoryRecordWhereInput = { OR: [{ resourceName: term }, { resourceCode: term }] };

  const [analytics, recent, maintenance] = await Promise.all([
    prisma.pcFactoryRecord.findMany({
      where,
      select: {
        resourceName: true,
        resourceCode: true,
        productionLine: true,
        sector: true,
        statusRaw: true,
        statusCategory: true,
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
      where: { ...where, statusCategory: PcFactoryStatusCategory.MANUTENCAO },
      orderBy: [{ startDateTime: "desc" }, { createdAt: "desc" }],
      take: 25,
      select: recordSelect
    })
  ]);

  if (analytics.length === 0) return null;

  const agg = aggregateHours(analytics);
  const sample = analytics.find((item) => item.resourceCode) ?? analytics[0];
  const availabilityPercent = availability(agg.plannedHours, agg.stoppedHours);

  return {
    resourceName: sample.resourceName,
    resourceCode: sample.resourceCode ?? null,
    productionLine: analytics.find((i) => i.productionLine)?.productionLine ?? null,
    sector: analytics.find((i) => i.sector)?.sector ?? null,
    plannedHours: agg.plannedHours,
    maintenanceHours: agg.maintenanceHours,
    mechanicalHours: agg.mechanicalHours,
    electricalHours: agg.electricalHours,
    waitingHours: agg.waitingHours,
    stoppedHours: agg.stoppedHours,
    maintenanceEvents: agg.maintenanceEvents,
    mttr: mttr(agg.maintenanceHours, agg.maintenanceEvents),
    availabilityPercent,
    categoryDistribution: categoryDistributionFromAggregate(agg),
    maintenanceTimeline: maintenance.map(toRecordRow),
    recentRecords: recent.map(toRecordRow),
    recommendations: buildRecommendations(agg, availabilityPercent)
  };
}

function buildRecommendations(agg: HoursAggregate, availabilityPercent: number | null): PcFactoryRecommendation[] {
  const recs: PcFactoryRecommendation[] = [];
  if (agg.maintenanceHours > 0 && agg.mechanicalHours >= agg.maintenanceHours * 0.5) {
    recs.push({ tone: "danger", message: "Máquina com alto impacto de manutenção mecânica." });
  }
  if (agg.waitingHours > 0 && agg.waitingHours >= agg.maintenanceHours * 0.3) {
    recs.push({ tone: "warning", message: "Máquina aguardando manutenção por tempo elevado." });
  }
  if (availabilityPercent !== null && availabilityPercent < 70) {
    recs.push({ tone: "warning", message: "Máquina com baixa disponibilidade estimada." });
  }
  if (agg.maintenanceEvents >= 5) {
    recs.push({ tone: "info", message: "Priorizar análise de causa raiz para recorrência de manutenção." });
  }
  if (recs.length === 0) {
    recs.push({ tone: "info", message: "Operação dentro dos parâmetros no período analisado." });
  }
  return recs;
}

/* ------------------------------------------------------------------ */
/* Opções de filtro                                                   */
/* ------------------------------------------------------------------ */

export async function getPcFactoryFilterOptions(): Promise<PcFactoryFilterOptions> {
  const [resources, lines, sectors, shifts, statusNames] = await Promise.all([
    prisma.pcFactoryRecord.findMany({ select: { resourceName: true }, distinct: ["resourceName"], orderBy: { resourceName: "asc" } }),
    prisma.pcFactoryRecord.findMany({ select: { productionLine: true }, distinct: ["productionLine"], orderBy: { productionLine: "asc" } }),
    prisma.pcFactoryRecord.findMany({ select: { sector: true }, distinct: ["sector"], orderBy: { sector: "asc" } }),
    prisma.pcFactoryRecord.findMany({ select: { shift: true }, distinct: ["shift"], orderBy: { shift: "asc" } }),
    prisma.pcFactoryRecord.findMany({ select: { statusRaw: true }, distinct: ["statusRaw"], orderBy: { statusRaw: "asc" } })
  ]);

  const clean = (rows: Array<{ [k: string]: string | null }>, key: string) =>
    rows
      .map((row) => row[key])
      .filter((value): value is string => Boolean(value && value.trim()))
      .map((value) => ({ value, label: value }));

  return {
    resources: resources.map((r) => ({ value: r.resourceName, label: r.resourceName })),
    productionLines: clean(lines, "productionLine"),
    sectors: clean(sectors, "sector"),
    shifts: clean(shifts, "shift"),
    statusNames: clean(statusNames, "statusRaw"),
    categories: PC_FACTORY_CATEGORY_ORDER.map((category) => ({ value: category, label: PC_FACTORY_CATEGORY_LABELS[category] }))
  };
}

/* ------------------------------------------------------------------ */
/* Orquestrador da página                                             */
/* ------------------------------------------------------------------ */

export async function getPcFactoryPageData(params: PcFactoryQueryParams = {}): Promise<PcFactoryPageData> {
  const reference = resolveReference(params);
  const totalRecords = await prisma.pcFactoryRecord.count();
  if (totalRecords === 0) return emptyPageData(reference);

  const records = await loadRecords(params);
  const agg = aggregateHours(records);
  const ranking = buildResourceRanking(records);

  const [kpis, productionLines, trend, records_, filterOptions] = await Promise.all([
    getPcFactoryDashboardKPIs(params),
    getPcFactoryProductionLineSummary(params),
    getPcFactoryTrend(params),
    getPcFactoryRecords(params),
    getPcFactoryFilterOptions()
  ]);

  const criticalResources = [...ranking].filter((r) => r.maintenanceHours > 0).sort((a, b) => b.maintenanceHours - a.maintenanceHours).slice(0, 10);
  const topMechanical = [...ranking].filter((r) => r.mechanicalHours > 0).sort((a, b) => b.mechanicalHours - a.mechanicalHours).slice(0, 10);
  const topElectrical = [...ranking].filter((r) => r.electricalHours > 0).sort((a, b) => b.electricalHours - a.electricalHours).slice(0, 10);
  const topWaiting = [...ranking].filter((r) => r.waitingHours > 0).sort((a, b) => b.waitingHours - a.waitingHours).slice(0, 10);

  return {
    reference,
    kpis,
    categoryDistribution: categoryDistributionFromAggregate(agg),
    maintenanceSplit: maintenanceSplitFromAggregate(agg),
    criticalResources,
    topMechanical,
    topElectrical,
    topWaiting,
    productionLines,
    trend,
    records: records_,
    filterOptions,
    source: "database"
  };
}

function resolveReference(params: PcFactoryQueryParams): PcFactoryReferencePeriod {
  if (params.startDate && params.endDate) {
    return { startDate: params.startDate, endDate: params.endDate, label: `${formatBr(params.startDate)} a ${formatBr(params.endDate)}` };
  }
  return { startDate: "", endDate: "", label: "Todo o período importado" };
}

/** Resumo enxuto para futura integração com o dashboard principal (TAREFA 12). */
export async function getPcFactoryDashboardSummary(): Promise<PcFactoryDashboardSummary> {
  const totalRecords = await prisma.pcFactoryRecord.count();
  if (totalRecords === 0) {
    return { hasData: false, maintenanceHours: 0, availabilityPercent: null, mttr: null, topMaintenanceResources: [], waitingMaintenanceResources: [] };
  }
  const records = await loadRecords({});
  const agg = aggregateHours(records);
  const ranking = buildResourceRanking(records);
  return {
    hasData: true,
    maintenanceHours: agg.maintenanceHours,
    availabilityPercent: availability(agg.plannedHours, agg.stoppedHours),
    mttr: mttr(agg.maintenanceHours, agg.maintenanceEvents),
    topMaintenanceResources: [...ranking]
      .filter((r) => r.maintenanceHours > 0)
      .sort((a, b) => b.maintenanceHours - a.maintenanceHours)
      .slice(0, 5)
      .map((r) => ({ resourceName: r.resourceName, hours: r.maintenanceHours })),
    waitingMaintenanceResources: [...ranking]
      .filter((r) => r.waitingHours > 0)
      .sort((a, b) => b.waitingHours - a.waitingHours)
      .slice(0, 5)
      .map((r) => ({ resourceName: r.resourceName, hours: r.waitingHours }))
  };
}

function emptyPageData(reference: PcFactoryReferencePeriod): PcFactoryPageData {
  return {
    reference,
    kpis: {
      totalRecords: 0,
      totalResources: 0,
      totalProductionLines: 0,
      totalHours: 0,
      plannedHours: 0,
      productionHours: 0,
      maintenanceHours: 0,
      mechanicalMaintenanceHours: 0,
      electricalMaintenanceHours: 0,
      waitingMaintenanceHours: 0,
      setupHours: 0,
      lossHours: 0,
      operationalHours: 0,
      excludedHours: 0,
      stoppedHours: 0,
      maintenanceEvents: 0,
      mechanicalEvents: 0,
      electricalEvents: 0,
      waitingEvents: 0,
      mttr: null,
      maintenancePercentOfPlanned: null,
      availabilityPercent: null,
      topMaintenanceResource: null
    },
    categoryDistribution: [],
    maintenanceSplit: [],
    criticalResources: [],
    topMechanical: [],
    topElectrical: [],
    topWaiting: [],
    productionLines: [],
    trend: [],
    records: { data: [], total: 0, page: 1, pageSize: DEFAULT_PAGE_SIZE, totalPages: 1 },
    filterOptions: {
      resources: [],
      productionLines: [],
      sectors: [],
      shifts: [],
      statusNames: [],
      categories: PC_FACTORY_CATEGORY_ORDER.map((category) => ({ value: category, label: PC_FACTORY_CATEGORY_LABELS[category] }))
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

function safeRound(value: number): number | null {
  return Number.isFinite(value) ? round(value) : null;
}

function clampPercent(value: number): number | null {
  if (!Number.isFinite(value)) return null;
  return round(Math.min(100, Math.max(0, value)));
}

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

function monthLabel(period: string): string {
  const [year, month] = period.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, 1))
    .toLocaleDateString("pt-BR", { month: "short", year: "2-digit", timeZone: "UTC" })
    .replace(".", "");
}

function formatBr(iso: string): string {
  const date = new Date(`${iso}T00:00:00.000Z`);
  return Number.isNaN(date.getTime()) ? iso : date.toLocaleDateString("pt-BR", { timeZone: "UTC" });
}
