/**
 * EVOLUÇÃO MENSAL DE ORDENS POR FAMÍLIA + DRILL-DOWN (aba Equipamentos Críticos).
 *
 *   FAMÍLIA → MÊS → MÁQUINA → REPARTIMENTO → ORDENS
 *
 * Agregação PURA (sem Prisma): recebe as OS já recortadas pelos filtros da aba e a
 * lista COMPLETA de equipamentos do recorte (`analyzeEquipments`, não o Top N), e
 * resolve tudo numa passada em memória — nada de uma consulta por família/máquina.
 *
 * Fontes (nenhuma nova regra):
 *  - Família e máquina raiz: `getRootFunctionalLocation` (cadastro de locais →
 *    padrão estrutural do TAG), a mesma do ranking e do filtro "Família".
 *    O título da OS NUNCA é usado para classificar.
 *  - Repartimento: `resolveFirstLevelChild` (cadeia `parentTag` do cadastro).
 *  - Corretiva/Planejada: `resolveOrderClass`, a mesma regra do gráfico
 *    "Ordens Corretivas x Planejadas" desta aba.
 *  - Mês: `openedAt` em YYYY-MM (mesma convenção da evolução anterior).
 */
import {
  getRootFunctionalLocation,
  resolveFirstLevelChild,
  type FunctionalLocationLite,
  type RootResolvableOrder
} from "@/utils/functional-location-hierarchy";
import { resolveOrderClass, type PlanningClassifiableOrder } from "@/utils/service-order-planning";
import type {
  CriticalEquipmentItem,
  CriticalEquipmentSelection,
  CriticalEquipmentSelectionContext,
  FamilyDrilldownComponent,
  FamilyDrilldownMachine,
  FamilyDrilldownMachineDetail,
  FamilyDrilldownSelection,
  FamilyDrilldownSplit,
  FamilyEvolutionData,
  FamilyEvolutionMonth,
  FamilyEvolutionSeries
} from "@/types/critical-equipments";

/** OS registrada na própria máquina (sem filho) — não se perde, vira categoria. */
export const NO_COMPONENT_KEY = "__SEM_REPARTIMENTO__";
export const NO_COMPONENT_LABEL = "Sem repartimento informado";
/** Pseudo-seleção "todas as OS da máquina" (útil quando não há hierarquia). */
export const ALL_ORDERS_KEY = "__TODAS__";
/** Teto da tabela de OS enviada ao browser (o total continua exato). */
export const DRILLDOWN_ORDERS_LIMIT = 1000;
/** Janela de recorrência: mês selecionado + 2 anteriores. */
const RECURRENCE_WINDOW_MONTHS = 3;

export type EvolutionRow = RootResolvableOrder &
  PlanningClassifiableOrder & {
    id: string;
    openedAt: Date | null;
    workedHours: number | null;
  };

/* ------------------------------------------------------------------ */
/* Meses                                                              */
/* ------------------------------------------------------------------ */

export function monthKey(date: Date): string {
  return date.toISOString().slice(0, 7);
}

export function monthLabel(period: string): string {
  const [year, month] = period.split("-");
  return `${month}/${year}`;
}

const MONTH_NAMES = [
  "Janeiro",
  "Fevereiro",
  "Março",
  "Abril",
  "Maio",
  "Junho",
  "Julho",
  "Agosto",
  "Setembro",
  "Outubro",
  "Novembro",
  "Dezembro"
];

/** "2026-08" → "Agosto/2026". */
export function formatMonthLong(period: string): string {
  const [year, month] = period.split("-");
  return `${MONTH_NAMES[Number(month) - 1] ?? month}/${year}`;
}

/** Todos os meses entre duas datas YYYY-MM-DD (inclusive), para o eixo não pular mês sem OS. */
export function monthsBetween(startDate: string, endDate: string): FamilyEvolutionMonth[] {
  const start = startDate.slice(0, 7);
  const end = endDate.slice(0, 7);
  if (!/^\d{4}-\d{2}$/.test(start) || !/^\d{4}-\d{2}$/.test(end) || start > end) {
    return [];
  }
  const months: FamilyEvolutionMonth[] = [];
  let [year, month] = start.split("-").map(Number);
  // Limite defensivo (20 anos) contra período malformado.
  for (let guard = 0; guard < 240; guard += 1) {
    const period = `${year}-${String(month).padStart(2, "0")}`;
    if (period > end) {
      break;
    }
    months.push({ period, label: monthLabel(period) });
    month += 1;
    if (month > 12) {
      month = 1;
      year += 1;
    }
  }
  return months;
}

