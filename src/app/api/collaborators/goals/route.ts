import { NextResponse, type NextRequest } from "next/server";
import type { CollaboratorArea } from "@prisma/client";
import { requireApiSession } from "@/lib/auth-guard";
import {
  CollaboratorValidationError,
  coerceArea,
  getAreaGoals,
  setAreaGoals
} from "@/services/collaborators.service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const goals = await getAreaGoals();
  return NextResponse.json({ ok: true, goals });
}

export async function PATCH(request: NextRequest) {
  const { error } = await requireApiSession();
  if (error) return error;

  try {
    const body = (await request.json().catch(() => null)) as { goals?: Record<string, unknown> } | null;
    const input: Partial<Record<CollaboratorArea, number>> = {};
    for (const [key, value] of Object.entries(body?.goals ?? {})) {
      const area = coerceArea(key);
      const goal = Number(value);
      if (area && Number.isFinite(goal)) input[area] = goal;
    }
    const results = await setAreaGoals(input);
    return NextResponse.json({ ok: true, results });
  } catch (error) {
    if (error instanceof CollaboratorValidationError) {
      return NextResponse.json({ ok: false, message: error.message }, { status: 400 });
    }
    console.error("[collaborators] Falha ao ajustar metas.", error instanceof Error ? error.message : "erro desconhecido");
    return NextResponse.json({ ok: false, message: "Não foi possível ajustar as metas." }, { status: 500 });
  }
}
