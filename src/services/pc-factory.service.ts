import { cache } from "react";
import type { PageDataSource } from "@/types/page-data";
import { PcFactoryStatusCategory, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { overlapHours, splitPcFactoryRecordByMonth } from "@/utils/pc-factory-segments";
import { hiddenFilterLabels, optionsFromGroups } from "@/utils/filter-options";
import { labelMachineNames } from "@/utils/technical-object-normalizer";
import { PC_FACTORY_COLORS, PC_FACTORY_MANAGEMENT_GROUP_COLORS } from "@/constants/pc-factory-colors";
import {
  PC_FACTORY_CATEGORY_COLORS,
  PC_FACTORY_CATEGORY_LABELS,
  PC_FACTORY_CATEGORY_ORDER,
  PC_FACTORY_MANAGEMENT_GROUP_LABELS,
  PC_FACTORY_MANAGEMENT_GROUP_ORDER,
  classifyAvailabilityBucket,
  classifyManagementGroup,
  calculateG0134BusinessAvailability,
  calculateMachineG0134Availability,
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
  PcFactoryFilterAudit,
  PcFactoryFilterOptions,
  PcFactoryGroupRow,
  PcFactoryKpis,
  PcFactoryMaintenanceSplit,
  PcFactoryManagementGroupRow,
  PcFactoryPageData,
  PcFactoryPeriodWindowDTO,
  PcFactoryProductionLineRow,
  PcFactoryQueryParams,
  PcFactoryRecommendation,
  PcFactoryRecordRow,
  PcFactoryRecordsResult,
  PcFactoryAvailabilityAudit,
  PcFactoryCalculationMode,
  PcFactoryReferencePeriod,
  PcFactoryReliabilityRow,
  PcFactoryResourceDetails,
  PcFactoryResourceRow,
  PcFactoryRootCauseSlice,
  PcFactoryTopResource,
  PcFactoryTrendPoint
} from "@/types/pc-factory";
import {
  calculateFleetPhysicalAvailability,
  calculateMonthHoursWithinWindow,
  calculatePeriodHours,
  calculatePhysicalAvailability
} from "@/utils/pc-factory-physical-availability";
import { PC_FACTORY_DEFAULT_MODE } from "@/types/pc-factory";
import { listAvailabilityNotesForPeriod } from "@/services/pc-factory-availability-notes.service";

const DEFAULT_PAGE_SIZE = 50;

/* ------------------------------------------------------------------ */
/* Janela do período — denominador da Disponibilidade Física           */
/* ------------------------------------------------------------------ */

/**
 * A janela de tempo do recorte, em horas-calendário. É o DENOMINADOR de toda
 * disponibilidade do módulo (ver `pc-factory-physical-availability`).
 */
export type PcFactoryPeriodWindow = {
  start: Date;
  end: Date;
  /** Horas-calendário do período, POR MÁQUINA (dias × 24). */
  hours: number;
  /**
   * De onde veio a janela:
   *  - "filtro": o usuário escolheu data inicial e/ou final na tela;
   *  - "base": sem filtro de data, usa-se a extensão da base inteira.
   */
  source: "filtro" | "base";
};

/**
 * Extensão TOTAL da base de PC-Factory (primeiro início → último término).
 *
 * Só é consultada quando a tela está sem filtro de período. Memoizada por request
 * (React.cache) porque a home e a aba podem pedir a mesma janela várias vezes.
 */
const loadBaseExtent = cache(async (): Promise<{ start: Date; end: Date } | null> => {
  try {
    const agg = await prisma.pcFactoryRecord.aggregate({
      _min: { startDateTime: true },
      _max: { endDateTime: true, startDateTime: true }
    });
    const start = agg._min.startDateTime;
    // Registro sem término cai no início: a extensão nunca encolhe por causa dele.
    const end = agg._max.endDateTime ?? agg._max.startDateTime;
    if (!start || !end || end < start) return null;
    return { start, end };
  } catch (error) {
    console.error("Falha ao medir a extensão da base PC-Factory.", error);
    return null;
  }
});

/**
 * JANELA DO PERÍODO do recorte — fonte ÚNICA do "Tempo Total do Período".
 *
 * Regras, nesta ordem:
 *  1. o filtro da tela manda. Com as duas datas, a janela é exatamente ela, e
 *     `calculatePeriodHours` conta dias civis inclusivos (01/08→31/08 = 744 h).
 *  2. com só uma das pontas, a outra vem da extensão da base;
 *  3. sem filtro nenhum, a janela é a extensão da base inteira.
 *
 * A janela é GLOBAL à consulta, nunca por máquina. Derivar o período do primeiro
 * registro de cada máquina seria inferir data de entrada em operação a partir do
 * PC-Factory — inferência insegura e explicitamente descartada: a base não tem
 * cadastro de vigência de recurso. A regra gerencial documentada é que toda
 * máquina válida conta como disponível 24 h/dia durante todo o período.
 */
export const resolvePeriodWindow = cache(
  async (params: PcFactoryQueryParams = {}): Promise<PcFactoryPeriodWindow> => {
    const hasStart = Boolean(params.startDate);
    const hasEnd = Boolean(params.endDate);

    if (hasStart && hasEnd) {
      return {
        start: new Date(`${params.startDate}T00:00:00.000Z`),
        end: new Date(`${params.endDate}T23:59:59.999Z`),
        hours: calculatePeriodHours(params.startDate as string, params.endDate as string),
        source: "filtro"
      };
    }

    const extent = await loadBaseExtent();
    if (!extent) {
      // Base vazia: sem período não há denominador, e a disponibilidade sai null.
      const now = new Date();
      return { start: now, end: now, hours: 0, source: "base" };
    }

    const start = hasStart ? new Date(`${params.startDate}T00:00:00.000Z`) : extent.start;
    const end = hasEnd ? new Date(`${params.endDate}T23:59:59.999Z`) : extent.end;

    return {
      start,
      end,
      // Uma das pontas é timestamp real da base: diferença exata, sem supor mês cheio.
      hours: calculatePeriodHours(start, end),
      source: hasStart || hasEnd ? "filtro" : "base"
    };
  }
);

/**
 * A MESMA janela que virou denominador da fórmula, serializada em "YYYY-MM-DD"
 * para atravessar server→client e servir de chave de período das justificativas.
 *
 * Só formata o que `resolvePeriodWindow` já devolveu — não recalcula nada, para
 * não abrir uma segunda fonte de verdade sobre o período.
 */
function toPeriodWindowDTO(window: PcFactoryPeriodWindow): PcFactoryPeriodWindowDTO {
  const startDate = window.start.toISOString().slice(0, 10);
  const endDate = window.end.toISOString().slice(0, 10);
  return {
    startDate,
    endDate,
    label: `${formatBr(startDate)} a ${formatBr(endDate)}`,
    totalHours: window.hours,
    source: window.source
  };
}

/**
 * Decisão de negócio (confirmada): Setup conta como parada/perda operacional e,
 * portanto, reduz a disponibilidade. Para tratar Setup como tempo neutro, basta
 * mudar esta constante para false.
 */
const SETUP_COUNTS_AS_LOSS = true;

/* ------------------------------------------------------------------ */
/* Where + carregamento de registros                                  */
/* ------------------------------------------------------------------ */

/** Limites UTC do filtro de período, ou null quando o filtro não foi usado. */
function periodBounds(params: PcFactoryQueryParams): { start: Date | null; end: Date | null } {
  return {
    start: params.startDate ? new Date(`${params.startDate}T00:00:00.000Z`) : null,
    end: params.endDate ? new Date(`${params.endDate}T23:59:59.999Z`) : null
  };
}

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

  // Período por SOBREPOSIÇÃO, não por contenção (TAREFA 9).
  //
  // A versão anterior comparava só `startDateTime`, então um registro que
  // começou em 31/08 e terminou em 02/09 sumia de um filtro de setembro — as
  // horas dele em setembro eram simplesmente perdidas. A condição correta é
  // "começou antes do fim da janela E terminou depois do início dela".
  //
  // `endDateTime` nulo (registro sem término utilizável) recai no comportamento
  // antigo: vale como evento pontual no instante de início.
  //
  // As horas ainda são recortadas à janela em `loadRecords`, senão um registro
  // que atravessa a fronteira contaria integralmente nos dois períodos.
  const bounds = periodBounds(params);
  if (bounds.start || bounds.end) {
    if (resolveMode(params) === "G0134_OFICIAL") {
      // Modo oficial: o registro pertence ao período em que COMEÇOU, inteiro.
      // É assim que o G0134 agrupa — uma manutenção que vira o mês conta toda no
      // mês de abertura. Sem isso o portal nunca fecha com o relatório.
      const dentro: Prisma.PcFactoryRecordWhereInput = { startDateTime: {} };
      if (bounds.start) (dentro.startDateTime as Prisma.DateTimeFilter).gte = bounds.start;
      if (bounds.end) (dentro.startDateTime as Prisma.DateTimeFilter).lte = bounds.end;
      and.push(dentro);
    } else {
      const overlap: Prisma.PcFactoryRecordWhereInput[] = [];
      if (bounds.end) overlap.push({ startDateTime: { lte: bounds.end } });
      if (bounds.start) {
        overlap.push({
          OR: [
            { endDateTime: { gte: bounds.start } },
            { endDateTime: null, startDateTime: { gte: bounds.start } }
          ]
        });
      }
      and.push({ AND: overlap });
    }
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

/** Modo pedido, ou o padrão da tela. */
function resolveMode(params: PcFactoryQueryParams): PcFactoryCalculationMode {
  return params.mode ?? PC_FACTORY_DEFAULT_MODE;
}

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
  endDateTime: Date | null;
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
  const rows = await prisma.pcFactoryRecord.findMany({
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
      startDateTime: true,
      endDateTime: true
    }
  });

  const bounds = periodBounds(params);
  if (!bounds.start && !bounds.end) return rows;

  // Modo oficial: nada de recorte. O `where` já trouxe só o que COMEÇA na janela,
  // e a duração vai inteira para o período — inclusive a parte que vaza para o mês
  // seguinte. É essa soma que o G0134 publica.
  if (resolveMode(params) === "G0134_OFICIAL") return rows;

  // Recorte à janela filtrada (TAREFA 9). `overlapHours` rateia durationHours —
  // a base oficial — pela fração do intervalo que cai dentro do período.
  //
  // Feito UMA vez, aqui: todas as agregações a jusante (KPIs, disponibilidade,
  // ranking, confiabilidade, composição) leem `durationHours` via metricHours()
  // e passam a ver a fatia correta sem que nenhuma delas precise mudar. A
  // FÓRMULA da disponibilidade continua exatamente a mesma; o que muda é a
  // atribuição das horas ao período.
  return rows.map((row) => {
    const clipped = overlapHours(row, bounds.start, bounds.end);
    // As DATAS também são recortadas, não só as horas. Sem isto, um registro de
    // 31/08 a 02/09 filtrado em agosto entraria com as horas já recortadas mas
    // com o intervalo inteiro — e a tendência (que segmenta por mês) espalharia
    // horas de agosto para dentro de setembro, fora da janela pedida.
    // Recortado, o registro passa a ser exatamente "a parte do evento dentro do
    // período", e todo o resto do pipeline fica coerente.
    const start = clampStart(row.startDateTime, bounds.start);
    const end = clampEnd(row.endDateTime, bounds.end);
    if (clipped === row.durationHours && start === row.startDateTime && end === row.endDateTime) return row;
    return { ...row, durationHours: clipped, startDateTime: start, endDateTime: end };
  });
});

