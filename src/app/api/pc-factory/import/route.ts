/**
 * POST /api/pc-factory/import — caminho DIRETO (arquivos pequenos).
 *
 * O arquivo vem no corpo da requisição e a base oficial é substituída na hora.
 * Continua existindo por dois motivos: é o que funciona quando o Supabase
 * Storage não está configurado, e serve de rede de segurança para planilhas
 * pequenas.
 *
 * ⚠️ LIMITE DA PLATAFORMA: a Vercel corta o corpo de uma função serverless em
 * ~4,5 MB e responde `Request Entity Too Large` em TEXTO PURO — antes de este
 * handler rodar. Nenhum try/catch daqui alcança isso; foi essa resposta que
 * produzia "Unexpected token 'R'" no modal. Por isso o modal usa o fluxo de
 * Storage + staging (upload-url → start → process → finish) sempre que ele
 * está disponível, e só cai aqui para arquivos pequenos.
 *
 * Para arquivos grandes prefira SEMPRE o fluxo de staging: lá o DELETE e os
 * INSERTs ficam na mesma transação, enquanto aqui o `replaceAll` apaga a base
 * antes de gravar.
 */
import { type NextRequest } from "next/server";
import { revalidatePath } from "next/cache";
import {
  PcFactoryLayoutError,
  importPcFactoryFromExcel
} from "@/services/importacao/pc-factory-import.service";
import { getSession, requireRole } from "@/lib/auth-guard";
import { auditImport } from "@/lib/audit-import";
import { badRequest, errorMessage, ok, serverError, tooLarge } from "@/lib/api-response";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;

/** Formatos aceitos: CSV histórico normalizado + planilhas do PC-Factory. */
const ACCEPTED_EXTENSIONS = /\.(csv|xlsx|xlsm|xls)$/i;

/**
 * Teto que ESTE caminho aceita: 4 MB.
 *
 * Fica abaixo do corte da Vercel (~4,5 MB) de propósito — assim a recusa vem
 * daqui, em JSON com mensagem em português, em vez de virar o texto puro da
 * plataforma que o front não consegue interpretar.
 */
const MAX_DIRECT_UPLOAD_BYTES = 4 * 1024 * 1024;

export async function POST(request: NextRequest) {
  const denied = await requireRole(request, ["ADMIN", "GESTOR"]);
  if (denied) return denied;

  const session = await getSession();
  let fileName = "(desconhecido)";

  try {
    // Recusa pelo cabeçalho antes de materializar o corpo na memória.
    const declaredLength = Number(request.headers.get("content-length") ?? 0);
    if (Number.isFinite(declaredLength) && declaredLength > MAX_DIRECT_UPLOAD_BYTES) {
      return tooLarge(
        "Arquivo muito grande para envio direto. Use a importação via Supabase Storage.",
        `content-length ${declaredLength} > ${MAX_DIRECT_UPLOAD_BYTES}`
      );
    }

    const formData = await request.formData();
    const file = formData.get("file");

    if (!(file instanceof File)) {
      return badRequest("Selecione um arquivo .csv, .xlsx ou .xls.", "campo 'file' ausente");
    }
    fileName = file.name;

    if (!ACCEPTED_EXTENSIONS.test(file.name)) {
      return badRequest(
        `Formato não suportado: "${file.name}". Envie um arquivo .csv, .xlsx, .xlsm ou .xls.`,
        `extensão inválida: ${file.name}`
      );
    }

    if (file.size > MAX_DIRECT_UPLOAD_BYTES) {
      return tooLarge(
        "Arquivo muito grande para envio direto. Use a importação via Supabase Storage.",
        `${file.size} bytes > ${MAX_DIRECT_UPLOAD_BYTES}`
      );
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const result = await importPcFactoryFromExcel(buffer, {
      fileName: file.name,
      importedBy: session?.name ?? "portal-web",
      replaceAll: true
    });

    await auditImport({ request, session, module: "PC-Factory", fileName, result });

    revalidatePath("/dashboard/pc-factory");
    revalidatePath("/dashboard");

    return ok(result);
  } catch (error) {
    // A mensagem pode ser um diagnóstico multi-linha (layout, colunas encontradas,
    // obrigatórias ausentes) — repassada íntegra em `details` para o modal exibir.
    const details = errorMessage(error);
    console.error("[pc-factory/import] Falha ao importar arquivo.", details);
    await auditImport({ request, session, module: "PC-Factory", fileName, error: details });

    // Layout irreconhecível é o arquivo que não serve, não o servidor que quebrou.
    // O diagnóstico completo vai em `details` e o modal o exibe na íntegra.
    if (error instanceof PcFactoryLayoutError) {
      return badRequest("O arquivo enviado não tem o layout esperado do PC-Factory.", details);
    }
    return serverError("Não foi possível importar o arquivo do PC-Factory.", details);
  }
}
