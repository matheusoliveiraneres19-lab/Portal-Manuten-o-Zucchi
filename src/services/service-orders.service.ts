import { ImportType, MaintenanceArea, Prisma, ServiceOrderStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { toEndOfDay, toStartOfDay } from "@/utils/date-range";
import {
  excludeInvalidTestEquipmentWhere,
  getProgrammedOrderType,
  isClosedServiceOrder,
  isProgrammedPreventiveOrder,
  type ProgrammedOrderType
} from "@/utils/service-order-classification";
import {
  PLANNING_GROUP_LABELS,
  PLANNING_GROUP_ORDER,
  resolvePlanningGroup,
  type PlanningGroupKey
} from "@/utils/service-order-planning";
import { hiddenFilterLabels, optionsFromGroups } from "@/utils/filter-options";
import { formatTechnicalObject } from "@/utils/technical-object-normalizer";
import { detectPartialBaseMonths } from "@/utils/partial-base";
import { buildDataQualitySummary } from "@/services/shared/data-quality";
import type { DataQualityNotice, DataQualitySummary } from "@/types/data-quality";
import type {
  ServiceOrderAdherenceByArea,
  ServiceOrderAreaOrdersResult,
  ServiceOrderAreaStatusFilter,
  ServiceOrderAreaTypeFilter,
  ServiceOrderDashboard,
  ServiceOrderFilterOptions,
  ServiceOrderSlice,
  ServiceOrderListItem,
  ServiceOrdersPageData,
  ServiceOrdersQueryParams,
  ServiceOrdersResult,
  ServiceOrdersSummary,
  ServiceOrderStatusLabel
} from "@/types/service-orders";

const DEFAULT_PAGE = 1;
const DEFAULT_PAGE_SIZE = 50;
const MAX_PAGE_SIZE = 2000;

export async function getServiceOrders(params: ServiceOrdersQueryParams = {}): Promise<ServiceOrdersResult> {
  const page = normalizePage(params.page);
  const pageSize = normalizePageSize(params.pageSize);
  const where = buildServiceOrderWhere(params);

  try {
    const [orders, total] = await Promise.all([
      prisma.serviceOrder.findMany({
        where,
        select: serviceOrderSelect,
        orderBy: [{ openedAt: "desc" }, { osNumber: "asc" }],
        skip: (page - 1) * pageSize,
        take: pageSize
      }),
      prisma.serviceOrder.count({ where })
    ]);

    return {
      data: orders.map(mapServiceOrder),
      total,
      page,
      pageSize,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
      source: "database"
    };
  } catch (error) {
    // NUNCA devolver ordens fictícias: em falha, estado vazio explícito para o
    // gestor não decidir sobre OS que não existem (mesma política do dashboard).
    console.error("Falha ao carregar ordens de serviço pelo banco. Exibindo estado vazio.", error);
    return getEmptyServiceOrders(params);
  }
}

/**
 * Os valores distintos de filtro mudam pouco (só em importações); são cacheados
 * por 120s para evitar reconsultar a cada navegação. Invalide com
 * revalidateTag("service-orders") após uma importação, se necessário.
 */
/**
 * Recorte que define as OPÇÕES de filtro: só o período.
 *
 * Os multi-seleção ficam de fora de propósito — se entrassem, escolher um
 * responsável apagaria os outros da lista e não haveria como trocar sem limpar o
 * filtro antes. O período, sim, tem de valer: é ele que separa "equipamento sem OS
 * neste mês" de "equipamento que não existe".
 */
function filterScopeParams(params: ServiceOrdersQueryParams): ServiceOrdersQueryParams {
  return { startDate: params.startDate, endDate: params.endDate };
}

/**
 * OPÇÕES DOS FILTROS DE OS — a partir do RECORTE, não da tabela inteira.
 *
 * Antes: cinco `distinct` sobre as 19.780 ordens, cacheados por 120 s. Isso listava
 * 689 equipamentos independentemente do período escolhido, e logo após uma importação
 * o filtro e a tabela discordavam por até dois minutos. As duas coisas alimentavam a
 * mesma reclamação: escolher uma opção e cair numa tela vazia.
 *
 * Agora as listas saem de `groupBy` sobre o MESMO where da página (menos os próprios
 * multi-seleção — ver `filterScopeParams`) e trazem a contagem do recorte. O cache
 * saiu junto: ele era por chave fixa e não tem como distinguir períodos diferentes,
 * então continuaria servindo a lista errada para metade das navegações.
 */
async function loadServiceOrderFilterOptions(
  params: ServiceOrdersQueryParams = {}
): Promise<ServiceOrderFilterOptions> {
  const where = buildServiceOrderWhere(filterScopeParams(params));

  const [statuses, areas, planningGroups, responsibles, equipments] = await Promise.all([
    prisma.serviceOrder.groupBy({ by: ["status"], where, _count: true }),
    prisma.serviceOrder.groupBy({ by: ["area"], where, _count: true }),
    prisma.serviceOrder.groupBy({ by: ["planningGroup"], where, _count: true }),
    prisma.serviceOrder.groupBy({ by: ["responsibleName", "responsibleId"], where, _count: true }),
    prisma.serviceOrder.groupBy({ by: ["equipmentCode", "equipmentName"], where, _count: true })
  ]);

  const count = (value: number | { _all: number }) => (typeof value === "number" ? value : value._all);

  // Responsável e equipamento são rotulados (nome + id / nome + código), então a
  // contagem é somada por RÓTULO — dois códigos com o mesmo rótulo viram uma opção só.
  const porResponsavel = new Map<string, number>();
  for (const row of responsibles) {
    const label = row.responsibleName
      ? row.responsibleId
        ? `${row.responsibleName} (${row.responsibleId})`
        : row.responsibleName
      : "SEM RESPONSÁVEL";
    porResponsavel.set(label, (porResponsavel.get(label) ?? 0) + count(row._count));
  }

  const porEquipamento = new Map<string, number>();
  for (const row of equipments) {
    const label = formatTechnicalObject(row.equipmentName, row.equipmentCode);
    if (label === "-") continue;
    porEquipamento.set(label, (porEquipamento.get(label) ?? 0) + count(row._count));
  }

  return {
    statuses: statuses
      .filter((row) => count(row._count) > 0)
      .map((row) => row.status as ServiceOrderStatusLabel)
      .sort(),
    areas: optionsFromGroups(areas, "area").map((option) => option.value),
    planningGroups: optionsFromGroups(planningGroups, "planningGroup").map((option) => option.value),
    responsibles: normalizeResponsibleOptions(Array.from(porResponsavel.keys())),
    equipments: Array.from(porEquipamento.keys()).sort((a, b) => a.localeCompare(b, "pt-BR")),
    counts: {
      areas: Object.fromEntries(optionsFromGroups(areas, "area").map((o) => [o.value, o.count ?? 0])),
      planningGroups: Object.fromEntries(
        optionsFromGroups(planningGroups, "planningGroup").map((o) => [o.value, o.count ?? 0])
      ),
      responsibles: Object.fromEntries(porResponsavel),
      equipments: Object.fromEntries(porEquipamento),
      statuses: Object.fromEntries(statuses.map((row) => [row.status as string, count(row._count)]))
    }
  };
}

export async function getServiceOrderFilterOptions(
  params: ServiceOrdersQueryParams = {}
): Promise<ServiceOrderFilterOptions> {
  try {
    return await loadServiceOrderFilterOptions(params);
  } catch (error) {
    console.error("Falha ao carregar opções de filtros de OS. Exibindo listas vazias.", error);
    return getEmptyFilterOptions();
  }
}

/**
 * Resumo por status do RECORTE FILTRADO.
 *
 * Recebia `()` e contava a base inteira, enquanto a tabela logo abaixo mostrava o
 * filtro: com um período aplicado, os cards falavam de 19.780 ordens e a tabela de
 * algumas centenas. Agora usa o MESMO where da tabela.
 */
export async function getServiceOrdersSummary(params: ServiceOrdersQueryParams = {}): Promise<ServiceOrdersSummary> {
  const base = buildServiceOrderWhere(params);
  try {
    const [
      total,
      abertas,
      liberadas,
      emAndamento,
      aguardandoMaterial,
      fechadas,
      semResponsavel
    ] = await Promise.all([
      prisma.serviceOrder.count({ where: base }),
      prisma.serviceOrder.count({ where: { ...base, status: ServiceOrderStatus.ABERTA } }),
      prisma.serviceOrder.count({ where: { ...base, status: ServiceOrderStatus.LIBERADA } }),
      prisma.serviceOrder.count({ where: { ...base, status: ServiceOrderStatus.EM_ANDAMENTO } }),
      prisma.serviceOrder.count({ where: { ...base, status: ServiceOrderStatus.AGUARDANDO_MATERIAL } }),
      prisma.serviceOrder.count({ where: { ...base, status: ServiceOrderStatus.FECHADA } }),
      prisma.serviceOrder.count({
        where: {
          ...base,
          OR: [
            { responsibleName: null },
            { responsibleName: "" },
            { responsibleName: "SEM RESPONSÁVEL" },
            { responsible: null },
            { responsible: "" }
          ]
        }
      })
    ]);

    return { total, abertas, liberadas, emAndamento, aguardandoMaterial, fechadas, semResponsavel };
  } catch (error) {
    console.error("Falha ao carregar resumo de OS. Exibindo resumo zerado.", error);
    return getEmptySummary();
  }
}

export async function getServiceOrdersPageData(params: ServiceOrdersQueryParams = {}): Promise<ServiceOrdersPageData> {
  const [orders, filterOptions, summary, lastImportAt] = await Promise.all([
    getServiceOrders(params),
    // Os MESMOS params da tela: as opções saem do recorte, não da tabela inteira.
    getServiceOrderFilterOptions(params),
    getServiceOrdersSummary(params),
    getLastServiceOrderImportAt()
  ]);

  const dashboard = await getServiceOrderDashboard(params);

  return {
    orders: orders.data,
    total: orders.total,
    page: orders.page,
    pageSize: orders.pageSize,
    totalPages: orders.totalPages,
    filterOptions,
    summary,
    dashboard,
    dataQuality: await buildServiceOrderDataQuality(dashboard, filterOptions),
    source: orders.source,
    lastImportAt
  };
}

/* ------------------------------------------------------------------ */
/* Dashboard gerencial (FASE 10)                                      */
/* ------------------------------------------------------------------ */

/** Quantos itens entram nos rankings de equipamento/responsável. */
const RANKING_SIZE = 10;

/** Status que contam como "em aberto" na aba. */
const OPEN_STATUSES: ServiceOrderStatus[] = [
  ServiceOrderStatus.ABERTA,
  ServiceOrderStatus.LIBERADA,
  ServiceOrderStatus.EM_ANDAMENTO,
  ServiceOrderStatus.AGUARDANDO_MATERIAL
];

/**
 * CARDS E GRÁFICOS da aba Ordens de Serviço, sobre o recorte filtrado.
 *
 * UMA varredura alimenta tudo. É isso que garante o critério da fase — "todos os
 * números devem bater com a tabela filtrada": cards, gráficos e tabela saem do mesmo
 * `where` e da mesma lista, não de contagens paralelas que divergem no primeiro
 * ajuste de regra.
 *
 * Nada é derivado de campo inexistente. "OS em atraso" não existe aqui porque o model
 * não tem data de vencimento planejada, e "Tipo de atividade" sai vazio enquanto a
 * planilha não trouxer a coluna — os dois viram aviso na tela, não número inventado.
 * Corretiva x planejada usa `isProgrammedPreventiveOrder`, a MESMA regra validada da
 * home, de Preventivas e de Equipamentos Críticos.
 */
export async function getServiceOrderDashboard(
  params: ServiceOrdersQueryParams = {}
): Promise<ServiceOrderDashboard> {
  try {
    const orders = await prisma.serviceOrder.findMany({
      where: buildServiceOrderWhere(params),
      select: {
        osNumber: true,
        status: true,
        statusSapRaw: true,
        title: true,
        openedAt: true,
        closedAt: true,
        workedHours: true,
        equipmentName: true,
        equipmentCode: true,
        responsibleName: true,
        responsibleId: true,
        planningGroup: true,
        planningGroupCode: true,
        planningActivityType: true
      }
    });

    // Mesma lista da varredura: a aderência por área não custa consulta extra.
    const adherence = createAdherenceAccumulator();

    let abertas = 0;
    let fechadas = 0;
    let workedHours = 0;
    let execucaoDias = 0;
    let execucaoAmostra = 0;
    let corretivas = 0;
    let planejadas = 0;
    let temGrupo = false;
    let temTipoAtividade = false;

    const porMes = new Map<string, { abertas: number; fechadas: number }>();
    const porGrupo = new Map<string, number>();
    const porTipoAtividade = new Map<string, number>();
    const porEquipamento = new Map<string, number>();
    const porResponsavel = new Map<string, number>();

    const bucket = (chave: string) => {
      const atual = porMes.get(chave);
      if (atual) return atual;
      const novo = { abertas: 0, fechadas: 0 };
      porMes.set(chave, novo);
      return novo;
    };

    for (const order of orders) {
      adherence.add(order);
      if (OPEN_STATUSES.includes(order.status)) abertas += 1;
      if (order.status === ServiceOrderStatus.FECHADA) fechadas += 1;

      workedHours += order.workedHours ?? 0;

      // Abertas pelo mês de ABERTURA, fechadas pelo mês de FECHAMENTO — é assim que a
      // home já publica a série, e as duas telas precisam contar a mesma coisa.
      if (order.openedAt) bucket(monthKey(order.openedAt)).abertas += 1;
      if (order.closedAt) bucket(monthKey(order.closedAt)).fechadas += 1;

      if (order.openedAt && order.closedAt && order.closedAt >= order.openedAt) {
        execucaoDias += (order.closedAt.getTime() - order.openedAt.getTime()) / 86_400_000;
        execucaoAmostra += 1;
      }

      if (isProgrammedPreventiveOrder(order)) planejadas += 1;
      else corretivas += 1;

      const grupo = order.planningGroup?.trim();
      if (grupo) {
        temGrupo = true;
        porGrupo.set(grupo, (porGrupo.get(grupo) ?? 0) + 1);
      }

      const tipo = order.planningActivityType?.trim();
      if (tipo) {
        temTipoAtividade = true;
        porTipoAtividade.set(tipo, (porTipoAtividade.get(tipo) ?? 0) + 1);
      }

      const equipamento = formatTechnicalObject(order.equipmentName, order.equipmentCode);
      if (equipamento !== "-") porEquipamento.set(equipamento, (porEquipamento.get(equipamento) ?? 0) + 1);

      const responsavel = order.responsibleName?.trim() || "SEM RESPONSÁVEL";
      porResponsavel.set(responsavel, (porResponsavel.get(responsavel) ?? 0) + 1);
    }

    const topEquipments = topSlices(porEquipamento, RANKING_SIZE);
    const topResponsibles = topSlices(porResponsavel, RANKING_SIZE);

    return {
      total: orders.length,
      abertas,
      fechadas,
      workedHours: Math.round(workedHours * 10) / 10,
      averageExecutionDays: execucaoAmostra > 0 ? Math.round((execucaoDias / execucaoAmostra) * 10) / 10 : null,
      executionSampleSize: execucaoAmostra,
      topEquipment: topEquipments[0] ?? null,
      topResponsible: topResponsibles[0] ?? null,

      openClosedByMonth: (() => {
        // A marcação usa as ABERTURAS do mês, que é o volume que mede a cobertura da
        // base; fechamentos podem cair em outro mês por natureza do processo.
        const parciais = detectPartialBaseMonths(
          new Map(Array.from(porMes.entries()).map(([chave, valores]) => [chave, valores.abertas]))
        );
        return Array.from(porMes.entries())
          .sort((a, b) => a[0].localeCompare(b[0]))
          .map(([chave, valores]) => ({ name: monthLabel(chave), ...valores, partialBase: parciais.has(chave) }));
      })(),
      adherenceByArea: adherence.result(params),
      byPlanningGroup: topSlices(porGrupo, RANKING_SIZE),
      byActivityType: topSlices(porTipoAtividade, RANKING_SIZE),
      correctiveVsPlanned: [
        { name: "Corretivas", value: corretivas },
        { name: "Planejadas (PL/PV)", value: planejadas }
      ],
      topEquipments,
      topResponsibles,

      fieldAvailability: {
        planningActivityType: temTipoAtividade,
        planningGroup: temGrupo,
        // O model ServiceOrder não tem data de vencimento planejada. Constante por
        // enquanto, mas declarada como campo para o dia em que a coluna existir.
        dueDate: false
      }
    };
  } catch (error) {
    console.error("Falha ao montar o dashboard de Ordens de Serviço.", error);
    return getEmptyDashboard();
  }
}

/** Chave YYYY-MM (UTC) para agrupar por mês. */
function monthKey(date: Date): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

/** "2026-08" → "ago/26". */
function monthLabel(key: string): string {
  const [ano, mes] = key.split("-").map(Number);
  const rotulo = new Date(Date.UTC(ano, mes - 1, 1))
    .toLocaleDateString("pt-BR", { month: "short", timeZone: "UTC" })
    .replace(".", "");
  return `${rotulo}/${String(ano).slice(2)}`;
}

/** Maiores contagens de um mapa, já no formato dos gráficos. */
function topSlices(counts: Map<string, number>, limit: number): ServiceOrderSlice[] {
  return Array.from(counts.entries())
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value)
    .slice(0, limit);
}

