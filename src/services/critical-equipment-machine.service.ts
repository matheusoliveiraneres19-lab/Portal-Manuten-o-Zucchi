/**
 * EQUIPAMENTOS CRÍTICOS — ANÁLISE POR MÁQUINA (modo independente da família).
 *
 *   MÁQUINA → EVOLUÇÃO ANUAL (Jan → Dez) → MÊS → REPARTIMENTO → OS
 *
 * O caminho por família (`critical-equipment-evolution.service`) fica intacto. Aqui:
 *  - A MÁQUINA é a mesma chave do ranking: TAG da raiz do local de instalação
 *    (`getRootFunctionalLocation` + cadastro de locais). Nunca o nome.
 *  - O SELETOR lista TODAS as máquinas válidas da base: não é limitado pela família
 *    filtrada, pelo Top N nem pelo período da página.
 *  - Filtros de FROTA (família, centro de custo, setor, reincidentes, críticos, Top N)
 *    decidem quais máquinas entram no ranking — no modo Máquina a máquina é escolhida
 *    diretamente, então eles não se aplicam (a tela avisa quais foram ignorados).
 *    Filtros de OS (status, grupo, tipo, corretiva/planejada, responsável, área) valem
 *    sobre as OS da máquina; "somente abertas"/"com horas" também passam a recortar as
 *    OS em vez de excluir a máquina.
 *  - Mesmas regras do restante da aba: uma linha de OS = 1 (a unidade de todo o
 *    módulo), corretiva/planejada por `resolveOrderClass`, abertas por `OPEN_STATUSES`,
 *    grupo por `resolvePlanningGroup`, mês por `openedAt`, repartimento por
 *    `resolveFirstLevelChild`, "Equipamento não informado" ignorado.
 *
 * Consultas: opções = 1 `groupBy`; ano = 1 leitura das OS da máquina; mês = 1 leitura
 * + 1 leitura por ID das OS exibidas. O cadastro de locais vem em cache.
 */
import { ServiceOrderStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  OPEN_STATUSES,
  applyPlanningFilters,
  buildWhere,
  fetchRowsFullByIds,
  loadFunctionalLocationLookup,
  toServiceOrderDto,
  type ServiceOrderRow
} from "@/services/critical-equipments.service";
import {
  DRILLDOWN_ORDERS_LIMIT,
  NO_COMPONENT_KEY,
  NO_COMPONENT_LABEL,
  describeComponent,
  formatMonthLong
} from "@/services/critical-equipment-evolution.service";
import { equipmentCandidateWhere } from "@/services/service-orders.service";
import {
  excludeInvalidTestEquipmentWhere,
  isInvalidTestEquipmentOrder
} from "@/utils/service-order-classification";
import {
  getRootFunctionalLocation,
  resolveFirstLevelChild,
  type FunctionalLocationLite
} from "@/utils/functional-location-hierarchy";
import {
  PLANNING_GROUP_LABELS,
  PLANNING_GROUP_ORDER,
  resolveOrderClass,
  resolvePlanningGroup,
  type PlanningGroupKey
} from "@/utils/service-order-planning";
import type {
  CriticalEquipmentFilters,
  CriticalMachineComponent,
  CriticalMachineMonth,
  CriticalMachineMonthDetail,
  CriticalMachineMonthState,
  CriticalMachineOption,
  CriticalMachineSplit,
  CriticalMachineYearAnalysis
} from "@/types/critical-equipments";
import type { ServiceOrderStatusLabel } from "@/types/service-orders";

const MONTH_SHORT = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];

const ROW_SELECT = {
  id: true,
  equipmentName: true,
  equipmentCode: true,
  technicalObjectRaw: true,
  status: true,
  workedHours: true,
  openedAt: true,
  responsibleName: true,
  planningGroup: true,
  planningGroupCode: true,
  planningActivityType: true,
  maintenanceType: true,
  orderType: true,
  type: true,
  area: true,
  title: true,
  osNumber: true,
  operation: true
} as const;

