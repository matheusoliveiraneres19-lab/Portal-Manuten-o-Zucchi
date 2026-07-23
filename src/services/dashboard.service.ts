import {
  AlertStatus,
  Criticality,
  LubricantMovementCategory,
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
import { prisma } from "@/lib/prisma";
import { getCriticalAlertsCount } from "@/services/alerts.service";
import {
  getCriticalEquipmentsByOrders,
  getCriticalEquipmentsSummary,
  getTopEquipmentsByCorrectiveVolume
} from "@/services/critical-equipments.service";
import { getDerivedAlerts } from "@/services/derived-alerts.service";
import { getLubricantConsumption } from "@/services/lubricants.service";
import { getMostUsedMaterialsCount } from "@/services/materials.service";
import { countPublishedProcedures } from "@/services/procedures.service";
import {
  getPendingPurchases,
  getPendingPurchasesCount,
  getPurchasesByMonth
} from "@/services/purchases.service";
import { OPEN_SERVICE_ORDER_STATUSES } from "@/services/shared/portal-rules";
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
import { formatCurrency, formatDate, formatMonthName, formatPercent, formatVolume } from "@/utils/formatters";
import { isWithinPeriod, toEndOfDay, toStartOfDay, withinPeriod } from "@/utils/date-range";
import { getDefaultPortalPeriod, getTodayDate } from "@/utils/date";
import {
  excludeInvalidTestEquipmentWhere,
  isClosedServiceOrder,
  isProgrammedPreventiveOrder
} from "@/utils/service-order-classification";
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
    // OS "em aberto" = conjunto único de status do portal (aberta/liberada/em
    // andamento/aguardando material), excluindo registros sem equipamento.
    prisma.serviceOrder.count({
      where: { status: { in: OPEN_SERVICE_ORDER_STATUSES }, ...excludeInvalidTestEquipmentWhere() }
    }),
    getPendingPurchasesCount(),
    // Máquinas críticas = MESMA regra da aba Equipamentos Críticos (score ≥ 80,
    // por equipamento raiz, exclui PL/PV e sem equipamento) — não a criticidade
    // de cadastro. Garante que o card bata com /dashboard/equipamentos-criticos.
    getCriticalEquipmentsSummary({
      startDate: toInputDate(period.startDate),
      endDate: toInputDate(period.endDate)
    }).then((summary) => summary.totalCriticalEquipments),
    // Consumo (SAÍDA) de lubrificantes via service oficial (fonte única).
    getLubricantConsumption(period),
    getMostUsedMaterialsCount(period),
    // Procedimentos "ativos" = PUBLICADOS na Central (status "Publicado" + categoria),
    // não o campo legado `active`. Bate com /dashboard/procedimentos.
    countPublishedProcedures(),
    getCriticalAlertsCount()
  ]);

  return {
    openServiceOrders,
    pendingPurchases,
    criticalMachines,
    lubricantConsumption,
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
  // Só os KPIs realmente temporais têm comparativo. Buscamos APENAS eles no período
  // anterior (lubrificantes + materiais) em vez de recalcular todos os 7 KPIs —
  // evita repetir a análise pesada de equipamentos críticos para o período anterior.
  const [current, previousLubricant, previousMaterials] = await Promise.all([
    currentKpis ?? getDashboardKPIs(period),
    getLubricantConsumption(previousPeriod),
    getMostUsedMaterialsCount(previousPeriod)
  ]);

  return {
    lubricantConsumption: calculatePeriodVariation(current.lubricantConsumption, previousLubricant),
    mostUsedMaterials: calculatePeriodVariation(current.mostUsedMaterials, previousMaterials)
  };
}

export type MonthlyOpenClosedResult = {
  points: OpenClosedServiceOrdersPoint[];
  /** Aviso técnico quando há OS fechadas sem data de fechamento importada. */
  note: string | null;
};

