/**
 * Arquivos de importação no Supabase Storage — SOMENTE servidor.
 *
 * Guarda a planilha original de cada importação em um bucket PRIVADO, para que
 * seja possível auditar depois: "de que arquivo exatamente saíram estes 3.353
 * registros de compras?".
 *
 * BUCKET
 * ------
 *   portal-imports   (privado — configurável por SUPABASE_STORAGE_BUCKET_IMPORTS)
 *
 * ESTRUTURA
 * ---------
 *   imports/<modulo>/<ano>/<mes>/<timestamp>-<slug-do-arquivo>.<ext>
 *   ex.: imports/pc-factory/2026/09/20260910-143012-apontamentos-agosto.xlsx
 *
 * O particionamento por ano/mês existe porque o Storage lista objetos por
 * prefixo: sem ele, uma pasta com milhares de planilhas fica impraticável de
 * navegar no painel do Supabase.
 *
 * SEGURANÇA
 * ---------
 * O bucket NUNCA é público. Download só por URL assinada de curta duração,
 * gerada no servidor, por rota que já validou a sessão e o papel do usuário.
 * Este módulo usa a SERVICE ROLE KEY — nunca importe de Client Component.
 */
import { getSupabaseAdminClient, supabaseServerConfigured } from "@/lib/supabase-server";
import {
  ALLOWED_IMPORT_EXTENSIONS,
  IMPORT_CONTENT_TYPES,
  IMPORT_MODULE_SLUGS,
  getImportsBucket,
  getMaxImportBytes,
  type ImportModule
} from "@/types/imports";

export class ImportStorageNotConfiguredError extends Error {
  constructor() {
    super(
      "Supabase Storage não configurado para importações. Defina SUPABASE_URL e " +
        "SUPABASE_SERVICE_ROLE_KEY e crie o bucket privado de importações."
    );
    this.name = "ImportStorageNotConfiguredError";
  }
}

export class ImportFileRejectedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ImportFileRejectedError";
  }
}

/** true quando dá para gravar no Storage. Falso NÃO impede a importação —
 *  o orquestrador segue sem guardar o arquivo e registra isso na metadata. */
export function importStorageConfigured(): boolean {
  return supabaseServerConfigured();
}

/* -------------------------------------------------------------------------- */
/*  Validação                                                                  */
/* -------------------------------------------------------------------------- */

/** Extensão em minúsculas, com ponto ("" quando não há). */
export function getFileExtension(fileName: string): string {
  const match = /\.[A-Za-z0-9]+$/.exec(fileName.trim());
  return match ? match[0].toLowerCase() : "";
}

/**
 * Reduz o nome do arquivo ao que o Storage aceita em uma chave de objeto.
 *
 * Nomes reais vêm cheios de acento, espaço e parêntese ("Ordens de Serviço
 * (agosto) — final.xlsx"). Sem isto, a chave do objeto fica com caractere que
 * quebra a URL assinada.
 */
export function slugifyFileName(fileName: string): string {
  const ext = getFileExtension(fileName);
  const base = ext ? fileName.slice(0, -ext.length) : fileName;
  const slug = base
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // tira os acentos que o NFD separou
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase()
    .slice(0, 80);
  return `${slug || "planilha"}${ext}`;
}

/**
 * Valida extensão e tamanho antes de gastar banda com o upload.
 * Lança `ImportFileRejectedError` com mensagem pronta para o usuário.
 */
export function assertImportFileAccepted(params: { fileName: string; size: number }): void {
  const ext = getFileExtension(params.fileName);
  if (!ALLOWED_IMPORT_EXTENSIONS.includes(ext as (typeof ALLOWED_IMPORT_EXTENSIONS)[number])) {
    throw new ImportFileRejectedError(
      `Formato não suportado: "${params.fileName}". Envie um arquivo ${ALLOWED_IMPORT_EXTENSIONS.join(", ")}.`
    );
  }

  const max = getMaxImportBytes();
  if (params.size > max) {
    const mb = (max / (1024 * 1024)).toFixed(0);
    const atual = (params.size / (1024 * 1024)).toFixed(1);
    throw new ImportFileRejectedError(
      `Arquivo muito grande (${atual} MB). O limite atual é ${mb} MB.`
    );
  }
}

/** Content-type a partir da extensão (fallback binário genérico). */
export function resolveContentType(fileName: string): string {
  return IMPORT_CONTENT_TYPES[getFileExtension(fileName)] ?? "application/octet-stream";
}

/* -------------------------------------------------------------------------- */
/*  Caminho no bucket                                                          */
/* -------------------------------------------------------------------------- */

/**
 * Monta a chave do objeto: imports/<modulo>/<ano>/<mes>/<timestamp>-<slug>.
 *
 * O timestamp evita colisão quando a mesma planilha é reenviada — cada
 * importação preserva o arquivo que realmente usou, o que é o ponto de guardar
 * o arquivo em primeiro lugar.
 */
export function createImportFilePath(module: ImportModule, fileName: string, at: Date = new Date()): string {
  const slug = IMPORT_MODULE_SLUGS[module];
  const year = at.getUTCFullYear();
  const month = String(at.getUTCMonth() + 1).padStart(2, "0");
  const stamp = at.toISOString().replace(/[-:]/g, "").replace(/\.\d+Z$/, "Z");
  return `imports/${slug}/${year}/${month}/${stamp}-${slugifyFileName(fileName)}`;
}

