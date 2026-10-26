/**
 * POST /api/mrp/import/upload-url
 *
 * URL ASSINADA para o navegador enviar a planilha da Análise MRP (MRP, estoque
 * ou compras) DIRETO ao bucket privado, sem passar pelo corpo da função da
 * Vercel. O tipo da planilha ainda não é conhecido aqui — ele sai da detecção
 * por cabeçalhos em /inspect —, então as três usam a pasta imports/analise-mrp/.
 *
 * Corpo: { fileName }
 */
import { type NextRequest } from "next/server";
import { ImportType } from "@prisma/client";
import { requireRole } from "@/lib/auth-guard";
import { badRequest, errorMessage, ok, serverError, storageNotConfigured } from "@/lib/api-response";
import {
  ImportFileRejectedError,
  createImportUploadUrl,
  importStorageConfigured,
  resolveContentType
} from "@/services/import-storage.service";
import { getStoragePublicApiKey } from "@/lib/supabase-storage";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const denied = await requireRole(request, ["ADMIN", "GESTOR"]);
  if (denied) return denied;

  if (!importStorageConfigured()) {
    return storageNotConfigured(
      "Armazenamento de importações não configurado.",
      "SUPABASE_URL e/ou SUPABASE_SERVICE_ROLE_KEY ausentes"
    );
  }

  try {
    const body = (await request.json().catch(() => null)) as { fileName?: unknown } | null;
    const fileName = typeof body?.fileName === "string" ? body.fileName.trim() : "";
    if (!fileName) return badRequest("Informe o nome do arquivo a enviar.", "campo 'fileName' ausente");

    // Qualquer um dos três tipos MRP aponta para a mesma pasta (analise-mrp).
    const upload = await createImportUploadUrl(ImportType.MRP_STOCK, fileName);
    console.info(`[MRP_STORAGE_UPLOAD_READY] bucket=${upload.bucket} path=${upload.path}`);

    // `apiKey` é a chave pública (anon); quem autoriza é o token da URL. A
    // SERVICE ROLE KEY nunca sai do servidor.
    return ok({
      uploadUrl: upload.uploadUrl,
      path: upload.path,
      bucket: upload.bucket,
      contentType: resolveContentType(fileName),
      apiKey: getStoragePublicApiKey()
    });
  } catch (error) {
    if (error instanceof ImportFileRejectedError) return badRequest(error.message);
    const details = errorMessage(error);
    console.error("[mrp/import/upload-url] Falha ao gerar URL assinada:", details);
    return serverError("Não foi possível preparar o envio do arquivo.", details);
  }
}
