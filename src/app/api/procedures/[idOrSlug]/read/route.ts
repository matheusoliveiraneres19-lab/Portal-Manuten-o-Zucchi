import { NextResponse, type NextRequest } from "next/server";
import { requireApiSession } from "@/lib/auth-guard";
import { confirmRead, resolveProcedureId } from "@/services/procedures.service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: { idOrSlug: string } };

// POST: registra "Li e estou ciente" do usuário logado (qualquer papel). Idempotente.
export async function POST(_request: NextRequest, { params }: Params) {
  const { session, error } = await requireApiSession();
  if (error) return error;

  const procedureId = await resolveProcedureId(params.idOrSlug);
  if (!procedureId) return NextResponse.json({ ok: false, message: "Procedimento não encontrado." }, { status: 404 });

  const result = await confirmRead(session.sub, procedureId);
  return NextResponse.json({ ok: true, ...result });
}