function normalizeSearch(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
}

/* ------------------------------------------------------------------ */
/* Opções do seletor                                                  */
/* ------------------------------------------------------------------ */

/**
 * TODAS as máquinas válidas da base, para o seletor do modo Máquina.
 *
 * Um `groupBy` pelas colunas que identificam o local (código, nome, objeto técnico)
 * — algumas centenas de combinações, não as ~20 mil OS — e a raiz resolvida em
 * memória com a MESMA função do ranking. Família, Top N e período não entram.
 */
export async function getCriticalEquipmentMachineOptions(): Promise<CriticalMachineOption[]> {
  const [groups, lookup] = await Promise.all([
    prisma.serviceOrder.groupBy({
      by: ["equipmentCode", "equipmentName", "technicalObjectRaw"],
      where: excludeInvalidTestEquipmentWhere(),
      _count: { _all: true },
      _max: { openedAt: true }
    }),
    loadFunctionalLocationLookup()
  ]);

  type Acc = CriticalMachineOption & { terms: Set<string>; directName: boolean };
  const byRoot = new Map<string, Acc>();

  for (const group of groups) {
    // Mesma regra de "Equipamento não informado" do restante da aba.
    if (isInvalidTestEquipmentOrder({ ...group, title: "" })) continue;
    const root = getRootFunctionalLocation(group, lookup);
    let acc = byRoot.get(root.rootTag);
    if (!acc) {
      acc = {
        id: root.rootTag,
        name: root.rootDescription,
        familyLabel: root.familyLabel,
        totalOrders: 0,
        lastOrderAt: null,
        searchText: "",
        terms: new Set([root.rootTag, root.rootDescription, root.familyLabel]),
        directName: !root.componentTag && !root.dataQualityIssue
      };
      byRoot.set(root.rootTag, acc);
    } else if (!root.componentTag && !root.dataQualityIssue && !acc.directName) {
      // OS registrada na própria raiz traz o nome oficial (mesma regra do ranking).
      acc.name = root.rootDescription || acc.name;
      acc.directName = true;
    }
    acc.totalOrders += group._count._all;
    const last = group._max.openedAt?.toISOString() ?? null;
    if (last && (!acc.lastOrderAt || last > acc.lastOrderAt)) acc.lastOrderAt = last;
    for (const term of [group.equipmentCode, group.equipmentName, group.technicalObjectRaw, root.componentTag]) {
      if (term) acc.terms.add(term);
    }
  }

  return Array.from(byRoot.values())
    .map(({ terms, directName: _directName, ...option }) => ({
      ...option,
      searchText: normalizeSearch(Array.from(terms).join(" | "))
    }))
    .sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
}

/* ------------------------------------------------------------------ */
/* Leitura das OS da máquina                                          */
/* ------------------------------------------------------------------ */

/** Filtros de FROTA: não se aplicam quando a máquina é escolhida diretamente. */
const FLEET_FILTER_LABELS: Array<[keyof CriticalEquipmentFilters, string]> = [
  ["families", "Família"],
  ["costCenters", "Centro de custo"],
  ["sectors", "Setor / Galpão"],
  ["onlyRecurrent", "Somente reincidentes"],
  ["onlyCritical", "Somente críticos"]
];

function ignoredFleetFilters(params: Partial<CriticalEquipmentFilters>): string[] {
  return FLEET_FILTER_LABELS.filter(([key]) => {
    const value = params[key];
    return Array.isArray(value) ? value.length > 0 : Boolean(value);
  }).map(([, label]) => label);
}

/**
 * OS da máquina no intervalo, com os filtros de OS da página. SQL pré-filtra pelo
 * TAG (superconjunto); a decisão final é a mesma raiz do ranking, em memória.
 */
