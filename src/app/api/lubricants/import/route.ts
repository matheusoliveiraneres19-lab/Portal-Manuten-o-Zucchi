import { NextResponse, type NextRequest } from "next/server";
import { importLubricantsFromExcel } from "@/services/importacao/lubricants-import.service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get("file");

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "Arquivo .xlsx é obrigatório (campo 'file')." }, { status: 400 });
    }

    if (!/\.xlsx?$/i.test(file.name)) {
      return NextResponse.json({ error: "Envie um arquivo Excel (.xlsx)." }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const result = await importLubricantsFromExcel(buffer, {
      fileName: file.name,
      importedBy: "portal-web"
    });

    return NextResponse.json(result);
  } catch (error) {
    console.error("Falha ao importar planilha de lubrificantes.", error);
    const message = error instanceof Error ? error.message : "Falha ao importar a planilha.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
