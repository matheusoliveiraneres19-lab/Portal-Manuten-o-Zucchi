import { NextResponse, type NextRequest } from "next/server";
import { requireRole } from "@/lib/auth-guard";
import { AssetValidationError, createEpi, listEpis } from "@/services/collaborator-assets.service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// GET: lista EPIs do colaborador (qualquer sessão autenticada).
export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  const denied = await requireRole(request, []);
  if (denied) return denied;

  try {
    const epis = await listEpis(params.id);
    return NextResponse.json({ ok: true, epis });
  } catch (error) {
    console.error("[collaborators/epis] Falha ao listar EPIs.", error instanceof Error ? error.message : error);
    return NextResponse.json({ ok: false, message: "Não foi possível carregar os EPIs." }, { status: 500 });
  }
}

// POST: cadastra um EPI (ADMIN/GESTOR).
export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  const denied = await requireRole(request, ["ADMIN", "GESTOR"]);
  if (denied) return denied;

  try {
    const body = await request.json().catch(() => ({}));
    const epi = await createEpi(params.id, body ?? {});
    return NextResponse.json({ ok: true, epi }, { status: 201 });
  } catch (error) {
    if (error instanceof AssetValidationError) {
      return NextResponse.json({ ok: false, message: error.message }, { status: 400 });
    }
    console.error("[collaborators/epis] Falha ao criar EPI.", error instanceof Error ? error.message : error);
    return NextResponse.json({ ok: false, message: "Não foi possível salvar o EPI." }, { status: 500 });
  }
}
