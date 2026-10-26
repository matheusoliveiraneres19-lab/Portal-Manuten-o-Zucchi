import { ServiceOrdersPage } from "@/components/service-orders/ServiceOrdersPage";
import { getServiceOrdersPageData } from "@/services/service-orders.service";
import {
  parseAppliedServiceOrderFilters,
  toServiceOrderQueryParams,
  type ServiceOrderSearchParams
} from "@/utils/service-order-query-params";

export const dynamic = "force-dynamic";

type OrdensServicoPageProps = {
  searchParams?: ServiceOrderSearchParams;
};

export default async function OrdensServicoPage({ searchParams = {} }: OrdensServicoPageProps) {
  const applied = parseAppliedServiceOrderFilters(searchParams);
  const queryParams = toServiceOrderQueryParams(applied, searchParams);
  const data = await getServiceOrdersPageData(queryParams);

  return <ServiceOrdersPage data={data} appliedFilters={applied} />;
}
