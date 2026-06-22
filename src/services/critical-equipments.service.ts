import { MaintenanceArea, MaintenanceType, Prisma, ServiceOrderStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getServiceOrderFilterOptions } from "@/services/service-orders.service";
import { excludeLubricationOrderWhere } from "@/utils/service-order-filters";
import {
  ATTENTION_SCORE_THRESHOLD,
  CRITICALITY_SCORE_THRESHOLD,
  CRITICALITY_WEIGHTS
} from "@/services/shared/portal-rules";
import { toEndOfDay, toStartOfDay } from "@/utils/date-range";
import { toInputDate } from "@/utils/period";
import { getEquipmentGroupingKey } from "@/utils/technical-object-normalizer";
import type {
  CriticalEquipmentDetails,
  CriticalEquipmentFilterOptions,
  CriticalEquipmentFilters,
  CriticalEquipmentHoursPoint,
  CriticalEquipmentItem,
  CriticalEquipmentServiceOrder,
  CriticalEquipmentStatusSlice,
  CriticalEquipmentSummary,
  CriticalEquipmentTrendPoint,
  CriticalEquipmentsPageData,
  CriticalityLabel,
  CriticalityScoreInput,
  EquipmentHoursByResponsible
} from "@/types/critical-equipments";
import type { ServiceOrderStatusLabel } from "@/types/service-orders";

const DEFAULT_LIMIT = 10;
const NO_NAME = "EQUIPAMENTO NÃO INFORMADO";
const NO_CODE = "SEM CÓDIGO";
const NOT_INFORMED = "Não informado";

const STATUS_META: Record<ServiceOrderStatusLabel, { label: string; color: string }> = {
  ABERTA: { label: "Aberta", color: "#c49a45" },
  LIBERADA: { label: "Liberada", color: "#2f6384" },
  EM_ANDAMENTO: { label: "Em andamento", color: "#3f7da6" },
  AGUARDANDO_MATERIAL: { label: "Aguardando material", color: "#d8a657" },
  FECHADA: { label: "Fechada", color: "#3f8f6b" },
  CANCELADA: { label: "Cancelada", color: "#b51f32" }
};

const STATUS_ORDER: ServiceOrderStatusLabel[] = [
  "ABERTA",
  "LIBERADA",
  "EM_ANDAMENTO",
  "AGUARDANDO_MATERIAL",
  "FECHADA",
  "CANCELADA"
];

type ServiceOrderRow = {
  equipmentName: string | null;
  equipmentCode: string | null;
  technicalObjectRaw: string | null;
  status: ServiceOrderStatus;
  workedHours: number | null;
  openedAt: Date | null;
  responsibleName: string | null;
  planningGroup: string | null;
  planningGroupCode: string | null;
  area: MaintenanceArea | null;
  title: string;
  osNumber: string;
  operation: string | null;
};

type ServiceOrderFullRow = ServiceOrderRow & {
  id: string;
  description: string | null;
  closedAt: Date | null;
  technicalObjectRaw: string | null;
  failureCause: string | null;
  solution: string | null;
  source: string | null;
  importBatch: string | null;
};

/* ------------------------------------------------------------------ */
/* Score                                                              */
/* ------------------------------------------------------------------ */

/**
 * Score crítico (0–100):
 *  - 60% volume de ordens (normalizado);
 *  - 30% horas apontadas (normalizado);
 *  - 10% ordens em aberto (normalizado).
 */
export function calculateCriticalityScore(input: CriticalityScoreInput): number {
  const ordersScore = input.maxOrders > 0 ? (input.totalOrders / input.maxOrders) * 100 : 0;
  const hoursScore = input.maxWorkedHours > 0 ? (input.totalWorkedHours / input.maxWorkedHours) * 100 : 0;
  const openScore = input.maxOpenOrders > 0 ? (input.openOrders / input.maxOpenOrders) * 100 : 0;

  const score =
    ordersScore * CRITICALITY_WEIGHTS.orders +
    hoursScore * CRITICALITY_WEIGHTS.hours +
    openScore * CRITICALITY_WEIGHTS.openOrders;
  return Math.min(100, Math.max(0, Math.round(score)));
}

