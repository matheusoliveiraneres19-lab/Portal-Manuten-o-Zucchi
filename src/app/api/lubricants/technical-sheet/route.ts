import { NextResponse, type NextRequest } from "next/server";
import { updateLubricantTechnicalSheet } from "@/services/lubricants.service";
import { requireApiSession } from "@/lib/auth-guard";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const { error } = await requireApiSession();
  if (error) return error;

  try {
    const body = await request.json();
    const code = typeof body.code === "string" ? body.code : "";
    const technicalSheetUrl = typeof body.technicalSheetUrl === "string" ? body.technicalSheetUrl : null;

    if (!code) {
      return NextResponse.json({ error: "Código do lubrificante é obrigatório." }, { status: 400 });
    }

    await updateLubricantTechnicalSheet(code, technicalSheetUrl);
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Falha ao salvar ficha técnica do lubrificante.", error);
    return NextResponse.json({ error: "Falha ao salvar ficha técnica." }, { status: 500 });
  }
}