/* ------------------------------------------------------------------ */
/* Resolução por linha (uma vez por OS)                               */
/* ------------------------------------------------------------------ */

type ResolvedRow<Row extends EvolutionRow> = {
  row: Row;
  rootTag: string;
  family: string;
  month: string | null;
  /** TAG do repartimento ou NO_COMPONENT_KEY. */
  componentKey: string;
};

/**
 * Resolve máquina, família, mês e repartimento de cada OS e descarta as de máquinas
 * fora do recorte (filtros de família/setor/CC/abertas/reincidentes/críticos já
 * aplicados em `items`). Família vem do ITEM, a mesma exibida no ranking.
 */
function resolveRows<Row extends EvolutionRow>(
  rows: Row[],
  itemsById: Map<string, CriticalEquipmentItem>,
  lookup: Map<string, FunctionalLocationLite>,
  withComponent: boolean
): ResolvedRow<Row>[] {
  const resolved: ResolvedRow<Row>[] = [];
  for (const row of rows) {
    const root = getRootFunctionalLocation(row, lookup);
    const item = itemsById.get(root.rootTag);
    if (!item) {
      continue;
    }
    resolved.push({
      row,
      rootTag: root.rootTag,
      family: item.familyLabel,
      month: row.openedAt ? monthKey(row.openedAt) : null,
      componentKey:
        withComponent && root.componentTag
          ? resolveFirstLevelChild(root.componentTag, root.rootTag, lookup).tag
          : NO_COMPONENT_KEY
    });
  }
  return resolved;
}

/* ------------------------------------------------------------------ */
/* Seleção da análise — FONTE ÚNICA do recorte                        */
/* ------------------------------------------------------------------ */

export function isSelectionActive(selection: CriticalEquipmentSelection): boolean {
  return Boolean(selection.family || selection.month || selection.machine || selection.partition);
}

/** `ALL_ORDERS_KEY` é "todas as OS da máquina" — não recorta repartimento. */
function partitionFilter(selection: CriticalEquipmentSelection): string | null {
  return selection.partition && selection.partition !== ALL_ORDERS_KEY ? selection.partition : null;
}

/**
 * Recorte da página: filtros de equipamento (via `items`, que já aplicou família do
 * filtro, setor, CC, abertas, reincidentes, críticos) ∩ seleção da análise.
 *
 * TODOS os dashboards abaixo do gráfico de evolução consomem o resultado desta
 * função — é o "where" da seleção. Seleção sem correspondência devolve lista vazia
 * (nunca cai silenciosamente para o total geral).
 */
export function filterRowsBySelection<Row extends EvolutionRow>(
  rows: Row[],
  items: CriticalEquipmentItem[],
  lookup: Map<string, FunctionalLocationLite>,
  selection: CriticalEquipmentSelection
): Row[] {
  const itemsById = new Map(items.map((item) => [item.id, item]));
  const partition = partitionFilter(selection);
  return resolveRows(rows, itemsById, lookup, Boolean(partition))
    .filter(
      (entry) =>
        (!selection.family || entry.family === selection.family) &&
        (!selection.month || entry.month === selection.month) &&
        (!selection.machine || entry.rootTag === selection.machine) &&
        (!partition || entry.componentKey === partition)
    )
    .map((entry) => entry.row);
}

/** Caminho e rótulo legíveis da seleção, para a faixa "Análise atual" e os títulos. */
export function buildSelectionContext(
  selection: CriticalEquipmentSelection,
  items: CriticalEquipmentItem[],
  lookup: Map<string, FunctionalLocationLite>,
  totalOrders: number
): CriticalEquipmentSelectionContext {
  const path: CriticalEquipmentSelectionContext["path"] = [];
  if (selection.family) path.push({ level: "family", label: selection.family });
  if (selection.month) path.push({ level: "month", label: formatMonthLong(selection.month) });
  if (selection.machine) {
    const item = items.find((current) => current.id === selection.machine);
    path.push({ level: "machine", label: item?.equipmentName ?? selection.machine });
  }
  const partition = partitionFilter(selection);
  if (partition) {
    path.push({
      level: "partition",
      label:
        partition === NO_COMPONENT_KEY || !selection.machine
          ? NO_COMPONENT_LABEL
          : describeComponent(partition, selection.machine, lookup).label
    });
  }

  // Título: o nível mais específico (repartimento > máquina > família) + o mês.
  const subject = [...path].reverse().find((entry) => entry.level !== "month");
  const month = path.find((entry) => entry.level === "month");
  const label = [subject?.label, month?.label].filter(Boolean).join(" · ");

  return { active: path.length > 0, path, label, totalOrders };
}

