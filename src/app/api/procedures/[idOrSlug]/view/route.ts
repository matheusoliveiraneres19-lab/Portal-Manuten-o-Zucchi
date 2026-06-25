import { NextResponse, type NextRequest } from "next/server";
import { incrementProcedureView } from "@/services/procedures.service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: { idOrSlug: string } };

/** Incrementa o contador de visualização (best-effort — qualquer sessão autenticada). */
export async function POST(_request: NextRequest, { params }: Params) {
  await incrementProcedureView(params.idOrSlug);
  return NextResponse.json({ ok: true });
}