/** Início recortado ao começo da janela (o evento pode ter começado antes). */
function clampStart(value: Date | null, bound: Date | null): Date | null {
  if (!value || !bound) return value;
  return value.getTime() < bound.getTime() ? bound : value;
}

/** Término recortado ao fim da janela (o evento pode continuar depois). */
function clampEnd(value: Date | null, bound: Date | null): Date | null {
  if (!value || !bound) return value;
  return value.getTime() > bound.getTime() ? bound : value;
}

/**
 * Bucket oficial do registro — SEMPRE recalculado pela regra vigente.
 *
 * A coluna `availabilityBucket` gravada na importação é só um cache: a base atual foi
 * importada quando Refeição, Limpeza e Manutenção Planejada ainda saíam do Tempo
 * Operacional. Confiar no valor gravado congelaria a regra ANTIGA até alguém reimportar
 * — e a Disponibilidade continuaria errada com o dado certo no banco.
 *
 * Classificar aqui é uma busca em mapa por registro, barata perto da consulta.
 * O valor gravado só entra quando não há statusCode nem nome para classificar.
 */
function resolveBucket(record: AnalyticsRecord): PcFactoryAvailabilityBucket {
  const hasSignal = Boolean(record.statusCode || record.statusRaw || record.classificationRef);
  if (hasSignal) {
    return classifyAvailabilityBucket({
      statusCode: record.statusCode,
      statusRaw: record.statusRaw,
      classificationRef: record.classificationRef
    });
  }

  const stored = record.availabilityBucket;
  if (stored === "PRODUCAO") return "PRODUCAO";
  if (stored === "PARADA_PLANEJADA") return "PARADA_PLANEJADA";
  if (stored === "PARADA_NAO_PLANEJADA") return "PARADA_NAO_PLANEJADA";
  if (stored === "FORA_DE_TURNO") return "FORA_DE_TURNO";
  if (stored === "RECURSO_NAO_PROGRAMADO") return "RECURSO_NAO_PROGRAMADO";
  if (stored === "NAO_APONTADO") return "NAO_APONTADO";
  return "PARADA_NAO_PLANEJADA";
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
   * Manutenção = Mecânica + Elétrica + Automação + Planejada + Terceiros + Aguardando.
   *
   * Número ÚNICO: é o mesmo no card "Horas de Manutenção", na fórmula da
   * Disponibilidade e na auditoria. Existiam dois (`maintenanceHoursInOperational`
   * excluía a Manutenção Planejada, então o card mostrava ~971 h e a fórmula usava
   * ~923,6 h); como agora nenhuma manutenção sai do Tempo Operacional, não há mais o
   * que separar — e um só número não pode divergir de si mesmo.
   */
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
function g0134Availability(agg: HoursAggregate): number | null {
  return calculateG0134BusinessAvailability({
    operationalHours: availabilityBreakdown(agg).operationalHours,
    maintenanceHours: agg.maintenanceHours
  });
}

/** Recursos distintos no recorte — as "máquinas válidas" do denominador agregado. */
function countMachines(records: AnalyticsRecord[]): number {
  return new Set(records.map((record) => record.resourceName)).size;
}

/**
 * DISPONIBILIDADE FÍSICA DE UM CONJUNTO de máquinas (frota, grupo de área, linha,
 * mês da evolução). Fonte única dos percentuais agregados do módulo.
 *
 *     Tempo Total = horas do período × nº de máquinas válidas
 *     Paradas     = Σ horas de manutenção (os seis subtipos) do conjunto
 *
 * `agg.maintenanceHours` é a soma da categoria MANUTENÇÃO, que são exatamente os
 * seis subtipos — o mesmo número que a coluna "Paradas" da tabela por máquina.
 *
 * Ponderado pelo tempo, NUNCA média simples dos percentuais individuais: com 10
 * máquinas em agosto o denominador é 744 × 10 = 7.440 h.
 */
function fleetAvailability(records: AnalyticsRecord[], agg: HoursAggregate, periodHours: number): number | null {
  return calculateFleetPhysicalAvailability({
    periodHoursPerMachine: periodHours,
    machineCount: countMachines(records),
    downtimeHours: agg.maintenanceHours
  }).availabilityPercent;
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

function buildResourceRanking(records: AnalyticsRecord[], periodHours: number): PcFactoryResourceRow[] {
  const groups = new Map<string, AnalyticsRecord[]>();
  for (const record of records) {
    const list = groups.get(record.resourceName);
    if (list) list.push(record);
    else groups.set(record.resourceName, [record]);
  }

  const rows: PcFactoryResourceRow[] = [];
  for (const [resourceName, list] of Array.from(groups.entries())) {
    const agg = aggregateHours(list);
    // Uma máquina: o tempo-calendário do período vale uma vez.
    const physical = calculatePhysicalAvailability({
      totalPeriodHours: periodHours,
      downtimeHours: agg.maintenanceHours
    });
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
      periodHours: physical.totalPeriodHours,
      downtimeHours: physical.downtimeHours,
      availableHours: physical.availableHours,
      availabilityPercent: physical.availabilityPercent,
      g0134AvailabilityPercent: g0134Availability(agg)
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
 *  - Reparo (repairHours)   = Mecânica + Elétrica + Automação + Terceiros. É o reparo
 *                             CORRETIVO e só ele entra no MTTR: "Aguardando Manutenção"
 *                             é MTTA, e "Manutenção Planejada" não é quebra — somá-la ao
 *                             numerador sem somar ao contador de quebras inflaria o MTTR.
 *  - Planejada (planned)    = "Manutenção Planejada" — entra nas Paradas (e portanto na
 *                             Disponibilidade), mas fica fora de MTTR/MTTA/quebras.
 *  - Aguardando (waiting)   = "Aguardando Manutenção" — entra no MTTA e nas Paradas.
 *  - Quebras (failureEvents)= eventos de Mecânica+Elétrica+Automação+Terceiros+Aguardando
 *                             (exclui Planejada — manutenção preventiva não é falha).
 *  - Paradas (downtime)     = repair + planejada + aguardando = os SEIS subtipos, o mesmo
 *                             número do card "Horas de Manutenção" e do numerador da
 *                             Disponibilidade. Uma conta só para os três lugares.
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
 *  - MTBF = Tempo Operacional / quebras           (Operacional = Carga − Setup)
 *  - MTTR = repairHours / quebras                 (só tempo de reparo)
 *  - MTTA = waitingHours / quebras
 *  - Disponibilidade = (Tempo Operacional − paradas de manutenção) / Tempo Operacional × 100
 *
 * Toda divisão é protegida → null quando não aplicável (UI mostra "—", nunca 0/NaN/Infinity).
 */
export type MachineAvailabilityMetrics = {
  /** Tempo Total do recurso no recorte, antes de qualquer exclusão. */
  totalHours: number;
  outOfShiftHours: number;
  unscheduledResourceHours: number;
  /** Tempo de Carga = Total − Fora de Turno − Recurso Não Programado. */
  loadHours: number;
  /** Paradas planejadas (Setup) dentro da Carga. */
  plannedStopHours: number;
  /** G0134.LOADTIME = Carga − Setup. Denominador ÚNICO da Disponibilidade. */
  loadTimeHours: number;

  mechanicalHours: number;
  electricalHours: number;
  automationHours: number;
  thirdPartyHours: number;
  plannedMaintenanceHours: number;
  /** Reparo CORRETIVO = Mecânica + Elétrica + Automação + Terceiros (numerador do MTTR). */
  repairHours: number;
  /** "Tempo de Manutenção" da planilha = corretiva + Planejada. SEM o Aguardando. */
  maintenanceHours: number;
  /** "Tempo Ag. Manutenção" da planilha. */
  waitingMaintenanceHours: number;
  /** Manutenção + Aguardando = o que a Disponibilidade subtrai (os SEIS subtipos). */
  totalMaintenanceForAvailability: number;

  failureRepairEvents: number;
  waitingEvents: number;
  /** Quebras = eventos corretivos + aguardando. Exclui Planejada (preventiva não é falha). */
  failureEvents: number;

  mtbf: number | null;
  mttr: number | null;
  mtta: number | null;

  /* --- Disponibilidade Física (fórmula OFICIAL do portal) ---------- */
  /** Tempo-calendário do recorte para esta máquina (dias × 24 h). */
  periodHours: number;
  /**
   * HORAS DE PARADA da fórmula = os seis tipos de manutenção. É o MESMO número
   * exibido na coluna "Paradas" da tabela (`totalMaintenanceForAvailability`) —
   * a conferência manual depende de serem idênticos.
   */
  downtimeHours: number;
  /** Tempo Total − Paradas. */
  availableHours: number;
  /** Paradas acima do tempo-calendário: inconsistência de dados, nunca mascarada. */
  downtimeExceedsPeriod: boolean;
  excessDowntimeHours: number;
  /**
   * DISPONIBILIDADE OFICIAL DO PORTAL (Física). null quando não há período.
   * Vem de `calculatePhysicalAvailability()`.
   */
  availabilityPercent: number | null;

  /* --- G0134 (auditoria histórica, fora das telas gerenciais) ------ */
  /**
   * Fórmula ANTERIOR, preservada para comparação durante a transição:
   * (LOADTIME − Manutenção) / LOADTIME × 100. Não alimenta card, tabela nem
   * gráfico — ver scripts/compare-pcfactory-availability-methods.ts.
   */
  g0134AvailabilityPercent: number | null;

  dataQualityIssue: string | null;
};

/**
 * MÉTRICAS DE UMA MÁQUINA no recorte já filtrado — FONTE ÚNICA da linha da tabela
 * "Confiabilidade por Máquina" E do painel lateral "Detalhe da Máquina".
 *
 * Existe exatamente para que os dois não possam divergir: recebem a MESMA lista de
 * registros (mesmo período, mesmo modo, mesmos filtros) e passam pela MESMA conta. Antes
 * o detalhe montava os números por outro caminho e sem filtro nenhum, e a tela mostrava
 * 50,4% / 128,6 h na tabela contra 54,5% / 1.188,8 h no painel da MESMA máquina.
 *
 * Decomposição (base: Tempo Decorrido / durationHours, via metricHours):
 *
 *   Tempo de Carga  = Total − Fora de Turno − Recurso Não Programado
 *   LOADTIME        = Carga − Setup                         (= G0134.LOADTIME)
 *   Manutenção      = Mecânica + Elétrica + Automação + Planejada + Terceiros
 *   Aguardando      = Aguardando Manutenção
 *   Disponibilidade = (LOADTIME − (Manutenção + Aguardando)) / LOADTIME × 100
 *
 * A Disponibilidade sai de `calculateMachineG0134Availability()` — soma direta de horas.
 * MTBF/MTTR/MTTA são calculados aqui ao LADO dela e não entram na conta: mexer em
 * qualquer um deles não pode mover a Disponibilidade em nenhum ponto do módulo.
 *
 * Vale para QUALQUER recurso — não há lista de códigos nem exceção por máquina.
 */
export function buildMachineAvailabilityMetrics(
  records: AnalyticsRecord[],
  periodHours: number
): MachineAvailabilityMetrics {
  let totalHours = 0;
  let outOfShiftHours = 0;
  let unscheduledResourceHours = 0;
  let plannedStopHours = 0;
  let mechanicalHours = 0;
  let electricalHours = 0;
  let automationHours = 0;
  let thirdPartyHours = 0;
  let plannedMaintenanceHours = 0;
  let waitingMaintenanceHours = 0;
  /** Eventos que são FALHA (sem Planejada): é o divisor de MTBF/MTTR/MTTA. */
  let failureRepairEvents = 0;
  let waitingEvents = 0;

  for (const record of records) {
    const hours = metricHours(record); // Tempo Decorrido (durationHours) — base oficial
    totalHours += hours;

    // Fora de Turno / Recurso Não Programado saem da Carga — usa o bucket oficial (mesma
    // regra central da Disponibilidade), não a categoria. O tempo NÃO APONTADO permanece,
    // por decisão de 2026-08-05: fica dentro da Carga e, portanto, dentro do LOADTIME.
    const bucket = resolveBucket(record);
    if (bucket === "FORA_DE_TURNO") {
      outOfShiftHours += hours;
      continue;
    }
    if (bucket === "RECURSO_NAO_PROGRAMADO") {
      unscheduledResourceHours += hours;
      continue;
    }
    // Setup sai do LOADTIME (mesmo denominador do card principal e da planilha).
    if (bucket === "PARADA_PLANEJADA") plannedStopHours += hours;

    const kind = maintenanceKind(record.statusRaw);
    if (kind === "MECANICA") {
      mechanicalHours += hours;
      failureRepairEvents += 1;
    } else if (kind === "ELETRICA") {
      electricalHours += hours;
      failureRepairEvents += 1;
    } else if (kind === "AUTOMACAO") {
      automationHours += hours;
      failureRepairEvents += 1;
    } else if (kind === "TERCEIROS") {
      thirdPartyHours += hours;
      failureRepairEvents += 1;
    } else if (kind === "PLANEJADA") {
      // Entra na Manutenção (e na Disponibilidade), mas não no MTTR nem nas quebras:
      // preventiva não é falha, e no numerador do MTTR só inflaria o indicador.
      plannedMaintenanceHours += hours;
    } else if (kind === "AGUARDANDO") {
      waitingMaintenanceHours += hours;
      waitingEvents += 1;
    }
  }

  const loadHours = round(Math.max(0, totalHours - outOfShiftHours - unscheduledResourceHours));
  const repairHours = round(mechanicalHours + electricalHours + automationHours + thirdPartyHours);
  const maintenanceHours = round(repairHours + plannedMaintenanceHours);

  // Decomposição G0134 — mantida para auditoria e para as parcelas de manutenção
  // (maintenanceHours / waiting / total), que a tabela exibe. A DISPONIBILIDADE que
  // sai daqui NÃO é mais a do portal: ver `physical` logo abaixo.
  const availability = calculateMachineG0134Availability({
    loadTimeHours: loadHours - plannedStopHours,
    maintenanceHours,
    waitingMaintenanceHours
  });

  // DISPONIBILIDADE FÍSICA — fórmula oficial. Denominador = tempo-calendário do
  // recorte; numerador = as MESMAS horas de parada já somadas acima (os seis tipos).
  const physical = calculatePhysicalAvailability({
    totalPeriodHours: periodHours,
    downtimeHours: availability.totalMaintenanceForAvailability
  });

  const failureEvents = failureRepairEvents + waitingEvents;
  const operatingHours = round(Math.max(0, loadHours - availability.totalMaintenanceForAvailability));

  return {
    totalHours: round(totalHours),
    outOfShiftHours: round(outOfShiftHours),
    unscheduledResourceHours: round(unscheduledResourceHours),
    loadHours,
    plannedStopHours: round(plannedStopHours),
    loadTimeHours: availability.loadTimeHours,

    mechanicalHours: round(mechanicalHours),
    electricalHours: round(electricalHours),
    automationHours: round(automationHours),
    thirdPartyHours: round(thirdPartyHours),
    plannedMaintenanceHours: round(plannedMaintenanceHours),
    repairHours,
    maintenanceHours: availability.maintenanceHours,
    waitingMaintenanceHours: availability.waitingMaintenanceHours,
    totalMaintenanceForAvailability: availability.totalMaintenanceForAvailability,

    failureRepairEvents,
    waitingEvents,
    failureEvents,

    // MTBF sobre o LOADTIME, a mesma base da Disponibilidade. MTTR estritamente
    // corretivo; MTTA só o Aguardando. Nenhum dos três alimenta a Disponibilidade.
    mtbf: loadHours > 0 && failureEvents > 0 ? safeRound(availability.loadTimeHours / failureEvents) : null,
    mttr: repairHours > 0 && failureEvents > 0 ? safeRound(repairHours / failureEvents) : null,
    mtta:
      availability.waitingMaintenanceHours > 0 && failureEvents > 0
        ? safeRound(availability.waitingMaintenanceHours / failureEvents)
        : null,
    periodHours: physical.totalPeriodHours,
    downtimeHours: physical.downtimeHours,
    availableHours: physical.availableHours,
    downtimeExceedsPeriod: physical.downtimeExceedsPeriod,
    excessDowntimeHours: physical.excessDowntimeHours,
    availabilityPercent: physical.availabilityPercent,
    g0134AvailabilityPercent: availability.availabilityPercent,

    // O aviso de qualidade passa a falar da fórmula em uso. O caso impossível da
    // Disponibilidade Física é parada > calendário (sobreposição/duplicidade) —
    // vem primeiro porque invalida o número, ao contrário dos avisos de LOADTIME,
    // que hoje só afetam o G0134 de auditoria.
    dataQualityIssue: physical.downtimeExceedsPeriod
      ? `Horas de parada (${physical.downtimeHours} h) superiores às horas-calendário do período (${physical.totalPeriodHours} h). Verifique sobreposição ou duplicidade dos registros.`
      : periodHours <= 0
        ? "Sem período definido — disponibilidade não calculável."
        : loadHours <= 0
          ? "Sem tempo de carga no período — indicadores G0134 de auditoria não calculáveis."
          : operatingHours <= 0
            ? "Toda a base de tempo é manutenção (sem produção) — MTBF pouco representativo."
            : null
  };
}

/** Agrupa os registros do recorte por máquina, preservando a ordem de chegada. */
function groupRecordsByMachine(records: AnalyticsRecord[]): Map<string, AnalyticsRecord[]> {
  const groups = new Map<string, AnalyticsRecord[]>();
  for (const record of records) {
    const list = groups.get(record.resourceName);
    if (list) list.push(record);
    else groups.set(record.resourceName, [record]);
  }
  return groups;
}

function buildReliabilityByMachine(records: AnalyticsRecord[], periodHours: number): PcFactoryReliabilityRow[] {
  const rows: PcFactoryReliabilityRow[] = [];

  for (const [machineName, list] of Array.from(groupRecordsByMachine(records).entries())) {
    const metrics = buildMachineAvailabilityMetrics(list, periodHours);

    // Entra toda máquina com tempo medido no recorte. Antes o corte era
    // `failureEvents <= 0`, e isso escondia as máquinas SEM quebra — justamente as
    // que estão bem: em agosto/2026 eram 11 de 32, e a tabela virava uma lista só de
    // problemas, sem como ver a frota inteira. Quebras zero é resultado, não ausência
    // de dado: a linha mostra 0 quebras, MTBF/MTTR/MTTA em "—" (indefinidos, nunca
    // zero inventado) e a disponibilidade real.
    //
    // Máquina sem NENHUMA hora medida continua fora: não há o que exibir nela.
    if (metrics.totalHours <= 0) continue;

    const sample = list.find((item) => item.resourceCode) ?? list[0];

    rows.push({
      machineName,
      machineCode: sample.resourceCode ?? null,
      productionLine: list.find((item) => item.productionLine)?.productionLine ?? null,
      groupPortal: list.find((item) => item.groupPortal)?.groupPortal ?? null,
      plannedHours: metrics.loadHours,
      operatingHours: round(Math.max(0, metrics.loadHours - metrics.totalMaintenanceForAvailability)),
      loadTimeHours: metrics.loadTimeHours,
      plannedStopHours: metrics.plannedStopHours,
      failureEvents: metrics.failureEvents,
      repairHours: metrics.repairHours,
      plannedMaintenanceHours: metrics.plannedMaintenanceHours,
      maintenanceHours: metrics.maintenanceHours,
      waitingMaintenanceHours: metrics.waitingMaintenanceHours,
      maintenanceDowntimeHours: metrics.totalMaintenanceForAvailability,
      mtbf: metrics.mtbf,
      mttr: metrics.mttr,
      mtta: metrics.mtta,
      downtimeHours: metrics.totalMaintenanceForAvailability,
      periodHours: metrics.periodHours,
      availableHours: metrics.availableHours,
      downtimeExceedsPeriod: metrics.downtimeExceedsPeriod,
      availability: metrics.availabilityPercent,
      g0134Availability: metrics.g0134AvailabilityPercent,
      dataQualityIssue: metrics.dataQualityIssue
    });
  }

  // Mais críticas primeiro (mais horas de parada de manutenção).
  return rows.sort((a, b) => b.maintenanceDowntimeHours - a.maintenanceDowntimeHours);
}

export async function getPcFactoryReliabilityByMachine(params: PcFactoryQueryParams): Promise<PcFactoryReliabilityRow[]> {
  const [records, period] = await Promise.all([loadRecords(params), resolvePeriodWindow(params)]);
  return buildReliabilityByMachine(records, period.hours);
}

/** Uma máquina do recorte com a identificação dela e as métricas da fórmula G0134. */
export type PcFactoryMachineAvailabilityRow = MachineAvailabilityMetrics & {
  machineName: string;
  machineCode: string | null;
  productionLine: string | null;
  groupPortal: string | null;
};

/**
 * Disponibilidade G0134 de TODAS as máquinas do recorte, inclusive as que não tiveram
 * nenhuma quebra no período.
 *
 * Diferença para `getPcFactoryReliabilityByMachine`: aquela alimenta o painel de
 * CONFIABILIDADE e por isso lista só quem quebrou (sem quebras não há MTBF/MTTR/MTTA a
 * mostrar). Esta existe para conferência contra o relatório oficial, onde uma máquina com
 * 100% de disponibilidade também tem linha. As duas passam pela MESMA
 * `buildMachineAvailabilityMetrics()`, então não podem discordar da disponibilidade.
 */
export async function getPcFactoryAvailabilityByMachine(
  params: PcFactoryQueryParams
): Promise<PcFactoryMachineAvailabilityRow[]> {
  const [records, period] = await Promise.all([loadRecords(params), resolvePeriodWindow(params)]);
  const rows: PcFactoryMachineAvailabilityRow[] = [];

  for (const [machineName, list] of Array.from(groupRecordsByMachine(records).entries())) {
    const sample = list.find((item) => item.resourceCode) ?? list[0];
    rows.push({
      ...buildMachineAvailabilityMetrics(list, period.hours),
      machineName,
      machineCode: sample.resourceCode ?? null,
      productionLine: list.find((item) => item.productionLine)?.productionLine ?? null,
      groupPortal: list.find((item) => item.groupPortal)?.groupPortal ?? null
    });
  }

  return rows.sort((a, b) => b.totalMaintenanceForAvailability - a.totalMaintenanceForAvailability);
}

/* ------------------------------------------------------------------ */
/* 1. KPIs                                                            */
/* ------------------------------------------------------------------ */

export async function getPcFactoryDashboardKPIs(params: PcFactoryQueryParams): Promise<PcFactoryKpis> {
  const [records, period] = await Promise.all([loadRecords(params), resolvePeriodWindow(params)]);
  const agg = aggregateHours(records);
  const ranking = buildResourceRanking(records, period.hours);
  const fleet = calculateFleetPhysicalAvailability({
    periodHoursPerMachine: period.hours,
    machineCount: countMachines(records),
    downtimeHours: agg.maintenanceHours
  });

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
    // Disponibilidade Física da frota do recorte (ponderada pelo tempo).
    periodHoursPerMachine: fleet.periodHoursPerMachine,
    machineCount: fleet.machineCount,
    totalPeriodHours: fleet.totalPeriodHours,
    downtimeHours: fleet.downtimeHours,
    availableHours: fleet.availableHours,
    downtimeExceedsPeriod: fleet.downtimeExceedsPeriod,
    availabilityPercent: fleet.availabilityPercent,
    g0134AvailabilityPercent: g0134Availability(agg),
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
  const [records, period] = await Promise.all([loadRecords(params), resolvePeriodWindow(params)]);
  return buildResourceRanking(records, period.hours).sort((a, b) => b.maintenanceHours - a.maintenanceHours);
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
 * Usa a DISPONIBILIDADE FÍSICA já calculada por `buildResourceRanking` — a MESMA
 * fórmula e o MESMO tempo-calendário da aba PC-Factory. É isso que impede a home de
 * continuar na regra antiga enquanto a aba já usa a nova: não há conta local aqui.
 * (Esta função já teve fórmula própria uma vez — `(plannedHours − maintenanceHours) /
 * plannedHours` — e por isso divergia do card e da tabela. Não recriar regra local.)
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
  const [records, period] = await Promise.all([loadRecords(params), resolvePeriodWindow(params)]);
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
    // Denominador da linha = horas do período × máquinas da linha (ver fleetAvailability).
    const fleet = calculateFleetPhysicalAvailability({
      periodHoursPerMachine: period.hours,
      machineCount: countMachines(list),
      downtimeHours: agg.maintenanceHours
    });
    rows.push({
      productionLine,
      resourcesCount: fleet.machineCount,
      plannedHours: agg.plannedHours,
      productionHours: agg.productionHours,
      maintenanceHours: agg.maintenanceHours,
      lossHours: agg.lossHours,
      stoppedHours: agg.stoppedHours,
      totalPeriodHours: fleet.totalPeriodHours,
      availableHours: fleet.availableHours,
      availabilityPercent: fleet.availabilityPercent
    });
  }
  return rows.sort((a, b) => b.maintenanceHours - a.maintenanceHours);
}

export async function getPcFactoryGroupSummary(params: PcFactoryQueryParams): Promise<PcFactoryGroupRow[]> {
  const [records, period] = await Promise.all([loadRecords(params), resolvePeriodWindow(params)]);
  return buildGroupSummary(records, period.hours);
}

function buildGroupSummary(records: AnalyticsRecord[], periodHours: number): PcFactoryGroupRow[] {
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
    // GRUPO DE ÁREA (Indústria de Granito / Mármore / Dolomítico / Serraria):
    // Tempo Total = horas do período × máquinas válidas do grupo. Ponderado, nunca
    // média simples das disponibilidades individuais.
    const fleet = calculateFleetPhysicalAvailability({
      periodHoursPerMachine: periodHours,
      machineCount: countMachines(list),
      downtimeHours: agg.maintenanceHours
    });
    rows.push({
      groupPortal,
      resourcesCount: fleet.machineCount,
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
      totalPeriodHours: fleet.totalPeriodHours,
      availableHours: fleet.availableHours,
      availabilityPercent: fleet.availabilityPercent
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
  const [allRecords, period] = await Promise.all([loadRecords(params), resolvePeriodWindow(params)]);
  const records = allRecords.filter((r) => r.startDateTime);
  if (records.length === 0) return [];

  // Um registro que atravessa meses é DIVIDIDO entre eles (TAREFA 9): uma parada
  // de 31/08 a 02/09 deixa de cair inteira em agosto. Cada segmento vira um
  // registro virtual com a fatia de `durationHours` daquele mês, então
  // `aggregateHours` e `availability()` seguem intocados — só recebem as horas
  // no mês certo. A soma dos segmentos reproduz o total original (a trava de
  // 0,01 h é conferida na importação).
  const buckets = new Map<string, AnalyticsRecord[]>();
  for (const r of records) {
    for (const segment of splitPcFactoryRecordByMonth(r)) {
      const virtual: AnalyticsRecord =
        segment.hours === r.durationHours ? r : { ...r, durationHours: segment.hours };
      const list = buckets.get(segment.monthKey);
      if (list) list.push(virtual);
      else buckets.set(segment.monthKey, [virtual]);
    }
  }

  return Array.from(buckets.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([monthKey, list]) => {
      const agg = aggregateHours(list);
      // CADA MÊS TEM O SEU total-calendário — jan 744 h, fev 672 h, abr 720 h — e
      // nunca se aplica o total de um mês a outro. Nas pontas do recorte o mês entra
      // só com a fatia dentro da janela (um filtro de 10/08 a 20/09 dá 22 dias de
      // agosto e 20 de setembro), senão a disponibilidade das bordas sairia alta
      // demais: paradas de meio mês divididas pelo mês cheio.
      const monthHours = calculateMonthHoursWithinWindow(monthKey, period.start, period.end);
      const fleet = calculateFleetPhysicalAvailability({
        periodHoursPerMachine: monthHours,
        machineCount: countMachines(list),
        downtimeHours: agg.maintenanceHours
      });
      return {
        period: monthKey,
        label: monthLabel(monthKey),
        maintenanceHours: agg.maintenanceHours,
        mechanicalHours: agg.mechanicalHours,
        electricalHours: agg.electricalHours,
        automationHours: agg.automationHours,
        waitingHours: agg.waitingHours,
        plannedHours: agg.plannedHours,
        periodHoursPerMachine: fleet.periodHoursPerMachine,
        machineCount: fleet.machineCount,
        totalPeriodHours: fleet.totalPeriodHours,
        availableHours: fleet.availableHours,
        availabilityPercent: fleet.availabilityPercent
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

/**
 * Resolve o termo clicado (nome OU código do recurso) para o NOME do recurso, que é a
 * chave usada por `loadRecords`/`buildReliabilityByMachine` para agrupar por máquina.
 * null quando o recurso não existe na base.
 */
async function resolveResourceName(term: string): Promise<string | null> {
  const exactName = await prisma.pcFactoryRecord.findFirst({
    where: { resourceName: term },
    select: { resourceName: true }
  });
  if (exactName) return exactName.resourceName;

  const byCode = await prisma.pcFactoryRecord.findFirst({
    where: { resourceCode: term },
    select: { resourceName: true }
  });
  return byCode?.resourceName ?? null;
}

/**
 * DETALHE DE UMA MÁQUINA — no MESMO recorte da tela.
 *
 * Antes esta função recebia só o nome do recurso e consultava o histórico COMPLETO,
 * ignorando período, modo de cálculo e todos os demais filtros. Com a tela filtrada em
 * agosto, a tabela mostrava 50,4% / 128,6 h e o painel da mesma máquina mostrava
 * 54,5% / 1.188,8 h — os números do período inteiro importado.
 *
 * Agora ela recebe os `params` da tela e passa por `loadRecords()`, o mesmo funil da
 * tabela: mesmo where, mesmo filtro de duração mensurável, mesmo modo (G0134 oficial ou
 * intervalo real) e o mesmo recorte de horas na fronteira do período. Os indicadores
 * saem de `buildMachineAvailabilityMetrics()`, a MESMA função que monta a linha da
 * tabela — por construção os dois não podem divergir.
 *
 * As listas de registros (histórico recente e eventos de manutenção) seguem o mesmo
 * recorte, mas sem o filtro de duração mensurável: o usuário precisa enxergar o status
 * ABERTO da máquina dele, mesmo que ele não pese nos indicadores.
 */
export async function getPcFactoryResourceDetails(
  resourceCodeOrName: string,
  params: PcFactoryQueryParams = {}
): Promise<PcFactoryResourceDetails | null> {
  const term = resourceCodeOrName.trim();
  if (!term) return null;

  const resourceName = await resolveResourceName(term);
  if (!resourceName) return null;

  // O recorte do painel é o da tela, com o filtro de máquina fixado na clicada.
  const scopedParams: PcFactoryQueryParams = { ...params, resources: [resourceName] };
  const listWhere = buildWhere(scopedParams);

  const [analytics, recent, maintenance] = await Promise.all([
    loadRecords(scopedParams),
    prisma.pcFactoryRecord.findMany({
      where: listWhere,
      orderBy: [{ startDateTime: "desc" }, { createdAt: "desc" }],
      take: 25,
      select: recordSelect
    }),
    prisma.pcFactoryRecord.findMany({
      where: { AND: [listWhere, { statusCategory: PcFactoryStatusCategory.MANUTENCAO }] },
      orderBy: [{ startDateTime: "desc" }, { createdAt: "desc" }],
      take: 25,
      select: recordSelect
    })
  ]);

  if (analytics.length === 0) return null;

  // MESMA função da linha da tabela — é isso que garante o critério "ao clicar numa
  // máquina, os números do detalhe batem com a linha no mesmo filtro".
  // MESMA janela de período da tabela: o painel não pode ter outro denominador.
  const period = await resolvePeriodWindow(params);
  const metrics = buildMachineAvailabilityMetrics(analytics, period.hours);
  const agg = aggregateHours(analytics);
  const sample = analytics.find((item) => item.resourceCode) ?? analytics[0];

  return {
    resourceName: sample.resourceName,
    resourceCode: sample.resourceCode ?? null,
    productionLine: analytics.find((i) => i.productionLine)?.productionLine ?? null,
    groupPortal: analytics.find((i) => i.groupPortal)?.groupPortal ?? null,
    sector: analytics.find((i) => i.sector)?.sector ?? null,
    plannedHours: metrics.loadHours,
    // Manutenção total (os SEIS subtipos) = coluna "Paradas" da tabela. Mesmo número.
    maintenanceHours: metrics.totalMaintenanceForAvailability,
    mechanicalHours: metrics.mechanicalHours,
    electricalHours: metrics.electricalHours,
    automationHours: metrics.automationHours,
    waitingHours: metrics.waitingMaintenanceHours,
    stoppedHours: agg.stoppedHours,
    maintenanceEvents: metrics.failureRepairEvents + metrics.waitingEvents,
    waitingEvents: metrics.waitingEvents,
    // MTTR/MTBF/MTTA com as MESMAS definições da tabela (corretiva ÷ quebras,
    // LOADTIME ÷ quebras, aguardando ÷ quebras). Nenhum deles toca a Disponibilidade.
    mttr: metrics.mttr,
    mtbf: metrics.mtbf,
    mtta: metrics.mtta,
    availabilityPercent: metrics.availabilityPercent,
    availabilityAudit: {
      // Disponibilidade Física — os quatro números que o painel publica e que o
      // gestor confere na mão.
      periodHours: metrics.periodHours,
      downtimeHours: metrics.downtimeHours,
      availableHours: metrics.availableHours,
      availabilityPercent: metrics.availabilityPercent,
      downtimeExceedsPeriod: metrics.downtimeExceedsPeriod,
      // Decomposição G0134, mantida ao lado para auditoria histórica.
      loadTimeHours: metrics.loadTimeHours,
      maintenanceHours: metrics.maintenanceHours,
      waitingMaintenanceHours: metrics.waitingMaintenanceHours,
      totalMaintenanceForAvailability: metrics.totalMaintenanceForAvailability,
      g0134AvailabilityPercent: metrics.g0134AvailabilityPercent,
      totalHours: metrics.totalHours,
      outOfShiftHours: metrics.outOfShiftHours,
      unscheduledResourceHours: metrics.unscheduledResourceHours,
      loadHours: metrics.loadHours,
      plannedStopHours: metrics.plannedStopHours
    },
    periodLabel: describePeriod(params),
    categoryDistribution: categoryDistributionFromAggregate(agg),
    maintenanceTimeline: maintenance.map(toRecordRow),
    recentRecords: recent.map(toRecordRow),
    recommendations: buildRecommendations(agg, metrics.availabilityPercent)
  };
}

/** Rótulo curto do recorte ativo, para o painel deixar o filtro explícito. */
function describePeriod(params: PcFactoryQueryParams): string {
  const format = (value: string) => value.split("-").reverse().join("/");
  if (params.startDate && params.endDate) return `${format(params.startDate)} a ${format(params.endDate)}`;
  if (params.startDate) return `a partir de ${format(params.startDate)}`;
  if (params.endDate) return `até ${format(params.endDate)}`;
  return "período completo importado";
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

/**
 * Recorte que define as OPÇÕES de filtro: período e modo de cálculo, e mais nada.
 *
 * Os multi-seleção (máquina, grupo, linha, status...) ficam de fora de propósito.
 * Se entrassem, escolher "Multifio 04" apagaria todas as outras máquinas da lista e
 * o usuário não teria como trocar de máquina sem limpar o filtro antes.
 */
function filterScopeParams(params: PcFactoryQueryParams): PcFactoryQueryParams {
  return { startDate: params.startDate, endDate: params.endDate, mode: params.mode };
}

/**
 * OPÇÕES DOS FILTROS DA ABA — só o que tem registro no recorte ativo (FASE 4).
 *
 * Antes: `distinct` sobre a tabela inteira. Em agosto/2026 isso listava 83 máquinas
 * para 40 com dados — 43 opções (52% do filtro) abriam uma tela vazia, que foi
 * exatamente a reclamação da gestão. Agora cada lista sai de um `groupBy` sobre o
 * MESMO where da página, e já vem com a contagem do período ao lado do rótulo.
 *
 * Dimensões inexistentes na base (hoje Grupo Portal, Linha/Área, Setor e Turno estão
 * 100% nulas nos 71.638 registros) devolvem lista vazia: a UI não renderiza o campo e
 * declara o filtro escondido no painel de Qualidade dos Dados.
 *
 * Sem `MEASURABLE_DURATION` aqui: a opção some se não houver NENHUM registro visível,
 * não se as horas forem zero. Um status aberto continua aparecendo na tabela de
 * registros, então o filtro dele precisa continuar existindo.
 */
export async function getPcFactoryFilterOptions(params: PcFactoryQueryParams = {}): Promise<PcFactoryFilterOptions> {
  const where = buildWhere(filterScopeParams(params));

  const [resources, lines, groups, sectors, shifts, statusNames, categories] = await Promise.all([
    prisma.pcFactoryRecord.groupBy({ by: ["resourceName"], where, _count: true }),
    prisma.pcFactoryRecord.groupBy({ by: ["productionLine"], where, _count: true }),
    prisma.pcFactoryRecord.groupBy({ by: ["groupPortal"], where, _count: true }),
    prisma.pcFactoryRecord.groupBy({ by: ["sector"], where, _count: true }),
    prisma.pcFactoryRecord.groupBy({ by: ["shift"], where, _count: true }),
    prisma.pcFactoryRecord.groupBy({ by: ["statusRaw"], where, _count: true }),
    prisma.pcFactoryRecord.groupBy({ by: ["statusCategory"], where, _count: true })
  ]);

  const contagemPorCategoria = new Map(categories.map((row) => [row.statusCategory, readGroupCount(row._count)]));

  // O VALOR continua sendo o nome cru — é a chave de agrupamento validada do módulo
  // (resourceCode está 100% nulo, então não há chave técnica alternativa). Só o
  // RÓTULO é normalizado: "Multfio 07 -Skystone" vira "Multifio 07 - Skystone" na
  // lista, sem alterar nenhum cálculo. Nomes que colidiriam após normalizar voltam ao
  // bruto (ver labelMachineNames) — duas linhas idênticas num filtro seriam piores.
  const rotulos = labelMachineNames(resources.map((row) => row.resourceName));

  return {
    resources: optionsFromGroups(resources, "resourceName").map((option) => ({
      ...option,
      label: rotulos.get(option.value) ?? option.label
    })),
    productionLines: optionsFromGroups(lines, "productionLine"),
    groupPortals: optionsFromGroups(groups, "groupPortal"),
    sectors: optionsFromGroups(sectors, "sector"),
    shifts: optionsFromGroups(shifts, "shift"),
    statusNames: optionsFromGroups(statusNames, "statusRaw"),
    // Classificação é uma lista fechada do domínio, não um distinct da base: as que
    // não têm registro no recorte saem, as demais levam a contagem junto.
    categories: PC_FACTORY_CATEGORY_ORDER.filter((category) => (contagemPorCategoria.get(category) ?? 0) > 0).map(
      (category) => ({
        value: category,
        label: PC_FACTORY_CATEGORY_LABELS[category],
        count: contagemPorCategoria.get(category)
      })
    )
  };
}

/** `_count` do groupBy vem como número ou como { _all }. */
function readGroupCount(count: number | { _all: number }): number {
  return typeof count === "number" ? count : count._all;
}

/**
 * Auditoria dos filtros (FASE 4): quantas máquinas existem, quantas sobreviveram ao
 * recorte, quantas chegam à tabela de Confiabilidade e o que foi escondido.
 */
async function buildFilterAudit(
  params: PcFactoryQueryParams,
  options: PcFactoryFilterOptions,
  reliabilityRows: number
): Promise<PcFactoryFilterAudit> {
  const naBase = await prisma.pcFactoryRecord.groupBy({ by: ["resourceName"], _count: true });
  const resourcesInDatabase = naBase.length;
  const resourcesInPeriod = options.resources.length;

  return {
    resourcesInDatabase,
    resourcesInPeriod,
    resourcesInReliabilityTable: reliabilityRows,
    resourcesRemovedFromFilter: Math.max(0, resourcesInDatabase - resourcesInPeriod),
    hiddenFilters: hiddenFilterLabels([
      { label: "Grupo Portal", options: options.groupPortals },
      { label: "Linha / Área", options: options.productionLines },
      { label: "Setor", options: options.sectors },
      { label: "Turno", options: options.shifts },
      { label: "Nome Status Recurso", options: options.statusNames },
      { label: "Classificação", options: options.categories },
      { label: "Máquina / recurso", options: options.resources }
    ])
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

  const [records, period] = await Promise.all([loadRecords(params), resolvePeriodWindow(params)]);
  const agg = aggregateHours(records);
  const ranking = buildResourceRanking(records, period.hours);

  const [kpis, productionLines, groupSummary, trend, rootCausePareto, records_, filterOptions, dataQuality] = await Promise.all([
    getPcFactoryDashboardKPIs(params),
    getPcFactoryProductionLineSummary(params),
    getPcFactoryGroupSummary(params),
    getPcFactoryTrend(params),
    getPcFactoryRootCausePareto(params),
    getPcFactoryRecords(params),
    // Os MESMOS params da tela: as opções saem do recorte, não da base inteira.
    getPcFactoryFilterOptions(params),
    buildDataQuality(params)
  ]);

  const reliabilityByMachine = buildReliabilityByMachine(records, period.hours);
  const filterAudit = await buildFilterAudit(params, filterOptions, reliabilityByMachine.length);

  // Justificativas GERENCIAIS da janela atual. Carregadas DEPOIS de tudo que é
  // cálculo e sem participar de nada acima: se esta consulta falhasse, os números
  // da tela seriam exatamente os mesmos. Chave = janela resolvida, então trocar
  // agosto por setembro devolve outro conjunto (ou nenhum).
  //
  // A falha é engolida DE PROPÓSITO: se esta consulta estourasse, o catch de
  // `getPcFactoryPageData` derrubaria a aba inteira para o estado vazio — e a
  // tela inteira de disponibilidade sumiria por causa de um texto opcional. É o
  // que aconteceria num deploy que suba o código antes da migration. Sem as
  // justificativas a tabela ainda responde a pergunta principal.
  const periodWindow = toPeriodWindowDTO(period);
  const availabilityNotes = await listAvailabilityNotesForPeriod(periodWindow.startDate, periodWindow.endDate).catch(
    (error) => {
      console.error("Falha ao carregar justificativas de disponibilidade. Exibindo a tabela sem elas.", error);
      return [];
    }
  );

  const criticalResources = [...ranking].filter((r) => r.maintenanceHours > 0).sort((a, b) => b.maintenanceHours - a.maintenanceHours).slice(0, 10);
  const topMechanical = [...ranking].filter((r) => r.mechanicalHours > 0).sort((a, b) => b.mechanicalHours - a.mechanicalHours).slice(0, 10);
  const topElectrical = [...ranking].filter((r) => r.electricalHours > 0).sort((a, b) => b.electricalHours - a.electricalHours).slice(0, 10);
  const topAutomation = [...ranking].filter((r) => r.automationHours > 0).sort((a, b) => b.automationHours - a.automationHours).slice(0, 10);
  const topWaiting = [...ranking].filter((r) => r.waitingHours > 0).sort((a, b) => b.waitingHours - a.waitingHours).slice(0, 10);

  return {
    reference,
    periodWindow,
    availabilityNotes,
    kpis,
    categoryDistribution: categoryDistributionFromAggregate(agg),
    statusDistribution: statusDistributionFromRecords(records),
    managementTable: buildManagementTable(records),
    maintenanceSplit: maintenanceSplitFromAggregate(agg),
    criticalResources,
    reliabilityByMachine,
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
    filterAudit,
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
  const auditRecords = await loadRecords(params);
  const hoursAgg = aggregateHours(auditRecords);
  const breakdown = availabilityBreakdown(hoursAgg);
  const period = await resolvePeriodWindow(params);
  const fleet = calculateFleetPhysicalAvailability({
    periodHoursPerMachine: period.hours,
    machineCount: countMachines(auditRecords),
    downtimeHours: hoursAgg.maintenanceHours
  });

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
      mode: resolveMode(params),
      totalHours: breakdown.totalHours,
      outOfShiftHours: breakdown.outOfShiftHours,
      unscheduledResourceHours: breakdown.unscheduledResourceHours,
      loadHours: breakdown.loadHours,
      setupPlannedStopHours: breakdown.plannedStopHours,
      operationalHours: breakdown.operationalHours,
      maintenanceMechanicalHours: hoursAgg.mechanicalHours,
      maintenanceElectricalHours: hoursAgg.electricalHours,
      maintenanceAutomationHours: hoursAgg.automationHours,
      maintenancePlannedHours: hoursAgg.planejadaHours,
      maintenanceThirdPartyHours: hoursAgg.terceirosHours,
      maintenanceWaitingHours: hoursAgg.waitingHours,
      unplannedStopHours: hoursAgg.bucketHours.PARADA_NAO_PLANEJADA,
      productiveHours: hoursAgg.bucketHours.PRODUCAO,
      notPointedHours: hoursAgg.bucketHours.NAO_APONTADO,
      maintenanceHours: hoursAgg.maintenanceHours,
      waitingMaintenanceHours: hoursAgg.waitingHours,

      periodHours: fleet.totalPeriodHours,
      periodHoursPerMachine: fleet.periodHoursPerMachine,
      machineCount: fleet.machineCount,
      downtimeHours: fleet.downtimeHours,
      availableHours: fleet.availableHours,
      downtimeExceedsPeriod: fleet.downtimeExceedsPeriod,
      availabilityPercent: fleet.availabilityPercent,
      formula: "(totalPeriodHours - downtimeHours) / totalPeriodHours * 100",

      g0134AvailabilityPercent: g0134Availability(hoursAgg),
      g0134Formula: "(operationalHours - maintenanceHours) / operationalHours * 100",
      utilizationPercent: breakdown.utilizationPercent
    }
  };
}

/** Auditoria zerada — recorte sem nenhum registro. Nunca NaN, nunca Infinity. */
const EMPTY_AVAILABILITY_AUDIT: PcFactoryAvailabilityAudit = {
  mode: PC_FACTORY_DEFAULT_MODE,
  totalHours: 0,
  outOfShiftHours: 0,
  unscheduledResourceHours: 0,
  loadHours: 0,
  setupPlannedStopHours: 0,
  operationalHours: 0,
  maintenanceMechanicalHours: 0,
  maintenanceElectricalHours: 0,
  maintenanceAutomationHours: 0,
  maintenancePlannedHours: 0,
  maintenanceThirdPartyHours: 0,
  maintenanceWaitingHours: 0,
  unplannedStopHours: 0,
  productiveHours: 0,
  notPointedHours: 0,
  maintenanceHours: 0,
  waitingMaintenanceHours: 0,
  periodHours: 0,
  periodHoursPerMachine: 0,
  machineCount: 0,
  downtimeHours: 0,
  availableHours: 0,
  downtimeExceedsPeriod: false,
  availabilityPercent: null,
  formula: "(totalPeriodHours - downtimeHours) / totalPeriodHours * 100",
  g0134AvailabilityPercent: null,
  g0134Formula: "(operationalHours - maintenanceHours) / operationalHours * 100",
  utilizationPercent: null
};

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
  const [records, period] = await Promise.all([loadRecords({}), resolvePeriodWindow({})]);
  const agg = aggregateHours(records);
  const ranking = buildResourceRanking(records, period.hours);
  return {
    hasData: true,
    maintenanceHours: agg.maintenanceHours,
    availabilityPercent: fleetAvailability(records, agg, period.hours),
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
    // Sem dados não há janela resolvida: cai no que o usuário digitou (ou vazio).
    // A tabela nem chega a renderizar neste estado.
    periodWindow: {
      startDate: reference.startDate,
      endDate: reference.endDate,
      label: reference.label,
      totalHours: 0,
      source: reference.startDate || reference.endDate ? "filtro" : "base"
    },
    availabilityNotes: [],
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
      periodHoursPerMachine: 0,
      machineCount: 0,
      totalPeriodHours: 0,
      downtimeHours: 0,
      availableHours: 0,
      downtimeExceedsPeriod: false,
      availabilityPercent: null,
      g0134AvailabilityPercent: null,
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
      // Sem dados não há opção com registro: a tela vazia não deve oferecer filtro
      // nenhum, senão volta a existir o "filtro morto" que a FASE 4 eliminou.
      categories: []
    },
    filterAudit: {
      resourcesInDatabase: 0,
      resourcesInPeriod: 0,
      resourcesInReliabilityTable: 0,
      resourcesRemovedFromFilter: 0,
      hiddenFilters: []
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
      availabilityAudit: EMPTY_AVAILABILITY_AUDIT
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
