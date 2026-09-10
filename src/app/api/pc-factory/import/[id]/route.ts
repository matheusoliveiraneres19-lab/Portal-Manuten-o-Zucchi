/**
 * GET /api/pc-factory/import/[id]
 *
 * Estado de uma importação do PC-Factory: estágio, contadores, quantas linhas
 * há no staging e a auditoria da leitura. Serve para o modal reabrir o progresso
 * e para diagnosticar uma importação que ficou pelo caminho.
 */
import { type NextRequest } from "next/server";
import { requireRole } from "@/lib/auth-guard";
import { errorMessage, notFound, ok, serverError } from "@/lib/api-response";
import { getPcFactoryImportState } from "@/services/importacao/pc-factory-staging.service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  const denied = await requireRole(request, ["ADMIN", "GESTOR"]);
  if (denied) return denied;

  try {
    const state = await getPcFactoryImportState(params.id);
    if (!state) return notFound("Importação do PC-Factory não encontrada.");
    return ok(state);
  } catch (error) {
    const details = errorMessage(error);
    console.error("[pc-factory/import/:id] Falha ao ler o estado:", details);
    return serverError("Não foi possível consultar o estado da importação.", details);
  }
}