/**
 * "OS Abertas x Fechadas (por mês)" — fonte oficial ServiceOrder, alinhado à aba
 * /dashboard/ordens-servico (mesmas exclusões e reconhecimento de status).
 *
 *  - ABERTAS: agrupadas pelo mês de ABERTURA (openedAt; fallback createdAt). Nunca
 *    usam closedAt.
 *  - FECHADAS: OS reconhecidas como fechadas (isClosedServiceOrder = enum FECHADA
 *    ou statusSapRaw), agrupadas pelo mês de closedAt. Uma OS aberta em fev e
 *    fechada em mar conta Abertas+1 em fev e Fechadas+1 em mar (séries independentes).
 *  - Exclui registros de teste ("Equipamento não informado"); mantém PL/PV (OS gerais).
 *  - Meses do período são pré-criados (zero-fill). Sem NENHUMA OS, devolve vazio
 *    para o gráfico exibir o empty state.
 */
export async function getMonthlyOpenClosedServiceOrders(
  periodInput: DashboardPeriodInput
): Promise<MonthlyOpenClosedResult> {
  const period = parsePeriod(periodInput);
  const orders = await prisma.serviceOrder.findMany({
    where: {
      OR: [{ openedAt: withinPeriod(period) }, { closedAt: withinPeriod(period) }],
      ...excludeInvalidTestEquipmentWhere()
    },
    select: { openedAt: true, closedAt: true, createdAt: true, status: true, statusSapRaw: true }
  });

  const periodLabel = `${toInputDate(period.startDate)}→${toInputDate(period.endDate)}`;

  if (orders.length === 0) {
    console.info(`[dashboard os-abertas-x-fechadas] período ${periodLabel} | 0 OS consideradas no período`);
    return { points: [], note: null };
  }

  const buckets = createMonthlyBuckets(period);
  let openedGrouped = 0;
  let closedGrouped = 0;
  let closedWithoutDate = 0;
  let closedByRawOnly = 0;

  for (const order of orders) {
    // ABERTAS: mês de abertura (openedAt; fallback createdAt) — nunca closedAt.
    const openedDate = order.openedAt ?? order.createdAt;
    if (openedDate && isWithinPeriod(openedDate, period)) {
      const bucket = buckets.get(monthKey(openedDate));
      if (bucket) {
        bucket.abertas += 1;
        openedGrouped += 1;
      }
    }

    // FECHADAS: só OS reconhecidas como fechadas, agrupadas pelo mês de closedAt.
    if (isClosedServiceOrder(order)) {
      if (order.status !== ServiceOrderStatus.FECHADA) {
        closedByRawOnly += 1;
      }
      if (order.closedAt && isWithinPeriod(order.closedAt, period)) {
        const bucket = buckets.get(monthKey(order.closedAt));
        if (bucket) {
          bucket.fechadas += 1;
          closedGrouped += 1;
        }
      } else if (!order.closedAt) {
        closedWithoutDate += 1;
      }
    }
  }

  // TAREFA 11 — auditoria de consistência (logs do servidor).
  console.info(
    `[dashboard os-abertas-x-fechadas] período ${periodLabel} | OS consideradas: ${orders.length} | ` +
      `abertas agrupadas: ${openedGrouped} | fechadas agrupadas: ${closedGrouped} | ` +
      `fechadas sem closedAt: ${closedWithoutDate} | fechadas reconhecidas só por statusSapRaw: ${closedByRawOnly}`
  );

  // TAREFA 12 — há OS fechadas, mas nenhuma tem data de fechamento importada.
  const note =
    closedGrouped === 0 && closedWithoutDate > 0
      ? "Existem ordens com status fechado, mas sem data de fechamento importada. Reimporte as Ordens incluindo a coluna de conclusão/encerramento para o gráfico agrupar as fechadas por mês."
      : null;

  return { points: Array.from(buckets.values()), note };
}