export function getCriticalityLabel(score: number): CriticalityLabel {
  if (score >= CRITICALITY_SCORE_THRESHOLD) {
    return "Crítico";
  }
  if (score >= ATTENTION_SCORE_THRESHOLD) {
    return "Atenção";
  }
  return "Monitorado";
}

/* ------------------------------------------------------------------ */
/* Funções públicas                                                   */
/* ------------------------------------------------------------------ */

export async function getCriticalEquipmentsByOrders(
  params: Partial<CriticalEquipmentFilters> = {}
): Promise<CriticalEquipmentItem[]> {
  const rows = await fetchRows(params);
  const items = analyzeEquipments(rows, params);
  return items.slice(0, normalizeLimit(params.limit));
}

export type TopBreakEquipment = {
  equipmentName: string;
  equipmentCode: string;
  totalOrders: number;
  correctiveOrders: number;
};

/**
 * Top equipamentos por VOLUME de ordens para as análises de quebra do dashboard
 * (alertas de alto volume e índice de quebra). Exclui ordens de lubrificação (PL)
 * — fonte única do filtro. Ignora ordens sem equipamento identificável.
 */
export async function getTopEquipmentsByBreakVolume(
  params: { startDate?: string; endDate?: string } = {},
  limit = 5
): Promise<TopBreakEquipment[]> {
  const and: Prisma.ServiceOrderWhereInput[] = [excludeLubricationOrderWhere()];
  if (params.startDate || params.endDate) {
    and.push({
      openedAt: {
        ...(params.startDate ? { gte: toStartOfDay(params.startDate) } : {}),
        ...(params.endDate ? { lte: toEndOfDay(params.endDate) } : {})
      }
    });
  }

  const rows = await prisma.serviceOrder.findMany({
    where: { AND: and },
    select: { equipmentName: true, equipmentCode: true, type: true }
  });

  const groups = new Map<string, TopBreakEquipment>();
  for (const row of rows) {
    const name = cleanText(row.equipmentName);
    const code = cleanText(row.equipmentCode);
    if (!name && !code) {
      continue; // sem equipamento identificável — não vira alerta
    }
    const key = code || `nome:${name}`;
    const group =
      groups.get(key) ?? { equipmentName: name || NO_NAME, equipmentCode: code || NO_CODE, totalOrders: 0, correctiveOrders: 0 };
    group.totalOrders += 1;
    if (row.type === MaintenanceType.CORRETIVA) {
      group.correctiveOrders += 1;
    }
    groups.set(key, group);
  }

  return Array.from(groups.values())
    .sort((a, b) => b.totalOrders - a.totalOrders || b.correctiveOrders - a.correctiveOrders)
    .slice(0, Math.max(1, limit));
}

export async function getCriticalEquipmentsSummary(
  params: Partial<CriticalEquipmentFilters> = {}
): Promise<CriticalEquipmentSummary> {
  const rows = await fetchRows(params);
  const items = analyzeEquipments(rows, params);
  return buildSummary(items, rows.length);
}

export async function getCriticalEquipmentsTrend(
  params: Partial<CriticalEquipmentFilters> = {}
): Promise<CriticalEquipmentTrendPoint[]> {
  const rows = await fetchRows(params);
  const items = analyzeEquipments(rows, params);
  return buildTrend(rows, items, normalizeLimit(params.limit));
}

export async function getCriticalEquipmentDetails(
  equipmentId: string,
  params: Partial<CriticalEquipmentFilters> = {}
): Promise<CriticalEquipmentDetails | null> {
  const rows = await fetchRowsFull(params);
  const groupRows = rows.filter((row) => resolveCode(row) === equipmentId);

  if (!groupRows.length) {
    return null;
  }

  const items = analyzeEquipments(rows, params);
  const item = items.find((current) => current.id === equipmentId);

  if (!item) {
    return null;
  }

  const serviceOrders: CriticalEquipmentServiceOrder[] = [...groupRows]
    .sort((a, b) => (b.openedAt?.getTime() ?? 0) - (a.openedAt?.getTime() ?? 0))
    .map((row) => ({
      id: row.id,
      osNumber: row.osNumber,
      title: row.title,
      description: row.description,
      status: row.status as ServiceOrderStatusLabel,
      openedAt: row.openedAt?.toISOString() ?? null,
      closedAt: row.closedAt?.toISOString() ?? null,
      workedHours: row.workedHours,
      responsibleName: row.responsibleName,
      planningGroup: row.planningGroup,
      operation: row.operation,
      equipmentName: row.equipmentName,
      equipmentCode: row.equipmentCode,
      technicalObjectRaw: row.technicalObjectRaw,
      failureCause: row.failureCause,
      solution: row.solution,
      source: row.source,
      importBatch: row.importBatch
    }));

  return {
    item,
    statusDistribution: buildStatusDistribution(groupRows),
    frequentResponsibles: buildResponsibleStats(groupRows),
    planningGroupBreakdown: topBreakdown(groupRows.map((row) => cleanName(row.planningGroup))),
    serviceOrders
  };
}

