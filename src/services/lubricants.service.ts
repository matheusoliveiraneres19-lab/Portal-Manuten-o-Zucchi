import { cache } from "react";
import { AlertStatus, AlertType, LubricantMovementCategory, Prisma, Priority } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { toInputDate } from "@/utils/period";
import { LUBRICANT_CATEGORY_LABELS } from "@/utils/lubricants-normalizer";
import type {
  LubricantBalanceRow,
  LubricantCodeRow,
  LubricantDetails,
  LubricantFilterOptions,
  LubricantKpis,
  LubricantMaterialAggregate,
  LubricantMonthlyFlowPoint,
  LubricantMovementRow,
  LubricantMovementTypeSlice,
  LubricantMovementsResult,
  LubricantQueryParams,
  LubricantReferencePeriod,
  LubricantReplenishmentItem,
  LubricantUsageIndicators,
  LubricantsPageData
} from "@/types/lubricants";

const DEFAULT_PAGE_SIZE = 50;
const CATEGORY_COLORS: Record<LubricantMovementCategory, string> = {
  ENTRADA: "#3f8f6b",
  SAIDA: "#a6192e",
  ESTOQUE_INICIAL: "#0f4d68",
  AJUSTE: "#c49a45"
};
const CATEGORY_ORDER: LubricantMovementCategory[] = ["ENTRADA", "SAIDA", "ESTOQUE_INICIAL", "AJUSTE"];

/* ------------------------------------------------------------------ */
/* Índice de lubrificantes (cadastro + aplicações)                    */
/* ------------------------------------------------------------------ */

type LubricantInfo = {
  id: string;
  code: string;
  name: string;
  unit: string;
  category: string | null;
  currentStock: number;
  minimumStock: number;
  technicalSheetUrl: string | null;
  machineNames: string[];
};

// `cache` deduplica esta carga (índice completo de lubrificantes) dentro de UM
// render/request. A página chama loadLubricantIndex em ~7 sub-funções; sem isso,
// seriam ~7 varreduras idênticas — peso que estourava o tempo da função serverless.
const loadLubricantIndex = cache(async (): Promise<Map<string, LubricantInfo>> => {
  const lubricants = await prisma.lubricant.findMany({
    select: {
      id: true,
      code: true,
      name: true,
      unit: true,
      category: true,
      currentStock: true,
      minimumStock: true,
      technicalSheetUrl: true,
      machineApplications: { select: { equipmentName: true } }
    },
    orderBy: { code: "asc" }
  });

  const index = new Map<string, LubricantInfo>();
  for (const item of lubricants) {
    index.set(item.code, {
      id: item.id,
      code: item.code,
      name: item.name,
      unit: item.unit,
      category: item.category,
      currentStock: item.currentStock,
      minimumStock: item.minimumStock,
      technicalSheetUrl: item.technicalSheetUrl,
      machineNames: item.machineApplications.map((app) => app.equipmentName)
    });
  }
  return index;
});

/* ------------------------------------------------------------------ */
/* Período de referência                                              */
/* ------------------------------------------------------------------ */

function monthBounds(year: number, month: number): { start: Date; end: Date } {
  return {
    start: new Date(Date.UTC(year, month - 1, 1, 0, 0, 0, 0)),
    end: new Date(Date.UTC(year, month, 0, 23, 59, 59, 999))
  };
}

function yearBounds(year: number): { start: Date; end: Date } {
  return {
    start: new Date(Date.UTC(year, 0, 1, 0, 0, 0, 0)),
    end: new Date(Date.UTC(year, 11, 31, 23, 59, 59, 999))
  };
}

// Memoizado por request (React.cache): a página chama resolveLubricantReference em ~8
// sub-funções com os MESMOS params; sem isso, quando o usuário não fixa ano/mês, cada
// chamada repetiria o aggregate de movementDate (linha abaixo) — 8 queries idênticas/request.
export const resolveLubricantReference = cache(async (
  params: Partial<LubricantQueryParams> = {}
): Promise<LubricantReferencePeriod> => {
  let year = params.year;
  let month = params.month;

  // Período global do portal (startDate/endDate): quando o usuário não escolheu
  // um ano/mês específico na própria página, a janela global define a referência
  // mês/ano dos KPIs — assim os Lubrificantes acompanham o período selecionado
  // no header como os demais módulos. Usa-se o fim da janela como mês de referência.
  if ((!year || !month) && params.endDate) {
    const ref = new Date(params.endDate);
    if (!Number.isNaN(ref.getTime())) {
      year = year ?? ref.getUTCFullYear();
      month = month ?? ref.getUTCMonth() + 1;
    }
  }

  if (!year || !month) {
    const agg = await prisma.lubricantMovement.aggregate({ _max: { movementDate: true } });
    const ref = agg._max.movementDate ?? new Date();
    year = year ?? ref.getUTCFullYear();
    month = month ?? ref.getUTCMonth() + 1;
  }

  const { start, end } = monthBounds(year, month);
  const monthLabel = `${start
    .toLocaleDateString("pt-BR", { month: "short", timeZone: "UTC" })
    .replace(".", "")
    .replace(/^./, (c) => c.toUpperCase())}/${year}`;

  return { year, month, startDate: toInputDate(start), endDate: toInputDate(end), monthLabel };
});