function getEmptyDashboard(): ServiceOrderDashboard {
  return {
    total: 0,
    abertas: 0,
    fechadas: 0,
    workedHours: 0,
    averageExecutionDays: null,
    executionSampleSize: 0,
    topEquipment: null,
    topResponsible: null,
    openClosedByMonth: [],
    adherenceByArea: emptyAdherenceByArea(),
    byPlanningGroup: [],
    byActivityType: [],
    correctiveVsPlanned: [],
    topEquipments: [],
    topResponsibles: [],
    fieldAvailability: { planningActivityType: false, planningGroup: false, dueDate: false }
  };
}

/* ------------------------------------------------------------------ */
/* Aderência de execução por área                                      */
/* ------------------------------------------------------------------ */

/**
 * Regras do painel "Aderência de execução por área" — nenhuma nova:
 *
 *  - UNIDADE = ORDEM DE MANUTENÇÃO (`osNumber` distinto), não a linha da tabela.
 *    Cada linha é uma OPERAÇÃO (chave [osNumber, operationCode]) e uma preventiva
 *    elétrica chega com ~13 delas: contar linhas inflaria a Elétrica e poluiria o
 *    painel. É a mesma unidade do relatório PDF (service-order-adherence-report).
 *  - STATUS — FECHADA = TODAS as operações reconhecidas por `isClosedServiceOrder`
 *    (enum FECHADA, o "Tecnicamente encerrado" do SAP, mais a rede de segurança do
 *    texto cru). Uma operação pendente deixa a ordem em aberto — mesmo desempate do
 *    PDF. ABERTA = todo o resto, inclusive LIBERADA.
 *  - CLASSIFICAÇÃO — PLANEJADA = `isProgrammedPreventiveOrder` (prefixo "PL -" /
 *    "PV -" no título), a regra da home, de Preventivas e de Equipamentos Críticos;
 *    CORRETIVA = o resto. Avaliada no título da ordem: verificado na base, nenhuma
 *    ordem tem título (nem classificação) divergente entre operações.
 *  - Status e classificação são dimensões INDEPENDENTES sobre o MESMO conjunto de
 *    ordens: abertas + fechadas = total = corretivas + planejadas, em cada área.
 *  - ÁREA = `resolvePlanningGroup` (normalizador central), o primeiro grupo
 *    reconhecido entre as operações. Vazio/não reconhecido cai em "Outros", que só
 *    aparece quando tem OS — nenhuma ordem do recorte some da soma.
 */