/**
 * Ranking de horas apontadas por responsável para um equipamento.
 * Fonte: ServiceOrder.workedHours agregado por responsibleName (fallback confiável,
 * pois TimeEntry não está vinculada às ordens importadas do SAP/Fiori).
 */
export async function getEquipmentHoursByResponsible(
  equipmentId: string,
  params: Partial<CriticalEquipmentFilters> = {}
): Promise<EquipmentHoursByResponsible | null> {
  const rows = await fetchRows(params);
  const groupRows = rows.filter((row) => resolveCode(row) === equipmentId);

  if (!groupRows.length) {
    return null;
  }

  const byResponsible = new Map<string, { hours: number; orders: number }>();
  let totalWorkedHours = 0;

  for (const row of groupRows) {
    const name = cleanResponsible(row.responsibleName);
    const hours = row.workedHours ?? 0;
    totalWorkedHours += hours;
    const current = byResponsible.get(name) ?? { hours: 0, orders: 0 };
    current.hours += hours;
    current.orders += 1;
    byResponsible.set(name, current);
  }

  const responsibles = Array.from(byResponsible.entries())
    .map(([name, value]) => ({
      name,
      totalHours: Number(value.hours.toFixed(3)),
      totalOrders: value.orders,
      participationPercent: totalWorkedHours > 0 ? Math.round((value.hours / totalWorkedHours) * 100) : 0
    }))
    .sort((a, b) => b.totalHours - a.totalHours || b.totalOrders - a.totalOrders);

  const grouping = getEquipmentGroupingKey(groupRows[0]);
  return {
    equipmentName: grouping.name || cleanText(groupRows[0].equipmentName) || NO_NAME,
    equipmentCode: grouping.code || NO_CODE,
    totalWorkedHours: Number(totalWorkedHours.toFixed(3)),
    responsibles
  };
}

/** Detalhe completo de uma ordem (por número da OS). */
export async function getServiceOrderDetails(osNumber: string): Promise<CriticalEquipmentServiceOrder | null> {
  try {
    const order = await prisma.serviceOrder.findFirst({
      where: { osNumber },
      select: {
        id: true,
        osNumber: true,
        title: true,
        description: true,
        status: true,
        openedAt: true,
        closedAt: true,
        workedHours: true,
        responsibleName: true,
        planningGroup: true,
        operation: true,
        equipmentName: true,
        equipmentCode: true,
        technicalObjectRaw: true,
        failureCause: true,
        solution: true,
        source: true,
        importBatch: true
      }
    });

    if (!order) {
      return null;
    }

    return {
      id: order.id,
      osNumber: order.osNumber,
      title: order.title,
      description: order.description,
      status: order.status as ServiceOrderStatusLabel,
      openedAt: order.openedAt?.toISOString() ?? null,
      closedAt: order.closedAt?.toISOString() ?? null,
      workedHours: order.workedHours,
      responsibleName: order.responsibleName,
      planningGroup: order.planningGroup,
      operation: order.operation,
      equipmentName: order.equipmentName,
      equipmentCode: order.equipmentCode,
      technicalObjectRaw: order.technicalObjectRaw,
      failureCause: order.failureCause,
      solution: order.solution,
      source: order.source,
      importBatch: order.importBatch
    };
  } catch (error) {
    console.error("Falha ao carregar detalhe da ordem.", error);
    return null;
  }
}

/**
 * Busca os dados completos da página em uma única consulta ao banco.
 * Toda a agregação é feita aqui (não no componente).
 */
