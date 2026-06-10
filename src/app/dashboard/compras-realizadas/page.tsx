import { PurchasesCompletedPage } from "@/components/purchases/PurchasesCompletedPage";
import { parsePurchaseQueryParams, queryParamsToFilters } from "@/components/purchases/filters";
import { getCompletedPurchasesPageData } from "@/services/purchases.service";

export const dynamic = "force-dynamic";

type SearchParams = Record<string, string | string[] | undefined>;

export default async function ComprasRealizadasPage({ searchParams = {} }: { searchParams?: SearchParams }) {
  const params = parsePurchaseQueryParams(searchParams);
  const data = await getCompletedPurchasesPageData(params);
  const appliedFilters = queryParamsToFilters(params);

  return <PurchasesCompletedPage data={data} appliedFilters={appliedFilters} />;
}
