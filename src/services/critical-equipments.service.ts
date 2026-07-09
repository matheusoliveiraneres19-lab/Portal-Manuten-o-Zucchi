import { MaintenanceArea, MaintenanceType, Prisma, ServiceOrderStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getServiceOrderFilterOptions } from "@/services/service-orders.service";
import { excludeLubricationOrderWhere } from "@/utils/service-order-filters";
import {
  excludeInvalidTestEquipmentWhere,
  isInvalidTestEquipmentOrder,
  isProgrammedPreventiveOrder
} from "@/utils/service-order-classification";
import {
  ATTENTION_SCORE_THRESHOLD,
  CRITICALITY_SCORE_THRESHOLD,
  CRITICALITY_WEIGHTS,
  MONITOR_SCORE_THRESHOLD,
  RECURRENCE_MIN_ORDERS
} from "@/services/shared/portal-rules";
import { toEndOfDay, toStartOfDay } from "@/utils/date-range";
import { toInputDate } from "@/utils/period";
import {
  getFamilyLabel,
  getRootFunctionalLocation,
  type FunctionalLocationLite
} from "@/utils/functional-location-hierarchy";
import type {
  CriticalEquipmentComponent,
  CriticalEquipmentDetails,
  CriticalEquipmentFamilySlice,
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
  EquipmentHoursByResponsible,
  TrendDirection
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
  failureCause: string | null;
  solution: string | null;
  source: string | null;
  importBatch: string | null;
};

/* ------------------------------------------------------------------ */
/* Score                                                              */
/* ------------------------------------------------------------------ */

/**
 * Score crítico gerencial (0–100):
 *  - 35% volume de ordens (normalizado);
 *  - 25% horas apontadas (normalizado);
 *  - 20% ordens em aberto (normalizado);
 *  - 10% reincidência (repetição de OS no ativo, normalizada);
 *  - 10% tendência de piora (aumento de OS nos últimos meses, 0–1).
 * Blindado contra divisão por zero (nunca gera NaN/Infinity).
 */
export function calculateCriticalityScore(input: CriticalityScoreInput): number {
  const ordersScore = input.maxOrders > 0 ? (input.totalOrders / input.maxOrders) * 100 : 0;
  const hoursScore = input.maxWorkedHours > 0 ? (input.totalWorkedHours / input.maxWorkedHours) * 100 : 0;
  const openScore = input.maxOpenOrders > 0 ? (input.openOrders / input.maxOpenOrders) * 100 : 0;
  const recurrenceScore = input.maxRecurrence > 0 ? (input.recurrence / input.maxRecurrence) * 100 : 0;
  const trendScore = clamp01(input.worseningTrend) * 100;

  const score =
    ordersScore * CRITICALITY_WEIGHTS.orders +
    hoursScore * CRITICALITY_WEIGHTS.hours +
    openScore * CRITICALITY_WEIGHTS.openOrders +
    recurrenceScore * CRITICALITY_WEIGHTS.recurrence +
    trendScore * CRITICALITY_WEIGHTS.worseningTrend;

  if (!Number.isFinite(score)) {
    return 0;
  }
  return Math.min(100, Math.max(0, Math.round(score)));
}

export function getCriticalityLabel(score: number): CriticalityLabel {
  if (score >= CRITICALITY_SCORE_THRESHOLD) {
    return "Crítico";
  }
  if (score >= ATTENTION_SCORE_THRESHOLD) {
    return "Atenção";
  }
  if (score >= MONITOR_SCORE_THRESHOLD) {
    return "Monitorado";
  }
  return "Normal";
}

/* ------------------------------------------------------------------ */
/* Funções públicas                                                   */
/* ------------------------------------------------------------------ */

export async function getCriticalEquipmentsByOrders(
  params: Partial<CriticalEquipmentFilters> = {}
): Promise<CriticalEquipmentItem[]> {
  const [rows, lookup] = await Promise.all([fetchRows(params), loadFunctionalLocationLookup()]);
  const items = analyzeEquipments(rows, params, lookup);
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
  const [rows, lookup] = await Promise.all([fetchRows(params), loadFunctionalLocationLookup()]);
  const items = analyzeEquipments(rows, params, lookup);
  return buildSummary(items, rows.length, rows.length);
}