type AdherenceRow = {
  osNumber: string;
  title: string;
  status: ServiceOrderStatus;
  statusSapRaw: string | null;
  planningGroup: string | null;
  planningGroupCode: string | null;
};

/** Uma ordem consolidada a partir das suas operações. */
type ConsolidatedOrder<Row extends AdherenceRow> = {
  area: PlanningGroupKey;
  closed: boolean;
  /** Plano programado (PL/PV) ou `null` = corretiva. */
  programmedType: ProgrammedOrderType | null;
  /** Operações da ordem, na ordem em que vieram do banco. */
  operations: Row[];
  /** Operações ainda não encerradas. */
  openOperations: Row[];
};

/** Colapsa linhas de operação em uma entrada por `osNumber` (ver regras acima). */
function consolidateOrders<Row extends AdherenceRow>(rows: Row[]): Map<string, ConsolidatedOrder<Row>> {
  const orders = new Map<string, ConsolidatedOrder<Row>>();

  for (const row of rows) {
    const closed = isClosedServiceOrder(row);
    const area = resolvePlanningGroup(row);
    const order = orders.get(row.osNumber);

    if (!order) {
      orders.set(row.osNumber, {
        area,
        closed,
        programmedType: getProgrammedOrderType(row),
        operations: [row],
        openOperations: closed ? [] : [row]
      });
      continue;
    }

    order.operations.push(row);
    if (!closed) {
      order.closed = false;
      order.openOperations.push(row);
    }
    if (order.area === "OUTROS") order.area = area;
  }

  return orders;
}

