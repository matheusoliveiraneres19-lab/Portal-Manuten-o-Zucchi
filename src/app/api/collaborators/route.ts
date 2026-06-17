import { NextResponse, type NextRequest } from "next/server";
import { requireApiSession } from "@/lib/auth-guard";
import {
  CollaboratorConflictError,
  CollaboratorValidationError,
  coerceArea,
  coerceStatus,
  createCollaborator,
  listCollaborators
} from "@/services/collaborators.service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function parsePage(value: string | null): number | undefined {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : undefined;
}

export async function GET(request: NextRequest) {
  const sp = request.nextUrl.searchParams;
  const result = await listCollaborators({
    status: coerceStatus(sp.get("status") ?? undefined),
    area: coerceArea(sp.get("area") ?? undefined),
    search: sp.get("q")?.trim() || undefined,
    page: parsePage(sp.get("page")),
    pageSize: parsePage(sp.get("pageSize"))
  });
  return NextResponse.json(result);
}

export async function POST(request: NextRequest) {
  const { error } = await requireApiSession();
  if (error) return error;

  try {
    const body = (await request.json().catch(() => null)) ?? {};
    const collaborator = await createCollaborator(body);
    return NextResponse.json({ ok: true, collaborator }, { status: 201 });
  } catch (error) {
    if (error instanceof CollaboratorValidationError) {
      return NextResponse.json({ ok: false, message: error.message }, { status: 400 });
    }
    if (error instanceof CollaboratorConflictError) {
      return NextResponse.json({ ok: false, message: error.message }, { status: 409 });
    }
    console.error("[collaborators] Falha ao criar.", error instanceof Error ? error.message : "erro desconhecido");
    return NextResponse.json({ ok: false, message: "Não foi possível criar o colaborador." }, { status: 500 });
  }
}
