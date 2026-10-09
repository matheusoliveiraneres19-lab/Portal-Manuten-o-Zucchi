/**
 * POST /api/mrp/update-all — "Atualizar tudo" da Análise MRP.
 *
 * Confirma as planilhas (FASE C) e roda o motor (FASE D). A Base MRP nova, se
 * enviada, só é ativada junto com a nova análise, na mesma transação. Em
 * qualquer falha, a análise e a base vigentes continuam como estavam.
 *
 * Duas etapas, dois registros:
 *   - importação: histórico de importações + auditoria `importar_planilha`
 *     (sucesso sempre que as fontes foram gravadas);
 *   - aplicação da análise: auditoria `mrp_update_success` / `mrp_update_failed`
 *     (resultado MRP_UPDATE_SUCCESS / MRP_UPDATE_FAILED, fontes, run anterior e
 *     novo, erro, tempos).
 * Fontes importadas cuja análise falhou ficam no histórico, sem uso (HTTP 422).
 *
 * Corpo: { items: [{ importId, kind, sheet? }], depositFilter?, defaultArea? }
 */
import { NextResponse, type NextRequest } from "next/server";
import { revalidatePath } from "next/cache";
import { getSession, requireRole } from "@/lib/auth-guard";
import { badRequest, errorMessage, ok, serverError } from "@/lib/api-response";
import { auditImport } from "@/lib/audit-import";
import { getClientIp } from "@/lib/request-ip";
import { prisma } from "@/lib/prisma";
import { isMrpFileKind } from "@/lib/mrp/types";
import { createAuditLog } from "@/services/audit.service";
import { MrpImportError, type MrpConfirmItem } from "@/services/mrp-import.service";
import { MrpPersistenceError } from "@/services/mrp-persistence.service";
import { MRP_ANALYSIS_NOT_APPLIED_MESSAGE, MrpAnalysisNotAppliedError, updateAllMrp } from "@/services/mrp-update.service";
import { AUDIT_ACTIONS, AUDIT_MODULES } from "@/types/audit";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(request: NextRequest) {
  const denied = await requireRole(request, ["ADMIN", "GESTOR"]);
  if (denied) return denied;
  const session = await getSession();
  const startedAt = Date.now();
  let label = "-";
  let items: MrpConfirmItem[] = [];
  let depositFilter: string | undefined;
  const previousRunId = (await prisma.mrpAnalysisRun.findFirst({ where: { isCurrent: true }, select: { id: true } }).catch(() => null))?.id ?? null;

  const auditUpdate = (result: "MRP_UPDATE_SUCCESS" | "MRP_UPDATE_FAILED", details: Record<string, unknown>) =>
    createAuditLog({
      action: result === "MRP_UPDATE_SUCCESS" ? AUDIT_ACTIONS.MRP_UPDATE_SUCCESS : AUDIT_ACTIONS.MRP_UPDATE_FAILED,
      module: AUDIT_MODULES.IMPORTACAO,
      userId: session?.sub ?? null,
      userName: session?.name ?? null,
      entityId: (details.newRunId as string | undefined) ?? previousRunId ?? undefined,
      entityName: "Análise MRP — Atualizar tudo",
      ipAddress: getClientIp(request),
      details: { result, previousRunId, depositFilter: depositFilter ?? null, items: label, routeMs: Date.now() - startedAt, ...details }
    });

  try {
    const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
    if (!body || !Array.isArray(body.items)) return badRequest("Informe as planilhas.", "campo 'items' ausente");
    for (const raw of body.items as unknown[]) {
      const it = (raw ?? {}) as Record<string, unknown>;
      if (typeof it.importId !== "string" || !isMrpFileKind(it.kind)) return badRequest("Planilha inválida.", JSON.stringify(raw));
      items.push({ importId: it.importId, kind: it.kind, sheet: typeof it.sheet === "string" && it.sheet ? it.sheet : undefined });
    }
    label = items.map((i) => `${i.kind}:${i.importId}`).join(", ");
    depositFilter = typeof body.depositFilter === "string" ? body.depositFilter : undefined;

    const result = await updateAllMrp({
      items,
      depositFilter,
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
    await auditUpdate("MRP_UPDATE_SUCCESS", {
      newRunId: result.analysis.runId,
      baseVersionId: result.analysis.baseVersionId,
      stockImportId: result.analysis.stockImportId,
      purchaseImportId: result.analysis.purchaseImportId,
      baseImported: !!result.imported.baseVersionId,
      kpis: result.analysis.kpis,
      metrics: result.analysis.metrics
    });
    revalidatePath("/dashboard/analise-mrp");
    return ok({ runId: result.analysis.runId, kpis: result.analysis.kpis, metrics: result.analysis.metrics, message: result.imported.message, warnings: result.imported.warnings });
  } catch (error) {
    const details = errorMessage(error);
    console.error("[MRP_UPDATE_ALL_FAILED]", details);
    if (error instanceof MrpAnalysisNotAppliedError) {
      // Importação concluída (fontes gravadas, histórico = sucesso); análise NÃO aplicada.
      await auditImport({ request, session, module: "Análise MRP", fileName: label, result: {} });
      await auditUpdate("MRP_UPDATE_FAILED", {
        stage: "analysis",
        newRunId: null,
        baseVersionId: error.imported.baseVersionId ?? null,
        stockImportId: error.imported.stockImportId ?? null,
        purchaseImportId: error.imported.purchaseImportId ?? null,
        importsPersisted: true,
        sourcesUsedByCurrentAnalysis: false,
        error: details
      });
      return NextResponse.json(
        { success: false, error: MRP_ANALYSIS_NOT_APPLIED_MESSAGE, details, code: "MRP_ANALYSIS_NOT_APPLIED", importsPersisted: true },
        { status: 422 }
      );
    }
    await auditImport({ request, session, module: "Análise MRP", fileName: label, error: details });
    await auditUpdate("MRP_UPDATE_FAILED", { stage: "import", newRunId: null, importsPersisted: false, error: details });
    if (error instanceof MrpImportError) return badRequest(error.userMessage, details);
    if (error instanceof MrpPersistenceError) return badRequest(error.message, details);
    return serverError("Não foi possível atualizar a análise. A análise anterior continua vigente.", details);
  }
}
