import { NextResponse, type NextRequest } from "next/server";
import { syncLubricantLowStockAlerts } from "@/services/lubricants.service";
import { requireRole } from "@/lib/auth-guard";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const denied = await requireRole(request, ["ADMIN", "GESTOR"]);
  if (denied) return denied;

  try {
    const result = await syncLubricantLowStockAlerts();
    return NextResponse.json(result);
  } catch (error) {
    console.error("Falha ao sincronizar alertas de lubrificantes.", error);
    return NextResponse.json({ error: "Falha ao sincronizar alertas." }, { status: 500 });
  }
}