async function loadMachineRows(
  machineId: string,
  params: Partial<CriticalEquipmentFilters>,
  range: { from: Date; to: Date } | null,
  lookup: Map<string, FunctionalLocationLite>
): Promise<ServiceOrderRow[]> {
  // Filtros de OS em SQL (status, área, grupo cru, responsável) — sem o período da página.
  const where = buildWhere({ ...params, startDate: undefined, endDate: undefined });
  const and = [
    where,
    excludeInvalidTestEquipmentWhere(),
    equipmentCandidateWhere(machineId, lookup),
    ...(range ? [{ openedAt: { gte: range.from, lte: range.to } }] : [])
  ];

  const rows = (await prisma.serviceOrder.findMany({
    where: { AND: and },
    select: ROW_SELECT
  })) as ServiceOrderRow[];

  return applyPlanningFilters(
    rows.filter(
      (row) =>
        !isInvalidTestEquipmentOrder(row) &&
        getRootFunctionalLocation(row, lookup).rootTag === machineId &&
        (!params.onlyOpenOrders || OPEN_STATUSES.has(row.status as ServiceOrderStatusLabel)) &&
        (!params.onlyWithWorkedHours || (row.workedHours ?? 0) > 0)
    ),
    params
  );
}

/** Nome/família da máquina a partir das próprias OS (OS na raiz traz o nome oficial). */
function describeMachine(machineId: string, rows: ServiceOrderRow[], lookup: Map<string, FunctionalLocationLite>) {
  let name = "";
  let familyLabel = "";
  for (const row of rows) {
    const root = getRootFunctionalLocation(row, lookup);
    if (!name || (!root.componentTag && !root.dataQualityIssue)) name = root.rootDescription;
    familyLabel = familyLabel || root.familyLabel;
    if (!root.componentTag && !root.dataQualityIssue) break;
  }
  const entry = lookup.get(machineId);
  return {
    id: machineId,
    name: name || entry?.rootDescription || entry?.description || machineId,
    familyLabel: familyLabel || "Não informado"
  };
}

/* ------------------------------------------------------------------ */
/* Contagens                                                          */
/* ------------------------------------------------------------------ */

type SplitAcc = Omit<CriticalMachineSplit, "planningGroups"> & {
  groups: Map<PlanningGroupKey, { orders: number; hours: number }>;
};

function emptyAcc(): SplitAcc {
  return {
    totalOrders: 0,
    totalWorkedHours: 0,
    openOrders: 0,
    closedOrders: 0,
    otherStatusOrders: 0,
    correctiveOrders: 0,
    plannedOrders: 0,
    unclassifiedOrders: 0,
    groups: new Map()
  };
}

function addRow(acc: SplitAcc, row: ServiceOrderRow) {
  const hours = row.workedHours ?? 0;
  acc.totalOrders += 1;
  acc.totalWorkedHours += hours;
  if (OPEN_STATUSES.has(row.status as ServiceOrderStatusLabel)) acc.openOrders += 1;
  else if (row.status === ServiceOrderStatus.FECHADA) acc.closedOrders += 1;
  else acc.otherStatusOrders += 1;

  const orderClass = resolveOrderClass(row);
  if (orderClass === "CORRETIVA") acc.correctiveOrders += 1;
  else if (orderClass === "PLANEJADA") acc.plannedOrders += 1;
  else acc.unclassifiedOrders += 1;

  const key = resolvePlanningGroup(row);
  const group = acc.groups.get(key) ?? { orders: 0, hours: 0 };
  group.orders += 1;
  group.hours += hours;
  acc.groups.set(key, group);
}

function finish(acc: SplitAcc): CriticalMachineSplit {
  const { groups, ...rest } = acc;
  return {
    ...rest,
    totalWorkedHours: round1(rest.totalWorkedHours),
    planningGroups: PLANNING_GROUP_ORDER.flatMap((key) => {
      const group = groups.get(key);
      return group ? [{ key, label: PLANNING_GROUP_LABELS[key], orders: group.orders, hours: round1(group.hours) }] : [];
    })
  };
}

