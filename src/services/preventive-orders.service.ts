import { cache } from "react";
import { Prisma, ServiceOrderStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { toEndOfDay, toStartOfDay } from "@/utils/date-range";
import type {
  PreventiveAlerts,
  PreventiveAreaBreakdown,
  PreventiveArea,
  PreventiveExecutionStatus,
  PreventiveFilterOptions,
  PreventiveFilters,
  PreventiveManagementStatus,
  PreventiveMachineRow,
  PreventiveMonthlyPoint,
  PreventiveOrderRow,
  PreventivePageData,
  PreventiveStatusSlice,
  PreventiveSummary,
  PreventiveType,
  PreventiveTypeBreakdown
} from "@/types/preventive-orders";

// ── Regras oficiais ────────────────────────────────────────────────────────

/** Trabalho real (h) acima do qual a OS é considerada Realizada. <= 0,1 h = Não realizada. */
export const EXECUTION_THRESHOLD_HOURS = 0.1;

/** Quantidade máxima de linhas enviadas à tabela (o payload do client é limitado). */
const TABLE_ROW_CAP = 600;

/** Detecta o tipo preventivo pelo título: "PL -", "PL-", "PV -", "PV-" (case-insensitive). */
export function detectPreventiveType(title: string | null | undefined): PreventiveType | null {
  if (!title) return null;
  const match = title.match(/^\s*(PL|PV)\s*-/i);
  return match ? (match[1].toUpperCase() as PreventiveType) : null;
}

export function areaForType(type: PreventiveType): PreventiveArea {
  return type === "PL" ? "Lubrificação" : "Elétrica";
}

export function labelForType(type: PreventiveType): string {
  return type === "PL" ? "PL — Lubrificação" : "PV — Preventiva Elétrica";
}

/** Realizada quando workedHours > 0,1 h; vazio/null conta como 0. */
export function classifyExecution(workedHours: number | null | undefined): PreventiveExecutionStatus {
  const hours = Number(workedHours ?? 0);
  return hours > EXECUTION_THRESHOLD_HOURS ? "Realizada" : "Não Realizada";
}

// Considera-se "concluída" no SAP o status FECHADA (a base não preenche closedAt;
// statusSapRaw equivalente = "Tecnicamente encerrado (3)").
const CLOSED_STATUSES = new Set<ServiceOrderStatus>([ServiceOrderStatus.FECHADA]);

/**
 * Status gerencial derivado. Sem data de vencimento na base, "Atrasada"/"A vencer"
 * não são deriváveis — ordens abertas sem execução ficam como "Aberta sem execução".
 */
export function classifyManagement(
  status: ServiceOrderStatus,
  workedHours: number | null | undefined
): PreventiveManagementStatus {
  const realized = classifyExecution(workedHours) === "Realizada";

  if (status === ServiceOrderStatus.CANCELADA) return "Cancelada";

  if (CLOSED_STATUSES.has(status)) {
    return realized ? "Realizada" : "Fechada sem execução";
  }

  // Aberta / Liberada / Em andamento / Aguardando material.
  if (realized) return "Em andamento";
  return "Aberta sem execução";
}

const STATUS_SAP_LABEL: Record<ServiceOrderStatus, string> = {
  ABERTA: "Aberta",
  LIBERADA: "Liberada",
  EM_ANDAMENTO: "Em andamento",
  AGUARDANDO_MATERIAL: "Aguardando material",
  FECHADA: "Encerrada",
  CANCELADA: "Cancelada"
};

const MANAGEMENT_COLORS: Record<PreventiveManagementStatus, string> = {
  "Aberta sem execução": "#c49a45",
  "Em andamento": "#3b82f6",
  Realizada: "#10b981",
  "Fechada sem execução": "#dc2626",
  Atrasada: "#f97316",
  "A vencer": "#eab308",
  Cancelada: "#71717a"
};

export function colorForManagementStatus(status: PreventiveManagementStatus): string {
  return MANAGEMENT_COLORS[status];
}

const MS_PER_DAY = 1000 * 60 * 60 * 24;
const MONTH_LABELS = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

// ── Carregamento base (cacheado por request) ────────────────────────────────

const preventiveSelect = {
  id: true,
  osNumber: true,
  title: true,
  status: true,
  statusSapRaw: true,
  technicalObjectRaw: true,
  equipmentName: true,
  equipmentCode: true,
  responsible: true,
  responsibleName: true,
  openedAt: true,
  closedAt: true,
  workedHours: true
} satisfies Prisma.ServiceOrderSelect;

type PreventiveRecord = Prisma.ServiceOrderGetPayload<{ select: typeof preventiveSelect }>;

/**
 * Carrega as OS candidatas a PL/PV no período (filtro de data no banco) e as
 * classifica. Os demais filtros (tipo, área, status gerencial, toggles) são
 * aplicados sobre campos derivados, então rodam em memória. Cacheado por request
 * para que as 6 funções públicas compartilhem o mesmo fetch.
 */
const loadClassifiedOrders = cache(async (periodKey: string): Promise<PreventiveOrderRow[]> => {
  const [startDate, endDate] = periodKey.split("|");
  const and: Prisma.ServiceOrderWhereInput[] = [
    {
      OR: [
        { title: { startsWith: "PL", mode: "insensitive" } },
        { title: { startsWith: "PV", mode: "insensitive" } }
      ]
    }
  ];

  if (startDate || endDate) {
    and.push({
      openedAt: {
        ...(startDate ? { gte: toStartOfDay(startDate) } : {}),
        ...(endDate ? { lte: toEndOfDay(endDate) } : {})
      }
    });
  }

  const records = await prisma.serviceOrder.findMany({
    where: { AND: and },
    select: preventiveSelect,
    orderBy: [{ openedAt: "desc" }, { osNumber: "asc" }]
  });

  const rows: PreventiveOrderRow[] = [];
  const now = Date.now();

  for (const record of records) {
    const type = detectPreventiveType(record.title);
    if (!type) continue; // descarta falso-positivo do startsWith (ex.: "PLACA").

    const workedHours = Number(record.workedHours ?? 0);
    const executionStatus = classifyExecution(workedHours);
    const managementStatus = classifyManagement(record.status, workedHours);
    const isClosed = CLOSED_STATUSES.has(record.status) || record.status === ServiceOrderStatus.CANCELADA;
    const daysOpen =
      !isClosed && record.openedAt
        ? Math.max(0, Math.floor((now - record.openedAt.getTime()) / MS_PER_DAY))
        : null;

    rows.push({
      id: record.id,
      osNumber: record.osNumber,
      title: record.title,
      type,
      typeLabel: labelForType(type),
      area: areaForType(type),
      technicalObject: record.technicalObjectRaw ?? record.equipmentName ?? null,
      equipmentName: record.equipmentName,
      equipmentCode: record.equipmentCode,
      responsibleName: record.responsibleName ?? record.responsible ?? null,
      statusSapLabel: record.statusSapRaw ?? STATUS_SAP_LABEL[record.status],
      statusSapRaw: record.statusSapRaw,
      managementStatus,
      executionStatus,
      workedHours,
      openedAt: record.openedAt?.toISOString() ?? null,
      closedAt: record.closedAt?.toISOString() ?? null,
      daysOpen
    });
  }

  return rows;
});

function periodKey(filters: PreventiveFilters): string {
  return `${filters.startDate ?? ""}|${filters.endDate ?? ""}`;
}

function includesText(haystack: string | null | undefined, term?: string): boolean {
  if (!term?.trim()) return true;
  return (haystack ?? "").toLowerCase().includes(term.trim().toLowerCase());
}

/** Aplica os filtros secundários (derivados) sobre o conjunto classificado. */
function applyFilters(rows: PreventiveOrderRow[], filters: PreventiveFilters): PreventiveOrderRow[] {
  const statusSap = (filters.statusSap ?? []).filter(Boolean);
  const managementStatus = (filters.managementStatus ?? []).filter(Boolean);
  const responsibles = (filters.responsibles ?? []).filter(Boolean);

  return rows.filter((row) => {
    if (filters.type && row.type !== filters.type) return false;
    if (filters.area && row.area !== filters.area) return false;
    if (statusSap.length && !statusSap.includes(statusSapEnumOf(row))) return false;
    if (managementStatus.length && !managementStatus.includes(row.managementStatus)) return false;
    if (responsibles.length) {
      const responsible = row.responsibleName ?? "SEM RESPONSÁVEL";
      if (!responsibles.includes(responsible)) return false;
    }
    if (!includesText(row.technicalObject, filters.technicalObject)) return false;
    if (!includesText(`${row.equipmentName ?? ""} ${row.equipmentCode ?? ""}`, filters.equipment)) return false;
    if (filters.search) {
      const haystack = `${row.osNumber} ${row.title} ${row.technicalObject ?? ""} ${row.responsibleName ?? ""}`;
      if (!includesText(haystack, filters.search)) return false;
    }
    if (filters.onlyNotDone && row.executionStatus !== "Não Realizada") return false;
    if (filters.onlyClosedNoExec && row.managementStatus !== "Fechada sem execução") return false;
    if (filters.onlyLate && row.managementStatus !== "Atrasada") return false;
    return true;
  });
}

// O label SAP da linha já está pronto; para filtrar por enum reconstituímos a chave.
function statusSapEnumOf(row: PreventiveOrderRow): string {
  const entry = (Object.keys(STATUS_SAP_LABEL) as ServiceOrderStatus[]).find(
    (key) => STATUS_SAP_LABEL[key] === row.statusSapLabel
  );
  return entry ?? row.statusSapLabel;
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

function adherence(realizadas: number, total: number): number | null {
  return total > 0 ? round1((realizadas / total) * 100) : null;
}

// ── Funções públicas ────────────────────────────────────────────────────────

export async function getPreventiveOrders(filters: PreventiveFilters = {}): Promise<PreventiveOrderRow[]> {
  const all = await loadClassifiedOrders(periodKey(filters));
  return applyFilters(all, filters);
}

export async function getPreventiveOrdersSummary(filters: PreventiveFilters = {}): Promise<PreventiveSummary> {
  return summarize(await getPreventiveOrders(filters));
}

function summarize(rows: PreventiveOrderRow[]): PreventiveSummary {
  const realizadas = rows.filter((r) => r.executionStatus === "Realizada").length;
  const naoRealizadas = rows.length - realizadas;
  const fechadasSemExecucao = rows.filter((r) => r.managementStatus === "Fechada sem execução").length;
  const horasApontadas = round1(rows.reduce((sum, r) => sum + r.workedHours, 0));

  return {
    total: rows.length,
    totalPL: rows.filter((r) => r.type === "PL").length,
    totalPV: rows.filter((r) => r.type === "PV").length,
    realizadas,
    naoRealizadas,
    fechadasSemExecucao,
    horasApontadas,
    aderencia: adherence(realizadas, rows.length)
  };
}

export async function getPreventiveOrdersByArea(filters: PreventiveFilters = {}): Promise<PreventiveAreaBreakdown[]> {
  return breakdownByArea(await getPreventiveOrders(filters));
}

function breakdownByArea(rows: PreventiveOrderRow[]): PreventiveAreaBreakdown[] {
  const areas: PreventiveArea[] = ["Lubrificação", "Elétrica"];
  return areas.map((area) => {
    const subset = rows.filter((r) => r.area === area);
    const realizadas = subset.filter((r) => r.executionStatus === "Realizada").length;
    return {
      area,
      total: subset.length,
      realizadas,
      naoRealizadas: subset.length - realizadas,
      horas: round1(subset.reduce((sum, r) => sum + r.workedHours, 0)),
      aderencia: adherence(realizadas, subset.length)
    };
  });
}

function breakdownByType(rows: PreventiveOrderRow[]): PreventiveTypeBreakdown[] {
  const types: PreventiveType[] = ["PL", "PV"];
  return types.map((type) => {
    const subset = rows.filter((r) => r.type === type);
    const realizadas = subset.filter((r) => r.executionStatus === "Realizada").length;
    return {
      type,
      label: type === "PL" ? "PL (Lubrificação)" : "PV (Preventiva Elétrica)",
      total: subset.length,
      realizadas,
      naoRealizadas: subset.length - realizadas,
      horas: round1(subset.reduce((sum, r) => sum + r.workedHours, 0))
    };
  });
}

export async function getPreventiveOrdersByStatus(filters: PreventiveFilters = {}): Promise<PreventiveStatusSlice[]> {
  return breakdownByStatus(await getPreventiveOrders(filters));
}

function breakdownByStatus(rows: PreventiveOrderRow[]): PreventiveStatusSlice[] {
  const order: PreventiveManagementStatus[] = [
    "Aberta sem execução",
    "Em andamento",
    "Realizada",
    "Fechada sem execução",
    "Atrasada",
    "A vencer",
    "Cancelada"
  ];
  return order
    .map((status) => ({
      status,
      count: rows.filter((r) => r.managementStatus === status).length,
      color: MANAGEMENT_COLORS[status]
    }))
    .filter((slice) => slice.count > 0);
}

export async function getPreventiveOrdersByMachine(filters: PreventiveFilters = {}): Promise<PreventiveMachineRow[]> {
  return topMachines(await getPreventiveOrders(filters));
}

function topMachines(rows: PreventiveOrderRow[]): PreventiveMachineRow[] {
  const map = new Map<string, { naoRealizadas: number; total: number }>();
  for (const row of rows) {
    const name = row.technicalObject ?? row.equipmentName ?? "Sem identificação";
    const entry = map.get(name) ?? { naoRealizadas: 0, total: 0 };
    entry.total += 1;
    if (row.executionStatus === "Não Realizada") entry.naoRealizadas += 1;
    map.set(name, entry);
  }
  return Array.from(map.entries())
    .map(([name, value]) => ({ name, ...value }))
    .filter((m) => m.naoRealizadas > 0)
    .sort((a, b) => b.naoRealizadas - a.naoRealizadas)
    .slice(0, 10);
}

export async function getPreventiveOrdersMonthlyTrend(
  filters: PreventiveFilters = {}
): Promise<PreventiveMonthlyPoint[]> {
  return monthlyTrend(await getPreventiveOrders(filters));
}

function monthlyTrend(rows: PreventiveOrderRow[]): PreventiveMonthlyPoint[] {
  const map = new Map<string, PreventiveMonthlyPoint>();
  for (const row of rows) {
    if (!row.openedAt) continue;
    const date = new Date(row.openedAt);
    const month = `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
    const label = `${MONTH_LABELS[date.getUTCMonth()]}/${String(date.getUTCFullYear()).slice(2)}`;
    const point = map.get(month) ?? { month, label, total: 0, realizadas: 0, naoRealizadas: 0, horas: 0 };
    point.total += 1;
    if (row.executionStatus === "Realizada") point.realizadas += 1;
    else point.naoRealizadas += 1;
    point.horas = round1(point.horas + row.workedHours);
    map.set(month, point);
  }
  return Array.from(map.values()).sort((a, b) => a.month.localeCompare(b.month));
}

function buildAlerts(rows: PreventiveOrderRow[], byArea: PreventiveAreaBreakdown[]): PreventiveAlerts {
  const machines = topMachines(rows);
  const lowAdherenceAreas = byArea
    .filter((a) => a.total > 0 && a.aderencia !== null && a.aderencia < 80)
    .map((a) => ({ area: a.area, aderencia: a.aderencia as number }));

  return {
    closedNoExecCount: rows.filter((r) => r.managementStatus === "Fechada sem execução").length,
    // Sem data de vencimento na base, o atraso não é derivável.
    overdueCount: null,
    recurrentMachine: machines.length ? { name: machines[0].name, count: machines[0].naoRealizadas } : null,
    lowAdherenceAreas
  };
}

function buildFilterOptions(allRows: PreventiveOrderRow[]): PreventiveFilterOptions {
  const statusKeys = Array.from(new Set(allRows.map(statusSapEnumOf)));
  const statuses = statusKeys
    .map((value) => ({
      value,
      label: STATUS_SAP_LABEL[value as ServiceOrderStatus] ?? value
    }))
    .sort((a, b) => a.label.localeCompare(b.label, "pt-BR"));

  const managementStatuses = Array.from(new Set(allRows.map((r) => r.managementStatus)));
  const responsibles = Array.from(new Set(allRows.map((r) => r.responsibleName ?? "SEM RESPONSÁVEL"))).sort((a, b) =>
    a.localeCompare(b, "pt-BR")
  );

  return { statuses, managementStatuses, responsibles };
}

/** Agregador único para a página: 1 fetch (cacheado) → todas as seções. */
export async function getPreventiveOrdersPageData(filters: PreventiveFilters = {}): Promise<PreventivePageData> {
  try {
    const allInPeriod = await loadClassifiedOrders(periodKey(filters));
    const rows = applyFilters(allInPeriod, filters);

    const byArea = breakdownByArea(rows);

    return {
      summary: summarize(rows),
      byType: breakdownByType(rows),
      byArea,
      byStatus: breakdownByStatus(rows),
      byMachine: topMachines(rows),
      monthlyTrend: monthlyTrend(rows),
      alerts: buildAlerts(rows, byArea),
      rows: rows.slice(0, TABLE_ROW_CAP),
      totalRows: rows.length,
      rowsCapped: rows.length > TABLE_ROW_CAP,
      filterOptions: buildFilterOptions(allInPeriod),
      hasAnyPreventiveInPeriod: allInPeriod.length > 0,
      source: "database"
    };
  } catch (error) {
    console.error("Falha ao carregar dados de Preventivas Programadas.", error);
    return emptyPageData();
  }
}

function emptyPageData(): PreventivePageData {
  return {
    summary: {
      total: 0,
      totalPL: 0,
      totalPV: 0,
      realizadas: 0,
      naoRealizadas: 0,
      fechadasSemExecucao: 0,
      horasApontadas: 0,
      aderencia: null
    },
    byType: [],
    byArea: [],
    byStatus: [],
    byMachine: [],
    monthlyTrend: [],
    alerts: { closedNoExecCount: 0, overdueCount: null, recurrentMachine: null, lowAdherenceAreas: [] },
    rows: [],
    totalRows: 0,
    rowsCapped: false,
    filterOptions: { statuses: [], managementStatuses: [], responsibles: [] },
    hasAnyPreventiveInPeriod: false,
    source: "empty"
  };
}
