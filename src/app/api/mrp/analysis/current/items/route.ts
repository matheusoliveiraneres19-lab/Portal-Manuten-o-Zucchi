/**
 * GET /api/mrp/analysis/current/items — lista da aba COMPRAR sobre a análise
 * vigente (somente leitura do que já foi calculado e persistido).
 *
 * Query: q, status (need|Comprar|Verificar|Comprado|OK|all), area, family,
 *        sort (need|qtd|saldo|cod|desc), limit (200, 600, 1000…)
 * Retorna: items, filteredCount, totalCount, suggestedFiltered, hasMore, families.
 * `current: null` quando ainda não existe análise.
 */
import { type NextRequest } from "next/server";
import { requireApiSession } from "@/lib/auth-guard";
import { errorMessage, ok, serverError } from "@/lib/api-response";
import { parseMrpBuyFilters, parseMrpBuyLimit } from "@/lib/mrp/buy-list";
import { getCurrentMrpBuyListing } from "@/services/mrp-listing.service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const { error } = await requireApiSession();
  if (error) return error;
  try {
    const sp = request.nextUrl.searchParams;
    const listing = await getCurrentMrpBuyListing(parseMrpBuyFilters((k) => sp.get(k)), parseMrpBuyLimit(sp.get("limit")));
    if (process.env.NODE_ENV === "development" && listing) {
      console.info(`[MRP_BUY_LIST] run=${listing.runId} filtro=${listing.filteredCount}/${listing.totalCount} consultas=${listing.queries}`);
    }
    return ok({ listing });
  } catch (err) {
    return serverError("Não foi possível carregar a lista de compra.", errorMessage(err));
  }
}
