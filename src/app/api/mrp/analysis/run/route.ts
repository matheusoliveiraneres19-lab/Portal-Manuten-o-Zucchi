/**
 * POST /api/mrp/analysis/run
 *
 * Executa o motor da Análise MRP sobre (Base MRP + estoque + compras) já
 * importados e torna o resultado a análise vigente. Cada chamada cria um NOVO
 * run (snapshot); se falhar, a análise vigente anterior continua.
 *
 * Corpo: { baseVersionId?, stockImportId, purchaseImportId, depositFilter?, trigger? }
 *   baseVersionId ausente -> Base MRP ativa (o id usado fica gravado no run).
 *   trigger: FULL_UPDATE (padrão) | BASE_REIMPORT | BASE_RESTORE
 */
import { type NextRequest } from "next/server";
import { revalidatePath } from "next/cache";
import { getSession, requireRole } from "@/lib/auth-guard";
import { badRequest, errorMessage, ok, serverError } from "@/lib/api-response";
import { runMrpAnalysis } from "@/services/mrp-analysis.service";
import { MRP_RUN_TRIGGERS, MrpPersistenceError, type MrpRunTrigger } from "@/services/mrp-persistence.service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(request: NextRequest) {
  const denied = await requireRole(request, ["ADMIN", "GESTOR"]);
  if (denied) return denied;

  try {
    const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
    if (!body) return badRequest("Corpo da requisição inválido.", "JSON malformado");
    const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : undefined);
    const stockImportId = str(body.stockImportId);
    const purchaseImportId = str(body.purchaseImportId);
    if (!stockImportId || !purchaseImportId) {
      return badRequest("Informe a importação de estoque e a de compras.", "stockImportId/purchaseImportId ausentes");
    }
    const trigger = (str(body.trigger) ?? "FULL_UPDATE") as MrpRunTrigger;
    if (!(MRP_RUN_TRIGGERS as readonly string[]).includes(trigger)) return badRequest("Gatilho inválido.", `trigger=${trigger}`);

    const session = await getSession();
    const result = await runMrpAnalysis({
      baseVersionId: str(body.baseVersionId),
      stockImportId,
      purchaseImportId,
      depositFilter: typeof body.depositFilter === "string" ? body.depositFilter : undefined,
      trigger,
      userId: session?.name ?? session?.sub ?? null
    });
    revalidatePath("/dashboard/analise-mrp");
    return ok(result);
  } catch (error) {
    const details = errorMessage(error);
    console.error("[MRP_ANALYSIS_FAILED]", details);
    if (error instanceof MrpPersistenceError) return badRequest(error.message, details);
    return serverError("Não foi possível executar a análise MRP. A análise vigente foi mantida.", details);
  }
}
