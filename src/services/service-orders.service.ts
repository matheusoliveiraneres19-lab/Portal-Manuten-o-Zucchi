import { MaintenanceArea, Prisma, ServiceOrderStatus } from "@prisma/client";
import { mockServiceOrders } from "@/data/service-orders";
import { prisma } from "@/lib/prisma";
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
const DEFAULT_PAGE_SIZE = 1500;
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
    console.error("Falha ao carregar ordens de serviço pelo banco. Usando fallback mockado.", error);
    return getMockServiceOrders(params);
  }
}

export async function getServiceOrderFilterOptions(): Promise<ServiceOrderFilterOptions> {
  try {
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
  } catch (error) {
    console.error("Falha ao carregar opções de filtros de OS. Usando fallback mockado.", error);
    return getMockFilterOptions();
  }
}

export async function getServiceOrdersSummary(): Promise<ServiceOrdersSummary> {
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
      prisma.serviceOrder.count(),
      prisma.serviceOrder.count({ where: { status: ServiceOrderStatus.ABERTA } }),
      prisma.serviceOrder.count({ where: { status: ServiceOrderStatus.LIBERADA } }),
      prisma.serviceOrder.count({ where: { status: ServiceOrderStatus.EM_ANDAMENTO } }),
      prisma.serviceOrder.count({ where: { status: ServiceOrderStatus.AGUARDANDO_MATERIAL } }),
      prisma.serviceOrder.count({ where: { status: ServiceOrderStatus.FECHADA } }),
      prisma.serviceOrder.count({
        where: {
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
    console.error("Falha ao carregar resumo de OS. Usando fallback mockado.", error);
    return getMockSummary();
  }
}

export async function getServiceOrdersPageData(params: ServiceOrdersQueryParams = {}): Promise<ServiceOrdersPageData> {
  const [orders, filterOptions, summary] = await Promise.all([
    getServiceOrders(params),
    getServiceOrderFilterOptions(),
    getServiceOrdersSummary()
  ]);

  return {
    orders: orders.data,
    total: orders.total,
    page: orders.page,
    pageSize: orders.pageSize,
    totalPages: orders.totalPages,
    filterOptions,
    summary,
    source: orders.source
  };
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

function buildServiceOrderWhere(params: ServiceOrdersQueryParams): Prisma.ServiceOrderWhereInput {
  const and: Prisma.ServiceOrderWhereInput[] = [];

  if (params.search) {
    const search = contains(params.search);
    and.push({
      OR: [
        { osNumber: search },
        { title: search },
        { equipmentName: search },
        { equipmentCode: search },
        { operation: search },
        { responsibleName: search }
      ]
    });
  }

  if (params.osNumber) {
    const order = contains(params.osNumber);
    and.push({ OR: [{ osNumber: order }, { title: order }] });
  }

  if (params.status && params.status !== "TODOS") {
    and.push({ status: params.status as ServiceOrderStatus });
  }

  if (params.equipment) {
    const equipment = contains(params.equipment);
    and.push({
      OR: [{ equipmentName: equipment }, { equipmentCode: equipment }, { technicalObjectRaw: equipment }]
    });
  }

  if (params.area) {
    const area = normalizeArea(params.area);
    const planningGroup = contains(params.area);
    and.push({
      OR: [
        ...(area ? [{ area }] : []),
        { planningGroup },
        { planningGroupCode: planningGroup }
      ]
    });
  }

  if (params.startDate || params.endDate) {
    and.push({
      openedAt: {
        ...(params.startDate ? { gte: toStartOfDay(params.startDate) } : {}),
        ...(params.endDate ? { lte: toEndOfDay(params.endDate) } : {})
      }
    });
  }

  if (params.planningGroup) {
    const planningGroup = contains(params.planningGroup);
    and.push({ OR: [{ planningGroup }, { planningGroupCode: planningGroup }] });
  }

  if (params.responsibleName && params.responsibleName !== "TODOS") {
    if (params.responsibleName === "SEM RESPONSÁVEL") {
      and.push({
        OR: [
          { responsibleName: null },
          { responsibleName: "" },
          { responsibleName: "SEM RESPONSÁVEL" },
          { responsible: null },
          { responsible: "" }
        ]
      });
    } else {
      const responsible = stripResponsibleId(params.responsibleName);
      and.push({
        OR: [{ responsibleName: contains(responsible) }, { responsible: contains(responsible) }]
      });
    }
  }

  return and.length ? { AND: and } : {};
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

function getMockServiceOrders(params: ServiceOrdersQueryParams): ServiceOrdersResult {
  const page = normalizePage(params.page);
  const pageSize = normalizePageSize(params.pageSize);
  const filtered = mockServiceOrders.filter((order) => matchesMockFilters(order, params));
  const start = (page - 1) * pageSize;

  return {
    data: filtered.slice(start, start + pageSize),
    total: filtered.length,
    page,
    pageSize,
    totalPages: Math.max(1, Math.ceil(filtered.length / pageSize)),
    source: "mock"
  };
}

function getMockFilterOptions(): ServiceOrderFilterOptions {
  return {
    statuses: Array.from(new Set(mockServiceOrders.map((order) => order.status))),
    areas: Array.from(new Set(mockServiceOrders.map((order) => order.planningGroupCode).filter(Boolean))) as string[],
    planningGroups: Array.from(new Set(mockServiceOrders.map((order) => order.planningGroup).filter(Boolean))) as string[],
    responsibles: normalizeResponsibleOptions(mockServiceOrders.map(getResponsibleGroup)),
    equipments: Array.from(new Set(mockServiceOrders.map((order) => order.technicalObject)))
  };
}

function getMockSummary(): ServiceOrdersSummary {
  return {
    total: mockServiceOrders.length,
    abertas: mockServiceOrders.filter((order) => order.status === "ABERTA").length,
    liberadas: mockServiceOrders.filter((order) => order.status === "LIBERADA").length,
    emAndamento: mockServiceOrders.filter((order) => order.status === "EM_ANDAMENTO").length,
    aguardandoMaterial: mockServiceOrders.filter((order) => order.status === "AGUARDANDO_MATERIAL").length,
    fechadas: mockServiceOrders.filter((order) => order.status === "FECHADA").length,
    semResponsavel: mockServiceOrders.filter((order) => getResponsibleGroup(order) === "SEM RESPONSÁVEL").length
  };
}

function matchesMockFilters(order: ServiceOrderListItem, params: ServiceOrdersQueryParams) {
  const haystack = [
    order.osNumber,
    order.title,
    order.equipmentName,
    order.equipmentCode,
    order.operation,
    order.responsibleName
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  const openedDate = order.openedAt ? order.openedAt.slice(0, 10) : "";

  return (
    includes(haystack, params.search) &&
    includes(`${order.osNumber} ${order.title}`, params.osNumber) &&
    (!params.status || params.status === "TODOS" || order.status === params.status) &&
    includes(`${order.equipmentName ?? ""} ${order.equipmentCode ?? ""} ${order.technicalObject}`, params.equipment) &&
    includes(`${order.workCenter ?? ""} ${order.planningGroup ?? ""}`, params.area) &&
    (!params.startDate || (openedDate && openedDate >= params.startDate)) &&
    (!params.endDate || (openedDate && openedDate <= params.endDate)) &&
    includes(`${order.planningGroup ?? ""} ${order.planningGroupCode ?? ""}`, params.planningGroup) &&
    (!params.responsibleName ||
      params.responsibleName === "TODOS" ||
      getResponsibleGroup(order) === params.responsibleName)
  );
}

function contains(value: string): Prisma.StringFilter {
  return { contains: value.trim() };
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

function toStartOfDay(value: string) {
  const date = new Date(value);
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), 0, 0, 0, 0));
}

function toEndOfDay(value: string) {
  const date = new Date(value);
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), 23, 59, 59, 999));
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

function getResponsibleGroup(order: ServiceOrderListItem) {
  if (!order.responsibleName) {
    return "SEM RESPONSÁVEL";
  }

  return order.responsibleId ? `${order.responsibleName} (${order.responsibleId})` : order.responsibleName;
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

function includes(value: string, term?: string) {
  if (!term?.trim()) {
    return true;
  }

  return value.toLowerCase().includes(term.trim().toLowerCase());
}
