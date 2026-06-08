import { NextResponse } from "next/server";
import { syncLubricantLowStockAlerts } from "@/services/lubricants.service";

export const dynamic = "force-dynamic";

export async function POST() {
  try {
    const result = await syncLubricantLowStockAlerts();
    return NextResponse.json(result);
  } catch (error) {
    console.error("Falha ao sincronizar alertas de lubrificantes.", error);
    return NextResponse.json({ error: "Falha ao sincronizar alertas." }, { status: 500 });
  }
}
