import { NextResponse, type NextRequest } from "next/server";
import { requireApiSession } from "@/lib/auth-guard";
import { updateVacation } from "@/services/collaborators.service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = { params: { id: string } };

/** Edição de férias restrita a ADMIN/GESTOR (defesa em profundidade). */
export async function PATCH(request: NextRequest, { params }: RouteContext) {
  const { error } = await requireApiSession(["ADMIN", "GESTOR"]);
  if (error) return error;

  try {
    const body = (await request.json().catch(() => null)) as
      | { vacationStartDate?: string | null; acquisitionPeriodStart?: string | null }
      | null;
    const collaborator = await updateVacation(params.id, body ?? {});
    if (!collaborator) {
      return NextResponse.json({ ok: false, message: "Colaborador não encontrado." }, { status: 404 });
    }
    return NextResponse.json({ ok: true, collaborator });
  } catch (error) {
    console.error("[collaborators] Falha ao atualizar férias.", error instanceof Error ? error.message : "erro desconhecido");
    return NextResponse.json({ ok: false, message: "Não foi possível atualizar as férias." }, { status: 500 });
  }
}
