import { ImportType, Prisma, ServiceOrderStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { toEndOfDay, toStartOfDay } from "@/utils/date-range";
import { excludeInvalidTestEquipmentWhere } from "@/utils/service-order-classification";
import { formatTechnicalObject } from "@/utils/technical-object-normalizer";
import { buildDataQualitySummary } from "@/services/shared/data-quality";
import { emptyDataQualitySummary, type DataQualityNotice, type DataQualitySummary } from "@/types/data-quality";
import type {
  WorkforceEquipmentRow,
  WorkforceMemberDetail,
  WorkforceMemberRow,
  WorkforcePageData,
  WorkforceQueryParams
} from "@/types/workforce";

/**
 * EQUIPE DE MANUTENÇÃO — carga de trabalho a partir das ordens.
 *
 * Regra da entrega: a fonte oficial de horas é `ServiceOrder.workedHours`. Nada é
 * apontado manualmente aqui e nenhum snapshot é lido — a página responde "quanto a
 * equipe trabalhou" com o mesmo dado que a aba de Ordens de Serviço usa, ou os dois
 * números divergiriam e nenhum teria autoridade.
 *
 * PERFORMANCE: tudo sai de `groupBy` no banco — KPIs, ranking de colaboradores e
 * esforço por equipamento. Nenhuma consulta por colaborador (com 31 responsáveis isso
 * seria um N+1 de 31 idas ao banco por render) e nenhuma varredura das ~20 mil ordens
 * para somar em memória, que era o que custava ~5 s por carregamento.
 */

/** Status que contam como "em aberto". */
const OPEN_STATUSES: ServiceOrderStatus[] = [
  ServiceOrderStatus.ABERTA,
  ServiceOrderStatus.LIBERADA,
  ServiceOrderStatus.EM_ANDAMENTO,
  ServiceOrderStatus.AGUARDANDO_MATERIAL
];

/** Rótulo usado pelas ordens sem responsável informado. */
const UNASSIGNED = "SEM RESPONSÁVEL";

/**
 * Chave canônica de uma pessoa.
 *
 * Sem acento, sem caixa, sem o sufixo de matrícula entre parênteses: "JOAO SILVA",
 * "João Silva" e "JOAO SILVA (54)" viram a mesma chave. Sem isso a mesma pessoa
 * apareceria três vezes no ranking, dividindo as próprias horas por três.
 *
 * Só normaliza grafia — não tenta adivinhar que "J. Silva" é "João Silva".
 */
export function normalizePersonKey(value: string | null | undefined): string {
  if (!value) return UNASSIGNED;
  const cleaned = value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\(.*?\)/g, "") // matrícula entre parênteses
    .toUpperCase()
    .replace(/[^A-Z ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return cleaned || UNASSIGNED;
}

/** Nome apresentável: Primeira Letra Maiúscula, preservando preposições. */
function displayPersonName(raw: string): string {
  const MINUSCULAS = new Set(["de", "da", "do", "das", "dos", "e"]);
  return raw
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase()
    .split(" ")
    .map((token, index) =>
      index > 0 && MINUSCULAS.has(token) ? token : token.charAt(0).toUpperCase() + token.slice(1)
    )
    .join(" ");
}

/** Where do recorte — o mesmo padrão de período das demais abas. */
function periodWhere(params: WorkforceQueryParams): Prisma.ServiceOrderWhereInput {
  const and: Prisma.ServiceOrderWhereInput[] = [excludeInvalidTestEquipmentWhere()];
  if (params.startDate || params.endDate) {
    and.push({
      openedAt: {
        ...(params.startDate ? { gte: toStartOfDay(params.startDate) } : {}),
        ...(params.endDate ? { lte: toEndOfDay(params.endDate) } : {})
      }
    });
  }
  return { AND: and };
}

type Acumulador = {
  key: string;
  rawName: string;
  workedHours: number;
  totalOrders: number;
  openOrders: number;
  closedOrders: number;
};

/**
 * Carrega o cadastro de colaboradores indexado pela chave canônica do nome.
 * Uma consulta só; o cadastro tem dezenas de linhas, não milhares.
 */
async function loadCollaboratorIndex() {
  const collaborators = await prisma.collaborator.findMany({
    select: { name: true, role: true, area: true, shift: true, status: true }
  });
  const index = new Map<string, (typeof collaborators)[number]>();
  for (const collaborator of collaborators) index.set(normalizePersonKey(collaborator.name), collaborator);
  return index;
}

export async function getWorkforcePageData(params: WorkforceQueryParams = {}): Promise<WorkforcePageData> {
  const period = {
    startDate: params.startDate ?? "",
    endDate: params.endDate ?? ""
  };

  try {
    const where = periodWhere(params);

    // AGREGAÇÃO NO BANCO, não em memória (FASE 9). Carregar as ~20 mil ordens para
    // somá-las no Node custava ~5 s por render; dois `groupBy` devolvem algumas
    // centenas de linhas já somadas e fazem o mesmo trabalho. O agrupamento final por
    // CHAVE CANÔNICA continua em memória porque a chave não existe no banco — mas
    // agora sobre o resultado agregado, não sobre as linhas cruas.
    const [porResponsavelStatus, porEquipamentoResponsavel, totais, ordersWithHours, collaboratorIndex, activeCollaborators] =
      await Promise.all([
        prisma.serviceOrder.groupBy({
          by: ["responsibleName", "status"],
          where,
          _sum: { workedHours: true },
          _count: { _all: true }
        }),
        prisma.serviceOrder.groupBy({
          by: ["equipmentName", "equipmentCode", "responsibleName"],
          where,
          _sum: { workedHours: true },
          _count: { _all: true }
        }),
        prisma.serviceOrder.aggregate({ where, _sum: { workedHours: true }, _count: { _all: true } }),
        prisma.serviceOrder.count({ where: { AND: [where, { workedHours: { gt: 0 } }] } }),
        loadCollaboratorIndex(),
        prisma.collaborator.count({ where: { status: "ATIVO" } })
      ]);

    const porPessoa = new Map<string, Acumulador>();
    const porEquipamento = new Map<string, { workedHours: number; totalOrders: number; porPessoa: Map<string, number> }>();
    const workedHours = totais._sum.workedHours ?? 0;
    const totalOrders = totais._count._all;

    for (const row of porResponsavelStatus) {
      const key = normalizePersonKey(row.responsibleName);
      let pessoa = porPessoa.get(key);
      if (!pessoa) {
        pessoa = { key, rawName: row.responsibleName?.trim() || UNASSIGNED, workedHours: 0, totalOrders: 0, openOrders: 0, closedOrders: 0 };
        porPessoa.set(key, pessoa);
      }
      pessoa.workedHours += row._sum.workedHours ?? 0;
      pessoa.totalOrders += row._count._all;
      if (OPEN_STATUSES.includes(row.status)) pessoa.openOrders += row._count._all;
      else if (row.status === ServiceOrderStatus.FECHADA) pessoa.closedOrders += row._count._all;
    }

    for (const row of porEquipamentoResponsavel) {
      const equipamento = formatTechnicalObject(row.equipmentName, row.equipmentCode);
      if (equipamento === "-") continue;

      let alvo = porEquipamento.get(equipamento);
      if (!alvo) {
        alvo = { workedHours: 0, totalOrders: 0, porPessoa: new Map() };
        porEquipamento.set(equipamento, alvo);
      }
      const horas = row._sum.workedHours ?? 0;
      alvo.workedHours += horas;
      alvo.totalOrders += row._count._all;
      const key = normalizePersonKey(row.responsibleName);
      alvo.porPessoa.set(key, (alvo.porPessoa.get(key) ?? 0) + horas);
    }

    const members: WorkforceMemberRow[] = Array.from(porPessoa.values())
      .map((pessoa) => toMemberRow(pessoa, collaboratorIndex))
      .sort((a, b) => b.workedHours - a.workedHours);

    // Colaboradores com alguma hora — denominador honesto da média. Incluir quem não
    // apontou nada puxaria a média para baixo sem dizer nada sobre a carga real.
    const comHoras = members.filter((member) => member.key !== UNASSIGNED && member.workedHours > 0);
    const porOrdens = [...members].filter((m) => m.key !== UNASSIGNED).sort((a, b) => b.totalOrders - a.totalOrders);

    const equipmentEffort: WorkforceEquipmentRow[] = Array.from(porEquipamento.entries())
      .map(([equipment, dados]) => ({
        equipment,
        workedHours: round1(dados.workedHours),
        totalOrders: dados.totalOrders,
        topResponsibles: Array.from(dados.porPessoa.entries())
          .sort((a, b) => b[1] - a[1])
          .slice(0, 3)
          .map(([key]) => porPessoa.get(key)?.rawName ?? key)
          .map((nome) => (nome === UNASSIGNED ? nome : displayPersonName(nome)))
      }))
      .sort((a, b) => b.workedHours - a.workedHours)
      .slice(0, 15);

    return {
      period,
      kpis: {
        activeCollaborators,
        workedHours: round1(workedHours),
        ordersWithHours,
        averageHoursPerCollaborator: comHoras.length > 0 ? round1(workedHours / comHoras.length) : null,
        topByHours: comHoras[0] ? { name: comHoras[0].name, value: comHoras[0].workedHours } : null,
        topByOrders: porOrdens[0] ? { name: porOrdens[0].name, value: porOrdens[0].totalOrders } : null
      },
      members,
      equipmentEffort,
      dataQuality: await buildWorkforceDataQuality(totalOrders, members, activeCollaborators),
      source: totalOrders > 0 ? "database" : "empty"
    };
  } catch (error) {
    console.error("Falha ao carregar a carga de trabalho da equipe.", error);
    return {
      period,
      kpis: {
        activeCollaborators: 0,
        workedHours: 0,
        ordersWithHours: 0,
        averageHoursPerCollaborator: null,
        topByHours: null,
        topByOrders: null
      },
      members: [],
      equipmentEffort: [],
      dataQuality: emptyDataQualitySummary("Banco de dados — Ordens de Manutenção (SAP PM)"),
      source: "empty"
    };
  }
}

function toMemberRow(
  pessoa: Acumulador,
  index: Map<string, { name: string; role: string | null; area: string; shift: string | null; status: string }>
): WorkforceMemberRow {
  const cadastro = index.get(pessoa.key);
  const semResponsavel = pessoa.key === UNASSIGNED;

  return {
    key: pessoa.key,
    name: cadastro?.name ?? (semResponsavel ? UNASSIGNED : displayPersonName(pessoa.rawName)),
    role: cadastro?.role ?? null,
    area: cadastro?.area ?? null,
    shift: cadastro?.shift ?? null,
    status: cadastro?.status ?? null,
    // "SEM RESPONSÁVEL" não é uma pessoa fora do cadastro: é ausência de apontamento.
    unregistered: !cadastro && !semResponsavel,
    workedHours: round1(pessoa.workedHours),
    totalOrders: pessoa.totalOrders,
    openOrders: pessoa.openOrders,
    closedOrders: pessoa.closedOrders,
    averageHoursPerOrder: pessoa.totalOrders > 0 ? round1(pessoa.workedHours / pessoa.totalOrders) : null
  };
}

/**
 * DETALHE DE UM COLABORADOR — no MESMO recorte da tela.
 *
 * Recebe os filtros da página e reusa `periodWhere`, então os números do painel batem
 * com a linha do ranking. A lista de OS é limitada (`take`) para o painel não carregar
 * as 7.370 ordens do responsável mais ativo.
 */
export async function getWorkforceMemberDetail(
  memberKey: string,
  params: WorkforceQueryParams = {},
  orderLimit = 50
): Promise<WorkforceMemberDetail | null> {
  const key = normalizePersonKey(memberKey);
  if (!key) return null;

  try {
    // A chave canônica não existe no banco (lá está o nome cru, com as variações de
    // grafia). Em vez de varrer as ordens do período e filtrar em memória — o que
    // carregava 3.821 linhas para ler as de uma pessoa —, resolvem-se primeiro as
    // GRAFIAS dessa chave num groupBy de ~30 linhas, e só então se buscam as ordens
    // dela. Duas consultas pequenas no lugar de uma varredura.
    const nomes = await prisma.serviceOrder.groupBy({ by: ["responsibleName"], where: periodWhere(params) });
    const variantes = nomes
      .map((row) => row.responsibleName)
      .filter((nome): nome is string => Boolean(nome) && normalizePersonKey(nome) === key);

    const semResponsavel = key === UNASSIGNED;
    if (variantes.length === 0 && !semResponsavel) return null;

    const [doColaborador, collaboratorIndex] = await Promise.all([
      prisma.serviceOrder.findMany({
        where: {
          AND: [
            periodWhere(params),
            semResponsavel
              ? { OR: [{ responsibleName: null }, { responsibleName: { in: variantes } }] }
              : { responsibleName: { in: variantes } }
          ]
        },
        select: {
          id: true,
          osNumber: true,
          title: true,
          status: true,
          responsibleName: true,
          workedHours: true,
          equipmentName: true,
          equipmentCode: true,
          openedAt: true,
          closedAt: true
        },
        orderBy: [{ openedAt: "desc" }]
      }),
      loadCollaboratorIndex()
    ]);

    if (doColaborador.length === 0) return null;

    const acumulador: Acumulador = {
      key,
      rawName: doColaborador[0].responsibleName?.trim() || UNASSIGNED,
      workedHours: 0,
      totalOrders: 0,
      openOrders: 0,
      closedOrders: 0
    };
    const porEquipamento = new Map<string, { workedHours: number; totalOrders: number }>();

    for (const order of doColaborador) {
      const horas = order.workedHours ?? 0;
      acumulador.workedHours += horas;
      acumulador.totalOrders += 1;
      if (OPEN_STATUSES.includes(order.status)) acumulador.openOrders += 1;
      else if (order.status === ServiceOrderStatus.FECHADA) acumulador.closedOrders += 1;

      const equipamento = formatTechnicalObject(order.equipmentName, order.equipmentCode);
      if (equipamento === "-") continue;
      const alvo = porEquipamento.get(equipamento) ?? { workedHours: 0, totalOrders: 0 };
      alvo.workedHours += horas;
      alvo.totalOrders += 1;
      porEquipamento.set(equipamento, alvo);
    }

    return {
      member: toMemberRow(acumulador, collaboratorIndex),
      topEquipments: Array.from(porEquipamento.entries())
        .map(([equipment, dados]) => ({
          equipment,
          workedHours: round1(dados.workedHours),
          totalOrders: dados.totalOrders,
          topResponsibles: []
        }))
        .sort((a, b) => b.workedHours - a.workedHours)
        .slice(0, 8),
      orders: doColaborador.slice(0, orderLimit).map((order) => ({
        id: order.id,
        osNumber: order.osNumber,
        title: order.title,
        status: order.status,
        equipment: formatTechnicalObject(order.equipmentName, order.equipmentCode),
        openedAt: order.openedAt?.toISOString() ?? null,
        closedAt: order.closedAt?.toISOString() ?? null,
        workedHours: round1(order.workedHours ?? 0)
      })),
      totalOrders: doColaborador.length,
      periodLabel: describePeriod(params)
    };
  } catch (error) {
    console.error("Falha ao carregar o detalhe do colaborador.", error);
    return null;
  }
}

async function buildWorkforceDataQuality(
  totalOrders: number,
  members: WorkforceMemberRow[],
  activeCollaborators: number
): Promise<DataQualitySummary> {
  const semResponsavel = members.find((member) => member.key === UNASSIGNED);
  const foraDoCadastro = members.filter((member) => member.unregistered);
  const notices: DataQualityNotice[] = [];

  if (semResponsavel && semResponsavel.totalOrders > 0) {
    notices.push({
      id: "os-sem-responsavel",
      message: `${semResponsavel.totalOrders.toLocaleString("pt-BR")} OS sem responsável informado (${semResponsavel.workedHours.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} h).`,
      detail:
        "Essas horas existem e entram no total do período, mas não podem ser atribuídas a ninguém — aparecem como uma linha própria no ranking, nunca distribuídas entre a equipe.",
      tone: "warning"
    });
  }

  if (foraDoCadastro.length > 0) {
    notices.push({
      id: "responsavel-fora-do-cadastro",
      message: `${foraDoCadastro.length} responsável(is) das ordens não está(ão) no cadastro de colaboradores.`,
      detail: `Aparecem no ranking com as horas reais, mas sem função, área e turno: ${foraDoCadastro
        .slice(0, 5)
        .map((member) => member.name)
        .join(", ")}${foraDoCadastro.length > 5 ? "…" : ""}. Cadastre-os para completar a visão.`,
      tone: "info"
    });
  }

  return buildDataQualitySummary({
    importType: ImportType.ORDENS_SERVICO,
    analyzedRecords: totalOrders,
    validRecords: totalOrders,
    ignoredRecords: 0,
    missingFields: [],
    hiddenFilters: [],
    removedFilterOptions: 0,
    sourceLabel:
      "Banco de dados — Ordens de Manutenção (SAP PM). Horas = soma de trabalho real por responsável; não há apontamento manual nesta página.",
    metrics: [
      { label: "Colaboradores ativos no cadastro", value: activeCollaborators.toLocaleString("pt-BR") },
      { label: "Responsáveis com ordens no período", value: String(members.filter((m) => m.key !== UNASSIGNED).length) }
    ],
    notices
  });
}

function describePeriod(params: WorkforceQueryParams): string {
  const format = (value: string) => value.split("-").reverse().join("/");
  if (params.startDate && params.endDate) return `${format(params.startDate)} a ${format(params.endDate)}`;
  if (params.startDate) return `a partir de ${format(params.startDate)}`;
  if (params.endDate) return `até ${format(params.endDate)}`;
  return "período completo importado";
}

function round1(value: number): number {
  return Number.isFinite(value) ? Math.round(value * 10) / 10 : 0;
}
