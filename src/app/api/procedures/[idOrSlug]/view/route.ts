import { NextResponse, type NextRequest } from "next/server";
import { incrementProcedureView } from "@/services/procedures.service";
import { requireApiSession } from "@/lib/auth-guard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: { idOrSlug: string } };

/** Incrementa o contador de visualização (best-effort — qualquer sessão autenticada). */
export async function POST(_request: NextRequest, { params }: Params) {
  // Defesa em profundidade: o middleware já bloqueia /api/* sem sessão, mas a
  // rota revalida por conta própria para não depender só do matcher.
  const { error } = await requireApiSession();
  if (error) return error;

  await incrementProcedureView(params.idOrSlug);
  return NextResponse.json({ ok: true });
}
