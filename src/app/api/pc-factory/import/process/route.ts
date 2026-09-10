/**
 * POST /api/pc-factory/import/process
 *
 * Baixa a planilha do bucket privado, lê pelas regras oficiais e grava as
 * linhas em ImportStagingRow. A base oficial NÃO é tocada aqui.
 *
 * Chamada em FATIAS: devolve `done: false` + `nextOffset` quando o orçamento de
 * tempo acaba, e o cliente chama de novo. É assim que um arquivo grande é
 * processado sem esbarrar no teto da função serverless.
 *
 * Corpo: { importId, offset? }
 */
import { type NextRequest } from "next/server";
import { requireRole } from "@/lib/auth-guard";
import { badRequest, errorMessage, ok, serverError } from "@/lib/api-response";
import {
  PcFactoryImportError,
  failPcFactoryImport,
  processPcFactoryImport
} from "@/services/importacao/pc-factory-staging.service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
// Teto do plano Pro da Vercel. O service devolve o controle bem antes (≈45 s por
// fatia); esta janela é a folga para a leitura de um arquivo grande.
export const maxDuration = 300;

export async function POST(request: NextRequest) {
  const denied = await requireRole(request, ["ADMIN", "GESTOR"]);
  if (denied) return denied;

  let importId = "";
  try {
    const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
    if (!body) return badRequest("Corpo da requisição inválido.", "JSON malformado");

    importId = typeof body.importId === "string" ? body.importId : "";
    if (!importId) return badRequest("Informe o identificador da importação.", "campo 'importId' ausente");

    const offset = typeof body.offset === "number" && body.offset > 0 ? Math.floor(body.offset) : 0;
    const result = await processPcFactoryImport({ importId, offset });
    return ok(result);
  } catch (error) {
    const details = errorMessage(error);
    console.error("[pc-factory/import/process] Falha ao processar:", details);

    // Marca a importação como falha para o histórico não ficar preso em
    // "Validando" para sempre. A base oficial não foi tocada nesta etapa.
    if (importId) await failPcFactoryImport(importId, error);

    if (error instanceof PcFactoryImportError) {
      // `userMessage` é curta; `details` carrega o diagnóstico de layout completo.
      return badRequest(error.userMessage, details);
    }
    return serverError("Não foi possível processar o arquivo importado.", details);
  }
}