/* ------------------------------------------------------------------ */
/* Gráfico: evolução mensal por família                               */
/* ------------------------------------------------------------------ */

export function buildFamilyEvolution(
  rows: EvolutionRow[],
  items: CriticalEquipmentItem[],
  lookup: Map<string, FunctionalLocationLite>,
  period: { startDate: string; endDate: string }
): FamilyEvolutionData {
  const itemsById = new Map(items.map((item) => [item.id, item]));
  const resolved = resolveRows(rows, itemsById, lookup, false);

  const months = monthsBetween(period.startDate, period.endDate);
  // Mês de OS fora do eixo (não deveria ocorrer: o período filtra `openedAt`) entra
  // mesmo assim — a soma das famílias precisa bater com o total do recorte.
  const known = new Set(months.map((month) => month.period));
  for (const entry of resolved) {
    if (entry.month && !known.has(entry.month)) {
      known.add(entry.month);
      months.push({ period: entry.month, label: monthLabel(entry.month) });
    }
  }
  months.sort((a, b) => a.period.localeCompare(b.period));
  const monthIndex = new Map(months.map((month, index) => [month.period, index]));

  type Accumulator = {
    orders: number[];
    hours: number[];
    machinesByMonth: Array<Set<string>>;
    machines: Set<string>;
    totalOrders: number;
    totalHours: number;
  };
  const byFamily = new Map<string, Accumulator>();
  let totalOrders = 0;
  let totalHours = 0;

  for (const entry of resolved) {
    let acc = byFamily.get(entry.family);
    if (!acc) {
      acc = {
        orders: months.map(() => 0),
        hours: months.map(() => 0),
        machinesByMonth: months.map(() => new Set<string>()),
        machines: new Set(),
        totalOrders: 0,
        totalHours: 0
      };
      byFamily.set(entry.family, acc);
    }
    const hours = entry.row.workedHours ?? 0;
    acc.totalOrders += 1;
    acc.totalHours += hours;
    acc.machines.add(entry.rootTag);
    totalOrders += 1;
    totalHours += hours;

    const index = entry.month ? monthIndex.get(entry.month) : undefined;
    if (index !== undefined) {
      acc.orders[index] += 1;
      acc.hours[index] += hours;
      acc.machinesByMonth[index].add(entry.rootTag);
    }
  }

  const families: FamilyEvolutionSeries[] = Array.from(byFamily.entries())
    .map(([family, acc]) => ({
      family,
      totalOrders: acc.totalOrders,
      totalWorkedHours: round(acc.totalHours, 1),
      machineCount: acc.machines.size,
      orders: acc.orders,
      hours: acc.hours.map((value) => round(value, 1)),
      machines: acc.machinesByMonth.map((set) => set.size)
    }))
    .sort((a, b) => b.totalOrders - a.totalOrders || a.family.localeCompare(b.family, "pt-BR"));

  return { months, families, totalOrders, totalWorkedHours: round(totalHours, 1) };
}

/* ------------------------------------------------------------------ */
/* Drill-down                                                         */
/* ------------------------------------------------------------------ */

export type FamilyDrilldownComputation = {
  selection: FamilyDrilldownSelection;
  family: FamilyDrilldownSplit & { machineCount: number };
  variationVsPreviousMonth: number | null;
  machines: FamilyDrilldownMachine[];
  machine: FamilyDrilldownMachineDetail | null;
  /** IDs das OS do nível de ordens (já ordenadas: mais recente primeiro). */
  orders: { scopeLabel: string; ids: string[] } | null;
};

