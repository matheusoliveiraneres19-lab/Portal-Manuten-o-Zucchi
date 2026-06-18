import { NextResponse, type NextRequest } from "next/server";
import { updateLubricantMinimumStock } from "@/services/lubricants.service";
import { requireRole } from "@/lib/auth-guard";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const denied = await requireRole(request, ["ADMIN", "GESTOR"]);
  if (denied) return denied;

  try {
    const body = await request.json();
    const code = typeof body.code === "string" ? body.code : "";
    const minimumStock = Number(body.minimumStock);

    if (!code) {
      return NextResponse.json({ error: "Código do lubrificante é obrigatório." }, { status: 400 });
    }
    if (!Number.isFinite(minimumStock) || minimumStock < 0) {
      return NextResponse.json({ error: "Estoque mínimo inválido." }, { status: 400 });
    }

    await updateLubricantMinimumStock(code, minimumStock);
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Falha ao salvar estoque mínimo do lubrificante.", error);
    return NextResponse.json({ error: "Falha ao salvar estoque mínimo." }, { status: 500 });
  }
}
