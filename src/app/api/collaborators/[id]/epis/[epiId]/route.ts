import { NextResponse, type NextRequest } from "next/server";
import { requireRole } from "@/lib/auth-guard";
import { AssetValidationError, deleteEpi, updateEpi } from "@/services/collaborator-assets.service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// PATCH: atualiza um EPI (ADMIN/GESTOR).
export async function PATCH(request: NextRequest, { params }: { params: { id: string; epiId: string } }) {
  const denied = await requireRole(request, ["ADMIN", "GESTOR"]);
  if (denied) return denied;

  try {
    const body = await request.json().catch(() => ({}));
    const epi = await updateEpi(params.epiId, body ?? {});
    if (!epi) return NextResponse.json({ ok: false, message: "EPI não encontrado." }, { status: 404 });
    return NextResponse.json({ ok: true, epi });
  } catch (error) {
    if (error instanceof AssetValidationError) {
      return NextResponse.json({ ok: false, message: error.message }, { status: 400 });
    }
    console.error("[collaborators/epis] Falha ao atualizar EPI.", error instanceof Error ? error.message : error);
    return NextResponse.json({ ok: false, message: "Não foi possível atualizar o EPI." }, { status: 500 });
  }
}

// DELETE: remove um EPI (ADMIN/GESTOR).
export async function DELETE(request: NextRequest, { params }: { params: { id: string; epiId: string } }) {
  const denied = await requireRole(request, ["ADMIN", "GESTOR"]);
  if (denied) return denied;

  try {
    const removed = await deleteEpi(params.epiId);
    if (!removed) return NextResponse.json({ ok: false, message: "EPI não encontrado." }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[collaborators/epis] Falha ao remover EPI.", error instanceof Error ? error.message : error);
    return NextResponse.json({ ok: false, message: "Não foi possível remover o EPI." }, { status: 500 });
  }
}
