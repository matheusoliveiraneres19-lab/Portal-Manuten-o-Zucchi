/**
 * POST /api/mrp/base/replace — atualiza SÓ a Base MRP (envio pela aba Base MRP).
 *
 * A planilha já foi enviada ao Storage e inspecionada (/api/mrp/import/upload-url
 * + /inspect + /preview com kind "base"). Grava uma nova versão e, se houver
 * análise vigente, recalcula com o MESMO estoque e as MESMAS compras
 * (BASE_REIMPORT), ativando base e análise juntas. Falhou: nada muda.
 *
 * Corpo: { importId, sheet?, defaultArea? }
 */
import { type NextRequest } from "next/server";
import { revalidatePath } from "next/cache";
import { getSession, requireRole } from "@/lib/auth-guard";
import { badRequest, errorMessage, ok, serverError } from "@/lib/api-response";
import { auditImport } from "@/lib/audit-import";
import { MrpImportError } from "@/services/mrp-import.service";
import { MrpPersistenceError } from "@/services/mrp-persistence.service";
import { replaceMrpBaseFromImport } from "@/services/mrp-base-admin.service";

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
    importId = typeof body?.importId === "string" ? body.importId : "";
    if (!importId) return badRequest("Informe a planilha do MRP enviada.", "campo 'importId' ausente");
    const result = await replaceMrpBaseFromImport({
      importId,
      sheet: typeof body?.sheet === "string" && body.sheet ? body.sheet : undefined,
      defaultArea: typeof body?.defaultArea === "string" ? body.defaultArea : undefined,
      userId: session?.name ?? session?.sub ?? "portal-web"
    });
    await auditImport({ request, session, module: "Análise MRP — Base MRP", fileName: importId, result: { importedRows: result.analysis?.kpis.total ?? 0 } });
    revalidatePath("/dashboard/analise-mrp");
    return ok(result);
  } catch (error) {
    const details = errorMessage(error);
    console.error("[MRP_BASE_REPLACE_FAILED]", details);
    await auditImport({ request, session, module: "Análise MRP — Base MRP", fileName: importId || "-", error: details });
    if (error instanceof MrpImportError) return badRequest(error.userMessage, details);
    if (error instanceof MrpPersistenceError) return badRequest(error.message, details);
    return serverError("Não foi possível atualizar a Base MRP. A base e a análise anteriores continuam vigentes.", details);
  }
}
