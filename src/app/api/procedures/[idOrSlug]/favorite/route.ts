import { NextResponse, type NextRequest } from "next/server";
import { requireApiSession } from "@/lib/auth-guard";
import { resolveProcedureId, toggleFavorite } from "@/services/procedures.service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: { idOrSlug: string } };

// POST: alterna favorito do usuário logado (qualquer papel).
export async function POST(_request: NextRequest, { params }: Params) {
  const { session, error } = await requireApiSession();
  if (error) return error;

  const procedureId = await resolveProcedureId(params.idOrSlug);
  if (!procedureId) return NextResponse.json({ ok: false, message: "Procedimento não encontrado." }, { status: 404 });

  const result = await toggleFavorite(session.sub, procedureId);
  return NextResponse.json({ ok: true, ...result });
}
