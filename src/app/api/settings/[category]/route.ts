import { NextResponse, type NextRequest } from "next/server";
import { requireRole } from "@/lib/auth-guard";
import { getSettingsByCategory } from "@/services/settings.service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest, { params }: { params: { category: string } }) {
  const denied = await requireRole(request, []);
  if (denied) return denied;

  const data = await getSettingsByCategory(params.category);
  return NextResponse.json({ ok: true, data });
}