/** Parte ÷ total × 100 com duas casas; `null` sem denominador. */
function percentOf(part: number, total: number): number | null {
  return total > 0 ? Math.round((part / total) * 10_000) / 100 : null;
}

type AdherenceCounter = { total: number; closed: number; planned: number };

/** Os mesmos campos por área e para o total, a partir de (total, fechadas, planejadas). */
function toAdherenceTotals({ total, closed, planned }: AdherenceCounter) {
  return {
    total,
    open: total - closed,
    closed,
    adherence: percentOf(closed, total),
    corrective: total - planned,
    planned,
    correctivePercent: percentOf(total - planned, total),
    plannedPercent: percentOf(planned, total)
  };
}

function createAdherenceAccumulator() {
  const rows: AdherenceRow[] = [];

  return {
    add(row: AdherenceRow) {
      rows.push(row);
    },
    result(params: ServiceOrdersQueryParams): ServiceOrderAdherenceByArea {
      // UMA agregação: status e classificação saem do mesmo laço, sobre as mesmas ordens.
      const porArea = new Map<PlanningGroupKey, AdherenceCounter>();
      consolidateOrders(rows).forEach((order) => {
        const current = porArea.get(order.area) ?? { total: 0, closed: 0, planned: 0 };
        current.total += 1;
        if (order.closed) current.closed += 1;
        if (order.programmedType) current.planned += 1;
        porArea.set(order.area, current);
      });

      const geral: AdherenceCounter = { total: 0, closed: 0, planned: 0 };
      const areas = PLANNING_GROUP_ORDER.flatMap((key) => {
        const counter = porArea.get(key);
        if (!counter || counter.total === 0) return [];
        geral.total += counter.total;
        geral.closed += counter.closed;
        geral.planned += counter.planned;
        return [{ key, area: PLANNING_GROUP_LABELS[key], ...toAdherenceTotals(counter) }];
      });

      return {
        areas,
        ...toAdherenceTotals(geral),
        operationRows: rows.length,
        ...describeAdherencePeriod(params)
      };
    }
  };
}

