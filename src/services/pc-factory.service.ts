import { cache } from "react";
import type { PageDataSource } from "@/types/page-data";
import { PcFactoryStatusCategory, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { PC_FACTORY_COLORS, PC_FACTORY_MANAGEMENT_GROUP_COLORS } from "@/constants/pc-factory-colors";
import {
  PC_FACTORY_CATEGORY_COLORS,
  PC_FACTORY_CATEGORY_LABELS,
  PC_FACTORY_CATEGORY_ORDER,
  PC_FACTORY_MANAGEMENT_GROUP_LABELS,
  PC_FACTORY_MANAGEMENT_GROUP_ORDER,
  OUT_OF_LOAD_BUCKETS,
  classifyAvailabilityBucket,
  classifyManagementGroup,
  calculateG0134BusinessAvailability,
  calculateOfficialPcFactoryAvailability,
  maintenanceKind,
  normalizePcFactoryStatusKey,
  resolvePcFactoryStatusColor,
  type PcFactoryAvailabilityBucket,
  type PcFactoryManagementGroup
} from "@/utils/pc-factory-normalizer";
import type {
  PcFactoryCategorySlice,
  PcFactoryStatusSlice,
  PcFactoryDashboardSummary,
  PcFactoryDataQuality,
  PcFactoryFilterOptions,
  PcFactoryGroupRow,
  PcFactoryKpis,
  PcFactoryMaintenanceSplit,
  PcFactoryManagementGroupRow,
  PcFactoryPageData,
  PcFactoryProductionLineRow,
  PcFactoryQueryParams,
  PcFactoryRecommendation,
  PcFactoryRecordRow,
  PcFactoryRecordsResult,
  PcFactoryReferencePeriod,
  PcFactoryReliabilityRow,
  PcFactoryResourceDetails,
  PcFactoryResourceRow,
  PcFactoryRootCauseSlice,
  PcFactoryTopResource,
  PcFactoryTrendPoint
} from "@/types/pc-factory";

const DEFAULT_PAGE_SIZE = 50;

/**
 * Decisão de negócio (confirmada): Setup conta como parada/perda operacional e,
 * portanto, reduz a disponibilidade. Para tratar Setup como tempo neutro, basta
 * mudar esta constante para false.
 */
const SETUP_COUNTS_AS_LOSS = true;

/* ------------------------------------------------------------------ */
/* Where + carregamento de registros                                  */
/* ------------------------------------------------------------------ */

function buildWhere(params: PcFactoryQueryParams): Prisma.PcFactoryRecordWhereInput {
  const and: Prisma.PcFactoryRecordWhereInput[] = [];

  if (params.resources?.length) and.push({ resourceName: { in: params.resources } });
  if (params.productionLines?.length) and.push({ productionLine: { in: params.productionLines } });
  if (params.groupPortals?.length) and.push({ groupPortal: { in: params.groupPortals } });
  if (params.sectors?.length) and.push({ sector: { in: params.sectors } });
  if (params.shifts?.length) and.push({ shift: { in: params.shifts } });
  if (params.statusNames?.length) and.push({ statusRaw: { in: params.statusNames } });
  if (params.categories?.length) and.push({ statusCategory: { in: params.categories } });

  // Toggles de manutenção — usam o campo derivado maintenanceType (robusto, sem contains frágil).
  if (params.onlyMaintenance) and.push({ isMaintenanceKpi: true });
  if (params.onlyMechanical) and.push({ maintenanceType: "MECANICA" });
  if (params.onlyElectrical) and.push({ maintenanceType: "ELETRICA" });
  if (params.onlyAutomation) and.push({ maintenanceType: "AUTOMACAO" });
  if (params.onlyWaiting) and.push({ maintenanceType: "AGUARDANDO" });
  if (params.excludeOutOfPlanned) {
    and.push({ NOT: { statusCategory: PcFactoryStatusCategory.EXCLUIR_TEMPO_PLANEJADO } });
  }

  if (params.startDate || params.endDate) {
    const range: Prisma.DateTimeNullableFilter = {};
    if (params.startDate) range.gte = new Date(`${params.startDate}T00:00:00.000Z`);
    if (params.endDate) range.lte = new Date(`${params.endDate}T23:59:59.999Z`);
    and.push({ startDateTime: range });
  }

  if (params.search) {
    const term = params.search.trim();
    if (term) {
      and.push({
        OR: [
          { resourceName: { contains: term, mode: "insensitive" } },
          { resourceCode: { contains: term, mode: "insensitive" } },
          { productionLine: { contains: term, mode: "insensitive" } },
          { orderNumber: { contains: term, mode: "insensitive" } },
          { productDescription: { contains: term, mode: "insensitive" } },
          { statusRaw: { contains: term, mode: "insensitive" } }
        ]
      });
    }
  }

  return and.length ? { AND: and } : {};
}

/**
 * REGISTROS COM DURAÇÃO MENSURÁVEL — filtro aplicado a TODA agregação por horas.
 *
 * Um registro sem `endDateTime` é um status ABERTO: o PC-Factory nunca registrou a
 * mudança seguinte. A "duração" dele não é uma medição, é a distância entre o início e o
 * momento em que a planilha foi exportada — reexportar amanhã aumenta o número em 24 h.
 *
 * No export de jan–jul/2026 são 42 registros (de 60.921) que respondiam por 205.680 h,
 * quase metade da base, e dominavam os totais por status: 98,9% de "Aguardando
 * lançamento", 94,1% de "Parada não Identificada", 34,3% de toda a Manutenção Mecânica
 * (um único registro de 4.986 h na MULTFIO5, que por causa disso aparecia como máquina
 * mais crítica com 0% de disponibilidade) e 9,3% da Produção.
 *
 * Decisão do gestor em 2026-08-05: eles saem das somas de horas. Continuam gravados,
 * visíveis na tabela de registros e contados no painel de qualidade — o que se perde é
 * só o peso indevido nos indicadores. A causa raiz é na origem: fechar esses status no
 * PC-Factory.
 */
const MEASURABLE_DURATION: Prisma.PcFactoryRecordWhereInput = { endDateTime: { not: null } };

type AnalyticsRecord = {
  resourceName: string;
  resourceCode: string | null;
  productionLine: string | null;
  groupPortal: string | null;
  sector: string | null;
  statusRaw: string | null;
  statusKey: string | null;
  statusColorHex: string | null;
  statusCode: string | null;
  statusCategory: PcFactoryStatusCategory;
  managementGroup: string | null;
  availabilityBucket: string | null;
  classificationRef: string | null;
  durationHours: number;
  realDurationHours: number | null;
  startDateTime: Date | null;
};

/**
 * Base oficial dos indicadores PC-Factory: usamos durationHours (Tempo Decorrido) para
 * manter consistência com a Tabela Gerencial / Management View do PC-Factory (decisão de
 * 2026-06-24). A Management View consolida por "Tempo Decorrido" por status, não pelo Real.
 *
 * realDurationHours ("Tempo Decorrido Real[hr]") é armazenado apenas para auditoria/
 * comparação futura e NÃO deve substituir durationHours nos KPIs principais — por isso
 * NÃO há fallback `realDurationHours ?? durationHours` aqui. Nunca retorna NaN/negativo.
 */
function metricHours(record: { realDurationHours: number | null; durationHours: number }): number {
  const base = record.durationHours;
  return Number.isFinite(base) && base > 0 ? base : 0;
}

// `cache` deduplica a carga de registros filtrados no MESMO render — o orquestrador
// cria UM objeto `params` e o repassa a todas as sub-funções.
const loadRecords = cache(async (params: PcFactoryQueryParams): Promise<AnalyticsRecord[]> => {
  return prisma.pcFactoryRecord.findMany({
    // Funil ÚNICO da agregação por horas: o filtro de duração mensurável entra aqui e
    // vale para KPIs, tendência, confiabilidade, rankings, composição e qualidade.
    where: { AND: [buildWhere(params), MEASURABLE_DURATION] },
    select: {
      resourceName: true,
      resourceCode: true,
      productionLine: true,
      groupPortal: true,
      sector: true,
      statusRaw: true,
      statusKey: true,
      statusColorHex: true,
      statusCode: true,
      statusCategory: true,
      managementGroup: true,
      availabilityBucket: true,
      classificationRef: true,
      durationHours: true,
      realDurationHours: true,
      startDateTime: true
    }
  });
});

/**
 * Bucket oficial do registro. Usa a coluna gravada na importação e, se ela estiver
 * vazia (registros importados antes da migration), recalcula a partir de
 * statusCode/status/classificationRef — assim a Disponibilidade nunca depende de um
 * reimport para funcionar.
 */
function resolveBucket(record: AnalyticsRecord): PcFactoryAvailabilityBucket {
  const stored = record.availabilityBucket;
  if (stored === "PRODUCAO") return "PRODUCAO";
  if (stored === "PARADA_PLANEJADA") return "PARADA_PLANEJADA";
  if (stored === "PARADA_NAO_PLANEJADA") return "PARADA_NAO_PLANEJADA";
  if (stored === "FORA_DE_TURNO") return "FORA_DE_TURNO";
  if (stored === "RECURSO_NAO_PROGRAMADO") return "RECURSO_NAO_PROGRAMADO";
  if (stored === "NAO_APONTADO") return "NAO_APONTADO";
  return classifyAvailabilityBucket({
    statusCode: record.statusCode,
    statusRaw: record.statusRaw,
    classificationRef: record.classificationRef
  });
}

/* ------------------------------------------------------------------ */
/* Agregação pura                                                     */
/* ------------------------------------------------------------------ */

type HoursAggregate = {
  byCategory: Map<PcFactoryStatusCategory, number>;
  totalHours: number;
  plannedHours: number;
  productionHours: number;
  maintenanceHours: number;
  mechanicalHours: number;
  electricalHours: number;
  automationHours: number;
  planejadaHours: number;
  terceirosHours: number;
  waitingHours: number;
  setupHours: number;
  lossHours: number;
  operationalHours: number;
  excludedHours: number;
  stoppedHours: number;
  /** Horas por bucket oficial de disponibilidade (TAREFAS 8 e 9). */
  bucketHours: Record<PcFactoryAvailabilityBucket, number>;
  /**
   * Horas de manutenção que caem DENTRO do Tempo Operacional — numerador da
   * Disponibilidade G0134. Difere de `maintenanceHours` por excluir "Manutenção
   * Planejada" (0207), que está no bucket PARADA_PLANEJADA e portanto JÁ foi retirada do
   * denominador: contá-la de novo aqui subtrairia o mesmo tempo duas vezes.
   */
  maintenanceHoursInOperational: number;
  maintenanceEvents: number;
  mechanicalEvents: number;
  electricalEvents: number;
  automationEvents: number;
  planejadaEvents: number;
  terceirosEvents: number;
  waitingEvents: number;
};

function aggregateHours(records: AnalyticsRecord[]): HoursAggregate {
  const byCategory = new Map<PcFactoryStatusCategory, number>();
  let totalHours = 0;
  let plannedHours = 0;
  let productionHours = 0;
  let maintenanceHours = 0;
  let mechanicalHours = 0;
  let electricalHours = 0;
  let automationHours = 0;
  let planejadaHours = 0;
  let terceirosHours = 0;
  let waitingHours = 0;
  let setupHours = 0;
  let paradaPerdaHours = 0;
  let operationalHours = 0;
  let excludedHours = 0;
  let maintenanceEvents = 0;
  let mechanicalEvents = 0;
  let electricalEvents = 0;
  let automationEvents = 0;
  let planejadaEvents = 0;
  let terceirosEvents = 0;
  let waitingEvents = 0;
  let maintenanceHoursInOperational = 0;
  const bucketHours: Record<PcFactoryAvailabilityBucket, number> = {
    PRODUCAO: 0,
    PARADA_PLANEJADA: 0,
    PARADA_NAO_PLANEJADA: 0,
    FORA_DE_TURNO: 0,
    RECURSO_NAO_PROGRAMADO: 0,
    NAO_APONTADO: 0
  };

  for (const record of records) {
    const hours = metricHours(record); // Tempo Decorrido (durationHours) — base oficial da Management View
    const cat = record.statusCategory;
    const bucket = resolveBucket(record);
    totalHours += hours;
    byCategory.set(cat, (byCategory.get(cat) ?? 0) + hours);
    bucketHours[bucket] += hours;

    if (cat === PcFactoryStatusCategory.EXCLUIR_TEMPO_PLANEJADO) {
      excludedHours += hours;
      continue; // fora do tempo planejado — não entra em nenhum cálculo de planejado/parada
    }

    plannedHours += hours;

    switch (cat) {
      case PcFactoryStatusCategory.MANUTENCAO: {
        maintenanceHours += hours;
        // Só a manutenção que está DENTRO do Tempo Operacional entra no numerador da
        // Disponibilidade G0134. "Manutenção Planejada" (0207) é PARADA_PLANEJADA e já saiu
        // do denominador — somá-la aqui subtrairia o mesmo tempo duas vezes.
        if (bucket !== "PARADA_PLANEJADA" && !OUT_OF_LOAD_BUCKETS.has(bucket)) {
          maintenanceHoursInOperational += hours;
        }
        maintenanceEvents += 1;
        const kind = maintenanceKind(record.statusRaw);
        if (kind === "MECANICA") {
          mechanicalHours += hours;
          mechanicalEvents += 1;
        } else if (kind === "ELETRICA") {
          electricalHours += hours;
          electricalEvents += 1;
        } else if (kind === "AUTOMACAO") {
          automationHours += hours;
          automationEvents += 1;
        } else if (kind === "PLANEJADA") {
          planejadaHours += hours;
          planejadaEvents += 1;
        } else if (kind === "TERCEIROS") {
          terceirosHours += hours;
          terceirosEvents += 1;
        } else if (kind === "AGUARDANDO") {
          waitingHours += hours;
          waitingEvents += 1;
        }
        break;
      }
      case PcFactoryStatusCategory.PRODUCAO:
        productionHours += hours;
        break;
      case PcFactoryStatusCategory.SETUP:
        setupHours += hours;
        break;
      case PcFactoryStatusCategory.PARADA_PERDA:
        paradaPerdaHours += hours;
        break;
      case PcFactoryStatusCategory.OPERACIONAL:
      case PcFactoryStatusCategory.OUTROS:
        operationalHours += hours;
        break;
      default:
        break;
    }
  }

  const lossHours = paradaPerdaHours + (SETUP_COUNTS_AS_LOSS ? setupHours : 0);
  const stoppedHours = maintenanceHours + lossHours;

  return {
    byCategory,
    totalHours: round(totalHours),
    plannedHours: round(plannedHours),
    productionHours: round(productionHours),
    maintenanceHours: round(maintenanceHours),
    mechanicalHours: round(mechanicalHours),
    electricalHours: round(electricalHours),
    automationHours: round(automationHours),
    planejadaHours: round(planejadaHours),
    terceirosHours: round(terceirosHours),
    waitingHours: round(waitingHours),
    setupHours: round(setupHours),
    lossHours: round(lossHours),
    operationalHours: round(operationalHours),
    excludedHours: round(excludedHours),
    stoppedHours: round(stoppedHours),
    bucketHours: {
      PRODUCAO: round(bucketHours.PRODUCAO),
      PARADA_PLANEJADA: round(bucketHours.PARADA_PLANEJADA),
      PARADA_NAO_PLANEJADA: round(bucketHours.PARADA_NAO_PLANEJADA),
      FORA_DE_TURNO: round(bucketHours.FORA_DE_TURNO),
      RECURSO_NAO_PROGRAMADO: round(bucketHours.RECURSO_NAO_PROGRAMADO),
      NAO_APONTADO: round(bucketHours.NAO_APONTADO)
    },
    maintenanceHoursInOperational: round(maintenanceHoursInOperational),
    maintenanceEvents,
    mechanicalEvents,
    electricalEvents,
    automationEvents,
    planejadaEvents,
    terceirosEvents,
    waitingEvents
  };
}

/**
 * Decomposição das horas do recorte até o Tempo Operacional — o equivalente do
 * `G0134.LOADTIME` derivado do histórico de status:
 *
 *   Carga        = total − Fora de Turno − Recurso Não Programado
 *   Operacional  = Carga − Paradas Planejadas          (= G0134.LOADTIME)
 *
 * O tempo NÃO APONTADO permanece na Carga (decisão de 2026-08-05) e, por não ser
 * manutenção, conta como disponível — ver OUT_OF_LOAD_BUCKETS.
 *
 * O `utilizationPercent` que vem daqui é a métrica de UTILIZAÇÃO (Trabalhado ÷
 * Operacional) e NÃO é a Disponibilidade exibida no portal — ver `availability()`.
 */
function availabilityBreakdown(agg: HoursAggregate) {
  return calculateOfficialPcFactoryAvailability({
    production: agg.bucketHours.PRODUCAO,
    plannedStop: agg.bucketHours.PARADA_PLANEJADA,
    unplannedStop: agg.bucketHours.PARADA_NAO_PLANEJADA,
    outOfShift: agg.bucketHours.FORA_DE_TURNO,
    unscheduledResource: agg.bucketHours.RECURSO_NAO_PROGRAMADO,
    notReported: agg.bucketHours.NAO_APONTADO
  });
}

/**
 * DISPONIBILIDADE OFICIAL (%) do recorte — fonte ÚNICA usada por todos os cards,
 * tabelas e gráficos do módulo. Segue a planilha do negócio
 * `disponibilidade mensal exportado.xlsx` (relatório G0134 do PC-Factory):
 *
 *   Disponibilidade = (Tempo Operacional − Manutenção) / Tempo Operacional × 100
 *
 * Substituiu a fórmula anterior (Trabalhado ÷ Operacional), que na verdade calcula
 * UTILIZAÇÃO — o PC-Factory expõe as duas separadamente no G0007.
 *
 * Agregação: como recebe o `agg` do recorte inteiro (horas já SOMADAS), o resultado é
 * naturalmente PONDERADO pelos totais. Nunca é média simples das máquinas — é isso que
 * mantém a evolução mensal coerente com a planilha.
 *
 * Retorna null (nunca NaN/Infinity) quando não há Tempo Operacional.
 */
function availability(agg: HoursAggregate): number | null {
  return calculateG0134BusinessAvailability({
    operationalHours: availabilityBreakdown(agg).operationalHours,
    maintenanceHours: agg.maintenanceHoursInOperational
  });
}

function mttr(maintenanceHours: number, maintenanceEvents: number): number | null {
  return maintenanceEvents > 0 ? safeRound(maintenanceHours / maintenanceEvents) : null;
}

/**
 * MTBF gerencial (horas) = (Tempo Planejado Real − Horas de Manutenção Real) / eventos.
 * Aproxima o tempo operacional planejado disponível entre eventos de manutenção.
 * null = sem eventos de manutenção ("Dados insuficientes").
 */
function mtbf(plannedHours: number, maintenanceHours: number, maintenanceEvents: number): number | null {
  if (maintenanceEvents <= 0) return null;
  const operational = Math.max(0, plannedHours - maintenanceHours);
  return safeRound(operational / maintenanceEvents);
}

/**
 * MTTA gerencial estimado (horas) = horas em "Aguardando Manutenção" / nº de eventos
 * de Aguardando Manutenção. É uma estimativa (ainda não há timestamp de chamado vs.
 * início de atendimento). null = sem eventos de aguardando ("Dados insuficientes").
 */
function mtta(waitingHours: number, waitingEvents: number): number | null {
  return waitingEvents > 0 ? safeRound(waitingHours / waitingEvents) : null;
}

function maintenancePercent(plannedHours: number, maintenanceHours: number): number | null {
  if (plannedHours <= 0) return null;
  return clampPercent((maintenanceHours / plannedHours) * 100);
}

/* ------------------------------------------------------------------ */
/* Ranking por recurso                                                */
/* ------------------------------------------------------------------ */

function buildResourceRanking(records: AnalyticsRecord[]): PcFactoryResourceRow[] {
  const groups = new Map<string, AnalyticsRecord[]>();
  for (const record of records) {
    const list = groups.get(record.resourceName);
    if (list) list.push(record);
    else groups.set(record.resourceName, [record]);
  }

  const rows: PcFactoryResourceRow[] = [];
  for (const [resourceName, list] of Array.from(groups.entries())) {
    const agg = aggregateHours(list);
    const sample = list.find((item) => item.resourceCode) ?? list[0];
    const line = list.find((item) => item.productionLine)?.productionLine ?? null;
    const group = list.find((item) => item.groupPortal)?.groupPortal ?? null;
    rows.push({
      resourceName,
      resourceCode: sample.resourceCode ?? null,
      productionLine: line,
      groupPortal: group,
      plannedHours: agg.plannedHours,
      productionHours: agg.productionHours,
      maintenanceHours: agg.maintenanceHours,
      mechanicalHours: agg.mechanicalHours,
      electricalHours: agg.electricalHours,
      automationHours: agg.automationHours,
      planejadaHours: agg.planejadaHours,
      terceirosHours: agg.terceirosHours,
      waitingHours: agg.waitingHours,
      lossHours: agg.lossHours,
      stoppedHours: agg.stoppedHours,
      maintenanceEvents: agg.maintenanceEvents,
      waitingEvents: agg.waitingEvents,
      mttr: mttr(agg.maintenanceHours, agg.maintenanceEvents),
      mtbf: mtbf(agg.plannedHours, agg.maintenanceHours, agg.maintenanceEvents),
      mtta: mtta(agg.waitingHours, agg.waitingEvents),
      availabilityPercent: availability(agg)
    });
  }
  return rows;
}

function topByMaintenance(rows: PcFactoryResourceRow[]): PcFactoryTopResource {
  let best: PcFactoryResourceRow | null = null;
  for (const row of rows) {
    if (row.maintenanceHours > 0 && (!best || row.maintenanceHours > best.maintenanceHours)) best = row;
  }
  return best ? { resourceName: best.resourceName, resourceCode: best.resourceCode, hours: best.maintenanceHours } : null;
}

/* ------------------------------------------------------------------ */
/* Confiabilidade por máquina (MTBF / MTTR / MTTA / disponibilidade)   */
/* ------------------------------------------------------------------ */

/**
 * Indicadores de confiabilidade por máquina, alinhados às regras OFICIAIS do PC-Factory
 * (Management View). Base de tempo = durationHours (Tempo Decorrido), via metricHours().
 *
 * Definições (decididas com o gestor):
 *  - Reparo (repairHours)   = Mecânica + Elétrica + Automação + Terceiros. NÃO inclui
 *                             "Aguardando Manutenção" nem "Manutenção Planejada".
 *  - Aguardando (waiting)   = "Aguardando Manutenção" — entra só no MTTA e nas Paradas.
 *  - Quebras (failureEvents)= eventos de Mecânica+Elétrica+Automação+Terceiros+Aguardando
 *                             (exclui Planejada — manutenção preventiva não é falha).
 *  - Paradas (downtime)     = repairHours + waitingHours.
 *  - Tempo planejado        = Tempo Decorrido excluindo os buckets FORA do Tempo de Carga
 *                             (Fora de Turno, Recurso Não Programado e Não Apontado) —
 *                             mesma regra dos cards principais, sem regra paralela.
 *
 * A "Disponibilidade" desta tabela usa EXATAMENTE a mesma fórmula do card principal
 * (regra da planilha G0134 — ver `availability()`), só calculada por máquina em vez de
 * agregada: mesmo denominador (Tempo Operacional = Carga − Paradas Planejadas) e mesmo
 * numerador (paradas de manutenção). Não há regra paralela.
 *
 * Fórmulas:
 *  - MTBF = (plannedHours − paradas) / quebras
 *  - MTTR = repairHours / quebras                 (só tempo de reparo)
 *  - MTTA = waitingHours / quebras
 *  - Disponibilidade = (Tempo Operacional − paradas de manutenção) / Tempo Operacional × 100
 *
 * Toda divisão é protegida → null quando não aplicável (UI mostra "—", nunca 0/NaN/Infinity).
 */
function buildReliabilityByMachine(records: AnalyticsRecord[]): PcFactoryReliabilityRow[] {
  const groups = new Map<string, AnalyticsRecord[]>();
  for (const record of records) {
    const list = groups.get(record.resourceName);
    if (list) list.push(record);
    else groups.set(record.resourceName, [record]);
  }

  const rows: PcFactoryReliabilityRow[] = [];
  for (const [machineName, list] of Array.from(groups.entries())) {
    let plannedHours = 0;
    let plannedStopHours = 0;
    let repairHours = 0;
    let waitingHours = 0;
    let repairEvents = 0;
    let waitingEvents = 0;

    for (const record of list) {
      const hours = metricHours(record); // Tempo Decorrido (durationHours) — base oficial
      // Fora de Turno / Recurso Não Programado saem do tempo planejado — usa o bucket
      // oficial (mesma regra central da Disponibilidade), não a categoria. O tempo NÃO
      // APONTADO permanece, por decisão de 2026-08-05: ele entra em plannedHours e, com
      // isso, no MTBF desta tabela.
      const bucket = resolveBucket(record);
      if (OUT_OF_LOAD_BUCKETS.has(bucket)) continue;
      plannedHours += hours;
      // Paradas planejadas saem do Tempo Operacional (mesmo denominador do card principal).
      if (bucket === "PARADA_PLANEJADA") plannedStopHours += hours;

      const kind = maintenanceKind(record.statusRaw);
      if (kind === "MECANICA" || kind === "ELETRICA" || kind === "AUTOMACAO" || kind === "TERCEIROS") {
        repairHours += hours;
        repairEvents += 1;
      } else if (kind === "AGUARDANDO") {
        waitingHours += hours;
        waitingEvents += 1;
      }
      // kind === "PLANEJADA" → conta só no tempo planejado (não é falha/quebra).
    }

    const failureEvents = repairEvents + waitingEvents;
    if (failureEvents <= 0) continue; // sem quebras → fora do dashboard de confiabilidade

    plannedHours = round(plannedHours);
    plannedStopHours = round(plannedStopHours);
    repairHours = round(repairHours);
    waitingHours = round(waitingHours);
    const maintenanceDowntimeHours = round(repairHours + waitingHours);
    const operatingHours = round(Math.max(0, plannedHours - maintenanceDowntimeHours));
    // Tempo Operacional oficial da máquina (= G0134.LOADTIME): Carga − Paradas Planejadas.
    // É o denominador da Disponibilidade, o mesmo do card principal.
    const officialOperationalHours = round(Math.max(0, plannedHours - plannedStopHours));

    const hasPlanned = plannedHours > 0;
    const sample = list.find((item) => item.resourceCode) ?? list[0];

    rows.push({
      machineName,
      machineCode: sample.resourceCode ?? null,
      productionLine: list.find((item) => item.productionLine)?.productionLine ?? null,
      groupPortal: list.find((item) => item.groupPortal)?.groupPortal ?? null,
      plannedHours,
      operatingHours,
      failureEvents,
      repairHours,
      waitingMaintenanceHours: waitingHours,
      maintenanceDowntimeHours,
      mtbf: hasPlanned ? safeRound(operatingHours / failureEvents) : null,
      mttr: repairHours > 0 ? safeRound(repairHours / failureEvents) : null,
      mtta: waitingHours > 0 ? safeRound(waitingHours / failureEvents) : null,
      downtimeHours: maintenanceDowntimeHours,
      // Mesma fórmula do card principal (planilha G0134), por máquina — sem regra paralela.
      availability: calculateG0134BusinessAvailability({
        operationalHours: officialOperationalHours,
        maintenanceHours: maintenanceDowntimeHours
      }),
      dataQualityIssue: !hasPlanned
        ? "Sem tempo planejado no período — MTBF/disponibilidade não calculáveis."
        : maintenanceDowntimeHours > plannedHours
          ? "Paradas de manutenção excedem o tempo planejado (verificar importação)."
          : operatingHours <= 0
            ? "Toda a base de tempo é manutenção (sem produção) — MTBF/disponibilidade pouco representativos."
            : null
    });
  }

  // Mais críticas primeiro (mais horas de parada de manutenção).
  return rows.sort((a, b) => b.maintenanceDowntimeHours - a.maintenanceDowntimeHours);
}

export async function getPcFactoryReliabilityByMachine(params: PcFactoryQueryParams): Promise<PcFactoryReliabilityRow[]> {
  return buildReliabilityByMachine(await loadRecords(params));
}

/* ------------------------------------------------------------------ */
/* 1. KPIs                                                            */
/* ------------------------------------------------------------------ */

export async function getPcFactoryDashboardKPIs(params: PcFactoryQueryParams): Promise<PcFactoryKpis> {
  const records = await loadRecords(params);
  const agg = aggregateHours(records);
  const ranking = buildResourceRanking(records);

  const resourceNames = new Set(records.map((r) => r.resourceName));
  const lines = new Set(records.map((r) => r.productionLine).filter(Boolean) as string[]);
  const groups = new Set(records.map((r) => r.groupPortal).filter(Boolean) as string[]);

  return {
    totalRecords: records.length,
    totalResources: resourceNames.size,
    totalGroups: groups.size,
    totalProductionLines: lines.size,
    totalHours: agg.totalHours,
    plannedHours: agg.plannedHours,
    productionHours: agg.productionHours,
    maintenanceHours: agg.maintenanceHours,
    mechanicalMaintenanceHours: agg.mechanicalHours,
    electricalMaintenanceHours: agg.electricalHours,
    automationMaintenanceHours: agg.automationHours,
    waitingMaintenanceHours: agg.waitingHours,
    setupHours: agg.setupHours,
    lossHours: agg.lossHours,
    operationalHours: agg.operationalHours,
    excludedHours: agg.excludedHours,
    stoppedHours: agg.stoppedHours,
    maintenanceEvents: agg.maintenanceEvents,
    mechanicalEvents: agg.mechanicalEvents,
    electricalEvents: agg.electricalEvents,
    automationEvents: agg.automationEvents,
    waitingEvents: agg.waitingEvents,
    mttr: mttr(agg.maintenanceHours, agg.maintenanceEvents),
    mtbf: mtbf(agg.plannedHours, agg.maintenanceHours, agg.maintenanceEvents),
    mtta: mtta(agg.waitingHours, agg.waitingEvents),
    maintenancePercentOfPlanned: maintenancePercent(agg.plannedHours, agg.maintenanceHours),
    availabilityPercent: availability(agg),
    topMaintenanceResource: topByMaintenance(ranking)
  };
}

/* ------------------------------------------------------------------ */
/* 2. Distribuição por categoria                                      */
/* ------------------------------------------------------------------ */

export async function getPcFactoryCategoryDistribution(params: PcFactoryQueryParams): Promise<PcFactoryCategorySlice[]> {
  const records = await loadRecords(params);
  return categoryDistributionFromAggregate(aggregateHours(records));
}

function categoryDistributionFromAggregate(agg: HoursAggregate): PcFactoryCategorySlice[] {
  return PC_FACTORY_CATEGORY_ORDER.map((category) => {
    const totalHours = round(agg.byCategory.get(category) ?? 0);
    return {
      category,
      label: PC_FACTORY_CATEGORY_LABELS[category],
      color: PC_FACTORY_CATEGORY_COLORS[category],
      totalHours,
      percent: agg.totalHours > 0 ? clampPercent((totalHours / agg.totalHours) * 100) ?? 0 : 0
    };
  }).filter((slice) => slice.totalHours > 0);
}

/* ------------------------------------------------------------------ */
/* 2c. Distribuição de horas por STATUS REAL da planilha (com cor)     */
/* ------------------------------------------------------------------ */

export async function getPcFactoryStatusDistribution(params: PcFactoryQueryParams): Promise<PcFactoryStatusSlice[]> {
  return statusDistributionFromRecords(await loadRecords(params));
}

/**
 * Agrupa as horas pelo STATUS REAL da planilha (statusRaw), na base "Tempo Decorrido"
 * (durationHours — mesma base do resto do dashboard, decisão de 24/06). A cor segue a
 * planilha quando o registro tem `statusColorHex` (cor mais recente do status no recorte
 * filtrado, refletindo a última importação), com fallback por `statusKey`. Ordena por
 * horas desc. Respeita os filtros (recebe os registros já filtrados). Nunca gera NaN.
 */
function statusDistributionFromRecords(records: AnalyticsRecord[]): PcFactoryStatusSlice[] {
  type Bucket = { statusRaw: string; statusKey: string; hours: number; colorHex: string | null; colorAt: number };
  const byStatus = new Map<string, Bucket>();
  let total = 0;

  for (const record of records) {
    const statusRaw = (record.statusRaw ?? "").trim();
    if (!statusRaw) continue;
    const hours = metricHours(record);
    if (hours <= 0) continue;
    total += hours;

    const statusKey = record.statusKey || normalizePcFactoryStatusKey(statusRaw);
    const at = record.startDateTime ? record.startDateTime.getTime() : 0;
    const existing = byStatus.get(statusKey);
    if (existing) {
      existing.hours += hours;
      // Mantém a cor do registro MAIS RECENTE que tenha cor (reflete a última importação).
      if (record.statusColorHex && at >= existing.colorAt) {
        existing.colorHex = record.statusColorHex;
        existing.colorAt = at;
      }
    } else {
      byStatus.set(statusKey, {
        statusRaw,
        statusKey,
        hours,
        colorHex: record.statusColorHex ?? null,
        colorAt: record.statusColorHex ? at : -1
      });
    }
  }

  return Array.from(byStatus.values())
    .map((bucket) => {
      const { hex, source } = resolvePcFactoryStatusColor(bucket.statusKey, bucket.colorHex);
      return {
        statusRaw: bucket.statusRaw,
        statusKey: bucket.statusKey,
        hours: round(bucket.hours),
        percent: total > 0 ? clampPercent((bucket.hours / total) * 100) ?? 0 : 0,
        colorHex: hex,
        colorSource: source
      };
    })
    .sort((a, b) => b.hours - a.hours);
}

/* ------------------------------------------------------------------ */
/* 2b. Tabela Gerencial (Management View — 6 grupos por código)        */
/* ------------------------------------------------------------------ */

export async function getPcFactoryManagementTable(params: PcFactoryQueryParams): Promise<PcFactoryManagementGroupRow[]> {
  return buildManagementTable(await loadRecords(params));
}

/**
 * Reproduz a Tabela Gerencial do PC-Factory: soma "Tempo Decorrido" por grupo gerencial
 * (derivado do código RCODSTATUS), na ordem oficial, com % do total e acumulados.
 * O grupo é lido do campo `managementGroup`; se ausente (registro antigo), recai em
 * classifyManagementGroup(statusCode, statusRaw).
 */
function buildManagementTable(records: AnalyticsRecord[]): PcFactoryManagementGroupRow[] {
  const byGroup = new Map<PcFactoryManagementGroup, number>();
  let total = 0;
  for (const record of records) {
    const hours = metricHours(record);
    const group = (record.managementGroup as PcFactoryManagementGroup | null) ?? classifyManagementGroup(record.statusCode, record.statusRaw);
    byGroup.set(group, (byGroup.get(group) ?? 0) + hours);
    total += hours;
  }

  let cumulativeHours = 0;
  return PC_FACTORY_MANAGEMENT_GROUP_ORDER.map((group) => {
    const totalHours = round(byGroup.get(group) ?? 0);
    cumulativeHours = round(cumulativeHours + totalHours);
    return {
      group,
      label: PC_FACTORY_MANAGEMENT_GROUP_LABELS[group],
      color: PC_FACTORY_MANAGEMENT_GROUP_COLORS[group],
      totalHours,
      percent: total > 0 ? round((totalHours / total) * 100) : 0,
      cumulativeHours,
      cumulativePercent: total > 0 ? round((cumulativeHours / total) * 100) : 0
    };
  }).filter((row) => row.totalHours > 0);
}

function maintenanceSplitFromAggregate(agg: HoursAggregate): PcFactoryMaintenanceSplit[] {
  return [
    { key: "MECANICA" as const, label: "Manutenção Mecânica", hours: agg.mechanicalHours, events: agg.mechanicalEvents, color: PC_FACTORY_COLORS.MANUTENCAO_MECANICA },
    { key: "ELETRICA" as const, label: "Manutenção Elétrica", hours: agg.electricalHours, events: agg.electricalEvents, color: PC_FACTORY_COLORS.MANUTENCAO_ELETRICA },
    { key: "AUTOMACAO" as const, label: "Manutenção Automação", hours: agg.automationHours, events: agg.automationEvents, color: PC_FACTORY_COLORS.MANUTENCAO_AUTOMACAO },
    { key: "PLANEJADA" as const, label: "Manutenção Planejada", hours: agg.planejadaHours, events: agg.planejadaEvents, color: PC_FACTORY_COLORS.MANUTENCAO_PLANEJADA },
    { key: "TERCEIROS" as const, label: "Manutenção de Terceiros", hours: agg.terceirosHours, events: agg.terceirosEvents, color: PC_FACTORY_COLORS.MANUTENCAO_TERCEIROS },
    { key: "AGUARDANDO" as const, label: "Aguardando Manutenção", hours: agg.waitingHours, events: agg.waitingEvents, color: PC_FACTORY_COLORS.AGUARDANDO_MANUTENCAO }
  ].filter((item) => item.hours > 0);
}

/* ------------------------------------------------------------------ */
/* 3-4. Rankings e linhas                                             */
/* ------------------------------------------------------------------ */

export async function getPcFactoryResourceRanking(params: PcFactoryQueryParams): Promise<PcFactoryResourceRow[]> {
  return buildResourceRanking(await loadRecords(params)).sort((a, b) => b.maintenanceHours - a.maintenanceHours);
}

export type PcFactoryMachineBelowAverage = {
  machineName: string;
  machineCode: string | null;
  availability: number;
  plannedHours: number;
  maintenanceHours: number;
  downtimeHours: number;
  gapToAverage: number;
};

export type PcFactoryMachinesBelowAverageResult = {
  /** Média de disponibilidade das máquinas válidas (null quando não há dados). */
  averageAvailability: number | null;
  /** Máquinas abaixo da média, da pior para a melhor disponibilidade. */
  machinesBelowAverage: PcFactoryMachineBelowAverage[];
  /** Quantidade de máquinas abaixo da média. */
  count: number;
  /** Total de máquinas válidas (tempo planejado > 0) consideradas na média. */
  totalMachines: number;
};

/**
 * "Máquinas Críticas" da aba Início: máquinas com disponibilidade ABAIXO da média
 * geral do PC-Factory no período.
 *
 * Usa a DISPONIBILIDADE OFICIAL já calculada por `buildResourceRanking` →
 * `availability(agg)` (regra da planilha G0134: (Tempo Operacional − Manutenção) ÷
 * Tempo Operacional). Antes esta função tinha uma fórmula PRÓPRIA
 * (`(plannedHours − maintenanceHours) / plannedHours`) que usava o Tempo de Carga como
 * denominador em vez do Tempo Operacional e por isso divergia do card e da tabela de
 * confiabilidade. Não recriar regra local aqui.
 *
 * A média é a média simples da disponibilidade oficial de TODAS as máquinas com
 * disponibilidade calculável (inclui as saudáveis, sem manutenção) — é uma média ENTRE
 * MÁQUINAS de propósito, porque o objetivo é achar quem está abaixo das pares, não o
 * indicador global (esse é ponderado, ver `availability()`). Blindado contra NaN/Infinity.
 */
export async function getPcFactoryMachinesBelowAverage(
  params: PcFactoryQueryParams = {}
): Promise<PcFactoryMachinesBelowAverageResult> {
  const rows = await getPcFactoryResourceRanking(params);
  const round1 = (value: number) => Number(value.toFixed(1));

  const valid = rows
    .filter((row) => row.availabilityPercent !== null)
    .map((row) => ({ row, availability: row.availabilityPercent as number }))
    .filter((item) => Number.isFinite(item.availability));

  if (valid.length === 0) {
    return { averageAvailability: null, machinesBelowAverage: [], count: 0, totalMachines: 0 };
  }

  const average = valid.reduce((sum, item) => sum + item.availability, 0) / valid.length;

  const machinesBelowAverage = valid
    .filter((item) => item.availability < average)
    .sort((a, b) => a.availability - b.availability)
    .map(({ row, availability }) => ({
      machineName: row.resourceName,
      machineCode: row.resourceCode,
      availability: round1(availability),
      plannedHours: round1(row.plannedHours),
      maintenanceHours: round1(row.maintenanceHours),
      downtimeHours: round1(row.maintenanceHours),
      gapToAverage: round1(average - availability)
    }));

  return {
    averageAvailability: round1(average),
    machinesBelowAverage,
    count: machinesBelowAverage.length,
    totalMachines: valid.length
  };
}

export async function getPcFactoryProductionLineSummary(params: PcFactoryQueryParams): Promise<PcFactoryProductionLineRow[]> {
  const records = await loadRecords(params);
  const groups = new Map<string, AnalyticsRecord[]>();
  for (const record of records) {
    const key = record.productionLine?.trim() || "Sem linha";
    const list = groups.get(key);
    if (list) list.push(record);
    else groups.set(key, [record]);
  }

  const rows: PcFactoryProductionLineRow[] = [];
  for (const [productionLine, list] of Array.from(groups.entries())) {
    const agg = aggregateHours(list);
    rows.push({
      productionLine,
      resourcesCount: new Set(list.map((item) => item.resourceName)).size,
      plannedHours: agg.plannedHours,
      productionHours: agg.productionHours,
      maintenanceHours: agg.maintenanceHours,
      lossHours: agg.lossHours,
      stoppedHours: agg.stoppedHours,
      availabilityPercent: availability(agg)
    });
  }
  return rows.sort((a, b) => b.maintenanceHours - a.maintenanceHours);
}

export async function getPcFactoryGroupSummary(params: PcFactoryQueryParams): Promise<PcFactoryGroupRow[]> {
  return buildGroupSummary(await loadRecords(params));
}

function buildGroupSummary(records: AnalyticsRecord[]): PcFactoryGroupRow[] {
  const groups = new Map<string, AnalyticsRecord[]>();
  for (const record of records) {
    const key = record.groupPortal?.trim() || "Sem grupo";
    const list = groups.get(key);
    if (list) list.push(record);
    else groups.set(key, [record]);
  }

  const rows: PcFactoryGroupRow[] = [];
  for (const [groupPortal, list] of Array.from(groups.entries())) {
    const agg = aggregateHours(list);
    rows.push({
      groupPortal,
      resourcesCount: new Set(list.map((item) => item.resourceName)).size,
      plannedHours: agg.plannedHours,
      maintenanceHours: agg.maintenanceHours,
      mechanicalHours: agg.mechanicalHours,
      electricalHours: agg.electricalHours,
      automationHours: agg.automationHours,
      waitingHours: agg.waitingHours,
      lossHours: agg.lossHours,
      stoppedHours: agg.stoppedHours,
      maintenanceEvents: agg.maintenanceEvents,
      waitingEvents: agg.waitingEvents,
      mttr: mttr(agg.maintenanceHours, agg.maintenanceEvents),
      mtbf: mtbf(agg.plannedHours, agg.maintenanceHours, agg.maintenanceEvents),
      mtta: mtta(agg.waitingHours, agg.waitingEvents),
      availabilityPercent: availability(agg)
    });
  }
  return rows.sort((a, b) => b.maintenanceHours - a.maintenanceHours);
}

/* ------------------------------------------------------------------ */
/* 5. Tendência (sempre mensal — YYYY-MM)                             */
/* ------------------------------------------------------------------ */

/**
 * Evolução SEMPRE mensal (chave YYYY-MM), independente do tamanho do período.
 * Reaproveita a base oficial: horas via aggregateHours (durationHours) e
 * disponibilidade via availability(plannedHours, stoppedHours). Respeita todos
 * os filtros da página (inclusive máquina, via buildWhere → resourceName), pois
 * os registros vêm de loadRecords(params). Ordenação cronológica crescente
 * (YYYY-MM ordena lexicograficamente = cronologicamente).
 */
export async function getPcFactoryTrend(params: PcFactoryQueryParams): Promise<PcFactoryTrendPoint[]> {
  const records = (await loadRecords(params)).filter((r) => r.startDateTime);
  if (records.length === 0) return [];

  const buckets = new Map<string, AnalyticsRecord[]>();
  for (const r of records) {
    const d = r.startDateTime as Date;
    const key = `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}`;
    const list = buckets.get(key);
    if (list) list.push(r);
    else buckets.set(key, [r]);
  }

  return Array.from(buckets.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([period, list]) => {
      const agg = aggregateHours(list);
      return {
        period,
        label: monthLabel(period),
        maintenanceHours: agg.maintenanceHours,
        mechanicalHours: agg.mechanicalHours,
        electricalHours: agg.electricalHours,
        automationHours: agg.automationHours,
        waitingHours: agg.waitingHours,
        plannedHours: agg.plannedHours,
        availabilityPercent: availability(agg)
      };
    });
}

/* ------------------------------------------------------------------ */
/* 5b. Pareto de causas raiz de manutenção                            */
/* ------------------------------------------------------------------ */

/** Quantas causas mostrar antes de agrupar o resto em "Outras causas". */
const ROOT_CAUSE_TOP_N = 10;

/**
 * Pareto das causas raiz dos eventos de manutenção: soma de horas e contagem por
 * `rootCause`, ordenado desc, com % e % acumulado. Causas sem valor caem em
 * "Não informada"; o excedente do top N vira "Outras causas". Usa groupBy (1 query).
 */
export async function getPcFactoryRootCausePareto(params: PcFactoryQueryParams): Promise<PcFactoryRootCauseSlice[]> {
  const grouped = await prisma.pcFactoryRecord.groupBy({
    by: ["rootCause"],
    // MEASURABLE_DURATION: soma horas, então exclui os status abertos como o resto.
    where: {
      AND: [buildWhere(params), { statusCategory: PcFactoryStatusCategory.MANUTENCAO }, MEASURABLE_DURATION]
    },
    _sum: { durationHours: true },
    _count: { _all: true }
  });

  // Mescla null, "" e o placeholder "0" (PC-Factory exporta 0 quando não há causa)
  // no mesmo rótulo "Não informada".
  const merged = new Map<string, { hours: number; events: number }>();
  for (const group of grouped) {
    const raw = group.rootCause?.trim();
    const cause = !raw || raw === "0" ? "Não informada" : raw;
    const current = merged.get(cause) ?? { hours: 0, events: 0 };
    current.hours += group._sum.durationHours ?? 0;
    current.events += group._count._all;
    merged.set(cause, current);
  }

  const sorted = Array.from(merged.entries())
    .map(([cause, value]) => ({ cause, hours: round(value.hours), events: value.events }))
    .filter((item) => item.hours > 0)
    .sort((a, b) => b.hours - a.hours);

  if (sorted.length === 0) return [];

  // Top N + agrupamento do excedente.
  const top = sorted.slice(0, ROOT_CAUSE_TOP_N);
  const rest = sorted.slice(ROOT_CAUSE_TOP_N);
  if (rest.length > 0) {
    top.push({
      cause: "Outras causas",
      hours: round(rest.reduce((sum, item) => sum + item.hours, 0)),
      events: rest.reduce((sum, item) => sum + item.events, 0)
    });
  }

  const total = top.reduce((sum, item) => sum + item.hours, 0);
  let cumulative = 0;
  return top.map((item) => {
    const percent = total > 0 ? round((item.hours / total) * 100) : 0;
    cumulative = round(Math.min(100, cumulative + percent));
    return { ...item, percent, cumulativePercent: cumulative };
  });
}

/* ------------------------------------------------------------------ */
/* 6. Registros paginados                                             */
/* ------------------------------------------------------------------ */

export async function getPcFactoryRecords(params: PcFactoryQueryParams): Promise<PcFactoryRecordsResult> {
  const page = Math.max(1, params.page ?? 1);
  const pageSize = clampPageSize(params.pageSize);
  const where = buildWhere(params);

  const [total, rows] = await Promise.all([
    prisma.pcFactoryRecord.count({ where }),
    prisma.pcFactoryRecord.findMany({
      where,
      orderBy: [{ startDateTime: "desc" }, { createdAt: "desc" }],
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: recordSelect
    })
  ]);

  return {
    data: rows.map(toRecordRow),
    total,
    page,
    pageSize,
    totalPages: Math.max(1, Math.ceil(total / pageSize))
  };
}

const recordSelect = {
  id: true,
  resourceName: true,
  resourceCode: true,
  productionLine: true,
  groupPortal: true,
  sector: true,
  statusRaw: true,
  statusCategory: true,
  maintenanceType: true,
  isMaintenanceKpi: true,
  excludePlannedTime: true,
  startDateTime: true,
  endDateTime: true,
  durationHours: true,
  shift: true,
  orderNumber: true,
  productDescription: true,
  observation: true
} satisfies Prisma.PcFactoryRecordSelect;

type RecordPayload = Prisma.PcFactoryRecordGetPayload<{ select: typeof recordSelect }>;

function toRecordRow(record: RecordPayload): PcFactoryRecordRow {
  return {
    id: record.id,
    resourceName: record.resourceName,
    resourceCode: record.resourceCode,
    productionLine: record.productionLine,
    groupPortal: record.groupPortal,
    sector: record.sector,
    statusRaw: record.statusRaw,
    statusCategory: record.statusCategory,
    classificationLabel: PC_FACTORY_CATEGORY_LABELS[record.statusCategory],
    maintenanceType: record.maintenanceType,
    isMaintenance: record.statusCategory === PcFactoryStatusCategory.MANUTENCAO,
    isMaintenanceKpi: record.isMaintenanceKpi,
    isInPlannedTime: !record.excludePlannedTime,
    startDateTime: record.startDateTime ? record.startDateTime.toISOString() : null,
    endDateTime: record.endDateTime ? record.endDateTime.toISOString() : null,
    durationHours: round(record.durationHours),
    shift: record.shift,
    orderNumber: record.orderNumber,
    productDescription: record.productDescription,
    observation: record.observation
  };
}

function clampPageSize(value?: number): number {
  const allowed = [25, 50, 100];
  return value && allowed.includes(value) ? value : DEFAULT_PAGE_SIZE;
}

/* ------------------------------------------------------------------ */
/* 7. Detalhe da máquina/recurso                                      */
/* ------------------------------------------------------------------ */

export async function getPcFactoryResourceDetails(resourceCodeOrName: string): Promise<PcFactoryResourceDetails | null> {
  const term = resourceCodeOrName.trim();
  if (!term) return null;

  const where: Prisma.PcFactoryRecordWhereInput = { OR: [{ resourceName: term }, { resourceCode: term }] };

  const [analytics, recent, maintenance] = await Promise.all([
    prisma.pcFactoryRecord.findMany({
      // Soma horas → mesmo filtro de duração mensurável dos KPIs, para o drawer não
      // divergir do card. As listas de registros abaixo NÃO filtram: o usuário precisa
      // ver o status aberto na máquina dele.
      where: { AND: [where, MEASURABLE_DURATION] },
      select: {
        resourceName: true,
        resourceCode: true,
        productionLine: true,
        groupPortal: true,
        sector: true,
        statusRaw: true,
        statusKey: true,
        statusColorHex: true,
        statusCode: true,
        statusCategory: true,
        managementGroup: true,
        availabilityBucket: true,
        classificationRef: true,
        durationHours: true,
        realDurationHours: true,
        startDateTime: true
      }
    }),
    prisma.pcFactoryRecord.findMany({
      where,
      orderBy: [{ startDateTime: "desc" }, { createdAt: "desc" }],
      take: 25,
      select: recordSelect
    }),
    prisma.pcFactoryRecord.findMany({
      where: { ...where, statusCategory: PcFactoryStatusCategory.MANUTENCAO },
      orderBy: [{ startDateTime: "desc" }, { createdAt: "desc" }],
      take: 25,
      select: recordSelect
    })
  ]);

  if (analytics.length === 0) return null;

  const agg = aggregateHours(analytics);
  const sample = analytics.find((item) => item.resourceCode) ?? analytics[0];
  const availabilityPercent = availability(agg);

  return {
    resourceName: sample.resourceName,
    resourceCode: sample.resourceCode ?? null,
    productionLine: analytics.find((i) => i.productionLine)?.productionLine ?? null,
    groupPortal: analytics.find((i) => i.groupPortal)?.groupPortal ?? null,
    sector: analytics.find((i) => i.sector)?.sector ?? null,
    plannedHours: agg.plannedHours,
    maintenanceHours: agg.maintenanceHours,
    mechanicalHours: agg.mechanicalHours,
    electricalHours: agg.electricalHours,
    automationHours: agg.automationHours,
    waitingHours: agg.waitingHours,
    stoppedHours: agg.stoppedHours,
    maintenanceEvents: agg.maintenanceEvents,
    waitingEvents: agg.waitingEvents,
    mttr: mttr(agg.maintenanceHours, agg.maintenanceEvents),
    mtbf: mtbf(agg.plannedHours, agg.maintenanceHours, agg.maintenanceEvents),
    mtta: mtta(agg.waitingHours, agg.waitingEvents),
    availabilityPercent,
    categoryDistribution: categoryDistributionFromAggregate(agg),
    maintenanceTimeline: maintenance.map(toRecordRow),
    recentRecords: recent.map(toRecordRow),
    recommendations: buildRecommendations(agg, availabilityPercent)
  };
}

function buildRecommendations(agg: HoursAggregate, availabilityPercent: number | null): PcFactoryRecommendation[] {
  const recs: PcFactoryRecommendation[] = [];
  if (agg.maintenanceHours > 0 && agg.mechanicalHours >= agg.maintenanceHours * 0.5) {
    recs.push({ tone: "danger", message: "Máquina com alto impacto de manutenção mecânica." });
  }
  if (agg.waitingHours > 0 && agg.waitingHours >= agg.maintenanceHours * 0.3) {
    recs.push({ tone: "warning", message: "Máquina aguardando manutenção por tempo elevado." });
  }
  if (availabilityPercent !== null && availabilityPercent < 70) {
    recs.push({ tone: "warning", message: "Máquina com baixa disponibilidade estimada." });
  }
  if (agg.maintenanceEvents >= 5) {
    recs.push({ tone: "info", message: "Priorizar análise de causa raiz para recorrência de manutenção." });
  }
  if (recs.length === 0) {
    recs.push({ tone: "info", message: "Operação dentro dos parâmetros no período analisado." });
  }
  return recs;
}

/* ------------------------------------------------------------------ */
/* Opções de filtro                                                   */
/* ------------------------------------------------------------------ */

export async function getPcFactoryFilterOptions(): Promise<PcFactoryFilterOptions> {
  const [resources, lines, groups, sectors, shifts, statusNames] = await Promise.all([
    prisma.pcFactoryRecord.findMany({ select: { resourceName: true }, distinct: ["resourceName"], orderBy: { resourceName: "asc" } }),
    prisma.pcFactoryRecord.findMany({ select: { productionLine: true }, distinct: ["productionLine"], orderBy: { productionLine: "asc" } }),
    prisma.pcFactoryRecord.findMany({ select: { groupPortal: true }, distinct: ["groupPortal"], orderBy: { groupPortal: "asc" } }),
    prisma.pcFactoryRecord.findMany({ select: { sector: true }, distinct: ["sector"], orderBy: { sector: "asc" } }),
    prisma.pcFactoryRecord.findMany({ select: { shift: true }, distinct: ["shift"], orderBy: { shift: "asc" } }),
    prisma.pcFactoryRecord.findMany({ select: { statusRaw: true }, distinct: ["statusRaw"], orderBy: { statusRaw: "asc" } })
  ]);

  const clean = (rows: Array<{ [k: string]: string | null }>, key: string) =>
    rows
      .map((row) => row[key])
      .filter((value): value is string => Boolean(value && value.trim()))
      .map((value) => ({ value, label: value }));

  return {
    resources: resources.map((r) => ({ value: r.resourceName, label: r.resourceName })),
    productionLines: clean(lines, "productionLine"),
    groupPortals: clean(groups, "groupPortal"),
    sectors: clean(sectors, "sector"),
    shifts: clean(shifts, "shift"),
    statusNames: clean(statusNames, "statusRaw"),
    categories: PC_FACTORY_CATEGORY_ORDER.map((category) => ({ value: category, label: PC_FACTORY_CATEGORY_LABELS[category] }))
  };
}

/* ------------------------------------------------------------------ */
/* Orquestrador da página                                             */
/* ------------------------------------------------------------------ */

/**
 * Aba PC-Factory. Uma falha de banco aqui derrubava a página na tela genérica de
 * erro; agora degrada para estado vazio, como já fazem o dashboard e Ordens de
 * Serviço. `resolveReference` é puro (só lê os params), então continua válido
 * mesmo com o banco fora.
 */
export async function getPcFactoryPageData(params: PcFactoryQueryParams = {}): Promise<PcFactoryPageData> {
  try {
    return await loadPcFactoryPageData(params);
  } catch (error) {
    console.error("Falha ao carregar PC-Factory pelo banco. Exibindo estado vazio.", error);
    return emptyPageData(resolveReference(params), "unavailable");
  }
}

async function loadPcFactoryPageData(params: PcFactoryQueryParams): Promise<PcFactoryPageData> {
  const reference = resolveReference(params);
  const totalRecords = await prisma.pcFactoryRecord.count();
  if (totalRecords === 0) return emptyPageData(reference);

  const records = await loadRecords(params);
  const agg = aggregateHours(records);
  const ranking = buildResourceRanking(records);

  const [kpis, productionLines, groupSummary, trend, rootCausePareto, records_, filterOptions, dataQuality] = await Promise.all([
    getPcFactoryDashboardKPIs(params),
    getPcFactoryProductionLineSummary(params),
    getPcFactoryGroupSummary(params),
    getPcFactoryTrend(params),
    getPcFactoryRootCausePareto(params),
    getPcFactoryRecords(params),
    getPcFactoryFilterOptions(),
    buildDataQuality(params)
  ]);

  const criticalResources = [...ranking].filter((r) => r.maintenanceHours > 0).sort((a, b) => b.maintenanceHours - a.maintenanceHours).slice(0, 10);
  const topMechanical = [...ranking].filter((r) => r.mechanicalHours > 0).sort((a, b) => b.mechanicalHours - a.mechanicalHours).slice(0, 10);
  const topElectrical = [...ranking].filter((r) => r.electricalHours > 0).sort((a, b) => b.electricalHours - a.electricalHours).slice(0, 10);
  const topAutomation = [...ranking].filter((r) => r.automationHours > 0).sort((a, b) => b.automationHours - a.automationHours).slice(0, 10);
  const topWaiting = [...ranking].filter((r) => r.waitingHours > 0).sort((a, b) => b.waitingHours - a.waitingHours).slice(0, 10);

  return {
    reference,
    kpis,
    categoryDistribution: categoryDistributionFromAggregate(agg),
    statusDistribution: statusDistributionFromRecords(records),
    managementTable: buildManagementTable(records),
    maintenanceSplit: maintenanceSplitFromAggregate(agg),
    criticalResources,
    reliabilityByMachine: buildReliabilityByMachine(records),
    topMechanical,
    topElectrical,
    topAutomation,
    topWaiting,
    productionLines,
    groupSummary,
    trend,
    rootCausePareto,
    records: records_,
    filterOptions,
    dataQuality,
    source: "database"
  };
}

/** Diagnóstico de qualidade da importação refletido nos dados filtrados (TAREFA 8). */
async function buildDataQuality(params: PcFactoryQueryParams): Promise<PcFactoryDataQuality> {
  const where = buildWhere(params);
  const [totalRecords, recordsWithIssue, openEnded, agg, groups, statuses] = await Promise.all([
    prisma.pcFactoryRecord.count({ where }),
    prisma.pcFactoryRecord.count({ where: { AND: [where, { NOT: { dataQualityIssue: null } }] } }),
    // Status abertos: contagem + horas que eles declaravam e ficaram fora dos indicadores.
    prisma.pcFactoryRecord.aggregate({
      where: { AND: [where, { endDateTime: null }] },
      _count: { _all: true },
      _sum: { durationHours: true }
    }),
    prisma.pcFactoryRecord.aggregate({ where, _min: { startDateTime: true }, _max: { startDateTime: true } }),
    prisma.pcFactoryRecord.findMany({ where, select: { groupPortal: true }, distinct: ["groupPortal"], orderBy: { groupPortal: "asc" } }),
    prisma.pcFactoryRecord.findMany({ where, select: { statusRaw: true }, distinct: ["statusRaw"], orderBy: { statusRaw: "asc" } })
  ]);

  const resourcesDistinct = await prisma.pcFactoryRecord.findMany({ where, select: { resourceName: true }, distinct: ["resourceName"] });
  // Reaproveita os registros já carregados no render (loadRecords é memoizado por params),
  // sem query extra: horas não apontadas + auditoria da fórmula de Disponibilidade.
  const hoursAgg = aggregateHours(await loadRecords(params));
  const breakdown = availabilityBreakdown(hoursAgg);

  return {
    totalRecords,
    periodStart: agg._min.startDateTime ? agg._min.startDateTime.toISOString() : null,
    periodEnd: agg._max.startDateTime ? agg._max.startDateTime.toISOString() : null,
    groupsDetected: groups.map((g) => g.groupPortal).filter((v): v is string => Boolean(v && v.trim())),
    resourcesDetected: resourcesDistinct.length,
    statusDetected: statuses.map((s) => s.statusRaw).filter((v): v is string => Boolean(v && v.trim())),
    recordsWithIssue,
    recordsWithoutEndDate: openEnded._count._all,
    excludedOpenEndedHours: round(openEnded._sum.durationHours ?? 0),
    notReportedHours: breakdown.notReportedHours,
    availabilityAudit: {
      operationalHours: breakdown.operationalHours,
      maintenanceHours: hoursAgg.maintenanceHoursInOperational,
      waitingMaintenanceHours: hoursAgg.waitingHours,
      availabilityPercent: availability(hoursAgg),
      formula: "(operationalHours - maintenanceHours) / operationalHours * 100",
      utilizationPercent: breakdown.utilizationPercent
    }
  };
}

function resolveReference(params: PcFactoryQueryParams): PcFactoryReferencePeriod {
  if (params.startDate && params.endDate) {
    return { startDate: params.startDate, endDate: params.endDate, label: `${formatBr(params.startDate)} a ${formatBr(params.endDate)}` };
  }
  return { startDate: "", endDate: "", label: "Todo o período importado" };
}

/** Resumo enxuto para futura integração com o dashboard principal (TAREFA 12). */
export async function getPcFactoryDashboardSummary(): Promise<PcFactoryDashboardSummary> {
  const totalRecords = await prisma.pcFactoryRecord.count();
  if (totalRecords === 0) {
    return { hasData: false, maintenanceHours: 0, availabilityPercent: null, mttr: null, topMaintenanceResources: [], waitingMaintenanceResources: [] };
  }
  const records = await loadRecords({});
  const agg = aggregateHours(records);
  const ranking = buildResourceRanking(records);
  return {
    hasData: true,
    maintenanceHours: agg.maintenanceHours,
    availabilityPercent: availability(agg),
    mttr: mttr(agg.maintenanceHours, agg.maintenanceEvents),
    topMaintenanceResources: [...ranking]
      .filter((r) => r.maintenanceHours > 0)
      .sort((a, b) => b.maintenanceHours - a.maintenanceHours)
      .slice(0, 5)
      .map((r) => ({ resourceName: r.resourceName, hours: r.maintenanceHours })),
    waitingMaintenanceResources: [...ranking]
      .filter((r) => r.waitingHours > 0)
      .sort((a, b) => b.waitingHours - a.waitingHours)
      .slice(0, 5)
      .map((r) => ({ resourceName: r.resourceName, hours: r.waitingHours }))
  };
}

function emptyPageData(
  reference: PcFactoryReferencePeriod,
  source: PageDataSource = "empty"
): PcFactoryPageData {
  return {
    reference,
    kpis: {
      totalRecords: 0,
      totalResources: 0,
      totalGroups: 0,
      totalProductionLines: 0,
      totalHours: 0,
      plannedHours: 0,
      productionHours: 0,
      maintenanceHours: 0,
      mechanicalMaintenanceHours: 0,
      electricalMaintenanceHours: 0,
      automationMaintenanceHours: 0,
      waitingMaintenanceHours: 0,
      setupHours: 0,
      lossHours: 0,
      operationalHours: 0,
      excludedHours: 0,
      stoppedHours: 0,
      maintenanceEvents: 0,
      mechanicalEvents: 0,
      electricalEvents: 0,
      automationEvents: 0,
      waitingEvents: 0,
      mttr: null,
      mtbf: null,
      mtta: null,
      maintenancePercentOfPlanned: null,
      availabilityPercent: null,
      topMaintenanceResource: null
    },
    categoryDistribution: [],
    statusDistribution: [],
    managementTable: [],
    maintenanceSplit: [],
    criticalResources: [],
    reliabilityByMachine: [],
    topMechanical: [],
    topElectrical: [],
    topAutomation: [],
    topWaiting: [],
    productionLines: [],
    groupSummary: [],
    trend: [],
    rootCausePareto: [],
    records: { data: [], total: 0, page: 1, pageSize: DEFAULT_PAGE_SIZE, totalPages: 1 },
    filterOptions: {
      resources: [],
      productionLines: [],
      groupPortals: [],
      sectors: [],
      shifts: [],
      statusNames: [],
      categories: PC_FACTORY_CATEGORY_ORDER.map((category) => ({ value: category, label: PC_FACTORY_CATEGORY_LABELS[category] }))
    },
    dataQuality: {
      totalRecords: 0,
      periodStart: null,
      periodEnd: null,
      groupsDetected: [],
      resourcesDetected: 0,
      statusDetected: [],
      recordsWithIssue: 0,
      recordsWithoutEndDate: 0,
      excludedOpenEndedHours: 0,
      notReportedHours: 0,
      availabilityAudit: {
        operationalHours: 0,
        maintenanceHours: 0,
        waitingMaintenanceHours: 0,
        availabilityPercent: null,
        formula: "(operationalHours - maintenanceHours) / operationalHours * 100",
        utilizationPercent: null
      }
    },
    source
  };
}

/* ------------------------------------------------------------------ */
/* Helpers                                                            */
/* ------------------------------------------------------------------ */

function round(value: number): number {
  return Math.round(value * 100) / 100;
}

function safeRound(value: number): number | null {
  return Number.isFinite(value) ? round(value) : null;
}

function clampPercent(value: number): number | null {
  if (!Number.isFinite(value)) return null;
  return round(Math.min(100, Math.max(0, value)));
}

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

function monthLabel(period: string): string {
  const [year, month] = period.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, 1))
    .toLocaleDateString("pt-BR", { month: "short", year: "2-digit", timeZone: "UTC" })
    .replace(".", "");
}

function formatBr(iso: string): string {
  const date = new Date(`${iso}T00:00:00.000Z`);
  return Number.isNaN(date.getTime()) ? iso : date.toLocaleDateString("pt-BR", { timeZone: "UTC" });
}