/* ------------------------------------------------------------------ */
/* Agregações por material                                            */
/* ------------------------------------------------------------------ */

type GroupedByCode = Array<{
  materialCode: string;
  _sum: { absoluteQuantity: number | null };
  _count: { _all: number };
}>;

function toAggregates(grouped: GroupedByCode, index: Map<string, LubricantInfo>): LubricantMaterialAggregate[] {
  return grouped
    .map((group) => {
      const info = index.get(group.materialCode);
      return {
        code: group.materialCode,
        description: info?.name ?? group.materialCode,
        unit: info?.unit ?? "UN",
        quantity: round(group._sum.absoluteQuantity ?? 0),
        movementsCount: group._count._all
      };
    })
    .sort((a, b) => b.quantity - a.quantity);
}

async function aggregateByMaterial(
  category: LubricantMovementCategory,
  start: Date,
  end: Date
): Promise<GroupedByCode> {
  const grouped = await prisma.lubricantMovement.groupBy({
    by: ["materialCode"],
    where: { movementCategory: category, movementDate: { gte: start, lte: end } },
    _sum: { absoluteQuantity: true },
    _count: { _all: true }
  });

  return grouped.map((group) => ({
    materialCode: group.materialCode,
    _sum: { absoluteQuantity: group._sum.absoluteQuantity },
    _count: { _all: group._count._all }
  }));
}

/* ------------------------------------------------------------------ */
/* 2-5. Saídas/entradas mês e ano                                     */
/* ------------------------------------------------------------------ */

export async function getLubricantMonthlyOutputs(params: LubricantQueryParams): Promise<LubricantMaterialAggregate[]> {
  const { year, month } = await resolveLubricantReference(params);
  const { start, end } = monthBounds(year, month);
  const [grouped, index] = await Promise.all([
    aggregateByMaterial(LubricantMovementCategory.SAIDA, start, end),
    loadLubricantIndex()
  ]);
  return toAggregates(grouped, index);
}

export async function getLubricantAnnualOutputs(params: LubricantQueryParams): Promise<LubricantMaterialAggregate[]> {
  const { year } = await resolveLubricantReference(params);
  const { start, end } = yearBounds(year);
  const [grouped, index] = await Promise.all([
    aggregateByMaterial(LubricantMovementCategory.SAIDA, start, end),
    loadLubricantIndex()
  ]);
  return toAggregates(grouped, index);
}

export async function getLubricantMonthlyInputs(params: LubricantQueryParams): Promise<LubricantMaterialAggregate[]> {
  const { year, month } = await resolveLubricantReference(params);
  const { start, end } = monthBounds(year, month);
  const [grouped, index] = await Promise.all([
    aggregateByMaterial(LubricantMovementCategory.ENTRADA, start, end),
    loadLubricantIndex()
  ]);
  return toAggregates(grouped, index);
}

export async function getLubricantAnnualInputs(params: LubricantQueryParams): Promise<LubricantMaterialAggregate[]> {
  const { year } = await resolveLubricantReference(params);
  const { start, end } = yearBounds(year);
  const [grouped, index] = await Promise.all([
    aggregateByMaterial(LubricantMovementCategory.ENTRADA, start, end),
    loadLubricantIndex()
  ]);
  return toAggregates(grouped, index);
}

/* ------------------------------------------------------------------ */
/* 6. Saldo por código (all-time)                                     */
/* ------------------------------------------------------------------ */

type CategoryTotals = Record<LubricantMovementCategory, number>;

function emptyTotals(): CategoryTotals {
  return { ENTRADA: 0, SAIDA: 0, ESTOQUE_INICIAL: 0, AJUSTE: 0 };
}