export async function getCorrectivePreventiveChart(
  periodInput: DashboardPeriodInput
): Promise<CorrectivePreventiveChartData> {
  const period = parsePeriod(periodInput);
  // Regra oficial do portal: PREVENTIVA = plano programado (título "PL -"/"PV -"),
  // via isProgrammedPreventiveOrder — a MESMA usada nas abas Preventivas e
  // Equipamentos Críticos. CORRETIVA = demais OS válidas do período. Não classifica
  // pelo enum `type` (regra solta) nem duplica lógica no componente.
  const orders = await prisma.serviceOrder.findMany({
    where: {
      openedAt: withinPeriod(period),
      ...excludeInvalidTestEquipmentWhere()
    },
    select: { title: true }
  });

  let preventive = 0;
  let corrective = 0;
  for (const order of orders) {
    if (isProgrammedPreventiveOrder(order)) {
      preventive += 1;
    } else {
      corrective += 1;
    }
  }
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
 * Alertas críticos consolidados da aba Início (TAREFA 10). Reutiliza o service
 * OFICIAL de alertas derivados (getDerivedAlerts), que cruza as MESMAS fontes do
 * portal: OS corretiva recorrente, OS aberta há muitos dias, compra atrasada,
 * regularização Y04 de valor alto e lubrificante abaixo do mínimo. Sem dados de
 * teste. Ordena por severidade (crítico → alto → médio) e devolve os mais graves.
 */
export async function getDashboardCriticalAlerts(period: DashboardPeriod, limit = 6): Promise<CriticalAlertData[]> {
  const alerts = await getDerivedAlerts(period);

  return alerts
    .slice()
    .sort((a, b) => severityRank(b.severity) - severityRank(a.severity))
    .slice(0, limit)
    .map((alert) => ({
      title: alert.title,
      description: alert.description,
      equipmentName: null,
      severity: alert.severity,
      status: AlertStatus.ABERTO,
      type: alert.type,
      createdAt: period.endDate
    }));
}

/** Ordena severidades: crítica > alta > média > demais. */
function severityRank(severity: Priority): number {
  switch (severity) {
    case Priority.CRITICA:
      return 3;
    case Priority.ALTA:
      return 2;
    case Priority.MEDIA:
      return 1;
    default:
      return 0;
  }
}

export async function getTopMachinesBreakIndex(
  periodInput: DashboardPeriodInput,
  limit = 5
): Promise<TopMachineBreakIndexData[]> {
  const period = parsePeriod(periodInput);
  // Top máquinas por VOLUME de OS corretiva, via service OFICIAL de Equipamentos
  // Críticos (exclui lubrificação/PL e ordens sem equipamento). Substitui o antigo
  // "índice de quebra" em % por uma contagem clara de OS corretivas por equipamento.
  const top = await getTopEquipmentsByCorrectiveVolume(
    { startDate: toInputDate(period.startDate), endDate: toInputDate(period.endDate) },
    limit
  );

  return top.map((equipment) => ({
    equipmentName: equipment.equipmentName,
    correctiveOrders: equipment.correctiveOrders
  }));
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
  // Agrupado por MÊS (igual ao módulo de Lubrificantes), evitando uma curva diária
  // ruidosa que não bate com a aba. Meses sem saída ficam zerados e o gráfico
  // mostra empty state quando não há consumo real no período.
  const buckets = createConsumptionMonthlyBuckets(period);

  for (const movement of movements) {
    const bucket = buckets.get(monthKey(movement.movementDate));
    if (bucket) {
      bucket.consumption += Number(movement.absoluteQuantity);
    }
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
    openClosed,
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
    getMonthlyOpenClosedServiceOrders(period),
    getCorrectivePreventiveChart(period),
    getTopCriticalEquipments(period),
    getPendingPurchases(),
    getDashboardCriticalAlerts(period),
    getTopMachinesBreakIndex(period),
    getHoursByCollaborator(period),
    // "Compras por mês" usa o ANO do fim do período (mais recente/relevante).
    getPurchasesByMonth(period.endDate.getUTCFullYear()),
    getLubricantConsumptionByPeriod(period)
  ]);

  // TAREFA 14 — Auditoria de consistência (dev): estes números devem bater com as
  // abas oficiais. OS abertas = Ordens (soma dos status em aberto); compras
  // pendentes = Compras Pendentes; máquinas críticas = Equipamentos Críticos;
  // procedimentos = Publicados da Central.
  console.info(
    `[dashboard-inicio] período ${toInputDate(period.startDate)}→${toInputDate(period.endDate)} | ` +
      `OS abertas: ${kpis.openServiceOrders} | compras pendentes: ${kpis.pendingPurchases} | ` +
      `máquinas críticas: ${kpis.criticalMachines} | procedimentos publicados: ${kpis.activeProcedures} | ` +
      `corretiva/preventiva: ${correctivePreventiveChart.corrective}/${correctivePreventiveChart.preventive}`
  );

  return {
    period,
    kpis,
    kpiComparisons,
    openClosedServiceOrders: openClosed.points,
    openClosedNote: openClosed.note,
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
    // NUNCA cair em dados mockados: em falha, devolve estado vazio (empty states)
    // para não exibir números falsos na tela principal.
    console.error("Falha ao carregar dashboard pelo banco. Exibindo estado vazio.", error);
    return getEmptyDashboardData();
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
      where: excludeInvalidTestEquipmentWhere(),
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

/**
 * Estado VAZIO do dashboard (sem dados mockados) — usado apenas quando o banco
 * falha. Mostra os 6 KPIs zerados/empty e listas/gráficos vazios, para os
 * componentes renderizarem os empty states oficiais em vez de números falsos.
 */
export function getEmptyDashboardData(): DashboardData {
  const emptyKpi = (title: string, tone: KPITone, icon: LucideIcon, emptyHint: string): DashboardKPI => ({
    title,
    value: "0",
    tone,
    icon,
    comparison: { status: "unavailable", label: emptyHint },
    isEmpty: true,
    emptyHint
  });

  return {
    kpis: [
      emptyKpi("OS Abertas", "blue", ClipboardList, "Sem registros"),
      emptyKpi("Compras Pendentes", "gold", ShoppingCart, "Aguardando importação"),
      emptyKpi("Máquinas Críticas", "red", AlertTriangle, "Aguardando importação"),
      emptyKpi("Consumo Lubrificantes", "blue", Droplet, "Aguardando importação"),
      emptyKpi("Materiais Mais Utilizados", "gold", Package, "Aguardando integração com materiais"),
      emptyKpi("Procedimentos Ativos", "blue", FileText, "Aguardando importação")
    ],
    openClosedOrders: [],
    correctivePreventive: [],
    criticalEquipment: [],
    pendingPurchases: [],
    alerts: [],
    collaboratorHours: [],
    monthlyPurchases: [],
    lubricantConsumption: [],
    topBreakdownMachines: [],
    openClosedNote: null,
    source: "empty",
    period: null
  };
}

function monthPeriod(year: number, month: number): DashboardPeriod {
  return {
    startDate: new Date(Date.UTC(year, month - 1, 1, 0, 0, 0, 0)),
    endDate: new Date(Date.UTC(year, month, 0, 23, 59, 59, 999))
  };
}

/** Chave de mês (YYYY-MM) em UTC para agrupamento mensal dos gráficos. */
function monthKey(date: Date): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

/** Um bucket por MÊS do período (primeiro dia do mês como referência). */
function createMonthlyBuckets(period: DashboardPeriod) {
  const buckets = new Map<string, OpenClosedServiceOrdersPoint>();

  const cursor = new Date(Date.UTC(period.startDate.getUTCFullYear(), period.startDate.getUTCMonth(), 1));
  while (cursor <= period.endDate) {
    const month = new Date(cursor);
    buckets.set(monthKey(month), { date: month, abertas: 0, fechadas: 0 });
    cursor.setUTCMonth(cursor.getUTCMonth() + 1);
  }

  return buckets;
}

/** Um bucket de consumo por MÊS do período (igual ao módulo de Lubrificantes). */
function createConsumptionMonthlyBuckets(period: DashboardPeriod) {
  const buckets = new Map<string, LubricantConsumptionPoint>();

  const cursor = new Date(Date.UTC(period.startDate.getUTCFullYear(), period.startDate.getUTCMonth(), 1));
  while (cursor <= period.endDate) {
    const month = new Date(cursor);
    buckets.set(monthKey(month), { date: month, consumption: 0 });
    cursor.setUTCMonth(cursor.getUTCMonth() + 1);
  }

  return buckets;
}

function roundPercent(value: number) {
  return Number(value.toFixed(1));
}

/**
 * Subtítulo descritivo para KPIs "snapshot" (sem comparativo temporal). Substitui
 * o antigo "Comparativo indisponível" (TAREFA 16) por um texto que explica o que
 * o número representa — mais informativo e menos poluído.
 */
function snapshotSubtitle(label: string): KPIComparison {
  return { status: "unavailable", label };
}

/** Rótulo de mês (ex.: "Jan/24") — inclui o ano para não confundir meses de anos distintos. */
function monthLabel(date: Date): string {
  return `${formatMonthName(date)}/${String(date.getUTCFullYear()).slice(2)}`;
}

/** Converte a variação calculada em um comparativo pronto para exibição (com rótulo). */
function toComparison(variation: PeriodVariation | undefined): KPIComparison {
  if (!variation || variation.status === "unavailable") {
    return { status: "unavailable", label: "Sem período anterior para comparar" };
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
        comparison: snapshotSubtitle("Total em aberto (abertas + em andamento)"),
        emptyHint: "Sem OS em aberto"
      }),
      buildKpi({
        title: "Compras Pendentes",
        rawValue: data.kpis.pendingPurchases,
        value: String(data.kpis.pendingPurchases),
        tone: "gold",
        icon: ShoppingCart,
        comparison: snapshotSubtitle("Compras Y01 aguardando ação"),
        emptyHint: "Nenhuma compra pendente"
      }),
      buildKpi({
        title: "Máquinas Críticas",
        rawValue: data.kpis.criticalMachines,
        value: String(data.kpis.criticalMachines),
        tone: "red",
        icon: AlertTriangle,
        comparison: snapshotSubtitle("Score crítico ≥ 80 no período"),
        emptyHint: "Nenhum equipamento crítico"
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
        emptyHint: "Aguardando integração com materiais"
      }),
      buildKpi({
        title: "Procedimentos Ativos",
        rawValue: data.kpis.activeProcedures,
        value: String(data.kpis.activeProcedures),
        tone: "blue",
        icon: FileText,
        comparison: snapshotSubtitle("Publicados na Central"),
        emptyHint: "Nenhum procedimento publicado"
      })
    ],
    openClosedOrders: data.openClosedServiceOrders.map((item) => ({
      name: monthLabel(item.date),
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
        name: formatMonthName(new Date(Date.UTC(data.period.endDate.getUTCFullYear(), item.month - 1, 1))),
        value: Number((item.value / 1000).toFixed(1))
      })),
    lubricantConsumption: data.lubricantConsumptionByPeriod
      .filter((item) => item.consumption > 0)
      .map((item) => ({
        name: monthLabel(item.date),
        value: item.consumption
      })),
    topBreakdownMachines: data.topMachinesBreakIndex.map((item) => ({
      name: item.equipmentName,
      value: item.correctiveOrders
    })),
    openClosedNote: data.openClosedNote,
    source: "database",
    period: {
      startDate: data.period.startDate.toISOString(),
      endDate: data.period.endDate.toISOString()
    }
  };
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
