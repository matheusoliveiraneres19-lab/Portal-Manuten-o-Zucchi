import { NextResponse, type NextRequest } from "next/server";
import { importPcFactoryFromExcel } from "@/services/importacao/pc-factory-import.service";
import { getSession, requireRole } from "@/lib/auth-guard";
import { auditImport } from "@/lib/audit-import";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const denied = await requireRole(request, ["ADMIN", "GESTOR"]);
  if (denied) return denied;

  const session = await getSession();
  let fileName = "(desconhecido)";
  try {
    const formData = await request.formData();
    const file = formData.get("file");

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "Arquivo .xlsx é obrigatório (campo 'file')." }, { status: 400 });
    }
    fileName = file.name;

    if (!/\.xlsx?$/i.test(file.name)) {
      return NextResponse.json({ error: "Envie um arquivo Excel (.xlsx)." }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    // Importação pelo portal SUBSTITUI toda a base (apaga e recarrega) — evita misturar
    // planilhas/lotes diferentes e o double-counting. Só apaga se houver linhas válidas.
    const result = await importPcFactoryFromExcel(buffer, {
      fileName: file.name,
      importedBy: "portal-web",
      replaceAll: true
    });

    await auditImport({ request, session, module: "PC-Factory", fileName, result });
    return NextResponse.json(result);
  } catch (error) {
    console.error("Falha ao importar planilha do PC-Factory.", error);
    const message = error instanceof Error ? error.message : "Falha ao importar a planilha.";
    await auditImport({ request, session, module: "PC-Factory", fileName, error: message });
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
