import { NextResponse, type NextRequest } from "next/server";
import { requireApiSession } from "@/lib/auth-guard";
import {
  CollaboratorConflictError,
  CollaboratorValidationError,
  getCollaboratorById,
  updateCollaborator
} from "@/services/collaborators.service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = { params: { id: string } };

export async function GET(_request: NextRequest, { params }: RouteContext) {
  const collaborator = await getCollaboratorById(params.id);
  if (!collaborator) {
    return NextResponse.json({ ok: false, message: "Colaborador não encontrado." }, { status: 404 });
  }
  return NextResponse.json({ ok: true, collaborator });
}

export async function PATCH(request: NextRequest, { params }: RouteContext) {
  const { error } = await requireApiSession();
  if (error) return error;

  try {
    const body = (await request.json().catch(() => null)) ?? {};
    const collaborator = await updateCollaborator(params.id, body);
    if (!collaborator) {
      return NextResponse.json({ ok: false, message: "Colaborador não encontrado." }, { status: 404 });
    }
    return NextResponse.json({ ok: true, collaborator });
  } catch (error) {
    if (error instanceof CollaboratorValidationError) {
      return NextResponse.json({ ok: false, message: error.message }, { status: 400 });
    }
    if (error instanceof CollaboratorConflictError) {
      return NextResponse.json({ ok: false, message: error.message }, { status: 409 });
    }
    console.error("[collaborators] Falha ao atualizar.", error instanceof Error ? error.message : "erro desconhecido");
    return NextResponse.json({ ok: false, message: "Não foi possível atualizar o colaborador." }, { status: 500 });
  }
}
