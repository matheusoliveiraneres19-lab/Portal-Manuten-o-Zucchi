import { NextResponse, type NextRequest } from "next/server";
import { requireRole } from "@/lib/auth-guard";
import { seedDefaultSettings } from "@/services/settings.service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Apenas administradores podem semear as configurações padrão.
export async function POST(request: NextRequest) {
  const denied = await requireRole(request, ["ADMIN"]);
  if (denied) return denied;

  try {
    const result = await seedDefaultSettings();
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    console.error("Falha ao semear configurações padrão.", error);
    return NextResponse.json({ ok: false, message: "Não foi possível semear as configurações." }, { status: 500 });
  }
}
