import { ServiceOrdersPage } from "@/components/service-orders/ServiceOrdersPage";
import { getServiceOrdersPageData } from "@/services/service-orders.service";
import type {
  AppliedServiceOrderFilters,
  ServiceOrdersQueryParams,
  ServiceOrderStatusLabel
} from "@/types/service-orders";

export const dynamic = "force-dynamic";

type SearchParams = Record<string, string | string[] | undefined>;

type OrdensServicoPageProps = {
  searchParams?: SearchParams;
};

export default async function OrdensServicoPage({ searchParams = {} }: OrdensServicoPageProps) {
  const applied = parseAppliedFilters(searchParams);
  const queryParams = toQueryParams(applied, searchParams);
  const data = await getServiceOrdersPageData(queryParams);

  return <ServiceOrdersPage data={data} appliedFilters={applied} />;
}

/** Normaliza os search params da URL em filtros aplicados (com arrays para multi-seleção). */
function parseAppliedFilters(searchParams: SearchParams): AppliedServiceOrderFilters {
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

function toQueryParams(applied: AppliedServiceOrderFilters, searchParams: SearchParams): ServiceOrdersQueryParams {
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
