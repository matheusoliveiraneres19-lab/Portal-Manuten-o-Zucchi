import { AlertStatus, AlertType, Criticality, ImportType, Priority, ServiceOrderStatus } from "@prisma/client";
import {
  Activity,
  AlertTriangle,
  Bell,
  ClipboardList,
  FileText,
  FileWarning,
  Gauge,
  ShoppingCart
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { buildDataQualitySummary } from "@/services/shared/data-quality";
import { getPreventiveOrdersPageData } from "@/services/preventive-orders.service";
import { emptyDataQualitySummary, type DataQualityNotice, type DataQualitySummary } from "@/types/data-quality";
import { getCriticalEquipmentsByOrders } from "@/services/critical-equipments.service";
import { getDerivedAlerts } from "@/services/derived-alerts.service";
import {
  getPcFactoryMachinesBelowAverage,
  type PcFactoryMachinesBelowAverageResult
} from "@/services/pc-factory.service";
import { countPublishedProcedures } from "@/services/procedures.service";
import { getPendingPurchases, getPendingPurchasesCount } from "@/services/purchases.service";
import { OPEN_SERVICE_ORDER_STATUSES } from "@/services/shared/portal-rules";
import type {
  CorrectivePreventiveChartData,
  CriticalAlertData,
  DashboardData,
  DatabaseDashboardData,
  DashboardKPI,
  AlertItem,
  DashboardPeriod,
  PreventiveAdherenceHighlight,
  DashboardPeriodInput,
  HomeKpisData,
  KPIComparison,
  KPITone,
  OpenClosedServiceOrdersPoint,
  TopCriticalEquipmentData
} from "@/types/dashboard";
import { formatCurrency, formatDate, formatMonthName } from "@/utils/formatters";
import { isWithinPeriod, toEndOfDay, toStartOfDay, withinPeriod } from "@/utils/date-range";
import { getDefaultPortalPeriod, getTodayDate } from "@/utils/date";
import {
  excludeInvalidTestEquipmentWhere,
  isClosedServiceOrder,
  isProgrammedPreventiveOrder
} from "@/utils/service-order-classification";
import { toInputDate } from "@/utils/period";
import { CHART_SERIES } from "@/constants/theme";

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

/**
 * Log de auditoria de consistência. Os números do portal são conferidos contra as
 * abas oficiais durante o desenvolvimento; em produção o log é silenciado para não
 * gerar uma linha por request na Vercel (custo e ruído, sem leitor).
 */
const AUDIT_LOGS_ENABLED = process.env.NODE_ENV !== "production";

function auditLog(message: string): void {
  if (AUDIT_LOGS_ENABLED) {
    console.info(message);
  }
}

/**
 * KPIs da aba Início — SOMENTE os três indicadores realmente renderizados que vêm
 * do banco. "Máquinas Críticas" não entra aqui: vem de
 * getPcFactoryMachinesBelowAverage, chamado UMA única vez em
 * getDatabaseDashboardData (a query do PC-Factory é a mais pesada do portal).
 *
 * Nenhum dos três depende do período: são snapshots do estado atual (OS em aberto,
 * compras aguardando ação, procedimentos publicados) — igual ao que os cards já
 * comunicam nos subtítulos.
 */
async function getHomeKpis(): Promise<HomeKpisData> {
  const [openServiceOrders, pendingPurchases, activeProcedures] = await Promise.all([
    // OS "em aberto" = conjunto único de status do portal (aberta/liberada/em
    // andamento/aguardando material), excluindo registros sem equipamento.
    prisma.serviceOrder.count({
      where: { status: { in: OPEN_SERVICE_ORDER_STATUSES }, ...excludeInvalidTestEquipmentWhere() }
    }),
    getPendingPurchasesCount(),
    // Procedimentos "ativos" = PUBLICADOS na Central (status "Publicado" + categoria),
    // não o campo legado `active`. Bate com /dashboard/procedimentos.
    countPublishedProcedures()
  ]);

  return { openServiceOrders, pendingPurchases, activeProcedures };
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
    auditLog(`[dashboard os-abertas-x-fechadas] período ${periodLabel} | 0 OS consideradas no período`);
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
  auditLog(
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

export async function getDatabaseDashboardData(periodInput?: DashboardPeriodInput): Promise<DatabaseDashboardData> {
  const period = parsePeriod(periodInput);

  // UM único objeto de params do PC-Factory para TODO o render da home.
  // `loadRecords` (pc-factory.service) é memoizado com React.cache, cuja chave é a
  // IDENTIDADE do argumento — dois objetos literais equivalentes viram duas chaves
  // distintas e fazem a query mais pesada do portal rodar duas vezes. Por isso o
  // objeto é criado aqui e reaproveitado, conforme o contrato documentado lá.
  const pcFactoryParams = {
    startDate: toInputDate(period.startDate),
    endDate: toInputDate(period.endDate)
  };

  const [
    kpis,
    openClosed,
    correctivePreventiveChart,
    topCriticalEquipments,
    pendingPurchases,
    criticalAlerts,
    preventiveAdherence,
    pcFactoryCritical
  ] = await Promise.all([
    getHomeKpis(),
    getMonthlyOpenClosedServiceOrders(period),
    getCorrectivePreventiveChart(period),
    getTopCriticalEquipments(period),
    getPendingPurchases(),
    getDashboardCriticalAlerts(period),
    // MESMO service da aba Preventivas Programadas — a home não recalcula aderência.
    getPreventiveAdherenceHighlight(pcFactoryParams),
    // Máquinas abaixo da média de disponibilidade do PC-Factory (card Máquinas
    // Críticas). Fonte ÚNICA do card: média, contagem e ranking saem daqui.
    getPcFactoryMachinesBelowAverage(pcFactoryParams)
  ]);

  // TAREFA 14 — Auditoria de consistência (dev): estes números devem bater com as
  // abas oficiais. OS abertas = Ordens; compras pendentes = Compras Pendentes;
  // máquinas críticas = abaixo da média de disponibilidade do PC-Factory;
  // procedimentos = Publicados da Central.
  auditLog(
    `[dashboard-inicio] período ${pcFactoryParams.startDate}→${pcFactoryParams.endDate} | ` +
      `OS abertas: ${kpis.openServiceOrders} | compras pendentes: ${kpis.pendingPurchases} | ` +
      `máquinas críticas (PC-Factory < média ${pcFactoryCritical.averageAvailability ?? "—"}%): ${pcFactoryCritical.count}` +
      ` de ${pcFactoryCritical.totalMachines} | procedimentos publicados: ${kpis.activeProcedures} | ` +
      `corretiva/preventiva: ${correctivePreventiveChart.corrective}/${correctivePreventiveChart.preventive}`
  );

  return {
    period,
    kpis,
    openClosedServiceOrders: openClosed.points,
    openClosedNote: openClosed.note,
    correctivePreventiveChart,
    topCriticalEquipments,
    pendingPurchases,
    criticalAlerts,
    preventiveAdherence,
    pcFactoryCritical,
    dataQuality: await buildHomeDataQuality(period, openClosed.note)
  };
}

/**
 * Aderência Preventiva para o destaque da home (FASE 9).
 *
 * Delega inteiramente para `getPreventiveOrdersPageData`, o service da aba — inclusive
 * a meta, que vem das configurações do portal. Aqui só se escolhe a FAIXA (ok/warn/crit)
 * a partir da meta, que é decisão de apresentação, não de cálculo.
 *
 * Falha de banco devolve null e o destaque simplesmente não aparece: a home nunca
 * mostra aderência inventada.
 */
async function getPreventiveAdherenceHighlight(
  period: { startDate: string; endDate: string }
): Promise<PreventiveAdherenceHighlight | null> {
  try {
    const data = await getPreventiveOrdersPageData({ startDate: period.startDate, endDate: period.endDate });
    if (data.source !== "database" || data.summary.total === 0) return null;

    const adherence = data.summary.aderencia;
    const target = data.adherenceTarget;
    const level: PreventiveAdherenceHighlight["level"] =
      adherence === null ? "unknown" : adherence >= target ? "ok" : adherence >= target * 0.8 ? "warn" : "crit";

    return {
      adherence,
      target,
      level,
      closedWithoutExecution: data.summary.fechadasSemExecucao,
      total: data.summary.total,
      realizadas: data.summary.realizadas
    };
  } catch (error) {
    console.error("Falha ao carregar aderência preventiva para a home.", error);
    return null;
  }
}

/**
 * QUALIDADE DOS DADOS da tela inicial.
 *
 * A home mistura quatro bases (ordens, compras, PC-Factory e procedimentos), então o
 * painel aqui responde pela mais usada — as ordens de manutenção, que alimentam três
 * dos quatro gráficos — e registra os avisos que valem para a tela como um todo. O
 * detalhe por módulo fica no painel de cada aba, que mede o próprio recorte.
 */
async function buildHomeDataQuality(period: DashboardPeriod, openClosedNote: string | null): Promise<DataQualitySummary> {
  const [ordensNoPeriodo, ordensSemFechamento] = await Promise.all([
    prisma.serviceOrder.count({
      where: { ...excludeInvalidTestEquipmentWhere(), openedAt: { gte: period.startDate, lte: period.endDate } }
    }),
    prisma.serviceOrder.count({
      where: {
        ...excludeInvalidTestEquipmentWhere(),
        openedAt: { gte: period.startDate, lte: period.endDate },
        status: ServiceOrderStatus.FECHADA,
        closedAt: null
      }
    })
  ]);

  const notices: DataQualityNotice[] = [
    {
      id: "compras-pendentes-colunas",
      message: "Compras pendentes não exibem fornecedor, previsão nem valor.",
      detail:
        "Uma requisição só ganha esses três campos quando vira pedido de compra, então eles são vazios em 100% das pendências. A tabela mostra prioridade, material, requisitante e dias em aberto, que existem desde a abertura.",
      tone: "info"
    }
  ];

  if (openClosedNote) {
    notices.push({
      id: "os-sem-fechamento",
      message: openClosedNote,
      detail: "Afeta apenas a série de fechadas do gráfico OS abertas x fechadas.",
      tone: "warning"
    });
  }

  return buildDataQualitySummary({
    importType: ImportType.ORDENS_SERVICO,
    analyzedRecords: ordensNoPeriodo,
    validRecords: ordensNoPeriodo - ordensSemFechamento,
    ignoredRecords: ordensSemFechamento,
    missingFields: [],
    hiddenFilters: [],
    removedFilterOptions: 0,
    sourceLabel:
      "Banco de dados — importações de Ordens de Manutenção, Compras, PC-Factory e Procedimentos. Cada aba tem o painel do próprio recorte.",
    metrics: [
      {
        label: "OS fechadas sem data",
        value: ordensSemFechamento.toLocaleString("pt-BR"),
        hint: "fora da série de fechadas"
      }
    ],
    notices
  });
}

/**
 * ALERTAS DA HOME — gravidade, texto e destino.
 *
 * Duas fontes, ambas de indicadores que já existem; nenhum alerta é inventado:
 *
 *  1. `getDerivedAlerts` — quebra recorrente, OS atrasada, compra e lubrificante
 *     abaixo do mínimo. Já existiam, mas chegavam à tela sem gravidade e sem link.
 *  2. Indicadores desta mesma carga — aderência preventiva abaixo da meta, OS
 *     fechadas sem execução e máquinas do PC-Factory abaixo da média. Não custam
 *     consulta nenhuma: os números já estão em `data`.
 *
 * Cada alerta leva a rota da aba que o originou, com o período preservado — é o que
 * transforma "existe um problema" em "veja o problema".
 */
function buildHomeAlerts(data: DatabaseDashboardData): AlertItem[] {
  const periodQuery = `?startDate=${toInputDate(data.period.startDate)}&endDate=${toInputDate(data.period.endDate)}`;
  const int = (value: number) => value.toLocaleString("pt-BR");
  const alerts: AlertItem[] = [];

  // Aderência preventiva abaixo da meta — o indicador que a gestão cobra.
  const adherence = data.preventiveAdherence;
  if (adherence && adherence.adherence !== null && adherence.adherence < adherence.target) {
    alerts.push({
      text: `Aderência preventiva em ${adherence.adherence.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%, abaixo da meta de ${adherence.target}%.`,
      time: "Aderência preventiva",
      icon: Gauge,
      severity: adherence.level === "crit" ? "CRITICO" : "ATENCAO",
      href: `/dashboard/preventivas-programadas${periodQuery}`
    });
  }

  // OS fechadas sem execução real — causa direta da aderência baixa.
  if (adherence && adherence.closedWithoutExecution > 0) {
    alerts.push({
      text: `${int(adherence.closedWithoutExecution)} OS preventivas fechadas sem execução real (trabalho apontado ≤ 0,1 h).`,
      time: "OS sem execução",
      icon: FileWarning,
      severity: "CRITICO",
      href: `/dashboard/preventivas-programadas${periodQuery}`
    });
  }

  // Máquinas abaixo da média de disponibilidade do PC-Factory.
  const pcf = data.pcFactoryCritical;
  if (pcf.count > 0 && pcf.averageAvailability !== null) {
    const pior = pcf.machinesBelowAverage[0];
    alerts.push({
      text: `${int(pcf.count)} de ${int(pcf.totalMachines)} máquinas abaixo da média de disponibilidade (${pcf.averageAvailability.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%)${pior ? `; pior: ${pior.machineName} com ${pior.availability.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%` : ""}.`,
      time: "Disponibilidade",
      icon: Activity,
      severity: pior && pior.availability < 50 ? "CRITICO" : "ATENCAO",
      href: `/dashboard/pc-factory${periodQuery}`
    });
  }

  // Alertas derivados que já existiam.
  for (const alert of data.criticalAlerts) {
    alerts.push({
      text: `${alert.equipmentName ?? "Equipamento"} — ${alert.description}`,
      time: alert.title,
      icon: alert.severity === Priority.CRITICA ? Bell : AlertTriangle,
      severity:
        alert.severity === Priority.CRITICA ? "CRITICO" : alert.severity === Priority.ALTA ? "ATENCAO" : "INFORMATIVO",
      href: `${routeForAlertType(alert.type)}${periodQuery}`
    });
  }

  const ordem: Record<AlertItem["severity"], number> = { CRITICO: 0, ATENCAO: 1, INFORMATIVO: 2 };
  return alerts.sort((a, b) => ordem[a.severity] - ordem[b.severity]);
}

/** Aba de origem de cada tipo de alerta derivado. */
function routeForAlertType(type: AlertType): string {
  switch (type) {
    case AlertType.LUBRIFICANTE_BAIXO:
      return "/dashboard/lubrificantes";
    case AlertType.COMPRA_ATRASADA:
      return "/dashboard/compras-pendentes";
    case AlertType.QUEBRA_RECORRENTE:
      return "/dashboard/equipamentos-criticos";
    default:
      return "/dashboard/ordens-servico";
  }
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
 * falha. Mostra os 4 KPIs zerados/empty e listas/gráficos vazios, para os
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
      emptyKpi("Máquinas Críticas", "red", AlertTriangle, "Aguardando importação PC-Factory"),
      emptyKpi("Procedimentos Ativos", "blue", FileText, "Aguardando importação")
    ],
    openClosedOrders: [],
    correctivePreventive: [],
    criticalEquipment: [],
    pendingPurchases: [],
    alerts: [],
    openClosedNote: null,
    preventiveAdherence: null,
    dataQuality: emptyDataQualitySummary("Banco de dados — importações do portal"),
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

function percentLabel(value: number): string {
  return `${value.toFixed(1).replace(".", ",")}%`;
}

/**
 * Card "Máquinas Críticas" da aba Início — fonte PC-Factory: máquinas ABAIXO da
 * média de disponibilidade no período. Valor = quantidade; subtítulo com a média;
 * tooltip com as piores; clique abre a aba PC-Factory (com o período atual).
 */
function buildMachinesCriticalKpi(data: DatabaseDashboardData): DashboardKPI {
  const pc = data.pcFactoryCritical;
  const hasData = pc.averageAvailability !== null;
  const avgLabel = hasData ? percentLabel(pc.averageAvailability as number) : null;

  const startDate = toInputDate(data.period.startDate);
  const endDate = toInputDate(data.period.endDate);
  const href = `/dashboard/pc-factory?view=below-average&startDate=${startDate}&endDate=${endDate}`;

  const tooltip =
    pc.machinesBelowAverage.length > 0
      ? [
          `Máquinas críticas por disponibilidade PC-Factory (méd. ${avgLabel})`,
          ...pc.machinesBelowAverage
            .slice(0, 5)
            .map((machine, index) => `${index + 1}. ${machine.machineName} — ${percentLabel(machine.availability)}`)
        ].join("\n")
      : undefined;

  const subtitle = !hasData
    ? "Aguardando importação PC-Factory"
    : pc.count === 0
      ? `Todas acima da média (méd. ${avgLabel})`
      : `Abaixo da média PC-Factory · méd. ${avgLabel}`;

  return {
    title: "Máquinas Críticas",
    value: String(pc.count),
    tone: "red",
    icon: AlertTriangle,
    comparison: snapshotSubtitle(subtitle),
    isEmpty: !hasData,
    emptyHint: "Aguardando importação PC-Factory",
    href,
    tooltip
  };
}

/** Rótulo de mês (ex.: "Jan/24") — inclui o ano para não confundir meses de anos distintos. */
function monthLabel(date: Date): string {
  return `${formatMonthName(date)}/${String(date.getUTCFullYear()).slice(2)}`;
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
      buildMachinesCriticalKpi(data),
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
      { name: "Corretiva", value: data.correctivePreventiveChart.corrective, color: CHART_SERIES.corretiva },
      { name: "Preventiva", value: data.correctivePreventiveChart.preventive, color: CHART_SERIES.preventiva }
    ],
    criticalEquipment: data.topCriticalEquipments.map((item) => ({
      name: item.equipmentName,
      value: item.totalOrders
    })),
    pendingPurchases: data.pendingPurchases.map((item) => ({
      priority: item.priority ?? "—",
      requisition: item.requisitionNumber ?? "—",
      item: item.item,
      requester: item.requester ?? "—",
      requestedAt: formatDate(item.requisitionDate),
      daysOpen: item.daysOpen
    })),
    alerts: buildHomeAlerts(data),
    preventiveAdherence: data.preventiveAdherence,
    dataQuality: data.dataQuality,
    openClosedNote: data.openClosedNote,
    source: "database",
    period: {
      startDate: data.period.startDate.toISOString(),
      endDate: data.period.endDate.toISOString()
    }
  };
}