/** "AAAA-MM-DD" de hoje no fuso da fábrica — é o "hoje" de quem lê o painel. */
function todayIsoInPlant(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());
}

/**
 * Recorte em andamento = inclui hoje. Sem data final o recorte é "até agora", e
 * portanto também está em andamento.
 */
function describeAdherencePeriod(params: ServiceOrdersQueryParams) {
  const today = todayIsoInPlant();
  const start = params.startDate?.slice(0, 10);
  const end = params.endDate?.slice(0, 10);
  return {
    periodInProgress: (!start || start <= today) && (!end || end >= today),
    singleMonth: Boolean(start && end && start.slice(0, 7) === end.slice(0, 7))
  };
}

function emptyAdherenceByArea(): ServiceOrderAdherenceByArea {
  return {
    areas: [],
    ...toAdherenceTotals({ total: 0, closed: 0, planned: 0 }),
    operationRows: 0,
    periodInProgress: false,
    singleMonth: false
  };
}

const ADHERENCE_ROW_SELECT = {
  osNumber: true,
  title: true,
  status: true,
  statusSapRaw: true,
  planningGroup: true,
  planningGroupCode: true
} satisfies Prisma.ServiceOrderSelect;

/**
 * Aderência por área do recorte, em UMA leitura. A página não usa esta função — ela
 * recebe o mesmo cálculo de dentro de `getServiceOrderDashboard`, sem consulta extra;
 * esta é a porta de entrada para quem precisa só do painel.
 */
