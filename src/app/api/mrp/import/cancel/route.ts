/**
 * POST /api/mrp/import/cancel — descarta anexos ainda não confirmados
 * ("Limpar anexos"). Marca os históricos como CANCELLED; nada é apagado.
 *
 * Corpo: { importIds: string[] }
 */
import { type NextRequest } from "next/server";
import { requireRole } from "@/lib/auth-guard";
import { badRequest, errorMessage, ok, serverError } from "@/lib/api-response";
import { cancelMrpImports } from "@/services/mrp-import.service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const denied = await requireRole(request, ["ADMIN", "GESTOR"]);
  if (denied) return denied;
  try {
    const body = (await request.json().catch(() => null)) as { importIds?: unknown } | null;
    const ids = Array.isArray(body?.importIds) ? body!.importIds.filter((x): x is string => typeof x === "string" && !!x) : [];
    if (!ids.length) return badRequest("Informe as importações a descartar.");
    return ok({ cancelled: await cancelMrpImports(ids) });
  } catch (error) {
    return serverError("Não foi possível descartar os anexos.", errorMessage(error));
  }
}