export async function getCriticalEquipmentsPageData(
  params: Partial<CriticalEquipmentFilters> = {}
): Promise<CriticalEquipmentsPageData> {
  const period = await resolvePeriod(params);
  const effective: Partial<CriticalEquipmentFilters> = {
    ...params,
    startDate: period.startDate,
    endDate: period.endDate
  };

  try {
    const [rows, filterOptions] = await Promise.all([fetchRows(effective), loadFilterOptions()]);
    const items = analyzeEquipments(rows, effective);
    const limit = normalizeLimit(params.limit);
    const ranking = items.slice(0, limit);

    const hours: CriticalEquipmentHoursPoint[] = [...items]
      .filter((item) => item.totalWorkedHours > 0)
      .sort((a, b) => b.totalWorkedHours - a.totalWorkedHours)
      .slice(0, limit)
      .map((item) => ({
        id: item.id,
        equipmentName: item.equipmentName,
        equipmentCode: item.equipmentCode,
        totalWorkedHours: item.totalWorkedHours
      }));

    return {
      period,
      summary: buildSummary(items, rows.length),
      ranking,
      hours,
      statusDistribution: buildStatusDistribution(rows),
      trend: buildTrend(rows, items, limit),
      filterOptions,
      source: rows.length ? "database" : "empty"
    };
  } catch (error) {
    console.error("Falha ao carregar análise de equipamentos críticos.", error);
    return emptyPageData(period);
  }
}

/* ------------------------------------------------------------------ */
/* Núcleo de agregação                                                */
/* ------------------------------------------------------------------ */

function analyzeEquipments(
  rows: ServiceOrderRow[],
  params: Partial<CriticalEquipmentFilters>
): CriticalEquipmentItem[] {
  type Accumulator = {
    equipmentName: string;
    equipmentCode: string;
    machinePrefix: string;
    dataQualityIssue: boolean;
    totalOrders: number;
    statusCounts: Record<ServiceOrderStatusLabel, number>;
    totalWorkedHours: number;
    lastOrderDate: Date | null;
    responsibles: Map<string, number>;
    planningGroups: Map<string, number>;
  };

  const groups = new Map<string, Accumulator>();

  for (const row of rows) {
    const grouping = getEquipmentGroupingKey(row);
    const code = grouping.key;
    let group = groups.get(code);

    if (!group) {
      group = {
        equipmentName: grouping.name || cleanText(row.equipmentName) || NO_NAME,
        // Código técnico / local de instalação resolvido (explícito ou extraído do objeto técnico).
        equipmentCode: grouping.code || NO_CODE,
        machinePrefix: grouping.prefix,
        dataQualityIssue: grouping.dataQualityIssue,
        totalOrders: 0,
        statusCounts: emptyStatusCounts(),
        totalWorkedHours: 0,
        lastOrderDate: null,
        responsibles: new Map(),
        planningGroups: new Map()
      };
      groups.set(code, group);
    } else if (group.equipmentName === NO_NAME && (grouping.name || cleanText(row.equipmentName))) {
      // Completa o nome se uma ordem posterior trouxer um nome melhor para o mesmo código.
      group.equipmentName = grouping.name || cleanText(row.equipmentName);
    }

    group.totalOrders += 1;
    group.statusCounts[row.status as ServiceOrderStatusLabel] += 1;
    group.totalWorkedHours += row.workedHours ?? 0;

    if (row.openedAt && (!group.lastOrderDate || row.openedAt > group.lastOrderDate)) {
      group.lastOrderDate = row.openedAt;
    }

    const responsible = cleanName(row.responsibleName);
    if (responsible !== NOT_INFORMED) {
      group.responsibles.set(responsible, (group.responsibles.get(responsible) ?? 0) + 1);
    }

    const planningGroup = cleanName(row.planningGroup);
    if (planningGroup !== NOT_INFORMED) {
      group.planningGroups.set(planningGroup, (group.planningGroups.get(planningGroup) ?? 0) + 1);
    }
  }

  // Filtros pós-agregação no nível do equipamento.
  let aggregated = Array.from(groups.entries()).map(([id, group]) => {
    const backlogOrders =
      group.statusCounts.ABERTA +
      group.statusCounts.LIBERADA +
      group.statusCounts.EM_ANDAMENTO +
      group.statusCounts.AGUARDANDO_MATERIAL;

    return { id, group, backlogOrders };
  });

  if (params.onlyOpenOrders) {
    aggregated = aggregated.filter((entry) => entry.backlogOrders > 0);
  }
  if (params.onlyWithWorkedHours) {
    aggregated = aggregated.filter((entry) => entry.group.totalWorkedHours > 0);
  }

  const maxOrders = Math.max(0, ...aggregated.map((entry) => entry.group.totalOrders));
  const maxWorkedHours = Math.max(0, ...aggregated.map((entry) => entry.group.totalWorkedHours));
  const maxOpenOrders = Math.max(0, ...aggregated.map((entry) => entry.backlogOrders));

  const items: CriticalEquipmentItem[] = aggregated.map(({ id, group, backlogOrders }) => {
    const score = calculateCriticalityScore({
      totalOrders: group.totalOrders,
      maxOrders,
      totalWorkedHours: group.totalWorkedHours,
      maxWorkedHours,
      openOrders: backlogOrders,
      maxOpenOrders
    });

    return {
      id,
      position: 0,
      equipmentName: group.equipmentName,
      equipmentCode: group.equipmentCode,
      machinePrefix: group.machinePrefix,
      dataQualityIssue: group.dataQualityIssue,
      totalOrders: group.totalOrders,
      openOrders: group.statusCounts.ABERTA,
      releasedOrders: group.statusCounts.LIBERADA,
      inProgressOrders: group.statusCounts.EM_ANDAMENTO,
      waitingMaterialOrders: group.statusCounts.AGUARDANDO_MATERIAL,
      closedOrders: group.statusCounts.FECHADA,
      canceledOrders: group.statusCounts.CANCELADA,
      backlogOrders,
      totalWorkedHours: Number(group.totalWorkedHours.toFixed(3)),
      lastOrderDate: group.lastOrderDate?.toISOString() ?? null,
      mainResponsible: pickTop(group.responsibles),
      mainPlanningGroup: pickTop(group.planningGroups),
      criticalityScore: score,
      criticalityLabel: getCriticalityLabel(score)
    };
  });

  items.sort((a, b) => b.totalOrders - a.totalOrders || b.totalWorkedHours - a.totalWorkedHours);
  items.forEach((item, index) => {
    item.position = index + 1;
  });

  return items;
}

