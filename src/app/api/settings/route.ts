import { NextResponse, type NextRequest } from "next/server";
import { requireRole } from "@/lib/auth-guard";
import { getSettings } from "@/services/settings.service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Qualquer usuário autenticado pode visualizar as configurações.
export async function GET(request: NextRequest) {
  const denied = await requireRole(request, []);
  if (denied) return denied;

  const data = await getSettings();
  return NextResponse.json({ ok: true, data });
}
