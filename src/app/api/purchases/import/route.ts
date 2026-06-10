import { NextResponse, type NextRequest } from "next/server";
import { importPurchasesFromExcel } from "@/services/importacao/purchases-import.service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
// Amplia a janela da função serverless (parsing + gravação em lote da planilha).
export const maxDuration = 26;

const CLI_HINT =
  'Para planilhas muito grandes, utilize a importação via CLI ("npm run import:purchases") para evitar o limite de tempo do Netlify.';

function errorResponse(message: string, details: string, status: number) {
  return NextResponse.json({ success: false, message, details, errors: [] }, { status });
}

export async function POST(request: NextRequest) {
  try {
    const contentType = request.headers.get("content-type") ?? "";
    if (!contentType.includes("multipart/form-data")) {
      return errorResponse(
        "Envie o arquivo como multipart/form-data (campo 'file').",
        "content-type inválido",
        400
      );
    }

    const formData = await request.formData();
    const file = formData.get("file");

    if (!(file instanceof File)) {
      return errorResponse("Selecione um arquivo .xlsx para importar.", "campo 'file' ausente", 400);
    }
    if (!/\.xlsx?$/i.test(file.name)) {
      return errorResponse("Envie um arquivo Excel (.xlsx).", `arquivo inválido: ${file.name}`, 400);
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const result = await importPurchasesFromExcel(buffer, { fileName: file.name, importedBy: "portal-web" });

    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    const details = error instanceof Error ? error.message : "Erro desconhecido ao importar a planilha.";
    // Log apenas no servidor (sem stack para o cliente em produção).
    console.error("[purchases/import] Falha na importação:", details);

    // Mensagens de leitura/validação já são amigáveis e seguras de exibir.
    const isValidation = /aba|coluna|colunas|Excel|\.xlsx|multipart/i.test(details);
    const message = isValidation
      ? details
      : `Não foi possível importar a planilha. Verifique se a aba "Data" e as colunas estão corretas. ${CLI_HINT}`;

    return errorResponse(message, details, isValidation ? 400 : 500);
  }
}