export async function getServiceOrderAdherenceByArea(
  params: ServiceOrdersQueryParams = {}
): Promise<ServiceOrderAdherenceByArea> {
  try {
    const rows = await prisma.serviceOrder.findMany({
      where: buildServiceOrderWhere(params),
      select: ADHERENCE_ROW_SELECT
    });
    const adherence = createAdherenceAccumulator();
    rows.forEach((row) => adherence.add(row));
    return adherence.result(params);
  } catch (error) {
    console.error("Falha ao calcular a aderência por área das OS.", error);
    return emptyAdherenceByArea();
  }
}

/** Teto de ordens devolvidas no detalhe de uma área. */
const AREA_ORDERS_LIMIT = 500;

/**
 * DETALHE de uma área ("Análise — Mecânica"): as ORDENS da área no recorte, filtradas
 * por status (abertas/fechadas) e classificação (corretivas/planejadas) — os dois
 * filtros se combinam ("corretivas abertas da Mecânica").
 *
 * UMA consulta, só no clique, sobre o mesmo `where` da página, consolidada com a
 * mesma função do painel — o detalhe não tem como divergir do número da linha.
 * Abertas primeiro, e dentro de cada grupo as mais antigas primeiro.
 */
export async function getServiceOrdersByArea(
  params: ServiceOrdersQueryParams,
  key: PlanningGroupKey,
  filters: { status: ServiceOrderAreaStatusFilter; type: ServiceOrderAreaTypeFilter }
): Promise<ServiceOrderAreaOrdersResult> {
  const rows = await prisma.serviceOrder.findMany({
    where: buildServiceOrderWhere(params),
    select: {
      ...ADHERENCE_ROW_SELECT,
      openedAt: true,
      technicalObjectRaw: true,
      equipmentName: true,
      equipmentCode: true,
      responsibleName: true,
      responsible: true
    },
    orderBy: [{ openedAt: "asc" }, { osNumber: "asc" }, { operationCode: "asc" }]
  });

  const now = Date.now();
  const matching = Array.from(consolidateOrders(rows).entries())
    .filter(([, order]) => order.area === key)
    .filter(([, order]) => filters.status === "all" || order.closed === (filters.status === "closed"))
    .filter(([, order]) => filters.type === "all" || Boolean(order.programmedType) === (filters.type === "planned"))
    // Estável: abertas antes de fechadas, preservando a ordem por data-base do banco.
    .sort(([, a], [, b]) => Number(a.closed) - Number(b.closed));

  return {
    key,
    area: PLANNING_GROUP_LABELS[key],
    status: filters.status,
    type: filters.type,
    totalMatching: matching.length,
    limit: AREA_ORDERS_LIMIT,
    items: matching.slice(0, AREA_ORDERS_LIMIT).map(([osNumber, order]) => {
      const first = order.operations[0];
      // Status exibido: o da primeira operação pendente, que é a que impede o
      // encerramento; ordem encerrada mostra o da primeira operação.
      const shown = order.openOperations[0] ?? first;
      const openedAt = order.operations.find((op) => op.openedAt)?.openedAt ?? null;
      const equipment = order.operations.find((op) => op.technicalObjectRaw || op.equipmentName || op.equipmentCode);
      const responsible = order.operations.find((op) => op.responsibleName || op.responsible);

      return {
        osNumber,
        title: first.title,
        technicalObject: equipment
          ? equipment.technicalObjectRaw ?? formatTechnicalObject(equipment.equipmentName, equipment.equipmentCode)
          : "-",
        responsibleName: responsible ? responsible.responsibleName ?? responsible.responsible : null,
        status: shown.status as ServiceOrderStatusLabel,
        statusSapRaw: shown.statusSapRaw,
        closed: order.closed,
        programmedType: order.programmedType,
        openedAt: openedAt?.toISOString() ?? null,
        daysOpen:
          !order.closed && openedAt ? Math.max(0, Math.floor((now - openedAt.getTime()) / 86_400_000)) : null,
        totalOperations: order.operations.length,
        openOperations: order.openOperations.length
      };
    })
  };
}

/** Painel "Qualidade dos dados" da aba. */
async function buildServiceOrderDataQuality(
  dashboard: ServiceOrderDashboard,
  filterOptions: ServiceOrderFilterOptions
): Promise<DataQualitySummary> {
  const missingFields: string[] = [];
  const notices: DataQualityNotice[] = [];

  if (!dashboard.fieldAvailability.planningActivityType) {
    missingFields.push("Tipo de Atividade");
    notices.push({
      id: "tipo-atividade",
      message: "Indicador \"OS por tipo de atividade\" indisponível: a base importada não possui esse campo.",
      detail:
        "Reimporte a planilha de Ordens com a coluna de tipo de atividade para habilitar o gráfico. Nenhum valor é derivado no lugar dela.",
      tone: "info"
    });
  }

  if (!dashboard.fieldAvailability.dueDate) {
    missingFields.push("Data de vencimento planejada");
    notices.push({
      id: "sem-vencimento",
      message: "Card \"OS em atraso\" indisponível: a base atual não possui data de vencimento planejada.",
      detail:
        "As ordens trazem abertura e fechamento, mas não a data-limite programada — sem ela, atraso não é calculável. O card foi retirado em vez de exibir \"n/d\".",
      tone: "info"
    });
  }

  return buildDataQualitySummary({
    importType: ImportType.ORDENS_SERVICO,
    analyzedRecords: dashboard.total,
    validRecords: dashboard.total,
    ignoredRecords: 0,
    missingFields,
    hiddenFilters: hiddenFilterLabels([
      { label: "Centro / área de trabalho", options: filterOptions.areas },
      { label: "Grupo de planejamento", options: filterOptions.planningGroups },
      { label: "Responsável", options: filterOptions.responsibles },
      { label: "Status da ordem", options: filterOptions.statuses }
    ]),
    removedFilterOptions: 0,
    sourceLabel: "Banco de dados — importação de Ordens de Manutenção (SAP PM), sem registros de teste",
    metrics: [
      {
        label: "Tempo médio de execução",
        value:
          dashboard.averageExecutionDays === null
            ? "—"
            : `${dashboard.averageExecutionDays.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} dias`,
        hint: `sobre ${dashboard.executionSampleSize.toLocaleString("pt-BR")} OS fechadas com as duas datas`
      }
    ],
    notices
  });
}

