/**
 * POST /api/mrp/import/preview
 *
 * Recalcula a prévia de UMA planilha já enviada para outro tipo e/ou aba —
 * equivalente ao reatribuir()/trocarAba() do HTML, sem reenviar o arquivo.
 * Também serve para mudar o depósito ou a área padrão antes de confirmar.
 * Não grava dados de MRP.
 *
 * Corpo: { importId, kind?: "base"|"est"|"cmp", sheet?, depositFilter?, defaultArea? }
 */
import { type NextRequest } from "next/server";
import { requireRole } from "@/lib/auth-guard";
import { badRequest, errorMessage, ok, serverError } from "@/lib/api-response";
import { isMrpFileKind } from "@/lib/mrp/types";
import { MrpImportError, previewMrpImport } from "@/services/mrp-import.service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(request: NextRequest) {
  const denied = await requireRole(request, ["ADMIN", "GESTOR"]);
  if (denied) return denied;

  try {
    const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
    if (!body) return badRequest("Corpo da requisição inválido.", "JSON malformado");
    const importId = typeof body.importId === "string" ? body.importId : "";
    if (!importId) return badRequest("Informe o identificador da importação.", "campo 'importId' ausente");
    if (body.kind !== undefined && !isMrpFileKind(body.kind)) return badRequest("Tipo de planilha inválido.", `kind=${String(body.kind)}`);

    const result = await previewMrpImport({
      importId,
      kind: body.kind as "base" | "est" | "cmp" | undefined,
      sheet: typeof body.sheet === "string" && body.sheet ? body.sheet : undefined,
      depositFilter: typeof body.depositFilter === "string" ? body.depositFilter : undefined,
      defaultArea: typeof body.defaultArea === "string" ? body.defaultArea : undefined
    });
    return ok(result);
  } catch (error) {
    const details = errorMessage(error);
    console.error("[MRP_IMPORT_FAILED] etapa=preview", details);
    if (error instanceof MrpImportError) return badRequest(error.userMessage, details);
    return serverError("Não foi possível gerar a prévia da planilha.", details);
  }
}
