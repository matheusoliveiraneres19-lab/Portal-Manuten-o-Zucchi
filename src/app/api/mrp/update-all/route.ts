/**
 * POST /api/mrp/update-all — "Atualizar tudo" da Análise MRP.
 *
 * Confirma as planilhas (FASE C) e roda o motor (FASE D). A Base MRP nova, se
 * enviada, só é ativada junto com a nova análise, na mesma transação. Em
 * qualquer falha, a análise e a base vigentes continuam como estavam.
 *
 * Corpo: { items: [{ importId, kind, sheet? }], depositFilter?, defaultArea? }
 */
import { type NextRequest } from "next/server";
import { revalidatePath } from "next/cache";
import { getSession, requireRole } from "@/lib/auth-guard";
import { badRequest, errorMessage, ok, serverError } from "@/lib/api-response";
import { auditImport } from "@/lib/audit-import";
import { isMrpFileKind } from "@/lib/mrp/types";
import { MrpImportError, type MrpConfirmItem } from "@/services/mrp-import.service";
import { MrpPersistenceError } from "@/services/mrp-persistence.service";
import { updateAllMrp } from "@/services/mrp-update.service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(request: NextRequest) {
  const denied = await requireRole(request, ["ADMIN", "GESTOR"]);
  if (denied) return denied;
  const session = await getSession();
  let label = "-";
  try {
    const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
    if (!body || !Array.isArray(body.items)) return badRequest("Informe as planilhas.", "campo 'items' ausente");
    const items: MrpConfirmItem[] = [];
    for (const raw of body.items as unknown[]) {
      const it = (raw ?? {}) as Record<string, unknown>;
      if (typeof it.importId !== "string" || !isMrpFileKind(it.kind)) return badRequest("Planilha inválida.", JSON.stringify(raw));
      items.push({ importId: it.importId, kind: it.kind, sheet: typeof it.sheet === "string" && it.sheet ? it.sheet : undefined });
    }
    label = items.map((i) => `${i.kind}:${i.importId}`).join(", ");

    const result = await updateAllMrp({
      items,
      depositFilter: typeof body.depositFilter === "string" ? body.depositFilter : undefined,
      defaultArea: typeof body.defaultArea === "string" ? body.defaultArea : undefined,
      userId: session?.name ?? session?.sub ?? "portal-web"
    });
    await auditImport({
      request,
      session,
      module: "Análise MRP",
      fileName: label,
      result: { totalRows: result.analysis.kpis.total, importedRows: result.analysis.kpis.total }
    });
    revalidatePath("/dashboard/analise-mrp");
    return ok({ runId: result.analysis.runId, kpis: result.analysis.kpis, metrics: result.analysis.metrics, message: result.imported.message, warnings: result.imported.warnings });
  } catch (error) {
    const details = errorMessage(error);
    console.error("[MRP_UPDATE_ALL_FAILED]", details);
    await auditImport({ request, session, module: "Análise MRP", fileName: label, error: details });
    if (error instanceof MrpImportError) return badRequest(error.userMessage, details);
    if (error instanceof MrpPersistenceError) return badRequest(error.message, details);
    return serverError("Não foi possível atualizar a análise. A análise anterior continua vigente.", details);
  }
}
