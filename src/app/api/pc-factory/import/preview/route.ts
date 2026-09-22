/**
 * POST /api/pc-factory/import/preview
 *
 * Mede o que a aplicação FARIA, sem escrever nada: período detectado no
 * arquivo, linhas válidas, quantas são inéditas, quantas já existem e quantos
 * registros a base já tem dentro daquela janela.
 *
 * É o que alimenta a tela de confirmação — inclusive o alerta "já existem dados
 * para este período", que é a única situação em que o operador pode escolher
 * substituir. Sem esta etapa, a decisão de apagar algo seria cega.
 *
 * Corpo: { importId }
 */
import { type NextRequest } from "next/server";
import { requireRole } from "@/lib/auth-guard";
import { badRequest, errorMessage, ok, serverError } from "@/lib/api-response";
import {
  PcFactoryImportError,
  getPcFactoryImportState,
  previewPcFactoryImport
} from "@/services/importacao/pc-factory-staging.service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 120;

export async function POST(request: NextRequest) {
  const denied = await requireRole(request, ["ADMIN", "GESTOR"]);
  if (denied) return denied;

  try {
    const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
    if (!body) return badRequest("Corpo da requisição inválido.", "JSON malformado");

    const importId = typeof body.importId === "string" ? body.importId : "";
    if (!importId) return badRequest("Informe o identificador da importação.", "campo 'importId' ausente");

    const state = await getPcFactoryImportState(importId);
    if (!state) return badRequest("Importação não encontrada.", `importId=${importId}`);

    const preview = await previewPcFactoryImport(importId);

    console.info(
      `[PC_FACTORY_IMPORT_PREVIEW] importId=${importId} periodo=${preview.period.start ?? "-"}..${preview.period.end ?? "-"} ` +
        `validas=${preview.validRows} novas=${preview.newRecords} duplicadas=${preview.duplicateRecords} ` +
        `existentesNoPeriodo=${preview.existingInPeriod}`
    );

    return ok({ ...preview, fileName: state.fileName });
  } catch (error) {
    const details = errorMessage(error);
    console.error("[PC_FACTORY_IMPORT_FAILED] etapa=preview", details);
    if (error instanceof PcFactoryImportError) return badRequest(error.userMessage, details);
    // A prévia não escreve nada: falhar aqui não deixa a base em estado algum.
    return serverError("Não foi possível analisar a importação.", details);
  }
}
