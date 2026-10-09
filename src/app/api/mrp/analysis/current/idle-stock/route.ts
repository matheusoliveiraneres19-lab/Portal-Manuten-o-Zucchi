/**
 * GET /api/mrp/analysis/current/idle-stock — aba ESTOQUE PARADO: materiais da
 * análise vigente com noMovement = true.
 *
 * Query: idleQ, idleType (com|sem|all), idleArea, limit (200, 600…)
 * `listing: null` quando ainda não existe análise.
 */
import { type NextRequest } from "next/server";
import { requireApiSession } from "@/lib/auth-guard";
import { errorMessage, ok, serverError } from "@/lib/api-response";
import { parseMrpBuyLimit } from "@/lib/mrp/buy-list";
import { parseMrpIdleFilters } from "@/lib/mrp/idle";
import { getCurrentMrpIdleListing } from "@/services/mrp-idle.service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const { error } = await requireApiSession();
  if (error) return error;
  try {
    const sp = request.nextUrl.searchParams;
    const listing = await getCurrentMrpIdleListing(parseMrpIdleFilters((k) => sp.get(k)), parseMrpBuyLimit(sp.get("limit")));
    if (process.env.NODE_ENV === "development" && listing) {
      console.info(`[MRP_IDLE_LIST] run=${listing.runId} filtro=${listing.filteredCount}/${listing.totalNoMovement} consultas=${listing.queries}`);
    }
    return ok({ listing });
  } catch (err) {
    return serverError("Não foi possível carregar o estoque parado.", errorMessage(err));
  }
}
