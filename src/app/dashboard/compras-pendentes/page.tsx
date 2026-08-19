import { PurchasesPendingPage } from "@/components/purchases/PurchasesPendingPage";
import { parsePurchaseQueryParams, queryParamsToFilters } from "@/components/purchases/filters";
import { getPendingPurchasesPageData } from "@/services/purchases.service";

export const dynamic = "force-dynamic";

type SearchParams = Record<string, string | string[] | undefined>;

export default async function ComprasPendentesPage({ searchParams = {} }: { searchParams?: SearchParams }) {
  // "Tipo" e "Status" pertencem ao vocabulário da regra gerencial e são
  // DESCARTADOS aqui: esta aba segue a regra oficial v3.1 e mostra um único
  // status ("Pendente de Compra"). Sem isso, um parâmetro herdado da URL de
  // Compras Realizadas esvaziaria a tabela sem controle visível para desfazer.
  const params = { ...parsePurchaseQueryParams(searchParams), statuses: [], kinds: [] };
  const data = await getPendingPurchasesPageData(params);
  const appliedFilters = queryParamsToFilters(params);

  return <PurchasesPendingPage data={data} appliedFilters={appliedFilters} />;
}
