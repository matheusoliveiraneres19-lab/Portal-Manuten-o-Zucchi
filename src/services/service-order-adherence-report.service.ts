/**
 * RELATÓRIO DE ADERÊNCIA À EXECUÇÃO DAS ORDENS DE SERVIÇO — cálculo do dataset.
 *
 * Fonte ÚNICA dos números do relatório. O renderizador de PDF só imprime o que sai
 * daqui; não existe segunda contagem em lugar nenhum.
 *
 * ------------------------------------------------------------------------------
 * DECISÃO 1 — A UNIDADE É A ORDEM, NÃO A LINHA DA TABELA.
 *
 * `ServiceOrder` tem chave única [osNumber, operationCode]: cada linha é uma
 * OPERAÇÃO da ordem, não a ordem. Uma preventiva elétrica chega com 13 operações
 * ("PREPARAR FERRAMENTAS", "LIMPAR O PAINEL"…), e contar linhas multiplicaria a
 * Elétrica por ~5 — em agosto/2026 são 1.508 linhas para 314 ordens. O relatório
 * se chama "ordens de serviço", então conta ORDENS DISTINTAS (`osNumber`).
 *
 * Isso foi verificado contra a base: nas três áreas do relatório, NENHUMA ordem
 * tem status, grupo de planejamento, responsável ou data-base divergentes entre
 * suas operações (0 de 2.265 ordens). A deduplicação é, portanto, sem ambiguidade.
 * `dedupeByOrder` ainda assim resolve divergência de forma explícita, em vez de
 * depender de qual linha o banco devolver primeiro.
 *
 * ------------------------------------------------------------------------------
 * DECISÃO 2 — FECHADA = STATUS FECHADA (o "Tecnicamente encerrado" do SAP).
 *
 * `padronizarStatusOS` (utils/importacao) já mapeia "Tecnicamente encerrado (3)"
 * → `ServiceOrderStatus.FECHADA`; é o status de 18.562 das 18.682 linhas fechadas
 * da base. O reconhecimento usa `isClosedServiceOrder`
 * (utils/service-order-classification), a MESMA regra central da home, de
 * Preventivas e de Equipamentos Críticos — nenhuma classificação nova é criada
 * aqui. Todo o resto do recorte conta como "em aberto", como no relatório de
 * referência, onde ordens liberadas/abertas eram tratadas como não encerradas.
 *
 * ------------------------------------------------------------------------------
 * DECISÃO 3 — ÁREA VEM DO GRUPO DE PLANEJAMENTO, E SÓ DELE.
 *
 * Valores reais na base: "Manut. Mecanica" (MEC), "Manut. Eletrica" (ELE),
 * "Serviço Terceiro" (001), além de Lubrificação, Usinagem e Automação, que ficam
 * fora do relatório. O enum `area` NÃO é usado como reserva de propósito: as
 * ordens de "Serviço Terceiro" têm `area = null`, e as 172 linhas sem grupo são
 * registros de seed de 2024 cujo `area` as jogaria dentro das três áreas sem
 * serem delas. O que fica de fora é publicado na seção "Qualidade dos dados".
 *
 * ------------------------------------------------------------------------------
 * DECISÃO 4 — A DATA É A DATA-BASE DE INÍCIO (`openedAt`).
 *
 * É o campo que a própria aba já usa no filtro de período (ver
 * `buildServiceOrderWhere`: "Período (data-base do início)"). `createdAt` é a data
 * da IMPORTAÇÃO e não tem significado de manutenção — usá-la faria todo o
 * histórico cair no dia em que a planilha foi carregada.
 */
