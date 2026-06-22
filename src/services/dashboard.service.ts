import {
  AlertStatus,
  AlertType,
  Criticality,
  LubricantMovementCategory,
  MaintenanceType,
  Prisma,
  Priority,
  ServiceOrderStatus
} from "@prisma/client";
import {
  AlertTriangle,
  Bell,
  ClipboardList,
  Droplet,
  FileText,
  Package,
  ShoppingCart
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import {
  alerts as mockAlerts,
  collaboratorHours as mockCollaboratorHours,
  correctivePreventive as mockCorrectivePreventive,
  criticalEquipment as mockCriticalEquipment,
  kpis as mockKpis,
  lubricantConsumption as mockLubricantConsumption,
  monthlyPurchases as mockMonthlyPurchases,
  openClosedOrders as mockOpenClosedOrders,
  pendingPurchases as mockPendingPurchases,
  topBreakdownMachines as mockTopBreakdownMachines
} from "@/data/dashboard";
import { prisma } from "@/lib/prisma";
import { getCriticalAlertsCount } from "@/services/alerts.service";
import { getCriticalEquipmentsByOrders, getTopEquipmentsByBreakVolume } from "@/services/critical-equipments.service";
import { getMostUsedMaterialsCount } from "@/services/materials.service";
import {
  getPendingPurchases,
  getPendingPurchasesCount,
  getPurchasesByMonth
} from "@/services/purchases.service";
import {
  CRITICAL_EQUIPMENT_CRITICALITIES,
  OPEN_SERVICE_ORDER_STATUSES
} from "@/services/shared/portal-rules";
import { getHoursByCollaborator } from "@/services/time-entries.service";
import type {
  CorrectivePreventiveChartData,
  CriticalAlertData,
  DashboardData,
  DatabaseDashboardData,
  DashboardKPI,
  DashboardKPIsData,
  DashboardPeriod,
  DashboardPeriodInput,
  KPIComparison,
  KPITone,
  LubricantConsumptionPoint,
  OpenClosedServiceOrdersPoint,
  TopCriticalEquipmentData,
  TopMachineBreakIndexData
} from "@/types/dashboard";
import { formatCurrency, formatDate, formatMonthName, formatPercent, formatShortDate, formatVolume } from "@/utils/formatters";
import { dayKey, isWithinPeriod, toEndOfDay, toStartOfDay, withinPeriod } from "@/utils/date-range";
import { getDefaultPortalPeriod, getTodayDate } from "@/utils/date";
import { excludeLubricationOrderWhere } from "@/utils/service-order-filters";
import { calculatePeriodVariation, getPreviousPeriod, toInputDate, type PeriodVariation } from "@/utils/period";

/**
 * Período padrão quando não há dados no banco: mês atual → hoje (dinâmico).
 * Sem data fixa — acompanha o dia em que o portal é aberto.
 */
export function getDefaultDashboardPeriod(): DashboardPeriod {
  return getDefaultPortalPeriod();
}

export function parsePeriod(period?: DashboardPeriodInput): DashboardPeriod {
  if (!period) {
    return getDefaultPortalPeriod();
  }

  if (typeof period === "string") {
    const [year, month] = period.split("-").map(Number);
    return monthPeriod(year || getTodayDate().getUTCFullYear(), month || getTodayDate().getUTCMonth() + 1);
  }

  if (period.startDate && period.endDate) {
    return {
      startDate: toStartOfDay(period.startDate),
      endDate: toEndOfDay(period.endDate)
    };
  }

  return monthPeriod(
    period.year ?? getTodayDate().getUTCFullYear(),
    period.month ?? getTodayDate().getUTCMonth() + 1
  );
}

export async function getDashboardKPIs(periodInput: DashboardPeriodInput): Promise<DashboardKPIsData> {
  const period = parsePeriod(periodInput);
  const [
    openServiceOrders,
    pendingPurchases,
    criticalMachines,
    lubricantConsumption,
    mostUsedMaterials,
    activeProcedures,
    criticalAlerts
  ] = await Promise.all([
    prisma.serviceOrder.count({ where: { status: { in: OPEN_SERVICE_ORDER_STATUSES } } }),
    getPendingPurchasesCount(),
    prisma.equipment.count({ where: { criticality: { in: CRITICAL_EQUIPMENT_CRITICALITIES } } }),
    prisma.lubricantMovement.aggregate({
      _sum: { absoluteQuantity: true },
      where: {
        movementCategory: LubricantMovementCategory.SAIDA,
        movementDate: withinPeriod(period)
      }
    }),
    getMostUsedMaterialsCount(period),
    prisma.procedure.count({ where: { active: true } }),
    getCriticalAlertsCount()
  ]);

  return {
    openServiceOrders,
    pendingPurchases,
    criticalMachines,
    lubricantConsumption: Number(lubricantConsumption._sum.absoluteQuantity ?? 0),
    mostUsedMaterials,
    activeProcedures,
    criticalAlerts
  };
}

/**
 * Calcula o comparativo com o período imediatamente anterior (mesma duração).
 * Só os KPIs realmente filtrados por período têm comparativo temporal; os demais
 * são contagens "snapshot" e ficam como indisponíveis na camada de apresentação.
 */
export async function getDashboardKPIComparisons(
  period: DashboardPeriod,
  /**
   * KPIs do período atual já em andamento/calculados. Passe a MESMA promise usada
   * para montar o dashboard para evitar recalcular os 7 queries do período atual
   * (o anterior continua sendo buscado em paralelo). Sem isso, recai no cálculo próprio.
   */
  currentKpis?: Promise<DashboardKPIsData> | DashboardKPIsData
): Promise<Record<string, PeriodVariation>> {
  const previousPeriod = getPreviousPeriod(period.startDate, period.endDate);
  const [current, previous] = await Promise.all([
    currentKpis ?? getDashboardKPIs(period),
    getDashboardKPIs(previousPeriod)
  ]);

  return {
    lubricantConsumption: calculatePeriodVariation(
      current.lubricantConsumption,
      previous.lubricantConsumption
    ),
    mostUsedMaterials: calculatePeriodVariation(current.mostUsedMaterials, previous.mostUsedMaterials)
  };
}

export async function getOpenClosedServiceOrders(
  periodInput: DashboardPeriodInput
): Promise<OpenClosedServiceOrdersPoint[]> {
  const period = parsePeriod(periodInput);
  const orders = await prisma.serviceOrder.findMany({
    where: {
      OR: [{ openedAt: withinPeriod(period) }, { closedAt: withinPeriod(period) }]
    },
    select: {
      openedAt: true,
      closedAt: true,
      status: true
    }
  });
  const buckets = createDailyBuckets(period);

  for (const order of orders) {
    if (order.openedAt && isWithinPeriod(order.openedAt, period)) {
      buckets.get(dayKey(order.openedAt))!.abertas += 1;
    }

    if (order.status === ServiceOrderStatus.FECHADA && order.closedAt && isWithinPeriod(order.closedAt, period)) {
      buckets.get(dayKey(order.closedAt))!.fechadas += 1;
    }
  }

  return Array.from(buckets.values());
}

export async function getCorrectivePreventiveChart(
  periodInput: DashboardPeriodInput
): Promise<CorrectivePreventiveChartData> {
  const period = parsePeriod(periodInput);
  const grouped = await prisma.serviceOrder.groupBy({
    by: ["type"],
    where: {
      openedAt: withinPeriod(period),
      type: { in: [MaintenanceType.CORRETIVA, MaintenanceType.PREVENTIVA] }
    },
    _count: { _all: true }
  });

  const corrective = grouped.find((item) => item.type === MaintenanceType.CORRETIVA)?._count._all ?? 0;
  const preventive = grouped.find((item) => item.type === MaintenanceType.PREVENTIVA)?._count._all ?? 0;
  const total = corrective + preventive;

  return {
    corrective,
    preventive,
    total,
    correctivePercent: total ? roundPercent((corrective / total) * 100) : 0,
    preventivePercent: total ? roundPercent((preventive / total) * 100) : 0
  };
}

export async function getTopCriticalEquipments(
  periodInput: DashboardPeriodInput,
  limit = 5
): Promise<TopCriticalEquipmentData[]> {
  // Usa a MESMA lógica/fonte da aba Equipamentos Críticos (critical-equipments.service)
  // para o ranking bater exatamente com a aba — sem duplicar a regra no dashboard.
  const period = parsePeriod(periodInput);
  const items = await getCriticalEquipmentsByOrders({
    startDate: toInputDate(period.startDate),
    endDate: toInputDate(period.endDate),
    limit
  });

  return items.slice(0, limit).map((item) => ({
    equipmentName: item.equipmentName,
    totalOrders: item.totalOrders,
    criticality: labelToCriticality(item.criticalityLabel)
  }));
}

/** Converte o rótulo de criticidade calculado (aba) no enum Criticality (campo não exibido no gráfico). */
function labelToCriticality(label: string): Criticality {
  if (label === "Crítico") {
    return Criticality.CRITICA;
  }
  if (label === "Atenção") {
    return Criticality.ALTA;
  }
  return Criticality.MEDIA;
}

/**
 * Alertas do dashboard (TAREFA 4.8): top 5 equipamentos com mais ordens no período,
 * EXCLUINDO ordens de lubrificação (PL). Motivo fixo "Alto volume de ordens no período".
 * Substitui os alertas genéricos da tabela Alert na lista do dashboard.
 */
export async function getTopEquipmentAlerts(period: DashboardPeriod, limit = 5): Promise<CriticalAlertData[]> {
  const top = await getTopEquipmentsByBreakVolume(
    { startDate: toInputDate(period.startDate), endDate: toInputDate(period.endDate) },
    limit
  );

  return top.map((equipment) => ({
    title: "Alto volume de ordens no período",
    description: `${equipment.totalOrders.toLocaleString("pt-BR")} ordem(ns) no período`,
    equipmentName: equipment.equipmentName,
    severity: Priority.ALTA,
    status: AlertStatus.ABERTO,
    type: AlertType.QUEBRA_RECORRENTE,
    createdAt: period.endDate
  }));
}

export async function getTopMachinesBreakIndex(
  periodInput: DashboardPeriodInput,
  limit = 5
): Promise<TopMachineBreakIndexData[]> {
  const period = parsePeriod(periodInput);
  // Índice de QUEBRA: só corretivas e SEM ordens de lubrificação (prefixo PL),
  // que não representam falha do equipamento. Fonte única do filtro PL.
  const breakWhere: Prisma.ServiceOrderWhereInput = {
    type: MaintenanceType.CORRETIVA,
    openedAt: withinPeriod(period),
    equipmentId: { not: null },
    ...excludeLubricationOrderWhere()
  };
  const [totalCorrective, grouped] = await Promise.all([
    prisma.serviceOrder.count({ where: breakWhere }),
    prisma.serviceOrder.groupBy({
      by: ["equipmentId"],
      where: breakWhere,
      _count: { _all: true },
      orderBy: { _count: { equipmentId: "desc" } },
      take: limit
    })
  ]);
  const equipmentById = await getEquipmentById(grouped.map((item) => item.equipmentId).filter(Boolean) as string[]);
  const denominator = Math.max(1, totalCorrective);

  return grouped.flatMap((item) => {
    const equipment = item.equipmentId ? equipmentById.get(item.equipmentId) : null;

    return equipment
      ? [
          {
            equipmentName: equipment.name,
            breakIndex: roundPercent((item._count._all / denominator) * 100)
          }
        ]
      : [];
  });
}

export async function getLubricantConsumptionByPeriod(
  periodInput: DashboardPeriodInput
): Promise<LubricantConsumptionPoint[]> {
  const period = parsePeriod(periodInput);
  const movements = await prisma.lubricantMovement.findMany({
    where: {
      movementCategory: LubricantMovementCategory.SAIDA,
      movementDate: withinPeriod(period)
    },
    select: {
      movementDate: true,
      absoluteQuantity: true
    },
    orderBy: { movementDate: "asc" }
  });
  const buckets = createConsumptionBuckets(period);

  for (const movement of movements) {
    buckets.get(dayKey(movement.movementDate))!.consumption += Number(movement.absoluteQuantity);
  }

  return Array.from(buckets.values()).map((item) => ({
    date: item.date,
    consumption: Number(item.consumption.toFixed(2))
  }));
}

export async function getDatabaseDashboardData(periodInput?: DashboardPeriodInput): Promise<DatabaseDashboardData> {
  const period = parsePeriod(periodInput);
  // Calcula os KPIs do período atual UMA vez e reaproveita a mesma promise no
  // comparativo (que só precisa buscar, além desta, o período anterior). Antes,
  // o período atual era calculado 2x (aqui + dentro de getDashboardKPIComparisons).
  const currentKpis = getDashboardKPIs(period);
  const [
    kpis,
    kpiComparisons,
    openClosedServiceOrders,
    correctivePreventiveChart,
    topCriticalEquipments,
    pendingPurchases,
    criticalAlerts,
    topMachinesBreakIndex,
    hoursByCollaborator,
    purchasesByMonth,
    lubricantConsumptionByPeriod
  ] = await Promise.all([
    currentKpis,
    getDashboardKPIComparisons(period, currentKpis),
    getOpenClosedServiceOrders(period),
    getCorrectivePreventiveChart(period),
    getTopCriticalEquipments(period),
    getPendingPurchases(),
    getTopEquipmentAlerts(period),
    getTopMachinesBreakIndex(period),
    getHoursByCollaborator(period),
    getPurchasesByMonth(period.startDate.getUTCFullYear()),
    getLubricantConsumptionByPeriod(period)
  ]);

  return {
    period,
    kpis,
    kpiComparisons,
    openClosedServiceOrders,
    correctivePreventiveChart,
    topCriticalEquipments,
    pendingPurchases,
    criticalAlerts,
    topMachinesBreakIndex,
    hoursByCollaborator,
    purchasesByMonth,
    lubricantConsumptionByPeriod
  };
}

/**
 * Extrai o período (startDate/endDate) dos search params da URL — o store global
 * de período do portal. Retorna undefined quando ausente, para usar o padrão.
 */
export function parseDashboardPeriodParams(
  searchParams: Record<string, string | string[] | undefined>
): DashboardPeriodInput | undefined {
  const startDate = firstParam(searchParams.startDate);
  const endDate = firstParam(searchParams.endDate);

  if (startDate && endDate) {
    return { startDate, endDate };
  }

  return undefined;
}

function firstParam(value: string | string[] | undefined): string | undefined {
  const raw = Array.isArray(value) ? value[0] : value;
  return raw && raw.trim() ? raw.trim() : undefined;
}

export async function getDashboardData(periodInput?: DashboardPeriodInput): Promise<DashboardData> {
  try {
    const period = periodInput ?? (await resolveDefaultDashboardPeriod());
    const data = await getDatabaseDashboardData(period);
    return mapDatabaseDashboardToVisualData(data);
  } catch (error) {
    console.error("Falha ao carregar dashboard pelo banco. Usando fallback mockado.", error);
    return getMockDashboardData();
  }
}

/**
 * Período padrão do portal quando nenhum período é informado na URL.
 *
 * - INÍCIO: menor data de abertura das Ordens de Serviço (regra global existente),
 *   para o dashboard cobrir todo o histórico importado.
 * - FIM: SEMPRE hoje (dinâmico). Não fica preso na maior data importada — ao
 *   recarregar em outro dia, a data final acompanha o dia atual. Se existirem
 *   registros com data futura, o fim é estendido até eles para não esconder dados.
 */
export async function resolveDefaultDashboardPeriod(): Promise<DashboardPeriod> {
  try {
    const range = await prisma.serviceOrder.aggregate({
      _min: { openedAt: true },
      _max: { openedAt: true }
    });

    const minOpened = range._min.openedAt;

    if (!minOpened) {
      return getDefaultDashboardPeriod();
    }

    const today = toEndOfDay(getTodayDate());
    const maxOpened = range._max.openedAt ? toEndOfDay(range._max.openedAt) : today;

    return {
      startDate: toStartOfDay(minOpened),
      endDate: maxOpened > today ? maxOpened : today
    };
  } catch (error) {
    console.error("Falha ao resolver período padrão do dashboard. Usando período padrão.", error);
    return getDefaultDashboardPeriod();
  }
}

export function getMockDashboardData(): DashboardData {
  return {
    kpis: mockKpis.map((kpi): DashboardKPI => ({
      title: kpi.title,
      value: kpi.value,
      tone: kpi.tone,
      icon: kpi.icon,
      comparison: { status: "unavailable", label: "Aguardando importação" },
      isEmpty: true,
      emptyHint: "Aguardando importação"
    })),
    openClosedOrders: mockOpenClosedOrders,
    correctivePreventive: mockCorrectivePreventive,
    criticalEquipment: mockCriticalEquipment,
    pendingPurchases: mockPendingPurchases,
    alerts: mockAlerts,
    collaboratorHours: mockCollaboratorHours,
    monthlyPurchases: mockMonthlyPurchases,
    lubricantConsumption: mockLubricantConsumption,
    topBreakdownMachines: mockTopBreakdownMachines,
    source: "mock",
    period: null
  };
}

function monthPeriod(year: number, month: number): DashboardPeriod {
  return {
    startDate: new Date(Date.UTC(year, month - 1, 1, 0, 0, 0, 0)),
    endDate: new Date(Date.UTC(year, month, 0, 23, 59, 59, 999))
  };
}

function createDailyBuckets(period: DashboardPeriod) {
  const buckets = new Map<string, OpenClosedServiceOrdersPoint>();

  for (const date = new Date(period.startDate); date <= period.endDate; date.setUTCDate(date.getUTCDate() + 1)) {
    const day = new Date(date);
    buckets.set(dayKey(day), { date: day, abertas: 0, fechadas: 0 });
  }

  return buckets;
}

function createConsumptionBuckets(period: DashboardPeriod) {
  const buckets = new Map<string, LubricantConsumptionPoint>();

  for (const date = new Date(period.startDate); date <= period.endDate; date.setUTCDate(date.getUTCDate() + 1)) {
    const day = new Date(date);
    buckets.set(dayKey(day), { date: day, consumption: 0 });
  }

  return buckets;
}

async function getEquipmentById(ids: string[]) {
  if (!ids.length) {
    return new Map<string, { id: string; name: string; criticality: Criticality }>();
  }

  const equipment = await prisma.equipment.findMany({
    where: { id: { in: ids } },
    select: {
      id: true,
      name: true,
      criticality: true
    }
  });

  return new Map(equipment.map((item) => [item.id, item]));
}

function roundPercent(value: number) {
  return Number(value.toFixed(1));
}

const NON_TEMPORAL_COMPARISON: KPIComparison = {
  status: "unavailable",
  label: "Comparativo indisponível"
};

/** Converte a variação calculada em um comparativo pronto para exibição (com rótulo). */
function toComparison(variation: PeriodVariation | undefined): KPIComparison {
  if (!variation || variation.status === "unavailable") {
    return { ...NON_TEMPORAL_COMPARISON };
  }

  const arrow = variation.direction === "up" ? "↑" : variation.direction === "down" ? "↓" : "→";

  return {
    status: "available",
    direction: variation.direction,
    percentage: variation.percentage,
    label: `${arrow} ${formatPercent(variation.percentage)} vs período anterior`
  };
}

/**
 * Monta um KPI tratando estado vazio. Quando o valor atual é zero/ausente, o
 * comparativo é suprimido em favor do texto auxiliar (emptyHint).
 */
function buildKpi(input: {
  title: string;
  rawValue: number;
  value: string;
  tone: KPITone;
  icon: LucideIcon;
  comparison: KPIComparison;
  emptyHint: string;
}): DashboardKPI {
  const isEmpty = !Number.isFinite(input.rawValue) || input.rawValue <= 0;

  return {
    title: input.title,
    value: input.value,
    tone: input.tone,
    icon: input.icon,
    comparison: isEmpty ? { status: "unavailable", label: input.emptyHint } : input.comparison,
    isEmpty,
    emptyHint: input.emptyHint
  };
}

function mapDatabaseDashboardToVisualData(data: DatabaseDashboardData): DashboardData {
  return {
    kpis: [
      buildKpi({
        title: "OS Abertas",
        rawValue: data.kpis.openServiceOrders,
        value: String(data.kpis.openServiceOrders),
        tone: "blue",
        icon: ClipboardList,
        comparison: NON_TEMPORAL_COMPARISON,
        emptyHint: "Sem registros no período"
      }),
      buildKpi({
        title: "Compras Pendentes",
        rawValue: data.kpis.pendingPurchases,
        value: String(data.kpis.pendingPurchases),
        tone: "gold",
        icon: ShoppingCart,
        comparison: NON_TEMPORAL_COMPARISON,
        emptyHint: "Aguardando importação"
      }),
      buildKpi({
        title: "Máquinas Críticas",
        rawValue: data.kpis.criticalMachines,
        value: String(data.kpis.criticalMachines),
        tone: "red",
        icon: AlertTriangle,
        comparison: NON_TEMPORAL_COMPARISON,
        emptyHint: "Aguardando importação"
      }),
      buildKpi({
        title: "Consumo Lubrificantes",
        rawValue: data.kpis.lubricantConsumption,
        value: formatVolume(data.kpis.lubricantConsumption),
        tone: "blue",
        icon: Droplet,
        comparison: toComparison(data.kpiComparisons.lubricantConsumption),
        emptyHint: "Aguardando importação"
      }),
      buildKpi({
        title: "Materiais Mais Utilizados",
        rawValue: data.kpis.mostUsedMaterials,
        value: String(data.kpis.mostUsedMaterials),
        tone: "gold",
        icon: Package,
        comparison: toComparison(data.kpiComparisons.mostUsedMaterials),
        emptyHint: "Aguardando importação"
      }),
      buildKpi({
        title: "Procedimentos Ativos",
        rawValue: data.kpis.activeProcedures,
        value: String(data.kpis.activeProcedures),
        tone: "blue",
        icon: FileText,
        comparison: NON_TEMPORAL_COMPARISON,
        emptyHint: "Aguardando importação"
      })
    ],
    openClosedOrders: pickChartCheckpoints(data.openClosedServiceOrders).map((item) => ({
      name: formatShortDate(item.date),
      abertas: item.abertas,
      fechadas: item.fechadas
    })),
    correctivePreventive: [
      { name: "Corretiva", value: data.correctivePreventiveChart.corrective, color: "#b51f32" },
      { name: "Preventiva", value: data.correctivePreventiveChart.preventive, color: "#2f6384" }
    ],
    criticalEquipment: data.topCriticalEquipments.map((item) => ({
      name: item.equipmentName,
      value: item.totalOrders
    })),
    pendingPurchases: data.pendingPurchases.map((item) => ({
      item: item.item,
      supplier: item.supplier ?? "-",
      date: formatDate(item.expectedDate),
      value: item.totalValue === null ? "-" : formatCurrency(item.totalValue)
    })),
    alerts: data.criticalAlerts.map((item, index) => ({
      text: `${item.equipmentName ?? "Equipamento"} — ${item.description}`,
      time: item.title,
      icon: index === 0 ? Bell : AlertTriangle
    })),
    collaboratorHours: buildCollaboratorHoursChart(data.hoursByCollaborator),
    monthlyPurchases: data.purchasesByMonth
      .filter((item) => item.value > 0)
      .map((item) => ({
        name: formatMonthName(new Date(Date.UTC(data.period.startDate.getUTCFullYear(), item.month - 1, 1))),
        value: Number((item.value / 1000).toFixed(1))
      })),
    lubricantConsumption: data.lubricantConsumptionByPeriod
      .filter((item) => item.consumption > 0)
      .map((item) => ({
        name: formatShortDate(item.date),
        value: item.consumption
      })),
    topBreakdownMachines: data.topMachinesBreakIndex.map((item) => ({
      name: item.equipmentName,
      value: item.breakIndex
    })),
    source: "database",
    period: {
      startDate: data.period.startDate.toISOString(),
      endDate: data.period.endDate.toISOString()
    }
  };
}

function pickChartCheckpoints(points: OpenClosedServiceOrdersPoint[]) {
  if (points.length <= 5) {
    return points;
  }

  const indexes = [0, 7, 14, 21, points.length - 1].filter((index, position, all) => all.indexOf(index) === position);
  return indexes.map((index) => points[index]).filter(Boolean);
}

/**
 * Monta os dados do gráfico "Horas apontadas por colaborador" (aba Início):
 * - ordena do maior para o menor (a fonte já entrega ordenado, reforçamos aqui);
 * - mantém os TOP 10 e agrega o restante em "Outros (N)";
 * - carrega horas, nº de ordens e média de horas por ordem para o tooltip;
 * - sanitiza valores (sem NaN/Infinity) e descarta linhas zeradas.
 *
 * Mesma fonte da aba Equipe e Horas (getHoursByCollaborator), garantindo que os
 * totais batam entre as duas telas.
 */
const COLLABORATOR_HOURS_TOP = 10;

function buildCollaboratorHoursChart(rows: import("@/types/dashboard").HoursByCollaboratorData[]) {
  const safe = rows
    .map((row) => ({
      name: row.userName,
      hours: Number.isFinite(row.hours) && row.hours > 0 ? Number(row.hours.toFixed(2)) : 0,
      orders: Number.isFinite(row.orders) && row.orders > 0 ? row.orders : 0
    }))
    .filter((row) => row.hours > 0)
    .sort((a, b) => b.hours - a.hours);

  const top = safe.slice(0, COLLABORATOR_HOURS_TOP);
  const rest = safe.slice(COLLABORATOR_HOURS_TOP);

  const points = top.map((row) => ({
    name: row.name,
    value: row.hours,
    orders: row.orders,
    avg: row.orders > 0 ? Number((row.hours / row.orders).toFixed(2)) : 0
  }));

  if (rest.length > 0) {
    const restHours = Number(rest.reduce((sum, row) => sum + row.hours, 0).toFixed(2));
    const restOrders = rest.reduce((sum, row) => sum + row.orders, 0);
    points.push({
      name: `Outros (${rest.length})`,
      value: restHours,
      orders: restOrders,
      avg: restOrders > 0 ? Number((restHours / restOrders).toFixed(2)) : 0
    });
  }

  return points;
}
