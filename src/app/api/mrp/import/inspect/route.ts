/**
 * POST /api/mrp/import/inspect
 *
 * Depois do upload ao bucket: lê cada arquivo, identifica o tipo (Planilha do
 * MRP / Estoque / Compras) e a melhor aba pelos cabeçalhos, encaixa nos slots
 * como o HTML de referência e devolve a prévia de cada um + o estado da trava
 * do "Atualizar tudo". Abre um ImportHistory (UPLOADED) por arquivo; nenhum
 * dado de MRP é gravado.
 *
 * Corpo: { files: [{ fileName, filePath, bucket?, fileSize?, mimeType? }], depositFilter?, defaultArea?,
 *         currentSlots?: { base?: importId, est?: importId, cmp?: importId } }
 */
import { type NextRequest } from "next/server";
import { getSession, requireRole } from "@/lib/auth-guard";
import { badRequest, errorMessage, ok, serverError } from "@/lib/api-response";
import { MrpImportError, inspectMrpUploads, type MrpUploadedFileRef } from "@/services/mrp-import.service";
import { isMrpFileKind, type MrpFileKind } from "@/lib/mrp/types";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;

function parseFiles(value: unknown): MrpUploadedFileRef[] | null {
  if (!Array.isArray(value) || !value.length) return null;
  const files: MrpUploadedFileRef[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object") return null;
    const f = item as Record<string, unknown>;
    if (typeof f.fileName !== "string" || !f.fileName.trim() || typeof f.filePath !== "string" || !f.filePath.trim()) return null;
    files.push({
      fileName: f.fileName.trim(),
      filePath: f.filePath.trim(),
      bucket: typeof f.bucket === "string" && f.bucket ? f.bucket : undefined,
      fileSize: typeof f.fileSize === "number" && f.fileSize > 0 ? Math.round(f.fileSize) : undefined,
      mimeType: typeof f.mimeType === "string" ? f.mimeType : undefined
    });
  }
  return files;
}

function parseCurrentSlots(value: unknown): Partial<Record<MrpFileKind, string>> | undefined {
  if (!value || typeof value !== "object") return undefined;
  const out: Partial<Record<MrpFileKind, string>> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) if (isMrpFileKind(k) && typeof v === "string" && v) out[k] = v;
  return out;
}

export async function POST(request: NextRequest) {
  const denied = await requireRole(request, ["ADMIN", "GESTOR"]);
  if (denied) return denied;

  try {
    const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
    if (!body) return badRequest("Corpo da requisição inválido.", "JSON malformado");
    const files = parseFiles(body.files);
    if (!files) return badRequest("Informe os arquivos enviados.", "campo 'files' ausente ou inválido");

    const session = await getSession();
    const result = await inspectMrpUploads({
      files,
      importedBy: session?.name ?? session?.sub ?? "portal-web",
      depositFilter: typeof body.depositFilter === "string" ? body.depositFilter : undefined,
      defaultArea: typeof body.defaultArea === "string" ? body.defaultArea : undefined,
      currentSlots: parseCurrentSlots(body.currentSlots)
    });
    console.info(
      `[MRP_IMPORT_INSPECT] arquivos=${files.length} base=${result.slots.base?.fileName ?? "-"} ` +
        `est=${result.slots.est?.fileName ?? "-"} cmp=${result.slots.cmp?.fileName ?? "-"} pronto=${result.lock.ready}`
    );
    return ok(result);
  } catch (error) {
    const details = errorMessage(error);
    console.error("[MRP_IMPORT_FAILED] etapa=inspect", details);
    if (error instanceof MrpImportError) return badRequest(error.userMessage, details);
    return serverError("Não foi possível analisar as planilhas enviadas.", details);
  }
}
