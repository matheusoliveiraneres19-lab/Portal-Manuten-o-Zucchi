import { ServiceOrdersPage } from "@/components/service-orders/ServiceOrdersPage";
import { getServiceOrdersPageData } from "@/services/service-orders.service";
import type { ServiceOrdersQueryParams } from "@/types/service-orders";

export const dynamic = "force-dynamic";

type OrdensServicoPageProps = {
  searchParams?: Record<string, string | string[] | undefined>;
};

export default async function OrdensServicoPage({ searchParams = {} }: OrdensServicoPageProps) {
  const data = await getServiceOrdersPageData(parseServiceOrderSearchParams(searchParams));

  return <ServiceOrdersPage data={data} />;
}

function parseServiceOrderSearchParams(
  searchParams: Record<string, string | string[] | undefined>
): ServiceOrdersQueryParams {
  return {
    search: getParam(searchParams.search),
    osNumber: getParam(searchParams.osNumber ?? searchParams.ordem),
    status: getParam(searchParams.status) as ServiceOrdersQueryParams["status"],
    equipment: getParam(searchParams.equipment ?? searchParams.objetoTecnico),
    area: getParam(searchParams.area ?? searchParams.centroTrabalho),
    startDate: getParam(searchParams.startDate),
    endDate: getParam(searchParams.endDate),
    planningGroup: getParam(searchParams.planningGroup),
    responsibleName: getParam(searchParams.responsibleName),
    page: toNumber(getParam(searchParams.page)),
    pageSize: toNumber(getParam(searchParams.pageSize))
  };
}

function getParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function toNumber(value?: string) {
  if (!value) {
    return undefined;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}
