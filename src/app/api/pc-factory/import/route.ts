import { NextResponse, type NextRequest } from "next/server";
import { revalidatePath } from "next/cache";
import { importPcFactoryFromExcel } from "@/services/importacao/pc-factory-import.service";
import { getSession, requireRole } from "@/lib/auth-guard";
import { auditImport } from "@/lib/audit-import";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** Formatos aceitos (TAREFA 1): CSV histórico normalizado + planilhas do PC-Factory. */
const ACCEPTED_EXTENSIONS = /\.(csv|xlsx|xls)$/i;

export async function POST(request: NextRequest) {
  const denied = await requireRole(request, ["ADMIN", "GESTOR"]);
  if (denied) return denied;

  const session = await getSession();
  let fileName = "(desconhecido)";
  try {
    const formData = await request.formData();
    const file = formData.get("file");

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "Arquivo .csv ou .xlsx é obrigatório (campo 'file')." }, { status: 400 });
    }
    fileName = file.name;

    if (!ACCEPTED_EXTENSIONS.test(file.name)) {
      return NextResponse.json(
        { error: `Formato não suportado: "${file.name}". Envie um arquivo .csv, .xlsx ou .xls.` },
        { status: 400 }
      );
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    // Importação pelo portal SUBSTITUI toda a base (apaga e recarrega) — evita misturar
    // planilhas/lotes diferentes e o double-counting. Só apaga se houver linhas válidas.
    // O fileName decide o caminho de leitura (CSV vs XLSX) dentro do serviço.
    const result = await importPcFactoryFromExcel(buffer, {
      fileName: file.name,
      importedBy: "portal-web",
      replaceAll: true
    });

    await auditImport({ request, session, module: "PC-Factory", fileName, result });

    // TAREFA 16: invalida o cache das telas que consomem PcFactoryRecord, para os cards
    // e gráficos refletirem a importação sem depender de reload manual.
    revalidatePath("/dashboard/pc-factory");
    revalidatePath("/dashboard");

    return NextResponse.json(result);
  } catch (error) {
    console.error("Falha ao importar arquivo do PC-Factory.", error);
    // A mensagem pode ser um diagnóstico multi-linha (layout, colunas encontradas,
    // obrigatórias ausentes) — repassada íntegra para o modal exibir (TAREFA 14).
    const message = error instanceof Error ? error.message : "Falha ao importar o arquivo.";
    await auditImport({ request, session, module: "PC-Factory", fileName, error: message });
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
