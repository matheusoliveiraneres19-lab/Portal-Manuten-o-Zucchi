/**
 * GET /api/mrp/import/[id] — estado de uma importação da Análise MRP
 * (estágio, status, tipo/aba escolhidos, avisos e mensagem de erro).
 */
import { type NextRequest } from "next/server";
import { requireRole } from "@/lib/auth-guard";
import { errorMessage, notFound, ok, serverError } from "@/lib/api-response";
import { getMrpImportState } from "@/services/mrp-import.service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  const denied = await requireRole(request, ["ADMIN", "GESTOR"]);
  if (denied) return denied;
  try {
    const state = await getMrpImportState(params.id);
    if (!state) return notFound("Importação MRP não encontrada.");
    return ok(state);
  } catch (error) {
    return serverError("Não foi possível consultar a importação.", errorMessage(error));
  }
}
