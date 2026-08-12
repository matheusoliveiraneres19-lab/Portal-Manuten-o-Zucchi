import { unstable_cache } from "next/cache";
import { ImportType, MaintenanceArea, Prisma, ServiceOrderStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { toEndOfDay, toStartOfDay } from "@/utils/date-range";
import { excludeInvalidTestEquipmentWhere } from "@/utils/service-order-classification";
import type {
  ServiceOrderFilterOptions,
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
const loadServiceOrderFilterOptions = unstable_cache(
  async (): Promise<ServiceOrderFilterOptions> => {
    const [statuses, areas, planningGroups, responsibles, equipments] = await Promise.all([
      prisma.serviceOrder.findMany({
        distinct: ["status"],
        select: { status: true },
        orderBy: { status: "asc" }
      }),
      prisma.serviceOrder.findMany({
        distinct: ["area"],
        where: { area: { not: null } },
        select: { area: true },
        orderBy: { area: "asc" }
      }),
      prisma.serviceOrder.findMany({
        distinct: ["planningGroup"],
        where: { planningGroup: { not: null } },
        select: { planningGroup: true },
        orderBy: { planningGroup: "asc" }
      }),
      prisma.serviceOrder.findMany({
        distinct: ["responsibleName"],
        where: { responsibleName: { not: null } },
        select: { responsibleName: true, responsibleId: true },
        orderBy: { responsibleName: "asc" }
      }),
      prisma.serviceOrder.findMany({
        distinct: ["equipmentCode"],
        where: { OR: [{ equipmentCode: { not: null } }, { equipmentName: { not: null } }] },
        select: { equipmentCode: true, equipmentName: true },
        orderBy: { equipmentName: "asc" }
      })
    ]);

    return {
      statuses: statuses.map((item) => item.status as ServiceOrderStatusLabel),
      areas: areas.map((item) => item.area).filter(Boolean) as string[],
      planningGroups: planningGroups.map((item) => item.planningGroup).filter(Boolean) as string[],
      responsibles: normalizeResponsibleOptions(
        responsibles.map((item) =>
          item.responsibleName
            ? item.responsibleId
              ? `${item.responsibleName} (${item.responsibleId})`
              : item.responsibleName
            : "SEM RESPONSÁVEL"
        )
      ),
      equipments: equipments
        .map((item) => formatTechnicalObject(item.equipmentName, item.equipmentCode))
        .filter((item) => item !== "-")
    };
  },
  ["service-order-filter-options"],
  { revalidate: 120, tags: ["service-orders"] }
);

export async function getServiceOrderFilterOptions(): Promise<ServiceOrderFilterOptions> {
  try {
    return await loadServiceOrderFilterOptions();
  } catch (error) {
    console.error("Falha ao carregar opções de filtros de OS. Exibindo listas vazias.", error);
    return getEmptyFilterOptions();
  }
}

export async function getServiceOrdersSummary(): Promise<ServiceOrdersSummary> {
  // Base compartilhada: exclui registros de teste sem equipamento de todas as contagens.
  const base = excludeInvalidTestEquipmentWhere();
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
    getServiceOrderFilterOptions(),
    getServiceOrdersSummary(),
    getLastServiceOrderImportAt()
  ]);

  return {
    orders: orders.data,
    total: orders.total,
    page: orders.page,
    pageSize: orders.pageSize,
    totalPages: orders.totalPages,
    filterOptions,
    summary,
    source: orders.source,
    lastImportAt
  };
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
  return { statuses: [], areas: [], planningGroups: [], responsibles: [], equipments: [] };
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

function formatTechnicalObject(name: string | null, code: string | null) {
  if (name && code) {
    return `${name} (${code})`;
  }

  return name ?? code ?? "-";
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