// `cache` deduplica os totais all-time por código (groupBy completo) no mesmo
// render — chamado por KPIs, saldo, reposição e tabela de códigos numa só carga.
const loadAllTimeTotalsByCode = cache(async (): Promise<Map<string, CategoryTotals>> => {
  const grouped = await prisma.lubricantMovement.groupBy({
    by: ["materialCode", "movementCategory"],
    _sum: { absoluteQuantity: true }
  });

  const totals = new Map<string, CategoryTotals>();
  for (const row of grouped) {
    const current = totals.get(row.materialCode) ?? emptyTotals();
    current[row.movementCategory] = round(row._sum.absoluteQuantity ?? 0);
    totals.set(row.materialCode, current);
  }
  return totals;
});

function computeBalance(totals: CategoryTotals): number {
  return round(totals.ENTRADA + totals.ESTOQUE_INICIAL + totals.AJUSTE - totals.SAIDA);
}

export async function getLubricantBalanceByCode(): Promise<LubricantBalanceRow[]> {
  const [totals, index] = await Promise.all([loadAllTimeTotalsByCode(), loadLubricantIndex()]);
  const rows: LubricantBalanceRow[] = [];

  for (const [code, info] of Array.from(index.entries())) {
    const totalsForCode = totals.get(code) ?? emptyTotals();
    rows.push({
      code,
      description: info.name,
      unit: info.unit,
      totalInputs: totalsForCode.ENTRADA,
      totalOutputs: totalsForCode.SAIDA,
      initialStock: totalsForCode.ESTOQUE_INICIAL,
      balance: computeBalance(totalsForCode)
    });
  }

  return rows.sort((a, b) => a.balance - b.balance);
}

/* ------------------------------------------------------------------ */
/* Fluxo mensal (12 meses) e distribuição por tipo                    */
/* ------------------------------------------------------------------ */

async function getMonthlyFlow(year: number): Promise<LubricantMonthlyFlowPoint[]> {
  const { start, end } = yearBounds(year);
  const movements = await prisma.lubricantMovement.findMany({
    where: { movementDate: { gte: start, lte: end } },
    select: { movementDate: true, movementCategory: true, absoluteQuantity: true }
  });

  const points: LubricantMonthlyFlowPoint[] = Array.from({ length: 12 }, (_, monthIndex) => {
    const label = new Date(Date.UTC(year, monthIndex, 1))
      .toLocaleDateString("pt-BR", { month: "short", timeZone: "UTC" })
      .replace(".", "")
      .replace(/^./, (c) => c.toUpperCase());
    return { period: `${year}-${String(monthIndex + 1).padStart(2, "0")}`, label, inputs: 0, outputs: 0 };
  });

  for (const movement of movements) {
    const monthIndex = movement.movementDate.getUTCMonth();
    if (movement.movementCategory === LubricantMovementCategory.SAIDA) {
      points[monthIndex].outputs += movement.absoluteQuantity;
    } else {
      points[monthIndex].inputs += movement.absoluteQuantity;
    }
  }

  return points.map((point) => ({ ...point, inputs: round(point.inputs), outputs: round(point.outputs) }));
}

async function getMovementTypeDistribution(year: number): Promise<LubricantMovementTypeSlice[]> {
  const { start, end } = yearBounds(year);
  const grouped = await prisma.lubricantMovement.groupBy({
    by: ["movementCategory"],
    where: { movementDate: { gte: start, lte: end } },
    _count: { _all: true }
  });

  const counts = new Map<LubricantMovementCategory, number>();
  for (const row of grouped) {
    counts.set(row.movementCategory, row._count._all);
  }

  return CATEGORY_ORDER.map((category) => ({
    category,
    label: LUBRICANT_CATEGORY_LABELS[category],
    value: counts.get(category) ?? 0,
    color: CATEGORY_COLORS[category]
  })).filter((slice) => slice.value > 0);
}

/* ------------------------------------------------------------------ */
/* 7. Indicadores de uso                                              */
/* ------------------------------------------------------------------ */

