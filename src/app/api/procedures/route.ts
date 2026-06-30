import { NextResponse, type NextRequest } from "next/server";
import { getSession, requireRole } from "@/lib/auth-guard";
import {
  ProcedureConflictError,
  ProcedureValidationError,
  createProcedure,
  getProcedures
} from "@/services/procedures.service";
import { createAuditLog } from "@/services/audit.service";
import { getClientIp } from "@/lib/request-ip";
import { AUDIT_ACTIONS, AUDIT_MODULES } from "@/types/audit";
import { PROCEDURE_WRITE_ROLES } from "@/constants/procedure-categories";
import type { ProcedureSort } from "@/types/procedures";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function parseSort(value: string | null): ProcedureSort | undefined {
  return value === "popular" || value === "title" || value === "recent" ? value : undefined;
}

export async function GET(request: NextRequest) {
  const sp = request.nextUrl.searchParams;
  const result = await getProcedures({
    search: sp.get("q")?.trim() || undefined,
    categoryName: sp.get("category")?.trim() || undefined,
    level: sp.get("level")?.trim() || undefined,
    status: sp.get("status")?.trim() || undefined,
    includeArchived: sp.get("includeArchived") === "1",
    sort: parseSort(sp.get("sort"))
  });
  return NextResponse.json({ ok: true, data: result });
}

export async function POST(request: NextRequest) {
  const denied = await requireRole(request, PROCEDURE_WRITE_ROLES);
  if (denied) return denied;

  try {
    const body = (await request.json().catch(() => null)) ?? {};
    const procedure = await createProcedure(body);
    const session = await getSession();
    await createAuditLog({
      action: AUDIT_ACTIONS.CRIAR_PROCEDIMENTO,
      module: AUDIT_MODULES.PROCEDIMENTOS,
      userId: session?.sub ?? null,
      userName: session?.name ?? null,
      entityId: procedure.id,
      entityName: procedure.title,
      ipAddress: getClientIp(request)
    });
    return NextResponse.json({ ok: true, procedure }, { status: 201 });
  } catch (error) {
    if (error instanceof ProcedureValidationError) {
      return NextResponse.json({ ok: false, message: error.message }, { status: 400 });
    }
    if (error instanceof ProcedureConflictError) {
      return NextResponse.json({ ok: false, message: error.message }, { status: 409 });
    }
    console.error("[procedures] Falha ao criar.", error instanceof Error ? error.message : "erro desconhecido");
    return NextResponse.json({ ok: false, message: "Não foi possível criar o procedimento." }, { status: 500 });
  }
}