async function getLastServiceOrderImportAt(): Promise<string | null> {
  try {
    const last = await prisma.importHistory.findFirst({
      where: { type: ImportType.ORDENS_SERVICO },
      orderBy: { createdAt: "desc" },
      select: { createdAt: true }
    });

    return last?.createdAt.toISOString() ?? null;
  } catch (error) {
    console.error("Falha ao carregar última importação de OS.", error);
    return null;
  }
}

const serviceOrderSelect = {
  id: true,
  osNumber: true,
  title: true,
  openedAt: true,
  status: true,
  statusSapRaw: true,
  technicalObjectRaw: true,
  equipmentName: true,
  equipmentCode: true,
  responsible: true,
  responsibleName: true,
  responsibleId: true,
  planningGroup: true,
  planningGroupCode: true,
  workedHours: true,
  operation: true,
  operationCode: true,
  equipment: { select: { name: true, code: true } }
} satisfies Prisma.ServiceOrderSelect;

/**
 * Monta o filtro Prisma com lógica acumulativa:
 * - AND entre grupos de filtros distintos (status E responsável E grupo ...);
 * - OR dentro de cada grupo (status ABERTA ou LIBERADA; responsável Cleiton ou Leonardo).
 */
function buildServiceOrderWhere(params: ServiceOrdersQueryParams): Prisma.ServiceOrderWhereInput {
  // Exclui registros de teste sem equipamento ("Equipamento não informado") de
  // toda a visão principal e contagens da aba Ordens de Serviço.
  const and: Prisma.ServiceOrderWhereInput[] = [excludeInvalidTestEquipmentWhere()];

  if (params.search) {
    const search = contains(params.search);
    and.push({
      OR: [
        { osNumber: search },
        { title: search },
        { equipmentName: search },
        { equipmentCode: search },
        { technicalObjectRaw: search },
        { operation: search },
        { responsibleName: search }
      ]
    });
  }

  if (params.osNumber) {
    const order = contains(params.osNumber);
    and.push({ OR: [{ osNumber: order }, { title: order }] });
  }

  // Status — OR dentro do grupo via `in`.
  const statuses = (params.statuses ?? []).filter(Boolean) as ServiceOrderStatus[];
  if (statuses.length) {
    and.push({ status: { in: statuses } });
  }

  // Objeto técnico — busca textual em nome/código/objeto técnico bruto.
  if (params.equipment) {
    const equipment = contains(params.equipment);
    and.push({
      OR: [{ equipmentName: equipment }, { equipmentCode: equipment }, { technicalObjectRaw: equipment }]
    });
  }

  // Área de manutenção — multi-seleção (OR via `in`).
  const areas = (params.areas ?? [])
    .map((value) => normalizeArea(value))
    .filter((value): value is MaintenanceArea => Boolean(value));
  if (areas.length) {
    and.push({ area: { in: areas } });
  }

  // Grupo de planejamento — multi-seleção (OR via `in`, nome ou código).
  const planningGroups = (params.planningGroups ?? []).filter(Boolean);
  if (planningGroups.length) {
    and.push({
      OR: [{ planningGroup: { in: planningGroups } }, { planningGroupCode: { in: planningGroups } }]
    });
  }

  // Responsável — multi-seleção (OR), tratando "SEM RESPONSÁVEL".
  const responsibleCondition = buildResponsiblesCondition(params.responsibles ?? []);
  if (responsibleCondition) {
    and.push(responsibleCondition);
  }

  // Período (data-base do início) — intervalo.
  if (params.startDate || params.endDate) {
    and.push({
      openedAt: {
        ...(params.startDate ? { gte: toStartOfDay(params.startDate) } : {}),
        ...(params.endDate ? { lte: toEndOfDay(params.endDate) } : {})
      }
    });
  }

  return and.length ? { AND: and } : {};
}