export async function getLubricantUsageIndicators(params: LubricantQueryParams): Promise<LubricantUsageIndicators> {
  const reference = await resolveLubricantReference(params);
  const { start: yearStart, end: yearEnd } = yearBounds(reference.year);

  const [outputsRaw, inputsRaw, index] = await Promise.all([
    aggregateByMaterial(LubricantMovementCategory.SAIDA, yearStart, yearEnd),
    aggregateByMaterial(LubricantMovementCategory.ENTRADA, yearStart, yearEnd),
    loadLubricantIndex()
  ]);

  const outputs = toAggregates(outputsRaw, index);
  const inputs = toAggregates(inputsRaw, index);
  const outputByCode = new Map(outputs.map((item) => [item.code, item]));

  const totalOutputs = sum(outputs.map((item) => item.quantity));
  const totalInputs = sum(inputs.map((item) => item.quantity));

  const noOutputItems = Array.from(index.values())
    .filter((info) => !outputByCode.has(info.code))
    .map((info) => ({ code: info.code, description: info.name, unit: info.unit }));

  // Consumo médio mensal: total de saídas do ano dividido pelos meses com movimento.
  const monthsWithOutput = new Set(
    (
      await prisma.lubricantMovement.findMany({
        where: { movementCategory: LubricantMovementCategory.SAIDA, movementDate: { gte: yearStart, lte: yearEnd } },
        select: { movementDate: true }
      })
    ).map((movement) => movement.movementDate.getUTCMonth())
  ).size;

  return {
    topConsumedItems: outputs.slice(0, 10),
    lowMovementItems: [...outputs].reverse().slice(0, 5),
    noOutputItems,
    highOutputItems: outputs.slice(0, 5),
    inputVsOutputRatio: totalOutputs > 0 ? round(totalInputs / totalOutputs) : null,
    averageMonthlyConsumption: monthsWithOutput > 0 ? round(totalOutputs / monthsWithOutput) : 0
  };
}

/* ------------------------------------------------------------------ */
/* 1. KPIs                                                            */
/* ------------------------------------------------------------------ */

export async function getLubricantsDashboardKPIs(params: LubricantQueryParams): Promise<LubricantKpis> {
  const reference = await resolveLubricantReference(params);
  const { start: monthStart, end: monthEnd } = monthBounds(reference.year, reference.month);
  const { start: yearStart, end: yearEnd } = yearBounds(reference.year);

  const [
    totalLubricants,
    monthOutputs,
    yearOutputs,
    monthInputs,
    yearInputs,
    totals,
    index,
    movementsCount
  ] = await Promise.all([
    prisma.lubricant.count(),
    sumAbsolute(LubricantMovementCategory.SAIDA, monthStart, monthEnd),
    aggregateByMaterial(LubricantMovementCategory.SAIDA, yearStart, yearEnd),
    sumAbsolute(LubricantMovementCategory.ENTRADA, monthStart, monthEnd),
    sumAbsolute(LubricantMovementCategory.ENTRADA, yearStart, yearEnd),
    loadAllTimeTotalsByCode(),
    loadLubricantIndex(),
    prisma.lubricantMovement.count({ where: { movementDate: { gte: yearStart, lte: yearEnd } } })
  ]);

  const yearOutputsAgg = toAggregates(yearOutputs, index);
  const mostUsed = yearOutputsAgg[0] ?? null;

  let currentBalance = 0;
  let itemsWithoutMachineApplication = 0;
  let itemsWithoutTechnicalSheet = 0;
  let itemsBelowMinimum = 0;
  for (const [code, info] of Array.from(index.entries())) {
    const balance = computeBalance(totals.get(code) ?? emptyTotals());
    currentBalance += balance;
    if (info.machineNames.length === 0) {
      itemsWithoutMachineApplication += 1;
    }
    if (!info.technicalSheetUrl) {
      itemsWithoutTechnicalSheet += 1;
    }
    if (info.minimumStock > 0 && balance < info.minimumStock) {
      itemsBelowMinimum += 1;
    }
  }

  return {
    totalLubricants,
    totalOutputMonth: monthOutputs,
    totalOutputYear: round(sum(yearOutputsAgg.map((item) => item.quantity))),
    totalInputMonth: monthInputs,
    totalInputYear: yearInputs,
    currentBalance: round(currentBalance),
    mostUsedLubricant: mostUsed
      ? { code: mostUsed.code, description: mostUsed.description, quantity: mostUsed.quantity, unit: mostUsed.unit }
      : null,
    movementsCount,
    itemsWithoutMachineApplication,
    itemsWithoutTechnicalSheet,
    itemsBelowMinimum
  };
}

async function sumAbsolute(category: LubricantMovementCategory, start: Date, end: Date): Promise<number> {
  const agg = await prisma.lubricantMovement.aggregate({
    where: { movementCategory: category, movementDate: { gte: start, lte: end } },
    _sum: { absoluteQuantity: true }
  });
  return round(agg._sum.absoluteQuantity ?? 0);
}

/* ------------------------------------------------------------------ */
/* 8. Lista completa de códigos                                       */
/* ------------------------------------------------------------------ */

