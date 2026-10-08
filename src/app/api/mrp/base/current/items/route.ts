/**
 * GET /api/mrp/base/current/items — "Materiais cadastrados" da Base MRP exibida.
 *
 * Query: baseQ, baseArea, baseFilter (all|semparam|conj), limit (200, 600…)
 * `listing: null` quando não existe Base MRP.
 */
import { type NextRequest } from "next/server";
import { requireApiSession } from "@/lib/auth-guard";
import { errorMessage, ok, serverError } from "@/lib/api-response";
import { parseMrpBuyLimit } from "@/lib/mrp/buy-list";
import { parseMrpBaseViewFilters } from "@/lib/mrp/base-view";
import { getCurrentMrpBaseListing } from "@/services/mrp-base-view.service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const { error } = await requireApiSession();
  if (error) return error;
  try {
    const sp = request.nextUrl.searchParams;
    return ok({ listing: await getCurrentMrpBaseListing(parseMrpBaseViewFilters((k) => sp.get(k)), parseMrpBuyLimit(sp.get("limit"))) });
  } catch (err) {
    return serverError("Não foi possível carregar os materiais da Base MRP.", errorMessage(err));
  }
}