import { Prisma, ServiceOrderStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { toEndOfDay, toStartOfDay } from "@/utils/date-range";
import { excludeInvalidTestEquipmentWhere, isClosedServiceOrder } from "@/utils/service-order-classification";
import {
  ADHERENCE_AREA_LABEL,
  ADHERENCE_AREA_ORDER,
  type AdherenceAreaCollaborators,
  type AdherenceAreaKey,
  type AdherenceAreaTotals,
  type AdherenceCollaboratorRow,
  type AdherenceMonthRow,
  type AdherencePeriod,
  type AdherenceReportDataset,
  type AdherenceReportFilters,
  type AdherenceReportRequest,
  type AdherenceTotals
} from "@/types/service-order-adherence-report";

/** Rótulo usado pela aba (e pelo próprio banco) para ordem sem responsável. */
const SEM_RESPONSAVEL = "SEM RESPONSÁVEL";

/* ------------------------------------------------------------------ */
/* Classificação por área                                             */
/* ------------------------------------------------------------------ */

/** Normaliza texto para comparação: sem acento, minúsculo, sem pontuação. */
function normalize(value: string | null | undefined): string {
  return (value ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/**
 * Grupo de planejamento → área do relatório. `null` quando o grupo está fora do
 * escopo (Lubrificação, Usinagem, Automação) ou vazio.
 *
 * Casa por TEXTO do grupo, tolerante às grafias do SAP ("Manut. Mecanica",
 * "MECANICA", "Serviço Terceiro", "Terceiros"). O código (MEC/ELE) entra apenas
 * como reforço; "001" de propósito não é aceito sozinho, por ser genérico demais
 * para significar "terceiros" em qualquer importação futura.
 */
export function resolveAdherenceArea(order: {
  planningGroup?: string | null;
  planningGroupCode?: string | null;
}): AdherenceAreaKey | null {
  const group = normalize(order.planningGroup);
  const code = normalize(order.planningGroupCode);

  // Lubrificação primeiro: "Lubrificação" não contém "mecanic"/"eletric", mas
  // deixar explícito impede que um grupo futuro como "Lubrif. Mecanica" entre.
  if (group.includes("lubrif") || code === "lub") return null;
  if (group.includes("usinagem") || group.includes("automacao")) return null;

  if (group.includes("mecanic") || code === "mec") return "MECANICA";
  if (group.includes("eletric") || code === "ele") return "ELETRICA";
  if (group.includes("terceir")) return "TERCEIROS";

  return null;
}

/* ------------------------------------------------------------------ */
/* Aritmética da aderência                                            */
/* ------------------------------------------------------------------ */

/**
 * Monta o bloco de totais a partir de (total, fechadas).
 *
 * `total === 0` devolve `aderencia: null` — jamais 0% e jamais NaN. E `fechadas`
 * é limitado a `total` por construção do chamador, o que torna impossível passar
 * de 100% pela fórmula normal.
 */
function toTotals(total: number, fechadas: number): AdherenceTotals {
  return {
    total,
    fechadas,
    abertas: total - fechadas,
    aderencia: total > 0 ? Math.round((fechadas / total) * 1000) / 10 : null
  };
}

/** Acumulador mutável usado durante a varredura. */
type Counter = { total: number; fechadas: number };

function bump(map: Map<string, Counter>, key: string, closed: boolean) {
  const current = map.get(key) ?? { total: 0, fechadas: 0 };
  current.total += 1;
  if (closed) current.fechadas += 1;
  map.set(key, current);
}

/* ------------------------------------------------------------------ */
/* Rótulos de período                                                 */
/* ------------------------------------------------------------------ */

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

const MONTH_SHORT = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

/** "2026-01-01" → { year: 2026, month: 0, day: 1 }, sem passar por fuso. */
function parseIsoDate(value: string): { year: number; month: number; day: number } {
  const [year, month, day] = value.split("-").map(Number);
  return { year, month: month - 1, day };
}

/** Chave "YYYY-MM" de uma data, lida em UTC (é como o banco grava a data-base). */
function monthKeyOf(date: Date): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

/** "31/08/2026" a partir de "2026-08-31". */
function formatBr(iso: string): string {
  const { year, month, day } = parseIsoDate(iso);
  return `${String(day).padStart(2, "0")}/${String(month + 1).padStart(2, "0")}/${year}`;
}

/**
 * Título do período, SEMPRE derivado das datas escolhidas:
 *   mesmo mês e ano  → "AGOSTO DE 2026"
 *   mesmo ano        → "JANEIRO A AGOSTO DE 2026"
 *   anos diferentes  → "NOVEMBRO DE 2025 A MARÇO DE 2026"
 */
function buildTitleLabel(from: string, to: string): string {
  const a = parseIsoDate(from);
  const b = parseIsoDate(to);
  const mesA = MONTH_NAMES[a.month]?.toUpperCase() ?? "";
  const mesB = MONTH_NAMES[b.month]?.toUpperCase() ?? "";

  if (a.year === b.year) {
    return a.month === b.month ? `${mesA} DE ${a.year}` : `${mesA} A ${mesB} DE ${a.year}`;
  }
  return `${mesA} DE ${a.year} A ${mesB} DE ${b.year}`;
}

function buildPeriod(from: string, to: string): AdherencePeriod {
  return {
    from,
    to,
    label: `${formatBr(from)} a ${formatBr(to)}`,
    titleLabel: buildTitleLabel(from, to)
  };
}

/**
 * Todos os meses do intervalo, na ordem — inclusive os que não têm nenhuma OS.
 * Um mês vazio precisa aparecer como "—" no gráfico; omiti-lo faria o eixo
 * mentir sobre a continuidade do período.
 */
function monthsInRange(from: string, to: string): string[] {
  const a = parseIsoDate(from);
  const b = parseIsoDate(to);
  const keys: string[] = [];
  let year = a.year;
  let month = a.month;

  // Guarda de sanidade: 600 meses (50 anos) é muito além de qualquer recorte real.
  for (let guard = 0; guard < 600; guard += 1) {
    if (year > b.year || (year === b.year && month > b.month)) break;
    keys.push(`${year}-${String(month + 1).padStart(2, "0")}`);
    month += 1;
    if (month > 11) {
      month = 0;
      year += 1;
    }
  }
  return keys;
}

/** "2026-08" → "Agosto". */
function monthLabel(key: string): string {
  const month = Number(key.split("-")[1]) - 1;
  return MONTH_NAMES[month] ?? key;
}

/** "2026-08" → "ago/26". */
function monthShortLabel(key: string): string {
  const [year, month] = key.split("-");
  return `${MONTH_SHORT[Number(month) - 1] ?? month}/${year.slice(2)}`;
}

/* ------------------------------------------------------------------ */
/* Filtro Prisma                                                      */
/* ------------------------------------------------------------------ */

/**
 * `where` do relatório: período + (opcionalmente) os filtros da tela.
 *
 * Deliberadamente NÃO restringe o grupo de planejamento às três áreas — as ordens
 * de fora são lidas e contadas para a seção "Qualidade dos dados", que é o que
 * torna visível quanto do recorte ficou de fora. São poucas colunas por linha, e
 * o filtro de período já corta a base.
 */
function buildAdherenceWhere(
  dateFrom: string,
  dateTo: string,
  filters: AdherenceReportFilters | undefined
): Prisma.ServiceOrderWhereInput {
  const and: Prisma.ServiceOrderWhereInput[] = [
    // Mesma exclusão de registros de teste de toda a aba Ordens de Serviço.
    excludeInvalidTestEquipmentWhere(),
    { openedAt: { gte: toStartOfDay(dateFrom), lte: toEndOfDay(dateTo) } }
  ];

  const statuses = (filters?.statuses ?? []).filter(Boolean) as ServiceOrderStatus[];
  if (statuses.length) and.push({ status: { in: statuses } });

  if (filters?.equipment) {
    const equipment: Prisma.StringFilter = { contains: filters.equipment.trim(), mode: "insensitive" };
    and.push({
      OR: [{ equipmentName: equipment }, { equipmentCode: equipment }, { technicalObjectRaw: equipment }]
    });
  }

  const planningGroups = (filters?.planningGroups ?? []).filter(Boolean);
  if (planningGroups.length) {
    and.push({
      OR: [{ planningGroup: { in: planningGroups } }, { planningGroupCode: { in: planningGroups } }]
    });
  }

  const responsibles = (filters?.responsibles ?? []).filter(Boolean);
  if (responsibles.length) {
    const or: Prisma.ServiceOrderWhereInput[] = [];
    for (const responsible of responsibles) {
      if (responsible === SEM_RESPONSAVEL) {
        or.push({
          OR: [
            { responsibleName: null },
            { responsibleName: "" },
            { responsibleName: SEM_RESPONSAVEL },
            { responsible: null },
            { responsible: "" }
          ]
        });
      } else {
        // A opção da tela vem como "Nome (id)"; o banco guarda só o nome.
        const name = responsible.replace(/\s+\([^)]*\)$/, "").trim();
        or.push({ OR: [{ responsibleName: name }, { responsible: name }] });
      }
    }
    and.push({ OR: or });
  }

  // `areas` (enum MaintenanceArea) é intencionalmente ignorado: o relatório é
  // organizado por GRUPO DE PLANEJAMENTO, e cruzar as duas classificações
  // produziria recortes contraditórios (ver DECISÃO 3 no cabeçalho).

  return { AND: and };
}

/** Descreve em texto os filtros aplicados, para imprimir na capa do relatório. */
function describeFilters(filters: AdherenceReportFilters | undefined): string[] {
  if (!filters) return [];
  const parts: string[] = [];
  const list = (values: string[] | undefined) => (values ?? []).filter(Boolean);

  if (list(filters.statuses).length) parts.push(`Status: ${list(filters.statuses).join(", ")}`);
  if (list(filters.planningGroups).length)
    parts.push(`Grupo de planejamento: ${list(filters.planningGroups).join(", ")}`);
  if (list(filters.responsibles).length) parts.push(`Responsável: ${list(filters.responsibles).join(", ")}`);
  if (filters.equipment?.trim()) parts.push(`Objeto técnico: ${filters.equipment.trim()}`);
  if (list(filters.areas).length) parts.push(`Área de manutenção: ${list(filters.areas).join(", ")} (não aplicado — o relatório classifica por grupo de planejamento)`);

  return parts;
}

/* ------------------------------------------------------------------ */
/* Deduplicação linha-de-operação → ordem                             */
/* ------------------------------------------------------------------ */

/** Campos lidos do banco (uma linha = uma operação da ordem). */
type OperationRow = {
  osNumber: string;
  status: ServiceOrderStatus;
  statusSapRaw: string | null;
  openedAt: Date | null;
  planningGroup: string | null;
  planningGroupCode: string | null;
  responsibleName: string | null;
  responsible: string | null;
};

/** Uma ORDEM consolidada, já com a área resolvida. */
type OrderRecord = {
  osNumber: string;
  closed: boolean;
  openedAt: Date | null;
  area: AdherenceAreaKey | null;
  hasPlanningGroup: boolean;
  responsavel: string;
};

/**
 * Colapsa as linhas de operação em uma entrada por `osNumber`.
 *
 * Divergência entre operações da mesma ordem não ocorre na base atual (verificado:
 * 0 de 2.265 ordens), mas o desempate é explícito para nunca depender da ordem em
 * que o banco devolveu as linhas:
 *  - FECHADA só se TODAS as operações estiverem fechadas — uma operação pendente
 *    significa ordem não concluída, que é o critério conservador e o único que
 *    mantém a aderência como medida de execução completa;
 *  - demais campos: primeiro valor não vazio encontrado.
 */
function dedupeByOrder(rows: OperationRow[]): OrderRecord[] {
  const byOrder = new Map<string, OrderRecord>();

  for (const row of rows) {
    const closed = isClosedServiceOrder({ status: row.status, statusSapRaw: row.statusSapRaw });
    const responsavel = (row.responsibleName ?? row.responsible ?? "").trim() || SEM_RESPONSAVEL;
    const existing = byOrder.get(row.osNumber);

    if (!existing) {
      byOrder.set(row.osNumber, {
        osNumber: row.osNumber,
        closed,
        openedAt: row.openedAt,
        area: resolveAdherenceArea(row),
        hasPlanningGroup: Boolean(row.planningGroup?.trim() || row.planningGroupCode?.trim()),
        responsavel
      });
      continue;
    }

    // Uma operação em aberto derruba a ordem inteira para "em aberto".
    if (!closed) existing.closed = false;
    if (!existing.openedAt) existing.openedAt = row.openedAt;
    if (!existing.area) existing.area = resolveAdherenceArea(row);
    if (!existing.hasPlanningGroup) {
      existing.hasPlanningGroup = Boolean(row.planningGroup?.trim() || row.planningGroupCode?.trim());
    }
    if (existing.responsavel === SEM_RESPONSAVEL && responsavel !== SEM_RESPONSAVEL) {
      existing.responsavel = responsavel;
    }
  }

  return Array.from(byOrder.values());
}

/* ------------------------------------------------------------------ */
/* Montagem do dataset                                                */
/* ------------------------------------------------------------------ */

/** Normaliza e valida o período recebido, invertendo se vier trocado. */
function normalizeRange(dateFrom: string, dateTo: string): { from: string; to: string } {
  const valid = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value));
  if (!valid(dateFrom) || !valid(dateTo)) {
    throw new Error("Período inválido: informe data inicial e final no formato AAAA-MM-DD.");
  }
  return dateFrom <= dateTo ? { from: dateFrom, to: dateTo } : { from: dateTo, to: dateFrom };
}

