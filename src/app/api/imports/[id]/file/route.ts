/**
 * GET /api/imports/[id]/file — URL assinada da planilha original.
 *
 * O bucket `portal-imports` é PRIVADO. O arquivo nunca é servido direto: esta
 * rota valida a sessão e o papel, e só então gera uma URL assinada de 5 minutos
 * no servidor. O link expira sozinho, então repassá-lo não vira acesso
 * permanente ao arquivo.
 *
 * ADMIN/GESTOR apenas — a planilha original contém dados operacionais brutos.
 */
import { type NextRequest } from "next/server";
import { requireRole } from "@/lib/auth-guard";
import { badRequest, errorMessage, notFound, ok, serverError, storageNotConfigured } from "@/lib/api-response";
import { getImportHistoryById } from "@/services/audit.service";
import { getImportFileSignedUrl, importStorageConfigured } from "@/services/import-storage.service";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** Validade do link. Curta de propósito: dá para clicar e baixar, não para circular. */
const SIGNED_URL_TTL_SECONDS = 300;

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  const denied = await requireRole(request, ["ADMIN", "GESTOR"]);
  if (denied) return denied;

  if (!importStorageConfigured()) {
    return storageNotConfigured(
      "Armazenamento de importações não configurado. O arquivo original desta importação não foi guardado."
    );
  }

  try {
    const history = await getImportHistoryById(params.id);
    if (!history) return notFound("Importação não encontrada.");

    if (!history.hasFile || !history.filePath) {
      return badRequest(
        "Esta importação não tem arquivo guardado no Storage.",
        "Importações anteriores à infraestrutura Supabase Pro não preservaram a planilha original."
      );
    }

    // O bucket é lido do registro, não do env: se o bucket padrão mudar amanhã,
    // o link das importações antigas continua apontando para onde o arquivo está.
    const stored = await prisma.importHistory.findUnique({
      where: { id: params.id },
      select: { bucket: true }
    });

    const url = await getImportFileSignedUrl(
      history.filePath,
      SIGNED_URL_TTL_SECONDS,
      stored?.bucket ?? undefined
    );

    return ok({ url, fileName: history.fileName, expiresInSeconds: SIGNED_URL_TTL_SECONDS });
  } catch (error) {
    const details = errorMessage(error);
    console.error("[api/imports/file] Falha ao gerar URL assinada:", details);
    return serverError("Não foi possível gerar o link de download do arquivo.", details);
  }
}
