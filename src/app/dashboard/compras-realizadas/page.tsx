import { PurchasesCompletedPage } from "@/components/purchases/PurchasesCompletedPage";
import { parsePurchaseQueryParams, queryParamsToFilters } from "@/components/purchases/filters";
import { getCompletedPurchasesPageData } from "@/services/purchases.service";

export const dynamic = "force-dynamic";

type SearchParams = Record<string, string | string[] | undefined>;

export default async function ComprasRealizadasPage({ searchParams = {} }: { searchParams?: SearchParams }) {
  // "Prioridade" é filtro da aba Compras Pendentes (a prioridade orienta a FILA
  // de compra; aqui o item já foi comprado) e não é oferecido nesta tela. É
  // DESCARTADO para que um parâmetro herdado da URL da outra aba não recorte
  // silenciosamente esta — mesmo motivo de "Tipo"/"Status" lá.
  const params = { ...parsePurchaseQueryParams(searchParams), priorities: [] };
  const data = await getCompletedPurchasesPageData(params);
  const appliedFilters = queryParamsToFilters(params);

  return <PurchasesCompletedPage data={data} appliedFilters={appliedFilters} />;
}