export async function getCriticalEquipmentsTrend(
  params: Partial<CriticalEquipmentFilters> = {}
): Promise<CriticalEquipmentTrendPoint[]> {
  const [rows, lookup] = await Promise.all([fetchRows(params), loadFunctionalLocationLookup()]);
  const items = analyzeEquipments(rows, params, lookup);
  return buildTrend(rows, items, normalizeLimit(params.limit), lookup);
}

export async function getCriticalEquipmentDetails(
  equipmentId: string,
  params: Partial<CriticalEquipmentFilters> = {}
): Promise<CriticalEquipmentDetails | null> {
  const [rows, lookup] = await Promise.all([fetchRowsFull(params), loadFunctionalLocationLookup()]);
  const groupRows = rows.filter((row) => resolveRootKey(row, lookup) === equipmentId);

  if (!groupRows.length) {
    return null;
  }

  const items = analyzeEquipments(rows, params, lookup);
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
    componentBreakdown: buildComponentBreakdown(groupRows, lookup),
    trend: buildTrendForRows(groupRows),
    serviceOrders
  };
}

/**
 * Ranking de horas apontadas por responsável para um equipamento.
 * Fonte: ServiceOrder.workedHours agregado por responsibleName.
 */
export async function getEquipmentHoursByResponsible(
  equipmentId: string,
  params: Partial<CriticalEquipmentFilters> = {}
): Promise<EquipmentHoursByResponsible | null> {
  const [rows, lookup] = await Promise.all([fetchRows(params), loadFunctionalLocationLookup()]);
  const groupRows = rows.filter((row) => resolveRootKey(row, lookup) === equipmentId);

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

  const root = getRootFunctionalLocation(groupRows[0], lookup);
  return {
    equipmentName: root.rootDescription || NO_NAME,
    equipmentCode: root.rootTag || NO_CODE,
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
    const [rawRows, filterOptions, lookup] = await Promise.all([
      fetchRowsRaw(effective),
      loadFilterOptions(),
      loadFunctionalLocationLookup()
    ]);

    // Passo 2: excluir registros de teste sem equipamento ("Equipamento não informado").
    const validEquipmentRows = rawRows.filter((row) => !isInvalidTestEquipmentOrder(row));
    const ignoredInvalidEquipment = rawRows.length - validEquipmentRows.length;

    // Passo 3: após período + filtros de tela, excluir PL/PV da criticidade.
    const rows = validEquipmentRows.filter((row) => !isProgrammedPreventiveOrder(row));
    const ignoredPreventiveOrders = validEquipmentRows.length - rows.length;

    // Auditoria: totais devem bater com Ordens de Manutenção no mesmo período.
    console.info(
      `[equipamentos-criticos] período ${period.startDate}→${period.endDate} | OS brutas: ${rawRows.length} | equip. não informado ignoradas: ${ignoredInvalidEquipment} | PL/PV ignoradas: ${ignoredPreventiveOrders} | OS consideradas: ${rows.length}`
    );

    const items = analyzeEquipments(rows, effective, lookup);
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

    const summary = buildSummary(items, rows.length, rawRows.length, ignoredPreventiveOrders, ignoredInvalidEquipment);

    return {
      period,
      summary,
      ranking,
      hours,
      statusDistribution: buildStatusDistribution(rows),
      trend: buildTrend(rows, items, limit, lookup),
      familyDistribution: buildFamilyDistribution(items),
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

type ComponentAccumulator = {
  tag: string;
  description: string;
  familyLabel: string;
  totalOrders: number;
  openOrders: number;
  workedHours: number;
};

function analyzeEquipments(
  rows: ServiceOrderRow[],
  params: Partial<CriticalEquipmentFilters>,
  lookup: Map<string, FunctionalLocationLite>
): CriticalEquipmentItem[] {
  type Accumulator = {
    equipmentName: string;
    rootTag: string;
    equipmentCode: string;
    familyCode: string;
    familyLabel: string;
    costCenter: string;
    sector: string;
    machinePrefix: string;
    dataQualityIssue: boolean;
    hasDirectRootName: boolean;
    totalOrders: number;
    statusCounts: Record<ServiceOrderStatusLabel, number>;
    totalWorkedHours: number;
    lastOrderDate: Date | null;
    responsibles: Map<string, number>;
    planningGroups: Map<string, number>;
    components: Set<string>;
    firstHalfOrders: number;
    secondHalfOrders: number;
  };

  const midpoint = computeGlobalMidpoint(rows);
  const groups = new Map<string, Accumulator>();

  for (const row of rows) {
    const root = getRootFunctionalLocation(row, lookup);
    const key = root.rootTag;
    let group = groups.get(key);

    if (!group) {
      group = {
        equipmentName: root.rootDescription || NO_NAME,
        rootTag: root.rootTag,
        equipmentCode: root.dataQualityIssue ? NO_CODE : root.rootTag,
        familyCode: root.familyCode,
        familyLabel: root.familyLabel,
        costCenter: root.costCenter ?? "",
        sector: extractSector(root.rootTag, root.dataQualityIssue),
        machinePrefix: root.familyCode,
        dataQualityIssue: root.dataQualityIssue,
        hasDirectRootName: !root.componentTag && !root.dataQualityIssue,
        totalOrders: 0,
        statusCounts: emptyStatusCounts(),
        totalWorkedHours: 0,
        lastOrderDate: null,
        responsibles: new Map(),
        planningGroups: new Map(),
        components: new Set(),
        firstHalfOrders: 0,
        secondHalfOrders: 0
      };
      groups.set(key, group);
    } else if (!root.componentTag && !root.dataQualityIssue && !group.hasDirectRootName) {
      // OS registrada exatamente na raiz traz o melhor nome oficial.
      group.equipmentName = root.rootDescription || group.equipmentName;
      group.hasDirectRootName = true;
    }
    if (!group.costCenter && root.costCenter) {
      group.costCenter = root.costCenter;
    }

    group.totalOrders += 1;
    group.statusCounts[row.status as ServiceOrderStatusLabel] += 1;
    group.totalWorkedHours += row.workedHours ?? 0;

    if (root.componentTag) {
      group.components.add(root.componentTag);
    }

    if (row.openedAt) {
      if (!group.lastOrderDate || row.openedAt > group.lastOrderDate) {
        group.lastOrderDate = row.openedAt;
      }
      if (midpoint && row.openedAt.getTime() >= midpoint) {
        group.secondHalfOrders += 1;
      } else {
        group.firstHalfOrders += 1;
      }
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

  // Filtros pós-agregação no nível do equipamento (não afetam a fonte de OS).
  const families = normalizeSet(params.families);
  const costCenters = normalizeSet(params.costCenters);
  const sectors = normalizeSet(params.sectors);

  let aggregated = Array.from(groups.entries()).map(([id, group]) => {
    const backlogOrders =
      group.statusCounts.ABERTA +
      group.statusCounts.LIBERADA +
      group.statusCounts.EM_ANDAMENTO +
      group.statusCounts.AGUARDANDO_MATERIAL;
    return { id, group, backlogOrders };
  });

  if (families.size) {
    aggregated = aggregated.filter((entry) => families.has(entry.group.familyLabel.toUpperCase()));
  }
  if (costCenters.size) {
    aggregated = aggregated.filter((entry) => costCenters.has(entry.group.costCenter.toUpperCase()));
  }
  if (sectors.size) {
    aggregated = aggregated.filter((entry) => sectors.has(entry.group.sector.toUpperCase()));
  }
  if (params.onlyOpenOrders) {
    aggregated = aggregated.filter((entry) => entry.backlogOrders > 0);
  }
  if (params.onlyWithWorkedHours) {
    aggregated = aggregated.filter((entry) => entry.group.totalWorkedHours > 0);
  }
  if (params.onlyRecurrent) {
    aggregated = aggregated.filter((entry) => entry.group.totalOrders >= RECURRENCE_MIN_ORDERS);
  }

  const maxOrders = Math.max(0, ...aggregated.map((entry) => entry.group.totalOrders));
  const maxWorkedHours = Math.max(0, ...aggregated.map((entry) => entry.group.totalWorkedHours));
  const maxOpenOrders = Math.max(0, ...aggregated.map((entry) => entry.backlogOrders));
  const maxRecurrence = Math.max(0, ...aggregated.map((entry) => Math.max(0, entry.group.totalOrders - 1)));

  let items: CriticalEquipmentItem[] = aggregated.map(({ id, group, backlogOrders }) => {
    const trend = computeTrend(group.firstHalfOrders, group.secondHalfOrders);
    const recurrence = Math.max(0, group.totalOrders - 1);

    const score = calculateCriticalityScore({
      totalOrders: group.totalOrders,
      maxOrders,
      totalWorkedHours: group.totalWorkedHours,
      maxWorkedHours,
      openOrders: backlogOrders,
      maxOpenOrders,
      recurrence,
      maxRecurrence,
      worseningTrend: trend.worsening
    });

    return {
      id,
      position: 0,
      equipmentName: group.equipmentName,
      equipmentCode: group.equipmentCode,
      rootTag: group.rootTag,
      familyCode: group.familyCode,
      familyLabel: group.familyLabel,
      costCenter: group.costCenter,
      sector: group.sector,
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
      averageHoursPerOrder: group.totalOrders > 0 ? Number((group.totalWorkedHours / group.totalOrders).toFixed(2)) : 0,
      componentCount: group.components.size,
      isRecurrent: group.totalOrders >= RECURRENCE_MIN_ORDERS,
      trendDirection: trend.direction,
      trendDelta: trend.delta,
      lastOrderDate: group.lastOrderDate?.toISOString() ?? null,
      mainResponsible: pickTop(group.responsibles),
      mainPlanningGroup: pickTop(group.planningGroups),
      criticalityScore: score,
      criticalityLabel: getCriticalityLabel(score)
    };
  });

  // Filtro de exibição (não altera os máximos/score): somente críticos.
  if (params.onlyCritical) {
    items = items.filter((item) => item.criticalityScore >= CRITICALITY_SCORE_THRESHOLD);
  }

  items.sort((a, b) => b.totalOrders - a.totalOrders || b.totalWorkedHours - a.totalWorkedHours);
  items.forEach((item, index) => {
    item.position = index + 1;
  });

  return items;
}

function buildSummary(
  items: CriticalEquipmentItem[],
  totalOrders: number,
  rawOrders: number,
  ignoredPreventiveOrders = 0,
  ignoredInvalidEquipment = 0
): CriticalEquipmentSummary {
  const totalEquipmentsAnalyzed = items.length;
  // "Equipamento com mais ordens": prioriza o ativo IDENTIFICADO (com raiz),
  // evitando exibir o bucket genérico como líder.
  const top = items.find((item) => !item.dataQualityIssue) ?? items[0];
  const totalWorkedHours = items.reduce((sum, item) => sum + item.totalWorkedHours, 0);
  const totalOpenOrders = items.reduce((sum, item) => sum + item.backlogOrders, 0);
  const criticalItems = items.filter((item) => item.criticalityScore >= CRITICALITY_SCORE_THRESHOLD);
  const mostCritical = items.reduce<CriticalEquipmentItem | null>(
    (best, item) =>
      !item.dataQualityIssue && (!best || item.criticalityScore > best.criticalityScore) ? item : best,
    null
  );

  return {
    totalEquipmentsAnalyzed,
    totalOrdersInPeriod: totalOrders,
    equipmentWithMostOrders: top?.equipmentName ?? NOT_INFORMED,
    highestOrderCount: top?.totalOrders ?? 0,
    mostCriticalEquipment: mostCritical?.equipmentName ?? top?.equipmentName ?? NOT_INFORMED,
    highestCriticalityScore: mostCritical?.criticalityScore ?? 0,
    totalWorkedHours: Number(totalWorkedHours.toFixed(3)),
    averageOrdersPerEquipment: totalEquipmentsAnalyzed
      ? Number((totalOrders / totalEquipmentsAnalyzed).toFixed(1))
      : 0,
    totalOpenOrders,
    openOrdersOnCriticalEquipments: criticalItems.reduce((sum, item) => sum + item.backlogOrders, 0),
    totalCriticalEquipments: criticalItems.length,
    totalRecurrentEquipments: items.filter((item) => item.isRecurrent).length,
    ordersWithoutTechnicalCode: items
      .filter((item) => item.dataQualityIssue)
      .reduce((sum, item) => sum + item.totalOrders, 0),
    ignoredPreventiveOrders,
    ignoredInvalidEquipment,
    rawOrdersInPeriod: rawOrders
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
  limit: number,
  lookup: Map<string, FunctionalLocationLite>
): CriticalEquipmentTrendPoint[] {
  const topKeys = new Set(items.slice(0, limit).map((item) => item.id));
  const relevant = rows.filter((row) => topKeys.has(resolveRootKey(row, lookup)));
  return buildTrendForRows(relevant);
}

/** Evolução mensal (YYYY-MM) para um conjunto de OS. */
function buildTrendForRows(rows: Array<{ openedAt: Date | null }>): CriticalEquipmentTrendPoint[] {
  const byPeriod = new Map<string, number>();
  for (const row of rows) {
    if (!row.openedAt) {
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

/**
 * Distribuição de OS por família de equipamento (gráfico de família). Agrupa pelo
 * RÓTULO desambiguado (não pelo código cru), evitando misturar máquinas que
 * reutilizam o mesmo código de família (ex.: PT = Pórtico vs. Plataforma).
 */
function buildFamilyDistribution(items: CriticalEquipmentItem[]): CriticalEquipmentFamilySlice[] {
  const byFamily = new Map<string, CriticalEquipmentFamilySlice>();
  for (const item of items) {
    const label = item.familyLabel || "Não informado";
    const key = label.toUpperCase();
    const slice =
      byFamily.get(key) ??
      {
        familyCode: item.familyCode || "",
        familyLabel: label,
        totalOrders: 0,
        totalEquipments: 0,
        totalWorkedHours: 0
      };
    slice.totalOrders += item.totalOrders;
    slice.totalEquipments += 1;
    slice.totalWorkedHours += item.totalWorkedHours;
    byFamily.set(key, slice);
  }

  return Array.from(byFamily.values())
    .map((slice) => ({ ...slice, totalWorkedHours: Number(slice.totalWorkedHours.toFixed(3)) }))
    .sort((a, b) => b.totalOrders - a.totalOrders);
}

/** Ramificações/componentes com mais OS dentro de um ativo raiz (drill-down). */
function buildComponentBreakdown(
  rows: ServiceOrderRow[],
  lookup: Map<string, FunctionalLocationLite>
): CriticalEquipmentComponent[] {
  const byComponent = new Map<string, ComponentAccumulator>();
  const openStatuses = new Set<ServiceOrderStatusLabel>([
    "ABERTA",
    "LIBERADA",
    "EM_ANDAMENTO",
    "AGUARDANDO_MATERIAL"
  ]);

  for (const row of rows) {
    const root = getRootFunctionalLocation(row, lookup);
    // Componente = ramificação; OS na própria raiz cai em "Equipamento (raiz)".
    const tag = root.componentTag ?? root.rootTag;
    const description = root.componentTag
      ? root.componentDescription || cleanText(row.equipmentName) || tag
      : "Equipamento (raiz)";
    const familyLabel = root.componentTag ? getFamilyLabel(extractComponentFamily(root.componentTag)) : root.familyLabel;

    const acc =
      byComponent.get(tag) ??
      { tag, description, familyLabel, totalOrders: 0, openOrders: 0, workedHours: 0 };
    acc.totalOrders += 1;
    acc.workedHours += row.workedHours ?? 0;
    if (openStatuses.has(row.status as ServiceOrderStatusLabel)) {
      acc.openOrders += 1;
    }
    byComponent.set(tag, acc);
  }

  return Array.from(byComponent.values())
    .map((acc) => ({
      tag: acc.tag,
      description: acc.description,
      familyLabel: acc.familyLabel,
      totalOrders: acc.totalOrders,
      openOrders: acc.openOrders,
      totalWorkedHours: Number(acc.workedHours.toFixed(3))
    }))
    .sort((a, b) => b.totalOrders - a.totalOrders || b.totalWorkedHours - a.totalWorkedHours)
    .slice(0, 12);
}

/* ------------------------------------------------------------------ */
/* Tendência / helpers de score                                       */
/* ------------------------------------------------------------------ */

/** Ponto médio (timestamp) do intervalo coberto pelas OS, p/ dividir a tendência. */
function computeGlobalMidpoint(rows: Array<{ openedAt: Date | null }>): number | null {
  let min = Number.POSITIVE_INFINITY;
  let max = Number.NEGATIVE_INFINITY;
  for (const row of rows) {
    if (!row.openedAt) {
      continue;
    }
    const t = row.openedAt.getTime();
    if (t < min) min = t;
    if (t > max) max = t;
  }
  if (!Number.isFinite(min) || !Number.isFinite(max) || min === max) {
    return null;
  }
  return min + (max - min) / 2;
}

function computeTrend(
  firstHalf: number,
  secondHalf: number
): { direction: TrendDirection; delta: number; worsening: number } {
  const total = firstHalf + secondHalf;
  if (total === 0) {
    return { direction: "stable", delta: 0, worsening: 0 };
  }
  // Variação percentual (blindada contra divisão por zero).
  const delta =
    firstHalf > 0
      ? Math.round(((secondHalf - firstHalf) / firstHalf) * 100)
      : secondHalf > 0
        ? 100
        : 0;

  let direction: TrendDirection = "stable";
  if (secondHalf > firstHalf * 1.15) {
    direction = "up";
  } else if (secondHalf < firstHalf * 0.85) {
    direction = "down";
  }

  // worsening 0–1: fração de piora relativa (só quando aumentou).
  const worsening = secondHalf > firstHalf ? clamp01((secondHalf - firstHalf) / total) : 0;
  return { direction, delta, worsening };
}

/* ------------------------------------------------------------------ */
/* Acesso ao banco e helpers                                          */
/* ------------------------------------------------------------------ */

/**
 * Consulta bruta (período + filtros de tela) SEM excluir PL/PV. Usada apenas
 * internamente para permitir contar quantas preventivas programadas foram
 * ignoradas na análise (auditoria) numa única leitura do banco.
 */
async function fetchRowsRaw(params: Partial<CriticalEquipmentFilters>): Promise<ServiceOrderRow[]> {
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

/**
 * Ordens de Manutenção VÁLIDAS para criticidade: exclui as preventivas
 * programadas (PL/PV) e os registros de teste sem equipamento.
 */
async function fetchRows(params: Partial<CriticalEquipmentFilters>): Promise<ServiceOrderRow[]> {
  const rows = await fetchRowsRaw(params);
  return rows.filter((row) => !isInvalidTestEquipmentOrder(row) && !isProgrammedPreventiveOrder(row));
}

/** Versão com todos os campos exibíveis no detalhe (usada sob demanda no drill-down). */
async function fetchRowsFull(params: Partial<CriticalEquipmentFilters>): Promise<ServiceOrderFullRow[]> {
  const where = buildWhere(params);

  const rows = (await prisma.serviceOrder.findMany({
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
  })) as ServiceOrderFullRow[];

  return rows.filter((row) => !isInvalidTestEquipmentOrder(row) && !isProgrammedPreventiveOrder(row));
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
      OR: [{ responsibleName: null }, { responsibleName: "" }, { responsibleName: "SEM RESPONSÁVEL" }]
    };
  }

  const name = value.replace(/\s+\([^)]*\)$/, "").trim();
  return { responsibleName: name };
}

/**
 * Carrega o cadastro de LOCAIS DE INSTALAÇÃO (planilha importada) num Map por TAG
 * normalizado, para enriquecer/sobrepor a resolução da raiz. É OPCIONAL: se a
 * tabela estiver vazia ou indisponível, retorna Map vazio e o resolvedor usa o
 * padrão estrutural do TAG (funciona sem a planilha).
 */
async function loadFunctionalLocationLookup(): Promise<Map<string, FunctionalLocationLite>> {
  try {
    const rows = await prisma.functionalLocation.findMany({
      select: {
        tag: true,
        description: true,
        costCenter: true,
        rootTag: true,
        rootDescription: true,
        equipmentFamily: true
      }
    });
    const map = new Map<string, FunctionalLocationLite>();
    for (const row of rows) {
      map.set(row.tag, row);
    }
    return map;
  } catch (error) {
    console.warn("[equipamentos-criticos] cadastro de locais indisponível — usando padrão estrutural.", error);
    return new Map();
  }
}

async function loadFilterOptions(): Promise<CriticalEquipmentFilterOptions> {
  try {
    const [options, lookup, codes] = await Promise.all([
      getServiceOrderFilterOptions(),
      loadFunctionalLocationLookup(),
      prisma.serviceOrder.findMany({
        where: excludeInvalidTestEquipmentWhere(),
        select: { equipmentCode: true, equipmentName: true, technicalObjectRaw: true },
        distinct: ["equipmentCode"]
      })
    ]);

    // Famílias por RÓTULO desambiguado (valor = rótulo), coerente com o filtro.
    const familySet = new Set<string>();
    const sectorSet = new Set<string>();
    const costCenterSet = new Set<string>();

    for (const row of codes) {
      const root = getRootFunctionalLocation(row, lookup);
      if (root.dataQualityIssue) {
        continue;
      }
      if (root.familyCode && root.familyLabel && root.familyLabel !== "Não informado") {
        familySet.add(root.familyLabel);
      }
      const sector = extractSector(root.rootTag, false);
      if (sector) {
        sectorSet.add(sector);
      }
      if (root.costCenter) {
        costCenterSet.add(root.costCenter);
      }
    }

    return {
      statuses: options.statuses,
      areas: options.areas,
      planningGroups: options.planningGroups,
      responsibles: options.responsibles,
      families: Array.from(familySet)
        .map((label) => ({ value: label, label }))
        .sort((a, b) => a.label.localeCompare(b.label, "pt-BR")),
      costCenters: Array.from(costCenterSet).sort((a, b) => a.localeCompare(b, "pt-BR")),
      sectors: Array.from(sectorSet).sort((a, b) => a.localeCompare(b, "pt-BR"))
    };
  } catch (error) {
    console.error("Falha ao carregar opções de filtro de equipamentos críticos.", error);
    return { statuses: [], areas: [], planningGroups: [], responsibles: [], families: [], costCenters: [], sectors: [] };
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
      where: excludeInvalidTestEquipmentWhere(),
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
      mostCriticalEquipment: NOT_INFORMED,
      highestCriticalityScore: 0,
      totalWorkedHours: 0,
      averageOrdersPerEquipment: 0,
      totalOpenOrders: 0,
      openOrdersOnCriticalEquipments: 0,
      totalCriticalEquipments: 0,
      totalRecurrentEquipments: 0,
      ordersWithoutTechnicalCode: 0,
      ignoredPreventiveOrders: 0,
      ignoredInvalidEquipment: 0,
      rawOrdersInPeriod: 0
    },
    ranking: [],
    hours: [],
    statusDistribution: [],
    trend: [],
    familyDistribution: [],
    filterOptions: { statuses: [], areas: [], planningGroups: [], responsibles: [], families: [], costCenters: [], sectors: [] },
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

/** Chave de agrupamento = TAG da raiz resolvido (fonte única para ranking e detalhe). */
function resolveRootKey(
  row: { equipmentCode: string | null; equipmentName: string | null; technicalObjectRaw: string | null },
  lookup: Map<string, FunctionalLocationLite>
): string {
  return getRootFunctionalLocation(row, lookup).rootTag;
}

/** Setor/galpão = 2º–3º segmentos do TAG (ex.: ZC-SR-G07-... -> "SR-G07"). */
function extractSector(rootTag: string, dataQualityIssue: boolean): string {
  if (dataQualityIssue || !rootTag) {
    return "";
  }
  const segments = rootTag.split("-");
  if (segments.length < 2) {
    return "";
  }
  return segments.slice(1, Math.min(3, segments.length)).join("-");
}

/** Família de um componente: 1º segmento alfabético após o número da raiz. */
function extractComponentFamily(componentTag: string): string {
  const match = componentTag.match(/-([A-Z]{2,})-\d/);
  return match ? match[1] : "";
}

function normalizeSet(values?: string[]): Set<string> {
  return new Set((values ?? []).filter(Boolean).map((value) => value.toUpperCase()));
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

function clamp01(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.min(1, Math.max(0, value));
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