function buildSummary(items: CriticalEquipmentItem[], totalOrders: number): CriticalEquipmentSummary {
  const totalEquipmentsAnalyzed = items.length;
  const top = items[0];
  const totalWorkedHours = items.reduce((sum, item) => sum + item.totalWorkedHours, 0);
  const totalOpenOrders = items.reduce((sum, item) => sum + item.backlogOrders, 0);

  return {
    totalEquipmentsAnalyzed,
    totalOrdersInPeriod: totalOrders,
    equipmentWithMostOrders: top?.equipmentName ?? NOT_INFORMED,
    highestOrderCount: top?.totalOrders ?? 0,
    totalWorkedHours: Number(totalWorkedHours.toFixed(3)),
    averageOrdersPerEquipment: totalEquipmentsAnalyzed
      ? Number((totalOrders / totalEquipmentsAnalyzed).toFixed(1))
      : 0,
    totalOpenOrders,
    totalCriticalEquipments: items.filter((item) => item.criticalityScore >= CRITICALITY_SCORE_THRESHOLD).length,
    ordersWithoutTechnicalCode: items
      .filter((item) => item.dataQualityIssue)
      .reduce((sum, item) => sum + item.totalOrders, 0)
  };
}

function buildStatusDistribution(rows: ServiceOrderRow[]): CriticalEquipmentStatusSlice[] {
  const counts = emptyStatusCounts();
  for (const row of rows) {
    counts[row.status as ServiceOrderStatusLabel] += 1;
  }

  return STATUS_ORDER.filter((status) => counts[status] > 0).map((status) => ({
    status,
    label: STATUS_META[status].label,
    value: counts[status],
    color: STATUS_META[status].color
  }));
}

function buildTrend(
  rows: ServiceOrderRow[],
  items: CriticalEquipmentItem[],
  limit: number
): CriticalEquipmentTrendPoint[] {
  const topKeys = new Set(items.slice(0, limit).map((item) => item.id));
  const byPeriod = new Map<string, number>();

  for (const row of rows) {
    if (!row.openedAt || !topKeys.has(resolveCode(row))) {
      continue;
    }
    const key = row.openedAt.toISOString().slice(0, 7); // YYYY-MM
    byPeriod.set(key, (byPeriod.get(key) ?? 0) + 1);
  }

  return Array.from(byPeriod.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([period, totalOrders]) => {
      const [year, month] = period.split("-");
      return { period, label: `${month}/${year}`, totalOrders };
    });
}