export async function getAllLubricantCodes(params: LubricantQueryParams): Promise<LubricantCodeRow[]> {
  const reference = await resolveLubricantReference(params);
  const { start: monthStart, end: monthEnd } = monthBounds(reference.year, reference.month);
  const { start: yearStart, end: yearEnd } = yearBounds(reference.year);

  const [index, totals, monthOut, monthIn, yearOut, yearIn] = await Promise.all([
    loadLubricantIndex(),
    loadAllTimeTotalsByCode(),
    aggregateByMaterial(LubricantMovementCategory.SAIDA, monthStart, monthEnd),
    aggregateByMaterial(LubricantMovementCategory.ENTRADA, monthStart, monthEnd),
    aggregateByMaterial(LubricantMovementCategory.SAIDA, yearStart, yearEnd),
    aggregateByMaterial(LubricantMovementCategory.ENTRADA, yearStart, yearEnd)
  ]);

  const monthOutMap = sumMap(monthOut);
  const monthInMap = sumMap(monthIn);
  const yearOutMap = sumMap(yearOut);
  const yearInMap = sumMap(yearIn);

  const rows: LubricantCodeRow[] = [];
  for (const [code, info] of Array.from(index.entries())) {
    const totalsForCode = totals.get(code) ?? emptyTotals();
    const balance = computeBalance(totalsForCode);
    rows.push({
      id: info.id,
      code,
      description: info.name,
      unit: info.unit,
      currentStock: round(info.currentStock),
      minimumStock: round(info.minimumStock),
      totalInputs: totalsForCode.ENTRADA,
      totalOutputs: totalsForCode.SAIDA,
      monthlyInputs: monthInMap.get(code) ?? 0,
      monthlyOutputs: monthOutMap.get(code) ?? 0,
      annualInputs: yearInMap.get(code) ?? 0,
      annualOutputs: yearOutMap.get(code) ?? 0,
      balance,
      belowMinimum: info.minimumStock > 0 && balance < info.minimumStock,
      machinesUsed: info.machineNames,
      technicalSheetUrl: info.technicalSheetUrl,
      hasTechnicalSheet: Boolean(info.technicalSheetUrl),
      hasMachineApplication: info.machineNames.length > 0
    });
  }

  return rows.sort((a, b) => b.annualOutputs - a.annualOutputs || a.code.localeCompare(b.code));
}

function sumMap(grouped: GroupedByCode): Map<string, number> {
  return new Map(grouped.map((group) => [group.materialCode, round(group._sum.absoluteQuantity ?? 0)]));
}

/* ------------------------------------------------------------------ */
/* 9. Histórico de movimentações (paginado)                           */
/* ------------------------------------------------------------------ */

export async function getLubricantMovements(params: LubricantQueryParams): Promise<LubricantMovementsResult> {
  const page = Math.max(1, params.page ?? 1);
  const pageSize = clampPageSize(params.pageSize);

  const where: Prisma.LubricantMovementWhereInput = {};
  if (params.movementCategory) {
    where.movementCategory = params.movementCategory;
  }
  if (params.code) {
    where.materialCode = params.code;
  }
  if (params.unit) {
    where.unit = params.unit;
  }
  if (params.startDate || params.endDate) {
    where.movementDate = {};
    if (params.startDate) {
      where.movementDate.gte = new Date(`${params.startDate}T00:00:00.000Z`);
    }
    if (params.endDate) {
      where.movementDate.lte = new Date(`${params.endDate}T23:59:59.999Z`);
    }
  }
  if (params.search) {
    const term = params.search.trim();
    if (term) {
      where.OR = [
        { materialCode: { contains: term } },
        { materialDescription: { contains: term } },
        { movementTypeText: { contains: term } }
      ];
    }
  }

  const [total, rows] = await Promise.all([
    prisma.lubricantMovement.count({ where }),
    prisma.lubricantMovement.findMany({
      where,
      orderBy: [{ movementDate: "desc" }, { createdAt: "desc" }],
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: movementSelect
    })
  ]);

  return {
    data: rows.map(toMovementRow),
    total,
    page,
    pageSize,
    totalPages: Math.max(1, Math.ceil(total / pageSize))
  };
}

const movementSelect = {
  id: true,
  movementDate: true,
  movementTime: true,
  materialCode: true,
  materialDescription: true,
  movementCategory: true,
  movementTypeCode: true,
  movementTypeText: true,
  quantity: true,
  absoluteQuantity: true,
  unit: true,
  center: true,
  storageLocation: true
} satisfies Prisma.LubricantMovementSelect;

type MovementRecord = Prisma.LubricantMovementGetPayload<{ select: typeof movementSelect }>;

