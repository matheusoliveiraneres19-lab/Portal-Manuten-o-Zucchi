import { NextResponse, type NextRequest } from "next/server";
import { getSession } from "@/lib/auth-guard";
import { requireRole } from "@/lib/auth-guard";
import { SettingValidationError, updateSetting } from "@/services/settings.service";
import { createAuditLog } from "@/services/audit.service";
import { getClientIp } from "@/lib/request-ip";
import { AUDIT_ACTIONS, AUDIT_MODULES } from "@/types/audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Edição restrita a administradores e gestores.
const EDIT_ROLES = ["ADMIN", "GESTOR"];

export async function PUT(request: NextRequest, { params }: { params: { category: string; key: string } }) {
  const denied = await requireRole(request, EDIT_ROLES);
  if (denied) return denied;

  const session = await getSession();
  const body = (await request.json().catch(() => null)) as { value?: unknown } | null;
  if (!body || !("value" in body)) {
    return NextResponse.json({ ok: false, message: "Corpo inválido: informe { value }." }, { status: 400 });
  }

  try {
    const updated = await updateSetting(params.category, params.key, body.value, session?.sub);
    await createAuditLog({
      action: AUDIT_ACTIONS.ALTERAR_CONFIGURACAO,
      module: AUDIT_MODULES.CONFIGURACOES,
      userId: session?.sub ?? null,
      userName: session?.name ?? null,
      entityId: `${params.category}:${params.key}`,
      entityName: updated.label,
      ipAddress: getClientIp(request),
      details: { category: params.category, key: params.key, value: updated.value }
    });
    return NextResponse.json({ ok: true, data: updated });
  } catch (error) {
    if (error instanceof SettingValidationError) {
      return NextResponse.json({ ok: false, message: error.message }, { status: 400 });
    }
    console.error("Falha ao atualizar configuração.", error);
    return NextResponse.json({ ok: false, message: "Não foi possível salvar a configuração." }, { status: 500 });
  }
}