/* -------------------------------------------------------------------------- */
/*  Operações                                                                  */
/* -------------------------------------------------------------------------- */

export type UploadImportFileParams = {
  module: ImportModule;
  fileName: string;
  body: Buffer | Uint8Array;
  /** Sobrescreve o content-type derivado da extensão. */
  contentType?: string;
  /** Caminho pronto (quando o chamador já o gerou e gravou no histórico). */
  path?: string;
};

export type UploadedImportFile = {
  bucket: string;
  path: string;
  fileName: string;
  fileSize: number;
  mimeType: string;
};

/**
 * Envia a planilha para o bucket privado.
 *
 * `upsert: false` de propósito: o caminho já carrega timestamp, então uma
 * colisão significa bug, não reenvio — e sobrescrever destruiria a trilha de
 * auditoria de uma importação anterior.
 */
export async function uploadImportFile(params: UploadImportFileParams): Promise<UploadedImportFile> {
  if (!importStorageConfigured()) throw new ImportStorageNotConfiguredError();

  const size = params.body.byteLength;
  assertImportFileAccepted({ fileName: params.fileName, size });

  const bucket = getImportsBucket();
  const path = params.path ?? createImportFilePath(params.module, params.fileName);
  const contentType = params.contentType ?? resolveContentType(params.fileName);

  const { error } = await getSupabaseAdminClient()
    .storage.from(bucket)
    .upload(path, params.body, { contentType, upsert: false });

  if (error) throw error;

  return { bucket, path, fileName: params.fileName, fileSize: size, mimeType: contentType };
}

/**
 * URL assinada para baixar o arquivo original. Padrão: 5 minutos — tempo de
 * clicar e baixar, curto o bastante para o link não circular por aí.
 */
export async function getImportFileSignedUrl(
  path: string,
  expiresInSeconds = 300,
  bucket: string = getImportsBucket()
): Promise<string> {
  if (!importStorageConfigured()) throw new ImportStorageNotConfiguredError();

  const { data, error } = await getSupabaseAdminClient().storage.from(bucket).createSignedUrl(path, expiresInSeconds);

  if (error || !data?.signedUrl) {
    throw error ?? new Error("Falha ao gerar URL assinada do arquivo de importação.");
  }
  return data.signedUrl;
}

/**
 * URL assinada de UPLOAD, para o navegador enviar a planilha DIRETO ao bucket.
 *
 * É o caminho para planilhas grandes: contorna o limite de ~4,5 MB do corpo de
 * uma função serverless na Vercel, que é exatamente onde as importações grandes
 * de PC-Factory batem hoje.
 */
export async function createImportUploadUrl(
  module: ImportModule,
  fileName: string,
  bucket: string = getImportsBucket()
): Promise<{ uploadUrl: string; token: string; path: string; bucket: string }> {
  if (!importStorageConfigured()) throw new ImportStorageNotConfiguredError();
  assertImportFileAccepted({ fileName, size: 0 });

  const path = createImportFilePath(module, fileName);
  const { data, error } = await getSupabaseAdminClient().storage.from(bucket).createSignedUploadUrl(path);

  if (error || !data?.token) {
    throw error ?? new Error("Falha ao gerar URL de upload assinada.");
  }

  const base = (process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || "").replace(/\/+$/, "");
  return {
    uploadUrl: `${base}/storage/v1/object/upload/sign/${bucket}/${path}?token=${encodeURIComponent(data.token)}`,
    token: data.token,
    path: data.path ?? path,
    bucket
  };
}

/** Baixa o arquivo original de volta como Buffer (reprocessar sem reenviar). */
export async function downloadImportFile(path: string, bucket: string = getImportsBucket()): Promise<Buffer> {
  if (!importStorageConfigured()) throw new ImportStorageNotConfiguredError();

  const { data, error } = await getSupabaseAdminClient().storage.from(bucket).download(path);
  if (error || !data) {
    throw error ?? new Error("Falha ao baixar o arquivo de importação.");
  }
  return Buffer.from(await data.arrayBuffer());
}

/**
 * Remove o objeto do bucket.
 *
 * Não é chamado por nenhum fluxo automático: apagar o arquivo original destrói
 * a auditoria da importação. Existe para expurgo manual e retenção.
 */
export async function deleteImportFile(path: string, bucket: string = getImportsBucket()): Promise<void> {
  if (!importStorageConfigured()) throw new ImportStorageNotConfiguredError();

  const { error } = await getSupabaseAdminClient().storage.from(bucket).remove([path]);
  if (error) throw error;
}

/**
 * Garante que o bucket privado existe. Idempotente — se já existir, não faz
 * nada. Chamada só por script/rota administrativa, nunca no caminho quente.
 */
export async function ensureImportsBucket(bucket: string = getImportsBucket()): Promise<{ created: boolean }> {
  if (!importStorageConfigured()) throw new ImportStorageNotConfiguredError();

  const client = getSupabaseAdminClient();
  const { data: existing } = await client.storage.getBucket(bucket);
  if (existing) return { created: false };

  const { error } = await client.storage.createBucket(bucket, {
    public: false,
    fileSizeLimit: getMaxImportBytes()
  });
  if (error) throw error;
  return { created: true };
}
