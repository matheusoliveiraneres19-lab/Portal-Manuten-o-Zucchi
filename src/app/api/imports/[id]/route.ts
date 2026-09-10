/**
 * GET /api/imports/[id] — detalhes de uma importação.
 *
 * Alimenta o modal "Detalhes da Importação" (Configurações → Histórico de
 * Importações): resumo, contadores, metadata, caminho do arquivo no Storage e
 * as linhas que o staging reprovou.
 *
 * ADMIN/GESTOR apenas: a metadata carrega o diagnóstico interno da importação
 * (layout detectado, nomes de coluna, motivos de erro).
 *
 * Usa o contrato JSON padronizado de src/lib/api-response.ts — nunca devolve
 * HTML, para o `res.json()` do front nunca quebrar com "Unexpected token '<'".
 */
import { type NextRequest } from "next/server";
import { requireRole } from "@/lib/auth-guard";
import { errorMessage, notFound, ok, serverError } from "@/lib/api-response";
import {
  getImportHistoryById,
  getImportStagingErrors,
  getImportStagingSummary
} from "@/services/audit.service";
import { importStorageConfigured } from "@/services/import-storage.service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  const denied = await requireRole(request, ["ADMIN", "GESTOR"]);
  if (denied) return denied;

  try {
    const history = await getImportHistoryById(params.id);
    if (!history) return notFound("Importação não encontrada.");

    const [stagingSummary, stagingErrors] = await Promise.all([
      getImportStagingSummary(params.id),
      getImportStagingErrors(params.id, 50)
    ]);

    return ok({
      import: history,
      stagingSummary,
      stagingErrors,
      // O botão de download só aparece quando há arquivo E o Storage responde.
      canDownload: history.hasFile && importStorageConfigured()
    });
  } catch (error) {
    const details = errorMessage(error);
    console.error("[api/imports] Falha ao carregar detalhes da importação:", details);
    return serverError("Não foi possível carregar os detalhes da importação.", details);
  }
}