function round1(value: number): number {
  return Number.isFinite(value) ? Math.round(value * 10) / 10 : 0;
}

/* ------------------------------------------------------------------ */
/* Calendário: mês encerrado, em andamento, futuro, antes da base      */
/* ------------------------------------------------------------------ */

/** "YYYY-MM" de hoje no fuso da fábrica. */
function currentMonthKey(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date()).slice(0, 7);
}

let baseStartCache: { at: number; month: string | null } | null = null;

/** Primeiro mês com OS na base importada (cache de 10 min): antes dele não há período disponível. */
async function baseStartMonth(): Promise<string | null> {
  if (baseStartCache && Date.now() - baseStartCache.at < 10 * 60 * 1000) return baseStartCache.month;
  const range = await prisma.serviceOrder.aggregate({
    where: excludeInvalidTestEquipmentWhere(),
    _min: { openedAt: true }
  });
  const month = range._min.openedAt ? range._min.openedAt.toISOString().slice(0, 7) : null;
  baseStartCache = { at: Date.now(), month };
  return month;
}

function monthState(period: string, today: string, baseStart: string | null): CriticalMachineMonthState {
  if (period > today) return "future";
  if (period === today) return "current";
  if (baseStart && period < baseStart) return "noBase";
  return "closed";
}

/* ------------------------------------------------------------------ */
/* Ano da máquina                                                     */
/* ------------------------------------------------------------------ */

/**
 * Evolução Jan → Dez de UMA máquina num ano, agregada no servidor numa passada.
 * Sem dados no ano (ou máquina inexistente) devolve `null` — nunca dados de família
 * nem gerais no lugar.
 */
export async function getCriticalEquipmentMachineYearAnalysis(
  machineId: string,
  year: number | null,
  params: Partial<CriticalEquipmentFilters> = {}
): Promise<CriticalMachineYearAnalysis | null> {
  const id = machineId.trim();
  if (!id) return null;

  const lookup = await loadFunctionalLocationLookup();
  // TODOS os anos da máquina numa leitura: dá a lista de anos com dados e o ano pedido.
  const rows = await loadMachineRows(id, params, null, lookup);
  const availableYears = Array.from(
    new Set(rows.flatMap((row) => (row.openedAt ? [row.openedAt.getUTCFullYear()] : [])))
  ).sort((a, b) => a - b);

  // Máquina sem nenhuma OS (inexistente, ou zerada pelos filtros de OS): nada a mostrar.
  if (!rows.length) return null;

  const machine = describeMachine(id, rows, lookup);
  const selectedYear = year && Number.isInteger(year) ? year : availableYears[availableYears.length - 1] ?? null;
  if (selectedYear === null) return null;

  const yearRows = rows.filter((row) => row.openedAt?.getUTCFullYear() === selectedYear);
  const today = currentMonthKey();
  const baseStart = await baseStartMonth();

  const monthAcc = MONTH_SHORT.map(() => emptyAcc());
  const total = emptyAcc();
  for (const row of yearRows) {
    addRow(total, row);
    addRow(monthAcc[row.openedAt!.getUTCMonth()], row);
  }

  const months: CriticalMachineMonth[] = monthAcc.map((acc, index) => {
    const period = `${selectedYear}-${String(index + 1).padStart(2, "0")}`;
    return { ...finish(acc), period, label: MONTH_SHORT[index], state: monthState(period, today, baseStart) };
  });

  const peak = (pick: (month: CriticalMachineMonth) => number) => {
    const best = months.reduce<CriticalMachineMonth | null>((top, month) => (pick(month) > (top ? pick(top) : 0) ? month : top), null);
    return best ? { period: best.period, label: formatMonthLong(best.period), value: pick(best) } : null;
  };

  return {
    machine,
    year: selectedYear,
    availableYears,
    months,
    summary: {
      ...finish(total),
      peakOrdersMonth: peak((month) => month.totalOrders),
      peakHoursMonth: peak((month) => month.totalWorkedHours)
    },
    ignoredFilters: ignoredFleetFilters(params)
  };
}

