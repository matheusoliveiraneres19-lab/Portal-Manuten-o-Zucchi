/**
 * Leitura dos filtros da aba Ordens de Serviço a partir da URL.
 *
 * Fonte única para a página (`/dashboard/ordens-servico`) e para as rotas de API
 * que precisam do MESMO recorte (detalhe da aderência por área): um filtro lido de
 * forma diferente em cada lado faria o drill-down discordar do gráfico.
 *
 * Puro: sem Prisma e sem React.
 */
import type {
  AppliedServiceOrderFilters,
  ServiceOrdersQueryParams,
  ServiceOrderStatusLabel
} from "@/types/service-orders";

export type ServiceOrderSearchParams = Record<string, string | string[] | undefined>;

/** `URLSearchParams` → o mesmo formato que o Next entrega à página. */
export function searchParamsToRecord(params: URLSearchParams): ServiceOrderSearchParams {
  const record: ServiceOrderSearchParams = {};
  params.forEach((value, key) => {
    const current = record[key];
    record[key] = current === undefined ? value : Array.isArray(current) ? [...current, value] : [current, value];
  });
  return record;
}

/** Normaliza os search params da URL em filtros aplicados (com arrays para multi-seleção). */
export function parseAppliedServiceOrderFilters(searchParams: ServiceOrderSearchParams): AppliedServiceOrderFilters {
  return {
    search: firstParam(searchParams.search) ?? "",
    osNumber: (firstParam(searchParams.osNumber) ?? firstParam(searchParams.ordem)) ?? "",
    statuses: toArray(searchParams.status) as ServiceOrderStatusLabel[],
    equipment: (firstParam(searchParams.equipment) ?? firstParam(searchParams.objetoTecnico)) ?? "",
    areas: toArray(searchParams.area),
    planningGroups: toArray(searchParams.grupo ?? searchParams.planningGroup),
    responsibles: toArray(searchParams.responsavel ?? searchParams.responsibleName),
    startDate: firstParam(searchParams.startDate) ?? "",
    endDate: firstParam(searchParams.endDate) ?? ""
  };
}

export function toServiceOrderQueryParams(
  applied: AppliedServiceOrderFilters,
  searchParams: ServiceOrderSearchParams
): ServiceOrdersQueryParams {
  return {
    search: applied.search || undefined,
    osNumber: applied.osNumber || undefined,
    statuses: applied.statuses.length ? applied.statuses : undefined,
    equipment: applied.equipment || undefined,
    areas: applied.areas.length ? applied.areas : undefined,
    planningGroups: applied.planningGroups.length ? applied.planningGroups : undefined,
    responsibles: applied.responsibles.length ? applied.responsibles : undefined,
    startDate: applied.startDate || undefined,
    endDate: applied.endDate || undefined,
    page: toNumber(firstParam(searchParams.page)),
    pageSize: toNumber(firstParam(searchParams.pageSize))
  };
}

function firstParam(value: string | string[] | undefined): string | undefined {
  const raw = Array.isArray(value) ? value[0] : value;
  return raw && raw.trim() ? raw.trim() : undefined;
}

function toArray(value: string | string[] | undefined): string[] {
  if (Array.isArray(value)) {
    return value.map((item) => item.trim()).filter(Boolean);
  }

  return value && value.trim() ? [value.trim()] : [];
}

function toNumber(value?: string) {
  if (!value) {
    return undefined;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}