/** "aderencia-os-2026-01-a-2026-08.pdf" */
function buildFileName(from: string, to: string): string {
  return `aderencia-os-${from.slice(0, 7)}-a-${to.slice(0, 7)}.pdf`;
}

/**
 * Monta o dataset completo do relatório com UMA leitura do banco.
 *
 * A leitura é enxuta (8 colunas escalares) e já cortada pelo período, então mesmo
 * o recorte mais largo da base atual traz alguns milhares de linhas — não as
 * ~20 mil da tabela inteira, e nada disso trafega para o navegador: o cliente
 * envia filtros, recebe PDF.
 */
export async function buildAdherenceReportDataset(
  request: AdherenceReportRequest
): Promise<AdherenceReportDataset> {
  const { from, to } = normalizeRange(request.dateFrom, request.dateTo);
  const filters = request.useCurrentFilters ? request.filters : undefined;

  const rows = await prisma.serviceOrder.findMany({
    where: buildAdherenceWhere(from, to, filters),
    select: {
      osNumber: true,
      status: true,
      statusSapRaw: true,
      openedAt: true,
      planningGroup: true,
      planningGroupCode: true,
      responsibleName: true,
      responsible: true
    }
  });

  const orders = dedupeByOrder(rows);

  // ---- acumuladores ------------------------------------------------
  const geral: Counter = { total: 0, fechadas: 0 };
  const porArea = new Map<AdherenceAreaKey, Counter>();
  /** chave "YYYY-MM" e "YYYY-MM|AREA". */
  const porMes = new Map<string, Counter>();
  /** chave "AREA|responsável". */
  const porColaborador = new Map<string, Counter>();
  const semResponsavelPorArea = new Map<AdherenceAreaKey, number>();

  let semResponsavel = 0;
  let semGrupoPlanejamento = 0;
  let semDataBase = 0;
  let foraDasAreas = 0;

  for (const order of orders) {
    if (!order.hasPlanningGroup) semGrupoPlanejamento += 1;

    if (!order.area) {
      foraDasAreas += 1;
      continue;
    }

    // A partir daqui: ordem CONSIDERADA no relatório.
    const { area, closed } = order;

    geral.total += 1;
    if (closed) geral.fechadas += 1;

    const areaCounter = porArea.get(area) ?? { total: 0, fechadas: 0 };
    areaCounter.total += 1;
    if (closed) areaCounter.fechadas += 1;
    porArea.set(area, areaCounter);

    if (order.openedAt) {
      const key = monthKeyOf(order.openedAt);
      bump(porMes, key, closed);
      bump(porMes, `${key}|${area}`, closed);
    } else {
      // Não deveria acontecer: o próprio filtro de período exige `openedAt`.
      // Contado mesmo assim, para a seção de qualidade nunca esconder o caso.
      semDataBase += 1;
    }

    if (order.responsavel === SEM_RESPONSAVEL) {
      semResponsavel += 1;
      semResponsavelPorArea.set(area, (semResponsavelPorArea.get(area) ?? 0) + 1);
    } else {
      bump(porColaborador, `${area}|${order.responsavel}`, closed);
    }
  }

  // ---- séries ------------------------------------------------------
  const emptyTotals = toTotals(0, 0);
  const get = (map: Map<string, Counter>, key: string) => {
    const counter = map.get(key);
    return counter ? toTotals(counter.total, counter.fechadas) : emptyTotals;
  };

  const meses: AdherenceMonthRow[] = monthsInRange(from, to).map((key) => ({
    monthKey: key,
    label: monthLabel(key),
    shortLabel: monthShortLabel(key),
    geral: get(porMes, key),
    porArea: {
      MECANICA: get(porMes, `${key}|MECANICA`),
      ELETRICA: get(porMes, `${key}|ELETRICA`),
      TERCEIROS: get(porMes, `${key}|TERCEIROS`)
    }
  }));

  const areas: AdherenceAreaTotals[] = ADHERENCE_AREA_ORDER.map((area) => {
    const counter = porArea.get(area) ?? { total: 0, fechadas: 0 };
    return { area, label: ADHERENCE_AREA_LABEL[area], ...toTotals(counter.total, counter.fechadas) };
  });

  const colaboradores: AdherenceAreaCollaborators[] = ADHERENCE_AREA_ORDER.map((area) => {
    const rowsOfArea: AdherenceCollaboratorRow[] = [];
    for (const [key, counter] of Array.from(porColaborador.entries())) {
      const [rowArea, ...rest] = key.split("|");
      if (rowArea !== area) continue;
      const totals = toTotals(counter.total, counter.fechadas);
      rowsOfArea.push({
        responsavel: rest.join("|"),
        total: totals.total,
        fechadas: totals.fechadas,
        pendentes: totals.abertas,
        aderencia: totals.aderencia
      });
    }

    // Maior aderência primeiro; empate resolvido por maior volume, depois por nome
    // (para a ordem não variar entre gerações do mesmo recorte).
    rowsOfArea.sort(
      (a, b) =>
        (b.aderencia ?? -1) - (a.aderencia ?? -1) ||
        b.total - a.total ||
        a.responsavel.localeCompare(b.responsavel, "pt-BR")
    );

    const counter = porArea.get(area) ?? { total: 0, fechadas: 0 };
    return {
      area,
      label: ADHERENCE_AREA_LABEL[area],
      rows: rowsOfArea,
      semResponsavel: semResponsavelPorArea.get(area) ?? 0,
      totals: toTotals(counter.total, counter.fechadas)
    };
  });

  return {
    geradoEm: new Date().toISOString(),
    periodo: buildPeriod(from, to),
    filtros: {
      usouFiltrosDaTela: Boolean(request.useCurrentFilters),
      descricao: request.useCurrentFilters ? describeFilters(filters) : []
    },
    geral: toTotals(geral.total, geral.fechadas),
    porArea: areas,
    porMes: meses,
    colaboradores,
    qualidade: {
      semResponsavel,
      semGrupoPlanejamento,
      semDataBase,
      consideradas: geral.total,
      foraDasAreas,
      linhasOperacao: rows.length
    },
    fileName: buildFileName(from, to)
  };
}