export function buildFamilyDrilldown<Row extends EvolutionRow>(
  rows: Row[],
  items: CriticalEquipmentItem[],
  lookup: Map<string, FunctionalLocationLite>,
  requested: FamilyDrilldownSelection,
  period: { startDate: string; endDate: string }
): FamilyDrilldownComputation {
  const itemsById = new Map(items.map((item) => [item.id, item]));
  const familyRows = resolveRows(rows, itemsById, lookup, true).filter((entry) => entry.family === requested.family);

  const periodMonths = monthsBetween(period.startDate, period.endDate);
  const month = requested.month && /^\d{4}-\d{2}$/.test(requested.month) ? requested.month : null;
  const scoped = month ? familyRows.filter((entry) => entry.month === month) : familyRows;

  // Nível 1 — família no recorte.
  const familySplit = emptySplit();
  const byMachine = new Map<string, FamilyDrilldownSplit>();
  for (const entry of scoped) {
    addToSplit(familySplit, entry.row);
    const split = byMachine.get(entry.rootTag) ?? emptySplit();
    addToSplit(split, entry.row);
    byMachine.set(entry.rootTag, split);
  }

  const machines: FamilyDrilldownMachine[] = Array.from(byMachine.entries())
    .map(([rootTag, split]) => ({
      ...finishSplit(split),
      rootTag,
      name: itemsById.get(rootTag)?.equipmentName ?? rootTag,
      percentOfFamily: percent(split.totalOrders, familySplit.totalOrders)
    }))
    .sort((a, b) => b.totalOrders - a.totalOrders || b.totalWorkedHours - a.totalWorkedHours);

  // Variação vs. mês anterior — só com mês anterior DENTRO do período e com OS.
  let variationVsPreviousMonth: number | null = null;
  if (month) {
    const index = periodMonths.findIndex((current) => current.period === month);
    if (index > 0) {
      const previous = periodMonths[index - 1].period;
      const previousCount = familyRows.filter((entry) => entry.month === previous).length;
      if (previousCount > 0) {
        variationVsPreviousMonth = round(((familySplit.totalOrders - previousCount) / previousCount) * 100, 1);
      }
    }
  }

  const selection: FamilyDrilldownSelection = { family: requested.family, month, machine: null, component: null };
  const result: FamilyDrilldownComputation = {
    selection,
    family: { ...finishSplit(familySplit), machineCount: machines.length },
    variationVsPreviousMonth,
    machines,
    machine: null,
    orders: null
  };

  // Nível 2 — máquina → repartimentos.
  const machineEntry = requested.machine ? machines.find((current) => current.rootTag === requested.machine) : undefined;
  if (!machineEntry) {
    return result;
  }
  selection.machine = machineEntry.rootTag;

  const machineRowsAllMonths = familyRows.filter((entry) => entry.rootTag === machineEntry.rootTag);
  const machineRows = month ? machineRowsAllMonths.filter((entry) => entry.month === month) : machineRowsAllMonths;

  const registeredChildren = Array.from(lookup.values()).filter(
    (location) => location.parentTag === machineEntry.rootTag
  ).length;

  // Janela de recorrência: mês selecionado + 2 anteriores, sem sair do período.
  let recurrenceWindow: FamilyDrilldownMachineDetail["recurrenceWindow"] = null;
  if (month) {
    const index = periodMonths.findIndex((current) => current.period === month);
    if (index >= 0) {
      const start = Math.max(0, index - (RECURRENCE_WINDOW_MONTHS - 1));
      recurrenceWindow = {
        months: periodMonths.slice(start, index + 1),
        limitedByPeriod: index - start + 1 < RECURRENCE_WINDOW_MONTHS
      };
    }
  }
  const windowMonths = new Set(recurrenceWindow?.months.map((current) => current.period) ?? []);

  type ComponentAcc = { split: FamilyDrilldownSplit; windowOrders: number; windowMonths: Set<string> };
  const byComponent = new Map<string, ComponentAcc>();
  const ensure = (key: string) => {
    let acc = byComponent.get(key);
    if (!acc) {
      acc = { split: emptySplit(), windowOrders: 0, windowMonths: new Set() };
      byComponent.set(key, acc);
    }
    return acc;
  };
  for (const entry of machineRows) {
    addToSplit(ensure(entry.componentKey).split, entry.row);
  }
  if (recurrenceWindow) {
    for (const entry of machineRowsAllMonths) {
      if (entry.month && windowMonths.has(entry.month) && byComponent.has(entry.componentKey)) {
        const acc = byComponent.get(entry.componentKey)!;
        acc.windowOrders += 1;
        acc.windowMonths.add(entry.month);
      }
    }
  }

  const components: FamilyDrilldownComponent[] = Array.from(byComponent.entries())
    .map(([key, acc]) => {
      const child = key === NO_COMPONENT_KEY ? null : describeComponent(key, machineEntry.rootTag, lookup);
      return {
        ...finishSplit(acc.split),
        key,
        code: child?.code ?? "",
        description: child?.description ?? null,
        label: child ? child.label : NO_COMPONENT_LABEL,
        registered: child?.registered ?? true,
        percentOfMachine: percent(acc.split.totalOrders, machineEntry.totalOrders),
        recurrenceOrders: recurrenceWindow ? acc.windowOrders : null,
        recurrenceActiveMonths: recurrenceWindow ? acc.windowMonths.size : null
      };
    })
    // "Sem repartimento" sempre por último: é problema de cadastro, não um subconjunto.
    .sort(
      (a, b) =>
        Number(a.key === NO_COMPONENT_KEY) - Number(b.key === NO_COMPONENT_KEY) ||
        b.totalOrders - a.totalOrders ||
        a.label.localeCompare(b.label, "pt-BR")
    );

  const unidentified = byComponent.get(NO_COMPONENT_KEY)?.split.totalOrders ?? 0;
  const identified = machineEntry.totalOrders - unidentified;
  const hasHierarchy = registeredChildren > 0 || identified > 0;

  result.machine = {
    rootTag: machineEntry.rootTag,
    name: machineEntry.name,
    split: pickSplit(machineEntry),
    registeredChildren,
    hasHierarchy,
    components,
    coverage: { identified, unidentified, percent: percent(identified, machineEntry.totalOrders) },
    recurrenceWindow
  };

  // Nível 3 — OS. Sem hierarquia, a lista da máquina aparece direto.
  const component =
    requested.component && (requested.component === ALL_ORDERS_KEY || byComponent.has(requested.component))
      ? requested.component
      : !hasHierarchy
        ? ALL_ORDERS_KEY
        : null;
  if (!component) {
    return result;
  }
  selection.component = requested.component === component ? component : null;

  const orderRows =
    component === ALL_ORDERS_KEY ? machineRows : machineRows.filter((entry) => entry.componentKey === component);
  result.orders = {
    scopeLabel:
      component === ALL_ORDERS_KEY
        ? `Todas as OS de ${machineEntry.name}`
        : components.find((current) => current.key === component)?.label ?? component,
    ids: orderRows
      .slice()
      .sort((a, b) => (b.row.openedAt?.getTime() ?? 0) - (a.row.openedAt?.getTime() ?? 0))
      .map((entry) => entry.row.id)
  };
  return result;
}

