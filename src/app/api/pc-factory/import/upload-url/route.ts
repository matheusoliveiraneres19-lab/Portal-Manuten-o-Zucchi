/**
 * POST /api/pc-factory/import/upload-url
 *
 * Devolve uma URL ASSINADA para o navegador enviar a planilha DIRETO ao bucket
 * privado `portal-imports`, sem passar pela função serverless.
 *
 * É o que resolve o erro "Unexpected token 'R'": o arquivo nunca mais entra no
 * corpo de um POST, então a Vercel não tem o que recusar com
 * `Request Entity Too Large` (texto puro que quebrava o `response.json()`).
 *
 * Só o NOME do arquivo trafega aqui — o payload é de bytes contados.
 */
import { type NextRequest } from "next/server";
import { requireRole } from "@/lib/auth-guard";
import { badRequest, errorMessage, ok, serverError, storageNotConfigured } from "@/lib/api-response";
import {
  ImportFileRejectedError,
  createImportUploadUrl,
  importStorageConfigured,
  resolveContentType
} from "@/services/import-storage.service";
import { getStoragePublicApiKey } from "@/lib/supabase-storage";
import { IMPORT_MODULES } from "@/types/imports";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const denied = await requireRole(request, ["ADMIN", "GESTOR"]);
  if (denied) return denied;

  if (!importStorageConfigured()) {
    return storageNotConfigured(
      "Armazenamento de importações não configurado. Sem ele, só é possível importar arquivos pequenos.",
      "SUPABASE_URL e/ou SUPABASE_SERVICE_ROLE_KEY ausentes"
    );
  }

  try {
    const body = (await request.json().catch(() => null)) as { fileName?: unknown } | null;
    const fileName = typeof body?.fileName === "string" ? body.fileName.trim() : "";

    if (!fileName) {
      return badRequest("Informe o nome do arquivo a enviar.", "campo 'fileName' ausente");
    }

    const upload = await createImportUploadUrl(IMPORT_MODULES.PC_FACTORY, fileName);

    // Só o destino. A URL assinada carrega um token de escrita e não é logada.
    console.info(`[PC_FACTORY_STORAGE_UPLOAD_READY] bucket=${upload.bucket} path=${upload.path}`);

    // `apiKey` é a chave anon/publishable: o gateway do Supabase exige o header
    // `apikey` em qualquer requisição, mas quem AUTORIZA o upload é o token da URL
    // assinada. É pública por design (protegida por RLS) — mesmo contrato já usado
    // pelo upload de videoaula em /api/procedures/[idOrSlug]/attachments/upload-url.
    // A SERVICE ROLE KEY nunca sai daqui.
    return ok({
      uploadUrl: upload.uploadUrl,
      path: upload.path,
      bucket: upload.bucket,
      contentType: resolveContentType(fileName),
      apiKey: getStoragePublicApiKey()
    });
  } catch (error) {
    // Extensão fora da lista: é escolha do usuário, então 400 com o motivo dele.
    if (error instanceof ImportFileRejectedError) {
      return badRequest(error.message);
    }
    const details = errorMessage(error);
    console.error("[pc-factory/import/upload-url] Falha ao gerar URL assinada:", details);
    return serverError("Não foi possível preparar o envio do arquivo.", details);
  }
}
