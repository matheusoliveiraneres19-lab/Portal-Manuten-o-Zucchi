/**
 * POST /api/mrp/base/activate
 *
 * Ativa EXPLICITAMENTE uma versão da Base MRP (nova importação ou restauração
 * de uma versão anterior). Usa a transação da FASE B: desativa a vigente e
 * ativa a escolhida; se falhar, a vigente continua ativa.
 *
 * Corpo: { versionId }
 */
import { type NextRequest } from "next/server";
import { revalidatePath } from "next/cache";
import { getSession, requireRole } from "@/lib/auth-guard";
import { badRequest, errorMessage, ok, serverError } from "@/lib/api-response";
import { createAuditLog } from "@/services/audit.service";
import { MrpPersistenceError, activateMrpBaseVersion } from "@/services/mrp-persistence.service";
import { getClientIp } from "@/lib/request-ip";
import { AUDIT_ACTIONS, AUDIT_MODULES } from "@/types/audit";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const denied = await requireRole(request, ["ADMIN", "GESTOR"]);
  if (denied) return denied;

  try {
    const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
    const versionId = typeof body?.versionId === "string" ? body.versionId : "";
    if (!versionId) return badRequest("Informe a versão da Base MRP.", "campo 'versionId' ausente");

    const version = await activateMrpBaseVersion(versionId);
    const session = await getSession();
    await createAuditLog({
      action: AUDIT_ACTIONS.ALTERAR_CONFIGURACAO,
      module: AUDIT_MODULES.IMPORTACAO,
      userId: session?.sub ?? null,
      userName: session?.name ?? null,
      entityName: `Base MRP ${version.fileName}`,
      ipAddress: getClientIp(request),
      details: { action: "ativar_base_mrp", versionId: version.id, materialCount: version.materialCount }
    });
    revalidatePath("/dashboard/analise-mrp");
    return ok({ versionId: version.id, isActive: version.isActive, activatedAt: version.activatedAt, materialCount: version.materialCount });
  } catch (error) {
    const details = errorMessage(error);
    if (error instanceof MrpPersistenceError) return badRequest(error.message, details);
    return serverError("Não foi possível ativar a versão da Base MRP. A versão vigente foi mantida.", details);
  }
}
