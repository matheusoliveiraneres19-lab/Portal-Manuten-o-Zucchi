import { NextResponse, type NextRequest } from "next/server";
import { requireRole } from "@/lib/auth-guard";
import { AssetValidationError, createTool, listTools } from "@/services/collaborator-assets.service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// GET: lista ferramentas do colaborador (qualquer sessão autenticada).
export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  const denied = await requireRole(request, []);
  if (denied) return denied;

  try {
    const tools = await listTools(params.id);
    return NextResponse.json({ ok: true, tools });
  } catch (error) {
    console.error("[collaborators/tools] Falha ao listar ferramentas.", error instanceof Error ? error.message : error);
    return NextResponse.json({ ok: false, message: "Não foi possível carregar as ferramentas." }, { status: 500 });
  }
}

// POST: cadastra uma ferramenta (ADMIN/GESTOR).
export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  const denied = await requireRole(request, ["ADMIN", "GESTOR"]);
  if (denied) return denied;

  try {
    const body = await request.json().catch(() => ({}));
    const tool = await createTool(params.id, body ?? {});
    return NextResponse.json({ ok: true, tool }, { status: 201 });
  } catch (error) {
    if (error instanceof AssetValidationError) {
      return NextResponse.json({ ok: false, message: error.message }, { status: 400 });
    }
    console.error("[collaborators/tools] Falha ao criar ferramenta.", error instanceof Error ? error.message : error);
    return NextResponse.json({ ok: false, message: "Não foi possível salvar a ferramenta." }, { status: 500 });
  }
}
