/**
 * POST /api/mrp/base/restore — "Restaurar base inicial" (a base embutida do
 * HTML, versão SEED_HTML já gravada). Com análise vigente, recalcula com o
 * MESMO estoque e as MESMAS compras (BASE_RESTORE), ativando base e análise
 * juntas. Falhou: nada muda.
 */
import { type NextRequest } from "next/server";
import { revalidatePath } from "next/cache";
import { getSession, requireRole } from "@/lib/auth-guard";
import { badRequest, errorMessage, ok, serverError } from "@/lib/api-response";
import { createAuditLog } from "@/services/audit.service";
import { getClientIp } from "@/lib/request-ip";
import { AUDIT_ACTIONS, AUDIT_MODULES } from "@/types/audit";
import { MrpPersistenceError } from "@/services/mrp-persistence.service";
import { restoreMrpSeedBase } from "@/services/mrp-base-admin.service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(request: NextRequest) {
  const denied = await requireRole(request, ["ADMIN", "GESTOR"]);
  if (denied) return denied;
  const session = await getSession();
  try {
    const result = await restoreMrpSeedBase({ userId: session?.name ?? session?.sub ?? "portal-web" });
    if (!result.unchanged) {
      await createAuditLog({
        action: AUDIT_ACTIONS.ALTERAR_CONFIGURACAO,
        module: AUDIT_MODULES.IMPORTACAO,
        userId: session?.sub ?? null,
        userName: session?.name ?? null,
        entityName: "Base MRP inicial (SEED_HTML)",
        ipAddress: getClientIp(request),
        details: { action: "restaurar_base_mrp", baseVersionId: result.baseVersionId, runId: result.analysis?.runId ?? null }
      });
    }
    revalidatePath("/dashboard/analise-mrp");
    return ok(result);
  } catch (error) {
    const details = errorMessage(error);
    console.error("[MRP_BASE_RESTORE_FAILED]", details);
    if (error instanceof MrpPersistenceError) return badRequest(error.message, details);
    return serverError("Não foi possível restaurar a base inicial. A base e a análise anteriores continuam vigentes.", details);
  }
}
