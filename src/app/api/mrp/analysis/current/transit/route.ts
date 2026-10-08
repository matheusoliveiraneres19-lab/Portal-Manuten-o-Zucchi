/**
 * GET /api/mrp/analysis/current/transit — aba EM TRÂNSITO: última compra de
 * cada material da importação de compras usada pela análise vigente.
 *
 * Query: transitQ, transitStatus (pend|rec|sem|all), transitMrp (1 = só base), limit (200, 600…)
 * `listing: null` quando ainda não existe análise.
 */
import { type NextRequest } from "next/server";
import { requireApiSession } from "@/lib/auth-guard";
import { errorMessage, ok, serverError } from "@/lib/api-response";
import { parseMrpBuyLimit } from "@/lib/mrp/buy-list";
import { parseMrpTransitFilters } from "@/lib/mrp/transit";
import { getCurrentMrpTransitListing } from "@/services/mrp-transit.service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const { error } = await requireApiSession();
  if (error) return error;
  try {
    const sp = request.nextUrl.searchParams;
    const listing = await getCurrentMrpTransitListing(parseMrpTransitFilters((k) => sp.get(k)), parseMrpBuyLimit(sp.get("limit")));
    if (process.env.NODE_ENV === "development" && listing) {
      console.info(`[MRP_TRANSIT_LIST] run=${listing.runId} filtro=${listing.filteredCount}/${listing.totalGroups} consultas=${listing.queries}`);
    }
    return ok({ listing });
  } catch (err) {
    return serverError("Não foi possível carregar as compras em trânsito.", errorMessage(err));
  }
}