/* ------------------------------------------------------------------ */
/* Acesso ao banco e helpers                                          */
/* ------------------------------------------------------------------ */

async function fetchRows(params: Partial<CriticalEquipmentFilters>): Promise<ServiceOrderRow[]> {
  const where = buildWhere(params);

  return prisma.serviceOrder.findMany({
    where,
    select: {
      equipmentName: true,
      equipmentCode: true,
      technicalObjectRaw: true,
      status: true,
      workedHours: true,
      openedAt: true,
      responsibleName: true,
      planningGroup: true,
      planningGroupCode: true,
      area: true,
      title: true,
      osNumber: true,
      operation: true
    }
  });
}

/** Versão com todos os campos exibíveis no detalhe (usada sob demanda no drill-down). */
async function fetchRowsFull(params: Partial<CriticalEquipmentFilters>): Promise<ServiceOrderFullRow[]> {
  const where = buildWhere(params);

  return prisma.serviceOrder.findMany({
    where,
    select: {
      id: true,
      equipmentName: true,
      equipmentCode: true,
      status: true,
      workedHours: true,
      openedAt: true,
      closedAt: true,
      responsibleName: true,
      planningGroup: true,
      planningGroupCode: true,
      area: true,
      title: true,
      osNumber: true,
      operation: true,
      description: true,
      technicalObjectRaw: true,
      failureCause: true,
      solution: true,
      source: true,
      importBatch: true
    }
  }) as Promise<ServiceOrderFullRow[]>;
}

function buildWhere(params: Partial<CriticalEquipmentFilters>): Prisma.ServiceOrderWhereInput {
  const and: Prisma.ServiceOrderWhereInput[] = [];

  if (params.startDate || params.endDate) {
    and.push({
      openedAt: {
        ...(params.startDate ? { gte: toStartOfDay(params.startDate) } : {}),
        ...(params.endDate ? { lte: toEndOfDay(params.endDate) } : {})
      }
    });
  }

  const statuses = (params.statuses ?? []).filter(Boolean) as ServiceOrderStatus[];
  if (statuses.length) {
    and.push({ status: { in: statuses } });
  }

  const areas = (params.areas ?? [])
    .map((value) => normalizeArea(value))
    .filter((value): value is MaintenanceArea => Boolean(value));
  if (areas.length) {
    and.push({ area: { in: areas } });
  }

  const planningGroups = (params.planningGroups ?? []).filter(Boolean);
  if (planningGroups.length) {
    and.push({
      OR: [{ planningGroup: { in: planningGroups } }, { planningGroupCode: { in: planningGroups } }]
    });
  }

  const responsibles = (params.responsibleNames ?? []).filter(Boolean);
  if (responsibles.length) {
    and.push({ OR: responsibles.map((value) => buildResponsibleClause(value)) });
  }

  return and.length ? { AND: and } : {};
}

function buildResponsibleClause(value: string): Prisma.ServiceOrderWhereInput {
  if (value === "SEM RESPONSÁVEL") {
    return {
      OR: [
        { responsibleName: null },
        { responsibleName: "" },
        { responsibleName: "SEM RESPONSÁVEL" }
      ]
    };
  }

  const name = value.replace(/\s+\([^)]*\)$/, "").trim();
  return { responsibleName: name };
}

async function loadFilterOptions(): Promise<CriticalEquipmentFilterOptions> {
  try {
    const options = await getServiceOrderFilterOptions();
    return {
      statuses: options.statuses,
      areas: options.areas,
      planningGroups: options.planningGroups,
      responsibles: options.responsibles
    };
  } catch (error) {
    console.error("Falha ao carregar opções de filtro de equipamentos críticos.", error);
    return { statuses: [], areas: [], planningGroups: [], responsibles: [] };
  }
}