/* ------------------------------------------------------------------ */
/* Helpers                                                            */
/* ------------------------------------------------------------------ */

/** Rótulo do repartimento: "Descrição (código)" quando há descrição; senão só o código. */
function describeComponent(tag: string, rootTag: string, lookup: Map<string, FunctionalLocationLite>) {
  const child = resolveFirstLevelChild(tag, rootTag, lookup);
  return {
    code: child.code,
    description: child.description,
    registered: child.registered,
    label: child.description ? `${child.description} (${child.code})` : child.code
  };
}

function emptySplit(): FamilyDrilldownSplit {
  return { totalOrders: 0, correctiveOrders: 0, plannedOrders: 0, unclassifiedOrders: 0, totalWorkedHours: 0 };
}

function addToSplit(split: FamilyDrilldownSplit, row: EvolutionRow) {
  split.totalOrders += 1;
  split.totalWorkedHours += row.workedHours ?? 0;
  const orderClass = resolveOrderClass(row);
  if (orderClass === "CORRETIVA") {
    split.correctiveOrders += 1;
  } else if (orderClass === "PLANEJADA") {
    split.plannedOrders += 1;
  } else {
    split.unclassifiedOrders += 1;
  }
}

function finishSplit(split: FamilyDrilldownSplit): FamilyDrilldownSplit {
  return { ...split, totalWorkedHours: round(split.totalWorkedHours, 1) };
}

function pickSplit(split: FamilyDrilldownSplit): FamilyDrilldownSplit {
  return {
    totalOrders: split.totalOrders,
    correctiveOrders: split.correctiveOrders,
    plannedOrders: split.plannedOrders,
    unclassifiedOrders: split.unclassifiedOrders,
    totalWorkedHours: split.totalWorkedHours
  };
}

function percent(part: number, whole: number): number {
  return whole > 0 ? round((part / whole) * 100, 1) : 0;
}

function round(value: number, digits: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}