/* ------------------------------------------------------------------ */
/* Mês da máquina                                                     */
/* ------------------------------------------------------------------ */

/**
 * DETALHE — <máquina> — <mês>: contagens, repartimentos e as OS do mês (mais
 * recentes primeiro). Cada OS leva o seu repartimento, para a tela filtrar a lista
 * por repartimento sem nova consulta (Máquina → Mês → Repartimento → OS).
 */
export async function getCriticalEquipmentMachineMonthDetail(
  machineId: string,
  period: string,
  params: Partial<CriticalEquipmentFilters> = {}
): Promise<CriticalMachineMonthDetail | null> {
  const id = machineId.trim();
  if (!id || !/^\d{4}-(0[1-9]|1[0-2])$/.test(period)) return null;

  const [yearValue, monthValue] = period.split("-").map(Number);
  const from = new Date(Date.UTC(yearValue, monthValue - 1, 1));
  const to = new Date(Date.UTC(yearValue, monthValue, 0, 23, 59, 59, 999));

  const lookup = await loadFunctionalLocationLookup();
  const rows = await loadMachineRows(id, params, { from, to }, lookup);
  const machine = describeMachine(id, rows, lookup);

  const split = emptyAcc();
  const byComponent = new Map<string, { orders: number; hours: number }>();
  const componentOf = new Map<string, string>();
  for (const row of rows) {
    addRow(split, row);
    const root = getRootFunctionalLocation(row, lookup);
    // Repartimento = filho de 1º nível (mesma chave do drill-down por família).
    const key = root.componentTag ? resolveFirstLevelChild(root.componentTag, id, lookup).tag : NO_COMPONENT_KEY;
    componentOf.set(row.id, key);
    const acc = byComponent.get(key) ?? { orders: 0, hours: 0 };
    acc.orders += 1;
    acc.hours += row.workedHours ?? 0;
    byComponent.set(key, acc);
  }

  const components: CriticalMachineComponent[] = Array.from(byComponent.entries())
    .map(([key, acc]) => {
      const child = key === NO_COMPONENT_KEY ? null : describeComponent(key, id, lookup);
      return {
        key,
        label: child ? child.label : NO_COMPONENT_LABEL,
        code: child?.code ?? "",
        description: child?.description ?? null,
        orders: acc.orders,
        hours: round1(acc.hours)
      };
    })
    // "Sem repartimento" por último: é falta de cadastro, não um subconjunto.
    .sort((a, b) => Number(a.key === NO_COMPONENT_KEY) - Number(b.key === NO_COMPONENT_KEY) || b.orders - a.orders);

  const sortedIds = rows
    .slice()
    .sort((a, b) => (b.openedAt?.getTime() ?? 0) - (a.openedAt?.getTime() ?? 0))
    .map((row) => row.id);
  const ids = sortedIds.slice(0, DRILLDOWN_ORDERS_LIMIT);
  const fullRows = ids.length ? await fetchRowsFullByIds(ids) : [];
  const byId = new Map(fullRows.map((row) => [row.id, row]));

  return {
    machine,
    period,
    periodLabel: formatMonthLong(period),
    state: monthState(period, currentMonthKey(), await baseStartMonth()),
    split: finish(split),
    components,
    orders: {
      total: sortedIds.length,
      truncated: sortedIds.length > ids.length,
      items: ids.flatMap((rowId) => {
        const row = byId.get(rowId);
        return row ? [{ ...toServiceOrderDto(row), componentKey: componentOf.get(rowId) ?? NO_COMPONENT_KEY }] : [];
      })
    }
  };
}
