import { NextResponse, type NextRequest } from "next/server";
import { requireRole } from "@/lib/auth-guard";
import { AssetValidationError, deleteTool, updateTool } from "@/services/collaborator-assets.service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// PATCH: atualiza uma ferramenta (ADMIN/GESTOR).
export async function PATCH(request: NextRequest, { params }: { params: { id: string; toolId: string } }) {
  const denied = await requireRole(request, ["ADMIN", "GESTOR"]);
  if (denied) return denied;

  try {
    const body = await request.json().catch(() => ({}));
    const tool = await updateTool(params.toolId, body ?? {});
    if (!tool) return NextResponse.json({ ok: false, message: "Ferramenta não encontrada." }, { status: 404 });
    return NextResponse.json({ ok: true, tool });
  } catch (error) {
    if (error instanceof AssetValidationError) {
      return NextResponse.json({ ok: false, message: error.message }, { status: 400 });
    }
    console.error("[collaborators/tools] Falha ao atualizar ferramenta.", error instanceof Error ? error.message : error);
    return NextResponse.json({ ok: false, message: "Não foi possível atualizar a ferramenta." }, { status: 500 });
  }
}

// DELETE: remove uma ferramenta (ADMIN/GESTOR).
export async function DELETE(request: NextRequest, { params }: { params: { id: string; toolId: string } }) {
  const denied = await requireRole(request, ["ADMIN", "GESTOR"]);
  if (denied) return denied;

  try {
    const removed = await deleteTool(params.toolId);
    if (!removed) return NextResponse.json({ ok: false, message: "Ferramenta não encontrada." }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[collaborators/tools] Falha ao remover ferramenta.", error instanceof Error ? error.message : error);
    return NextResponse.json({ ok: false, message: "Não foi possível remover a ferramenta." }, { status: 500 });
  }
}
