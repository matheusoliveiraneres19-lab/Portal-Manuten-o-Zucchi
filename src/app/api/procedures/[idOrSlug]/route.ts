import { NextResponse, type NextRequest } from "next/server";
import { requireRole } from "@/lib/auth-guard";
import {
  ProcedureConflictError,
  ProcedureNotFoundError,
  ProcedureValidationError,
  deleteProcedure,
  getProcedureBySlug,
  updateProcedure
} from "@/services/procedures.service";
import { PROCEDURE_WRITE_ROLES } from "../route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: { idOrSlug: string } };

export async function GET(_request: NextRequest, { params }: Params) {
  const procedure = await getProcedureBySlug(params.idOrSlug);
  if (!procedure) {
    return NextResponse.json({ ok: false, message: "Procedimento não encontrado." }, { status: 404 });
  }
  return NextResponse.json({ ok: true, procedure });
}

export async function PUT(request: NextRequest, { params }: Params) {
  const denied = await requireRole(request, PROCEDURE_WRITE_ROLES);
  if (denied) return denied;

  try {
    const body = (await request.json().catch(() => null)) ?? {};
    const procedure = await updateProcedure(params.idOrSlug, body);
    return NextResponse.json({ ok: true, procedure });
  } catch (error) {
    if (error instanceof ProcedureValidationError) {
      return NextResponse.json({ ok: false, message: error.message }, { status: 400 });
    }
    if (error instanceof ProcedureNotFoundError) {
      return NextResponse.json({ ok: false, message: error.message }, { status: 404 });
    }
    if (error instanceof ProcedureConflictError) {
      return NextResponse.json({ ok: false, message: error.message }, { status: 409 });
    }
    console.error("[procedures] Falha ao atualizar.", error instanceof Error ? error.message : "erro desconhecido");
    return NextResponse.json({ ok: false, message: "Não foi possível atualizar o procedimento." }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest, { params }: Params) {
  const denied = await requireRole(request, PROCEDURE_WRITE_ROLES);
  if (denied) return denied;

  try {
    await deleteProcedure(params.idOrSlug);
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof ProcedureNotFoundError) {
      return NextResponse.json({ ok: false, message: error.message }, { status: 404 });
    }
    console.error("[procedures] Falha ao excluir.", error instanceof Error ? error.message : "erro desconhecido");
    return NextResponse.json({ ok: false, message: "Não foi possível excluir o procedimento." }, { status: 500 });
  }
}
