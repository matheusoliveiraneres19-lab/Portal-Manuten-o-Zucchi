import {
  AlertStatus,
  Criticality,
  LubricantMovementCategory,
  MaintenanceType,
  MaterialMovementType,
  Priority,
  PurchaseStatus,
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
import type {
  CorrectivePreventiveChartData,
  CriticalAlertData,
  DashboardData,
  DatabaseDashboardData,
  DashboardKPI,
  DashboardKPIsData,
  DashboardPeriod,
  DashboardPeriodInput,
  HoursByCollaboratorData,
  KPIComparison,
  KPITone,
  LubricantConsumptionPoint,
  OpenClosedServiceOrdersPoint,
  PendingPurchaseData,
  PurchasesByMonthData,
  TopCriticalEquipmentData,
  TopMachineBreakIndexData
} from "@/types/dashboard";
import { formatCurrency, formatDate, formatMonthName, formatPercent, formatShortDate, formatVolume } from "@/utils/formatters";
import { calculatePeriodVariation, getPreviousPeriod, type PeriodVariation } from "@/utils/period";

const openServiceOrderStatuses = [ServiceOrderStatus.ABERTA, ServiceOrderStatus.EM_ANDAMENTO];
const pendingPurchaseStatuses = [
  PurchaseStatus.SOLICITADA,
  PurchaseStatus.EM_COTACAO,
  PurchaseStatus.APROVADA,
  PurchaseStatus.ATRASADA
];
const criticalPriorities = [Priority.ALTA, Priority.CRITICA];
const criticalities = [Criticality.ALTA, Criticality.CRITICA];

export function getDefaultDashboardPeriod(): DashboardPeriod {
  return parsePeriod("2024-05");
}

export function parsePeriod(period?: DashboardPeriodInput): DashboardPeriod {
  if (!period) {
    return monthPeriod(2024, 5);
  }

  if (typeof period === "string") {
    const [year, month] = period.split("-").map(Number);
    return monthPeriod(year || 2024, month || 5);
  }

  if (period.startDate && period.endDate) {
    return {
      startDate: toStartOfDay(period.startDate),
      endDate: toEndOfDay(period.endDate)
    };
  }

  return monthPeriod(period.year ?? 2024, period.month ?? 5);
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
    prisma.serviceOrder.count({ where: { status: { in: openServiceOrderStatuses } } }),
    prisma.purchase.count({ where: { status: { in: pendingPurchaseStatuses } } }),
    prisma.equipment.count({ where: { criticality: { in: criticalities } } }),
    prisma.lubricantMovement.aggregate({
      _sum: { absoluteQuantity: true },
      where: {
        movementCategory: LubricantMovementCategory.SAIDA,
        movementDate: withinPeriod(period)
      }
    }),
    prisma.materialMovement.groupBy({
      by: ["materialId"],
      where: {
        type: MaterialMovementType.SAIDA,
        movementDate: withinPeriod(period)
      },
      _sum: { quantity: true }
    }),
    prisma.procedure.count({ where: { active: true } }),
    prisma.alert.count({
      where: {
        status: AlertStatus.ABERTO,
        severity: { in: criticalPriorities }
      }
    })
  ]);

  return {
    openServiceOrders,
    pendingPurchases,
    criticalMachines,
    lubricantConsumption: Number(lubricantConsumption._sum.absoluteQuantity ?? 0),
    mostUsedMaterials: mostUsedMaterials.length,
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
  period: DashboardPeriod
): Promise<Record<string, PeriodVariation>> {
  const previousPeriod = getPreviousPeriod(period.startDate, period.endDate);
  const [current, previous] = await Promise.all([
    getDashboardKPIs(period),
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
  const period = parsePeriod(periodInput);
  const grouped = await prisma.serviceOrder.groupBy({
    by: ["equipmentId"],
    where: {
      openedAt: withinPeriod(period),
      equipmentId: { not: null },
      equipment: { criticality: { in: criticalities } }
    },
    _count: { _all: true },
    orderBy: { _count: { equipmentId: "desc" } },
    take: limit
  });
  const equipmentById = await getEquipmentById(grouped.map((item) => item.equipmentId).filter(Boolean) as string[]);

  return grouped.flatMap((item) => {
    const equipment = item.equipmentId ? equipmentById.get(item.equipmentId) : null;

    return equipment
      ? [
          {
            equipmentName: equipment.name,
            totalOrders: item._count._all,
            criticality: equipment.criticality
          }
        ]
      : [];
  });
}

export async function getPendingPurchases(limit = 5): Promise<PendingPurchaseData[]> {
  const purchases = await prisma.purchase.findMany({
    where: { status: { in: pendingPurchaseStatuses } },
    select: {
      item: true,
      supplier: true,
      expectedDate: true,
      totalValue: true,
      status: true
    },
    orderBy: [{ expectedDate: "asc" }, { priority: "desc" }],
    take: limit
  });

  return purchases.map((purchase) => ({
    item: purchase.item,
    supplier: purchase.supplier,
    expectedDate: purchase.expectedDate,
    totalValue: purchase.totalValue === null ? null : Number(purchase.totalValue),
    status: purchase.status
  }));
}

export async function getCriticalAlerts(limit = 5): Promise<CriticalAlertData[]> {
  const alerts = await prisma.alert.findMany({
    where: {
      status: AlertStatus.ABERTO,
      severity: { in: criticalPriorities }
    },
    select: {
      title: true,
      description: true,
      severity: true,
      status: true,
      type: true,
      createdAt: true,
      equipment: { select: { name: true } }
    },
    orderBy: [{ severity: "desc" }, { createdAt: "desc" }],
    take: limit
  });

  return alerts.map((alert) => ({
    title: alert.title,
    description: alert.description,
    equipmentName: alert.equipment?.name ?? null,
    severity: alert.severity,
    status: alert.status,
    type: alert.type,
    createdAt: alert.createdAt
  }));
}

export async function getTopMachinesBreakIndex(
  periodInput: DashboardPeriodInput,
  limit = 5
): Promise<TopMachineBreakIndexData[]> {
  const period = parsePeriod(periodInput);
  const [totalCorrective, grouped] = await Promise.all([
    prisma.serviceOrder.count({
      where: {
        type: MaintenanceType.CORRETIVA,
        openedAt: withinPeriod(period),
        equipmentId: { not: null }
      }
    }),
    prisma.serviceOrder.groupBy({
      by: ["equipmentId"],
      where: {
        type: MaintenanceType.CORRETIVA,
        openedAt: withinPeriod(period),
        equipmentId: { not: null }
      },
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

export async function getHoursByCollaborator(periodInput: DashboardPeriodInput): Promise<HoursByCollaboratorData[]> {
  const period = parsePeriod(periodInput);
  const grouped = await prisma.timeEntry.groupBy({
    by: ["userName"],
    where: { workDate: withinPeriod(period) },
    _sum: { hours: true },
    orderBy: { _sum: { hours: "desc" } }
  });

  return grouped.map((item) => ({
    userName: item.userName,
    hours: Number(item._sum.hours ?? 0)
  }));
}

export async function getPurchasesByMonth(year: number): Promise<PurchasesByMonthData[]> {
  const startDate = new Date(Date.UTC(year, 0, 1, 0, 0, 0, 0));
  const endDate = new Date(Date.UTC(year, 11, 31, 23, 59, 59, 999));
  const purchases = await prisma.purchase.findMany({
    where: {
      OR: [{ purchaseDate: { gte: startDate, lte: endDate } }, { requestDate: { gte: startDate, lte: endDate } }]
    },
    select: {
      purchaseDate: true,
      requestDate: true,
      totalValue: true
    }
  });
  const totals = Array.from({ length: 12 }, (_, index) => ({ month: index + 1, value: 0 }));

  for (const purchase of purchases) {
    const referenceDate = purchase.purchaseDate ?? purchase.requestDate;

    if (referenceDate) {
      totals[referenceDate.getUTCMonth()].value += Number(purchase.totalValue ?? 0);
    }
  }

  return totals.map((item) => ({ ...item, value: Number(item.value.toFixed(2)) }));
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
    getDashboardKPIs(period),
    getDashboardKPIComparisons(period),
    getOpenClosedServiceOrders(period),
    getCorrectivePreventiveChart(period),
    getTopCriticalEquipments(period),
    getPendingPurchases(),
    getCriticalAlerts(),
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
 * Quando nenhum período é informado, usa o intervalo real das Ordens de Serviço
 * (menor e maior data de abertura) em vez de um mês fixo. Assim o dashboard
 * reflete os dados importados da planilha automaticamente.
 */
export async function resolveDefaultDashboardPeriod(): Promise<DashboardPeriod> {
  try {
    const range = await prisma.serviceOrder.aggregate({
      _min: { openedAt: true },
      _max: { openedAt: true }
    });

    const start = range._min.openedAt;
    const end = range._max.openedAt;

    if (!start || !end) {
      return getDefaultDashboardPeriod();
    }

    return {
      startDate: toStartOfDay(start),
      endDate: toEndOfDay(end)
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
      comparison: { status: "unavailable", label: "Comparativo indisponível" },
      isEmpty: false
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

function toStartOfDay(value: Date | string) {
  const date = new Date(value);
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), 0, 0, 0, 0));
}

function toEndOfDay(value: Date | string) {
  const date = new Date(value);
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), 23, 59, 59, 999));
}

function withinPeriod(period: DashboardPeriod) {
  return {
    gte: period.startDate,
    lte: period.endDate
  };
}

function isWithinPeriod(date: Date, period: DashboardPeriod) {
  return date >= period.startDate && date <= period.endDate;
}

function dayKey(date: Date) {
  return date.toISOString().slice(0, 10);
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
      text: `${item.equipmentName ?? "Alerta"} - ${item.title}`,
      time: index === 0 ? "Agora" : formatShortDate(item.createdAt),
      icon: index === 0 ? Bell : AlertTriangle
    })),
    collaboratorHours: data.hoursByCollaborator.map((item) => ({
      name: item.userName,
      value: item.hours
    })),
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