async function resolvePeriod(
  params: Partial<CriticalEquipmentFilters>
): Promise<{ startDate: string; endDate: string }> {
  if (params.startDate && params.endDate) {
    return { startDate: params.startDate, endDate: params.endDate };
  }

  try {
    const range = await prisma.serviceOrder.aggregate({
      _min: { openedAt: true },
      _max: { openedAt: true }
    });
    const min = range._min.openedAt;
    const max = range._max.openedAt;

    if (min && max) {
      return {
        startDate: params.startDate ?? toInputDate(min),
        endDate: params.endDate ?? toInputDate(max)
      };
    }
  } catch (error) {
    console.error("Falha ao resolver período padrão de equipamentos críticos.", error);
  }

  const today = toInputDate(new Date());
  return { startDate: params.startDate ?? today, endDate: params.endDate ?? today };
}

function emptyPageData(period: { startDate: string; endDate: string }): CriticalEquipmentsPageData {
  return {
    period,
    summary: {
      totalEquipmentsAnalyzed: 0,
      totalOrdersInPeriod: 0,
      equipmentWithMostOrders: NOT_INFORMED,
      highestOrderCount: 0,
      totalWorkedHours: 0,
      averageOrdersPerEquipment: 0,
      totalOpenOrders: 0,
      totalCriticalEquipments: 0,
      ordersWithoutTechnicalCode: 0
    },
    ranking: [],
    hours: [],
    statusDistribution: [],
    trend: [],
    filterOptions: { statuses: [], areas: [], planningGroups: [], responsibles: [] },
    source: "empty"
  };
}

function emptyStatusCounts(): Record<ServiceOrderStatusLabel, number> {
  return {
    ABERTA: 0,
    LIBERADA: 0,
    EM_ANDAMENTO: 0,
    AGUARDANDO_MATERIAL: 0,
    FECHADA: 0,
    CANCELADA: 0
  };
}

/**
 * Chave de agrupamento da máquina: código técnico explícito → código extraído do
 * objeto técnico (local de instalação) → nome → genérico. Fonte única em
 * technical-object-normalizer para o ranking e o detalhe agruparem igual.
 */
function resolveCode(row: { equipmentCode: string | null; equipmentName: string | null; technicalObjectRaw: string | null }): string {
  return getEquipmentGroupingKey(row).key;
}

function pickTop(counts: Map<string, number>): string {
  let topName = NOT_INFORMED;
  let topCount = 0;
  for (const [name, count] of Array.from(counts.entries())) {
    if (count > topCount) {
      topCount = count;
      topName = name;
    }
  }
  return topName;
}

function buildResponsibleStats(rows: ServiceOrderRow[]): Array<{ name: string; count: number; hours: number }> {
  const map = new Map<string, { count: number; hours: number }>();
  for (const row of rows) {
    const name = cleanResponsible(row.responsibleName);
    const current = map.get(name) ?? { count: 0, hours: 0 };
    current.count += 1;
    current.hours += row.workedHours ?? 0;
    map.set(name, current);
  }

  return Array.from(map.entries())
    .map(([name, value]) => ({ name, count: value.count, hours: Number(value.hours.toFixed(3)) }))
    .sort((a, b) => b.count - a.count || b.hours - a.hours)
    .slice(0, 6);
}

function cleanResponsible(value: string | null | undefined): string {
  return cleanText(value) || "SEM RESPONSÁVEL";
}

function topBreakdown(values: string[]): Array<{ name: string; count: number }> {
  const counts = new Map<string, number>();
  for (const value of values) {
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }
  return Array.from(counts.entries())
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);
}

function cleanText(value: string | null | undefined): string {
  return (value ?? "").trim();
}

function cleanName(value: string | null | undefined): string {
  const text = cleanText(value);
  return text || NOT_INFORMED;
}

function normalizeLimit(limit?: number): number {
  if (!limit || !Number.isFinite(limit) || limit <= 0) {
    return DEFAULT_LIMIT;
  }
  return Math.min(50, Math.floor(limit));
}

function normalizeArea(value: string): MaintenanceArea | null {
  const normalized = value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .toLowerCase();

  const map: Record<string, MaintenanceArea> = {
    mecanica: MaintenanceArea.MECANICA,
    eletrica: MaintenanceArea.ELETRICA,
    lubrificacao: MaintenanceArea.LUBRIFICACAO,
    pcm: MaintenanceArea.PCM,
    operacional: MaintenanceArea.OPERACIONAL
  };

  return map[normalized] ?? null;
}