function toMovementRow(movement: MovementRecord): LubricantMovementRow {
  return {
    id: movement.id,
    movementDate: movement.movementDate.toISOString(),
    movementTime: movement.movementTime,
    code: movement.materialCode,
    description: movement.materialDescription,
    movementCategory: movement.movementCategory,
    movementTypeCode: movement.movementTypeCode,
    movementTypeText: movement.movementTypeText,
    quantity: round(movement.quantity),
    absoluteQuantity: round(movement.absoluteQuantity),
    unit: movement.unit,
    center: movement.center,
    storageLocation: movement.storageLocation
  };
}

function clampPageSize(value?: number): number {
  const allowed = [25, 50, 100];
  return value && allowed.includes(value) ? value : DEFAULT_PAGE_SIZE;
}

/* ------------------------------------------------------------------ */
/* 10. Detalhe do lubrificante                                        */
/* ------------------------------------------------------------------ */

export async function getLubricantDetails(code: string): Promise<LubricantDetails | null> {
  const lubricant = await prisma.lubricant.findUnique({
    where: { code },
    select: {
      id: true,
      code: true,
      name: true,
      unit: true,
      category: true,
      currentStock: true,
      minimumStock: true,
      technicalSheetUrl: true,
      machineApplications: {
        select: { id: true, equipmentName: true, equipmentCode: true, applicationPoint: true, recommendation: true },
        orderBy: { equipmentName: "asc" }
      }
    }
  });

  if (!lubricant) {
    return null;
  }

  const [totalsGrouped, recentMovements, monthsWithOutput, lastMovement] = await Promise.all([
    prisma.lubricantMovement.groupBy({
      by: ["movementCategory"],
      where: { materialCode: code },
      _sum: { absoluteQuantity: true }
    }),
    prisma.lubricantMovement.findMany({
      where: { materialCode: code },
      orderBy: [{ movementDate: "desc" }, { createdAt: "desc" }],
      take: 20,
      select: movementSelect
    }),
    prisma.lubricantMovement.findMany({
      where: { materialCode: code, movementCategory: LubricantMovementCategory.SAIDA },
      select: { movementDate: true }
    }),
    prisma.lubricantMovement.aggregate({ where: { materialCode: code }, _max: { movementDate: true } })
  ]);

  const totals = emptyTotals();
  for (const row of totalsGrouped) {
    totals[row.movementCategory] = round(row._sum.absoluteQuantity ?? 0);
  }

  const distinctMonths = new Set(
    monthsWithOutput.map((m) => `${m.movementDate.getUTCFullYear()}-${m.movementDate.getUTCMonth()}`)
  ).size;

  return {
    id: lubricant.id,
    code: lubricant.code,
    description: lubricant.name,
    unit: lubricant.unit,
    category: lubricant.category,
    currentStock: round(lubricant.currentStock),
    minimumStock: round(lubricant.minimumStock),
    totalInputs: totals.ENTRADA,
    totalOutputs: totals.SAIDA,
    initialStock: totals.ESTOQUE_INICIAL,
    balance: computeBalance(totals),
    belowMinimum: lubricant.minimumStock > 0 && computeBalance(totals) < lubricant.minimumStock,
    averageMonthlyConsumption: distinctMonths > 0 ? round(totals.SAIDA / distinctMonths) : 0,
    lastMovementDate: lastMovement._max.movementDate ? lastMovement._max.movementDate.toISOString() : null,
    technicalSheetUrl: lubricant.technicalSheetUrl,
    hasTechnicalSheet: Boolean(lubricant.technicalSheetUrl),
    machineApplications: lubricant.machineApplications,
    recentMovements: recentMovements.map(toMovementRow)
  };
}

/* ------------------------------------------------------------------ */
/* 11. Salvar aplicação em máquina                                    */
/* ------------------------------------------------------------------ */

export type SaveMachineApplicationInput = {
  code: string;
  equipmentName: string;
  equipmentCode?: string | null;
  applicationPoint?: string | null;
  recommendation?: string | null;
};

export async function saveLubricantMachineApplication(input: SaveMachineApplicationInput): Promise<{ id: string }> {
  const lubricant = await prisma.lubricant.findUnique({ where: { code: input.code }, select: { id: true } });
  if (!lubricant) {
    throw new Error(`Lubrificante com código ${input.code} não encontrado.`);
  }

  const equipmentName = (input.equipmentName ?? "").trim();
  if (!equipmentName) {
    throw new Error("O nome do equipamento/máquina é obrigatório.");
  }

  const created = await prisma.lubricantMachineApplication.create({
    data: {
      lubricantId: lubricant.id,
      equipmentName,
      equipmentCode: emptyToNull(input.equipmentCode),
      applicationPoint: emptyToNull(input.applicationPoint),
      recommendation: emptyToNull(input.recommendation)
    },
    select: { id: true }
  });

  return created;
}

