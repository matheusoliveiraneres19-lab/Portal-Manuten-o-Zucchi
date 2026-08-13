import { NextResponse, type NextRequest } from "next/server";
import { revalidatePath, revalidateTag } from "next/cache";
import { importServiceOrdersFromExcel } from "@/services/importacao/service-orders-import.service";
import { requireApiSession } from "@/lib/auth-guard";
import { auditImport } from "@/lib/audit-import";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
// Amplia a janela da função serverless (parsing + gravação em lote da planilha).
// Limite do plano Pro da Vercel (até 300s); planilhas grandes exigem a janela cheia.
export const maxDuration = 300;

export async function POST(request: NextRequest) {
  const { session, error } = await requireApiSession(["ADMIN", "GESTOR"]);
  if (error) return error;

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
    const result = await importServiceOrdersFromExcel(buffer, {
      fileName: file.name,
      importedBy: "portal-web"
    });

    await auditImport({ request, session, module: "Ordens de Serviço", fileName, result });

    // Nova base de OS ⇒ recalcular as telas que derivam de ServiceOrder (horas da
    // equipe, dashboard e ordens de serviço). Sem isto, a aba Equipe e Horas podia
    // continuar exibindo o payload em cache (horas antigas) após a importação.
    revalidatePath("/dashboard/equipe-horas");
    revalidatePath("/dashboard");
    revalidatePath("/dashboard/ordens-servico");
    revalidatePath("/dashboard/equipamentos-criticos");

    // As OPÇÕES de filtro de OS (status, áreas, grupos, responsáveis, equipamentos)
    // são cacheadas por 120s com unstable_cache sob a tag "service-orders" — e
    // `revalidatePath` NÃO invalida cache por tag. Sem esta linha, um responsável ou
    // equipamento novo levava até 2 minutos para aparecer nos filtros, mesmo com a
    // tabela já mostrando as ordens importadas.
    revalidateTag("service-orders");

    return NextResponse.json(result);
  } catch (error) {
    console.error("Falha ao importar planilha de Ordens de Serviço.", error);
    const message = error instanceof Error ? error.message : "Falha ao importar a planilha.";
    await auditImport({ request, session, module: "Ordens de Serviço", fileName, error: message });
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
