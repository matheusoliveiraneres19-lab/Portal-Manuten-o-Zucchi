/**
 * POST /api/pc-factory/import/start
 *
 * Abre a sessão de importação DEPOIS de o arquivo já estar no bucket privado.
 * Cria o ImportHistory (stage UPLOADED) apontando para o objeto e devolve o
 * `importId` que conduz o resto do fluxo (process → finish).
 *
 * Corpo: { fileName, filePath, bucket, fileSize, mimeType }
 */
import { type NextRequest } from "next/server";
import { getSession, requireRole } from "@/lib/auth-guard";
import { badRequest, errorMessage, ok, serverError } from "@/lib/api-response";
import { startPcFactoryImport } from "@/services/importacao/pc-factory-staging.service";
import { getImportsBucket } from "@/types/imports";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const denied = await requireRole(request, ["ADMIN", "GESTOR"]);
  if (denied) return denied;

  try {
    const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
    if (!body) return badRequest("Corpo da requisição inválido.", "JSON malformado");

    const fileName = typeof body.fileName === "string" ? body.fileName.trim() : "";
    const filePath = typeof body.filePath === "string" ? body.filePath.trim() : "";
    if (!fileName) return badRequest("Informe o nome do arquivo.", "campo 'fileName' ausente");
    if (!filePath) return badRequest("Informe o caminho do arquivo enviado.", "campo 'filePath' ausente");

    // O caminho tem que ser o que a rota de upload gerou. Aceitar um caminho
    // arbitrário deixaria a rota ler qualquer objeto do bucket.
    if (!filePath.startsWith("imports/pc-factory/")) {
      return badRequest(
        "Caminho de arquivo inválido para o PC-Factory.",
        `esperado prefixo "imports/pc-factory/", recebido "${filePath}"`
      );
    }

    const session = await getSession();
    const { importId } = await startPcFactoryImport({
      fileName,
      filePath,
      bucket: typeof body.bucket === "string" && body.bucket ? body.bucket : getImportsBucket(),
      fileSize: typeof body.fileSize === "number" && body.fileSize > 0 ? Math.round(body.fileSize) : 0,
      mimeType: typeof body.mimeType === "string" ? body.mimeType : "application/octet-stream",
      importedBy: session?.name ?? session?.sub ?? "portal-web"
    });

    return ok({ importId });
  } catch (error) {
    const details = errorMessage(error);
    console.error("[pc-factory/import/start] Falha ao abrir a importação:", details);
    return serverError("Não foi possível iniciar a importação.", details);
  }
}