export async function deleteLubricantMachineApplication(id: string): Promise<void> {
  await prisma.lubricantMachineApplication.delete({ where: { id } });
}

/* ------------------------------------------------------------------ */
/* 12. Ficha técnica                                                  */
/* ------------------------------------------------------------------ */

export async function updateLubricantTechnicalSheet(code: string, technicalSheetUrl: string | null): Promise<void> {
  const value = (technicalSheetUrl ?? "").trim();
  await prisma.lubricant.update({
    where: { code },
    data: { technicalSheetUrl: value || null }
  });
}

export async function updateLubricantMinimumStock(code: string, minimumStock: number): Promise<void> {
  const value = Number.isFinite(minimumStock) && minimumStock > 0 ? minimumStock : 0;
  await prisma.lubricant.update({ where: { code }, data: { minimumStock: value } });
}

/* ------------------------------------------------------------------ */
/* Reposição / alertas de estoque baixo                               */
/* ------------------------------------------------------------------ */

/** Itens com estoque mínimo definido e saldo estimado abaixo dele. */
export async function getLubricantReplenishmentItems(): Promise<LubricantReplenishmentItem[]> {
  const [totals, index] = await Promise.all([loadAllTimeTotalsByCode(), loadLubricantIndex()]);
  const items: LubricantReplenishmentItem[] = [];

  for (const [code, info] of Array.from(index.entries())) {
    if (info.minimumStock <= 0) {
      continue;
    }
    const balance = computeBalance(totals.get(code) ?? emptyTotals());
    if (balance < info.minimumStock) {
      items.push({
        code,
        description: info.name,
        unit: info.unit,
        balance,
        minimumStock: round(info.minimumStock),
        deficit: round(info.minimumStock - balance)
      });
    }
  }

  return items.sort((a, b) => b.deficit - a.deficit);
}

function lowStockAlertTitle(code: string): string {
  return `Lubrificante abaixo do mínimo: ${code}`;
}

function severityForDeficit(deficit: number, minimumStock: number): Priority {
  const ratio = minimumStock > 0 ? deficit / minimumStock : 0;
  if (ratio >= 1) {
    return Priority.CRITICA;
  }
  if (ratio >= 0.5) {
    return Priority.ALTA;
  }
  return Priority.MEDIA;
}

/**
 * Sincroniza alertas LUBRIFICANTE_BAIXO com a situação atual de estoque:
 * cria/atualiza alertas abertos para itens abaixo do mínimo e resolve os que
 * voltaram ao nível adequado. Fecha o ciclo com o módulo de Alertas.
 */
export async function syncLubricantLowStockAlerts(): Promise<{ created: number; updated: number; resolved: number; below: number }> {
  const items = await getLubricantReplenishmentItems();
  const existing = await prisma.alert.findMany({
    where: { type: AlertType.LUBRIFICANTE_BAIXO },
    select: { id: true, title: true, status: true }
  });
  const existingByTitle = new Map(existing.map((alert) => [alert.title, alert]));
  const belowTitles = new Set(items.map((item) => lowStockAlertTitle(item.code)));

  let created = 0;
  let updated = 0;
  let resolved = 0;

  for (const item of items) {
    const title = lowStockAlertTitle(item.code);
    const description = `${item.description}: saldo estimado ${item.balance} ${item.unit} abaixo do mínimo de ${item.minimumStock} ${item.unit} (faltam ${item.deficit} ${item.unit}).`;
    const severity = severityForDeficit(item.deficit, item.minimumStock);
    const match = existingByTitle.get(title);

    if (match) {
      await prisma.alert.update({
        where: { id: match.id },
        data: { description, severity, status: AlertStatus.ABERTO }
      });
      updated += 1;
    } else {
      await prisma.alert.create({
        data: {
          title,
          description,
          type: AlertType.LUBRIFICANTE_BAIXO,
          severity,
          status: AlertStatus.ABERTO
        }
      });
      created += 1;
    }
  }

  // Resolve alertas de itens que voltaram ao nível adequado.
  for (const alert of existing) {
    const stillOpen = alert.status === AlertStatus.ABERTO || alert.status === AlertStatus.EM_ANALISE;
    if (stillOpen && !belowTitles.has(alert.title)) {
      await prisma.alert.update({ where: { id: alert.id }, data: { status: AlertStatus.RESOLVIDO } });
      resolved += 1;
    }
  }

  return { created, updated, resolved, below: items.length };
}

