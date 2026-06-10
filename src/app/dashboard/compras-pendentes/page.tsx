import { PurchasesPendingPage } from "@/components/purchases/PurchasesPendingPage";
import { parsePurchaseQueryParams, queryParamsToFilters } from "@/components/purchases/filters";
import { getPendingPurchasesPageData } from "@/services/purchases.service";

export const dynamic = "force-dynamic";

type SearchParams = Record<string, string | string[] | undefined>;

export default async function ComprasPendentesPage({ searchParams = {} }: { searchParams?: SearchParams }) {
  const params = parsePurchaseQueryParams(searchParams);
  const data = await getPendingPurchasesPageData(params);
  const appliedFilters = queryParamsToFilters(params);

  return <PurchasesPendingPage data={data} appliedFilters={appliedFilters} />;
}
