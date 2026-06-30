/**
 * Acesso ao Supabase Storage — EXCLUSIVAMENTE no servidor.
 *
 * Usa a SERVICE ROLE KEY (lida de env) para gravar/ler em um bucket PRIVADO.
 * NUNCA importe este módulo em código de cliente: a service key dá acesso total
 * ao Storage e jamais deve chegar ao browser. O download é feito apenas por URL
 * assinada de curta duração gerada aqui no servidor.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export const ATTACHMENTS_BUCKET = "collaborator-attachments";

/** Bucket privado dos materiais de apoio da Central de Procedimentos (fase 03). */
export const PROCEDURE_ATTACHMENTS_BUCKET = "procedure-attachments";

/** Tamanho máximo por anexo: 10 MB. */
export const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;

/**
 * Limite de upload de procedimentos: 4 MB. A Vercel limita o corpo de requisição de
 * funções serverless a ~4,5 MB, então arquivos maiores (vídeos) devem entrar como LINK
 * externo, não como upload. Cobre bem PDF e imagens de apoio.
 */
export const MAX_PROCEDURE_ATTACHMENT_BYTES = 4 * 1024 * 1024;

/** Tipos aceitos: apenas PDF (decisão do produto na ETAPA 3). */
export const ALLOWED_CONTENT_TYPES = ["application/pdf"] as const;

/** Tipos aceitos para upload de procedimentos (vídeo grande → usar link externo). */
export const PROCEDURE_UPLOAD_CONTENT_TYPES: Record<string, string> = {
  "application/pdf": ".pdf",
  "image/png": ".png",
  "image/jpeg": ".jpg",
  "image/webp": ".webp",
  "video/mp4": ".mp4"
};

/**
 * Limite de upload DIRETO de videoaula (navegador → Supabase, sem passar pela API).
 * 50 MB — teto do plano free do Supabase (o limite GLOBAL do projeto prevalece sobre o
 * file_size_limit do bucket). Vídeos maiores devem ser compactados ou entrar como link
 * externo (YouTube/Drive). Para subir o teto, é preciso plano pago + aumentar o limite
 * global em Project Settings → Storage no painel do Supabase.
 */
export const MAX_PROCEDURE_VIDEO_BYTES = 50 * 1024 * 1024;

/** Content-types de vídeo aceitos no upload direto da videoaula. */
export const PROCEDURE_VIDEO_CONTENT_TYPES: Record<string, string> = {
  "video/mp4": ".mp4"
};

export class StorageNotConfiguredError extends Error {
  constructor() {
    super("Supabase Storage não configurado. Defina SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY.");
    this.name = "StorageNotConfiguredError";
  }
}

let cached: SupabaseClient | null = null;

/** true quando as variáveis de ambiente do Storage estão presentes. */
export function storageConfigured(): boolean {
  return Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
}

/**
 * Chave PÚBLICA (anon/publishable) usada APENAS pelo navegador para enviar a videoaula
 * à URL assinada (o gateway do Supabase exige `apikey`; o token na URL é quem autoriza
 * de fato). É pública por design (protegida por RLS) — pode ir ao cliente. Pode ser
 * sobrescrita por env. NUNCA confundir com a SERVICE ROLE KEY (essa é secreta).
 */
const PUBLISHABLE_KEY_FALLBACK =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJxcWpzcGFkenpzd2Fvb3ZwY3lvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA5MzQwOTMsImV4cCI6MjA5NjUxMDA5M30.viyVgCJwVsHEFRPVezD1VEQ_0_1-WBq7pfzWvJoUjqg";

export function getStoragePublicApiKey(): string {
  return process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_PUBLISHABLE_KEY || PUBLISHABLE_KEY_FALLBACK;
}

function getClient(): SupabaseClient {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new StorageNotConfiguredError();
  }
  if (!cached) {
    cached = createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false }
    });
  }
  return cached;
}

/** Envia o arquivo (já validado) para um bucket privado (default: colaboradores). */
export async function uploadAttachment(
  path: string,
  body: Buffer,
  contentType: string,
  bucket: string = ATTACHMENTS_BUCKET
): Promise<void> {
  const { error } = await getClient().storage.from(bucket).upload(path, body, { contentType, upsert: false });
  if (error) throw error;
}

/**
 * Cria uma URL ASSINADA DE UPLOAD para o navegador enviar o arquivo DIRETO ao bucket
 * privado, sem passar pela função serverless (contorna o limite de corpo da Vercel).
 * A URL é construída no formato REST documentado e autorizada pelo token — o browser
 * faz `PUT <uploadUrl>` com o binário. Expira em ~2h.
 */
export async function createSignedUploadUrl(
  path: string,
  bucket: string = ATTACHMENTS_BUCKET
): Promise<{ uploadUrl: string; token: string; path: string }> {
  const { data, error } = await getClient().storage.from(bucket).createSignedUploadUrl(path);
  if (error || !data?.token) {
    throw error ?? new Error("Falha ao gerar URL de upload assinada.");
  }
  const base = process.env.SUPABASE_URL!.replace(/\/+$/, "");
  const uploadUrl = `${base}/storage/v1/object/upload/sign/${bucket}/${path}?token=${encodeURIComponent(data.token)}`;
  return { uploadUrl, token: data.token, path: data.path ?? path };
}

/** Verifica se um objeto existe no bucket (best-effort, via geração de URL assinada). */
export async function objectExists(path: string, bucket: string = ATTACHMENTS_BUCKET): Promise<boolean> {
  try {
    await createSignedUrl(path, 60, bucket);
    return true;
  } catch {
    return false;
  }
}

/** Gera uma URL assinada de curta duração para download (default 60s). */
export async function createSignedUrl(
  path: string,
  expiresInSeconds = 60,
  bucket: string = ATTACHMENTS_BUCKET
): Promise<string> {
  const { data, error } = await getClient().storage.from(bucket).createSignedUrl(path, expiresInSeconds);
  if (error || !data?.signedUrl) {
    throw error ?? new Error("Falha ao gerar URL assinada.");
  }
  return data.signedUrl;
}

/** Remove o objeto do bucket (best-effort do lado do storage). */
export async function removeObject(path: string, bucket: string = ATTACHMENTS_BUCKET): Promise<void> {
  const { error } = await getClient().storage.from(bucket).remove([path]);
  if (error) throw error;
}