/* ------------------------------------------------------------------ */
/* Orquestrador da página                                             */
/* ------------------------------------------------------------------ */

export async function getLubricantsPageData(params: LubricantQueryParams = {}): Promise<LubricantsPageData> {
  const reference = await resolveLubricantReference(params);

  const movementsTotal = await prisma.lubricantMovement.count();
  if (movementsTotal === 0) {
    return emptyPageData(reference, params);
  }

  const [
    kpis,
    monthlyOutputs,
    annualOutputs,
    monthlyFlow,
    movementTypeDistribution,
    balanceByCode,
    indicators,
    replenishment,
    codes,
    movements,
    filterOptions
  ] = await Promise.all([
    getLubricantsDashboardKPIs(params),
    getLubricantMonthlyOutputs(params),
    getLubricantAnnualOutputs(params),
    getMonthlyFlow(reference.year),
    getMovementTypeDistribution(reference.year),
    getLubricantBalanceByCode(),
    getLubricantUsageIndicators(params),
    getLubricantReplenishmentItems(),
    getAllLubricantCodes(params),
    getLubricantMovements(params),
    getLubricantFilterOptions()
  ]);

  return {
    reference,
    period: resolvePeriodWindow(params, reference),
    kpis,
    monthlyOutputs,
    annualOutputs,
    monthlyFlow,
    movementTypeDistribution,
    balanceByCode,
    indicators,
    replenishment,
    codes,
    movements,
    filterOptions,
    source: "database"
  };
}

function resolvePeriodWindow(
  params: LubricantQueryParams,
  reference: LubricantReferencePeriod
): { startDate: string; endDate: string } {
  if (params.startDate && params.endDate) {
    return { startDate: params.startDate, endDate: params.endDate };
  }
  const { start, end } = yearBounds(reference.year);
  return { startDate: toInputDate(start), endDate: toInputDate(end) };
}

export async function getLubricantFilterOptions(): Promise<LubricantFilterOptions> {
  const [lubricants, units, range] = await Promise.all([
    prisma.lubricant.findMany({ select: { code: true, name: true }, orderBy: { code: "asc" } }),
    prisma.lubricantMovement.findMany({ select: { unit: true }, distinct: ["unit"] }),
    prisma.lubricantMovement.aggregate({ _min: { movementDate: true }, _max: { movementDate: true } })
  ]);

  const minYear = range._min.movementDate?.getUTCFullYear();
  const maxYear = range._max.movementDate?.getUTCFullYear();
  const years: number[] = [];
  if (minYear && maxYear) {
    for (let year = maxYear; year >= minYear; year -= 1) {
      years.push(year);
    }
  }

  return {
    codes: lubricants.map((item) => ({ value: item.code, label: `${item.code} — ${item.name}` })),
    units: units.map((item) => item.unit).filter(Boolean).sort(),
    years,
    movementCategories: [...CATEGORY_ORDER]
  };
}

function emptyPageData(reference: LubricantReferencePeriod, params: LubricantQueryParams): LubricantsPageData {
  return {
    reference,
    period: resolvePeriodWindow(params, reference),
    kpis: {
      totalLubricants: 0,
      totalOutputMonth: 0,
      totalOutputYear: 0,
      totalInputMonth: 0,
      totalInputYear: 0,
      currentBalance: 0,
      mostUsedLubricant: null,
      movementsCount: 0,
      itemsWithoutMachineApplication: 0,
      itemsWithoutTechnicalSheet: 0,
      itemsBelowMinimum: 0
    },
    monthlyOutputs: [],
    annualOutputs: [],
    monthlyFlow: [],
    movementTypeDistribution: [],
    balanceByCode: [],
    indicators: {
      topConsumedItems: [],
      lowMovementItems: [],
      noOutputItems: [],
      highOutputItems: [],
      inputVsOutputRatio: null,
      averageMonthlyConsumption: 0
    },
    replenishment: [],
    codes: [],
    movements: { data: [], total: 0, page: 1, pageSize: DEFAULT_PAGE_SIZE, totalPages: 1 },
    filterOptions: { codes: [], units: [], years: [reference.year], movementCategories: [...CATEGORY_ORDER] },
    source: "empty"
  };
}

/* ------------------------------------------------------------------ */
/* Helpers                                                            */
/* ------------------------------------------------------------------ */

function round(value: number): number {
  return Math.round(value * 100) / 100;
}

function sum(values: number[]): number {
  return values.reduce((acc, value) => acc + value, 0);
}

function emptyToNull(value: string | null | undefined): string | null {
  const text = (value ?? "").trim();
  return text || null;
}