function buildResponsiblesCondition(responsibles: string[]): Prisma.ServiceOrderWhereInput | null {
  const cleaned = responsibles.filter(Boolean);
  if (!cleaned.length) {
    return null;
  }

  const or: Prisma.ServiceOrderWhereInput[] = [];
  for (const responsible of cleaned) {
    if (responsible === "SEM RESPONSÁVEL") {
      or.push({
        OR: [
          { responsibleName: null },
          { responsibleName: "" },
          { responsibleName: "SEM RESPONSÁVEL" },
          { responsible: null },
          { responsible: "" }
        ]
      });
    } else {
      const name = stripResponsibleId(responsible);
      or.push({ OR: [{ responsibleName: name }, { responsible: name }] });
    }
  }

  return { OR: or };
}

function mapServiceOrder(order: Prisma.ServiceOrderGetPayload<{ select: typeof serviceOrderSelect }>): ServiceOrderListItem {
  const equipmentName = order.equipmentName ?? order.equipment?.name ?? null;
  const equipmentCode = order.equipmentCode ?? order.equipment?.code ?? null;

  return {
    id: order.id,
    osNumber: order.osNumber,
    title: order.title,
    openedAt: order.openedAt?.toISOString() ?? null,
    status: order.status as ServiceOrderStatusLabel,
    statusSapRaw: order.statusSapRaw,
    technicalObject: order.technicalObjectRaw ?? formatTechnicalObject(equipmentName, equipmentCode),
    equipmentName,
    equipmentCode,
    responsibleName: order.responsibleName ?? order.responsible,
    responsibleId: order.responsibleId,
    planningGroup: order.planningGroup,
    planningGroupCode: order.planningGroupCode,
    workCenter: formatPlanningGroup(order.planningGroup, order.planningGroupCode),
    workedHours: order.workedHours,
    operation: order.operation,
    operationCode: order.operationCode
  };
}

/* ------------------------------------------------------------------ */
/* Estados vazios de falha (substituem o antigo fallback mockado)      */
/*                                                                    */
/* Quando o banco falha, a aba mostra ESTADO VAZIO — nunca ordens      */
/* fictícias. `source: "empty"` permite à UI avisar que os dados estão */
/* indisponíveis, em vez de apresentar números falsos como reais.      */
/* ------------------------------------------------------------------ */

function getEmptyServiceOrders(params: ServiceOrdersQueryParams): ServiceOrdersResult {
  return {
    data: [],
    total: 0,
    page: normalizePage(params.page),
    pageSize: normalizePageSize(params.pageSize),
    totalPages: 1,
    source: "empty"
  };
}

function getEmptyFilterOptions(): ServiceOrderFilterOptions {
  return {
    statuses: [],
    areas: [],
    planningGroups: [],
    responsibles: [],
    equipments: [],
    counts: { areas: {}, planningGroups: {}, responsibles: {}, equipments: {}, statuses: {} }
  };
}

function getEmptySummary(): ServiceOrdersSummary {
  return {
    total: 0,
    abertas: 0,
    liberadas: 0,
    emAndamento: 0,
    aguardandoMaterial: 0,
    fechadas: 0,
    semResponsavel: 0
  };
}

/**
 * Filtro textual "contém", INSENSÍVEL a caixa — buscar "bomba" encontra "BOMBA"
 * (títulos e objetos técnicos vêm do SAP em maiúsculas). Alinhado ao padrão já
 * usado por purchases, pc-factory, procedures, collaborators e audit.
 */
function contains(value: string): Prisma.StringFilter {
  return { contains: value.trim(), mode: "insensitive" };
}

function normalizePage(value?: number) {
  return Number.isFinite(value) && value && value > 0 ? Math.floor(value) : DEFAULT_PAGE;
}

function normalizePageSize(value?: number) {
  if (!Number.isFinite(value) || !value || value <= 0) {
    return DEFAULT_PAGE_SIZE;
  }

  return Math.min(MAX_PAGE_SIZE, Math.floor(value));
}

function normalizeArea(value: string): MaintenanceArea | null {
  const normalized = normalizeEnumText(value);
  const map: Record<string, MaintenanceArea> = {
    mecanica: MaintenanceArea.MECANICA,
    manut_mecanica: MaintenanceArea.MECANICA,
    mec: MaintenanceArea.MECANICA,
    eletrica: MaintenanceArea.ELETRICA,
    manut_eletrica: MaintenanceArea.ELETRICA,
    ele: MaintenanceArea.ELETRICA,
    lubrificacao: MaintenanceArea.LUBRIFICACAO,
    lub: MaintenanceArea.LUBRIFICACAO,
    pcm: MaintenanceArea.PCM,
    operacional: MaintenanceArea.OPERACIONAL,
    operacao: MaintenanceArea.OPERACIONAL
  };

  return map[normalized] ?? null;
}


function formatPlanningGroup(name: string | null, code: string | null) {
  if (name && code) {
    return `${name} (${code})`;
  }

  return name ?? code ?? null;
}

function stripResponsibleId(value: string) {
  return value.replace(/\s+\([^)]*\)$/, "").trim();
}

function normalizeResponsibleOptions(values: string[]) {
  return Array.from(new Set(values.map((value) => value || "SEM RESPONSÁVEL"))).sort((a, b) =>
    a.localeCompare(b, "pt-BR")
  );
}

function normalizeEnumText(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .toLowerCase();
}
