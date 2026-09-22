/**
 * POST /api/pc-factory/import/finish
 *
 * Aplica o staging validado em `PcFactoryRecord`, dentro de UMA transação.
 * É o único ponto de todo o fluxo em que a base oficial muda.
 *
 * `mode` decide o que acontece com o histórico:
 *   INCREMENTAL (padrão)  acrescenta; NADA é apagado; duplicados são pulados.
 *   REPLACE_PERIOD        apaga SOMENTE a janela do arquivo e reinsere.
 *
 * Corpo ausente, inválido ou com modo desconhecido → INCREMENTAL. O caminho que
 * apaga alguma coisa só é tomado quando explicitamente pedido.
 *
 * Se qualquer coisa falhar, a transação reverte e a base anterior continua
 * exatamente como estava — a importação é marcada como FAILED e o usuário
 * recebe uma mensagem em português dizendo isso.
 *
 * Corpo: { importId, mode? }
 */
import { type NextRequest } from "next/server";
import { revalidatePath } from "next/cache";
import { getSession, requireRole } from "@/lib/auth-guard";
import { badRequest, errorMessage, ok, serverError } from "@/lib/api-response";
import { auditImport } from "@/lib/audit-import";
import {
  PcFactoryImportError,
  clearPcFactoryStaging,
  failPcFactoryImport,
  finishPcFactoryImport,
  getPcFactoryImportState
} from "@/services/importacao/pc-factory-staging.service";
import {
  PC_FACTORY_DEFAULT_IMPORT_MODE,
  isPcFactoryImportMode
} from "@/types/pc-factory-import-mode";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(request: NextRequest) {
  const denied = await requireRole(request, ["ADMIN", "GESTOR"]);
  if (denied) return denied;

  const session = await getSession();
  let importId = "";

  try {
    const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
    if (!body) return badRequest("Corpo da requisição inválido.", "JSON malformado");

    importId = typeof body.importId === "string" ? body.importId : "";
    if (!importId) return badRequest("Informe o identificador da importação.", "campo 'importId' ausente");

    // Modo desconhecido/ausente cai no INCREMENTAL, que não apaga nada. Um erro
    // de digitação no corpo da requisição nunca pode virar exclusão de dados.
    const mode = isPcFactoryImportMode(body.mode) ? body.mode : PC_FACTORY_DEFAULT_IMPORT_MODE;

    const state = await getPcFactoryImportState(importId);
    const fileName = state?.fileName ?? "(desconhecido)";

    console.info(`[PC_FACTORY_IMPORT_APPLY] importId=${importId} file="${fileName}" modo=${mode}`);

    const result = await finishPcFactoryImport({ importId, mode });

    console.info(
      `[PC_FACTORY_IMPORT_DONE] importId=${importId} modo=${result.mode} ` +
        `inseridos=${result.appliedRows} duplicados=${result.duplicateRows} removidos=${result.replacedRows} ` +
        `periodo=${result.period.start ?? "-"}..${result.period.end ?? "-"}`
    );

    await auditImport({ request, session, module: "PC-Factory", fileName, result });

    // O staging já cumpriu o papel; a trilha de auditoria é o arquivo no bucket.
    // Best-effort: falhar a limpeza não invalida uma importação bem-sucedida.
    await clearPcFactoryStaging(importId).catch(() => undefined);

    // Invalida o cache das telas que leem PcFactoryRecord.
    revalidatePath("/dashboard/pc-factory");
    revalidatePath("/dashboard");
    revalidatePath("/dashboard/configuracoes");

    return ok(result);
  } catch (error) {
    const details = errorMessage(error);
    console.error(`[PC_FACTORY_IMPORT_FAILED] etapa=finish importId=${importId || "-"}`, details);

    if (importId) {
      await failPcFactoryImport(importId, error);
      await auditImport({
        request,
        session,
        module: "PC-Factory",
        fileName: importId,
        error: details
      });
    }

    // As travas do service (sem linha válida, linha inválida, nada gravado) são
    // condições do arquivo, não erro do servidor → 400 com a mensagem pronta.
    if (error instanceof PcFactoryImportError) {
      return badRequest(error.userMessage, details);
    }
    return serverError(
      "Não foi possível aplicar a importação. A base atual do PC-Factory foi mantida.",
      details
    );
  }
}
