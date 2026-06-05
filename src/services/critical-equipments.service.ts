import { MaintenanceArea, Prisma, ServiceOrderStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getServiceOrderFilterOptions } from "@/services/service-orders.service";
import type {
  CriticalEquipmentDetails,
  CriticalEquipmentFilterOptions,
  CriticalEquipmentFilters,
  CriticalEquipmentHoursPoint,
  CriticalEquipmentItem,
  CriticalEquipmentStatusSlice,
  CriticalEquipmentSummary,
  CriticalEquipmentTrendPoint,
  CriticalEquipmentsPageData,
  CriticalityLabel,
  CriticalityScoreInput
} from "@/types/critical-equipments";
import type { ServiceOrderStatusLabel } from "@/types/service-orders";

const DEFAULT_LIMIT = 10;
const NO_NAME = "EQUIPAMENTO NÃO INFORMADO";
const NO_CODE = "SEM CÓDIGO";
const NOT_INFORMED = "Não informado";

/** Status considerados "em aberto" (backlog operacional). */
const OPEN_STATUSES: ServiceOrderStatus[] = [
  ServiceOrderStatus.ABERTA,
  ServiceOrderStatus.LIBERADA,
  ServiceOrderStatus.EM_ANDAMENTO,
  ServiceOrderStatus.AGUARDANDO_MATERIAL
];

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

  const score = ordersScore * 0.6 + hoursScore * 0.3 + openScore * 0.1;
  return Math.min(100, Math.max(0, Math.round(score)));
}

export function getCriticalityLabel(score: number): CriticalityLabel {
  if (score >= 70) {
    return "Crítico";
  }
  if (score >= 40) {
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
  const rows = await fetchRows(params);
  const groupRows = rows.filter((row) => resolveCode(row) === equipmentId);

  if (!groupRows.length) {
    return null;
  }

  const items = analyzeEquipments(rows, params);
  const item = items.find((current) => current.id === equipmentId);

  if (!item) {
    return null;
  }

  const lastOrders = [...groupRows]
    .sort((a, b) => (b.openedAt?.getTime() ?? 0) - (a.openedAt?.getTime() ?? 0))
    .slice(0, 10)
    .map((row) => ({
      osNumber: row.osNumber,
      title: row.title,
      status: row.status as ServiceOrderStatusLabel,
      openedAt: row.openedAt?.toISOString() ?? null,
      workedHours: row.workedHours,
      operation: row.operation
    }));

  return {
    item,
    lastOrders,
    responsibleBreakdown: topBreakdown(groupRows.map((row) => cleanName(row.responsibleName))),
    planningGroupBreakdown: topBreakdown(groupRows.map((row) => cleanName(row.planningGroup))),
    statusDistribution: buildStatusDistribution(groupRows)
  };
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
    totalOrders: number;
    statusCounts: Record<ServiceOrderStatusLabel, number>;
    totalWorkedHours: number;
    lastOrderDate: Date | null;
    responsibles: Map<string, number>;
    planningGroups: Map<string, number>;
  };

  const groups = new Map<string, Accumulator>();

  for (const row of rows) {
    const code = resolveCode(row);
    let group = groups.get(code);

    if (!group) {
      group = {
        equipmentName: cleanText(row.equipmentName) || NO_NAME,
        equipmentCode: cleanText(row.equipmentCode) || NO_CODE,
        totalOrders: 0,
        statusCounts: emptyStatusCounts(),
        totalWorkedHours: 0,
        lastOrderDate: null,
        responsibles: new Map(),
        planningGroups: new Map()
      };
      groups.set(code, group);
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
    totalCriticalEquipments: items.filter((item) => item.criticalityScore >= 70).length
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
  const topCodes = new Set(items.slice(0, limit).map((item) => item.equipmentCode));
  const byPeriod = new Map<string, number>();

  for (const row of rows) {
    if (!row.openedAt || !topCodes.has(resolveCodeDisplay(row))) {
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
      totalCriticalEquipments: 0
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

/** Chave de agrupamento (código quando houver; senão nome; senão genérico). */
function resolveCode(row: ServiceOrderRow): string {
  return cleanText(row.equipmentCode) || `nome:${cleanText(row.equipmentName)}` || "sem-id";
}

function resolveCodeDisplay(row: ServiceOrderRow): string {
  return cleanText(row.equipmentCode) || NO_CODE;
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

function toStartOfDay(value: string): Date {
  const date = new Date(value);
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), 0, 0, 0, 0));
}

function toEndOfDay(value: string): Date {
  const date = new Date(value);
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), 23, 59, 59, 999));
}

function toInputDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}
