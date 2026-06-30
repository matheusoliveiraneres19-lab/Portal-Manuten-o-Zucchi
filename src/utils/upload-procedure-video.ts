/**
 * Upload de videoaula (MP4) DIRETO do navegador ao Supabase Storage — client-side.
 *
 * Fluxo (contorna o limite ~4,5 MB da função serverless da Vercel):
 *  1) pede URL assinada + token + chave pública (`/attachments/upload-url`);
 *  2) envia o arquivo com o SDK oficial `uploadToSignedUrl` (monta apikey/headers/multipart
 *     exatamente como o Supabase espera — o token autoriza o upload);
 *  3) registra o anexo (`POST /attachments` com `storagePath`).
 *
 * Não dispara toasts nem refresh — quem chama trata o retorno (e remove o vídeo anterior).
 */
export const PROCEDURE_VIDEO_MAX_MB = 100;
const MAX_VIDEO_BYTES = PROCEDURE_VIDEO_MAX_MB * 1024 * 1024;

/** Valida tipo/tamanho do arquivo de videoaula. Retorna mensagem de erro ou null. */
export function validateProcedureVideoFile(file: File): string | null {
  if (file.type !== "video/mp4") return "Envie um vídeo no formato MP4 (ou cole um link do YouTube/Drive).";
  if (file.size > MAX_VIDEO_BYTES) return `Vídeo excede ${PROCEDURE_VIDEO_MAX_MB} MB. Compacte o arquivo ou use um link.`;
  return null;
}

export async function uploadProcedureVideo(
  idOrSlug: string,
  file: File,
  opts: { title?: string; description?: string } = {}
): Promise<{ ok: boolean; message?: string }> {
  const invalid = validateProcedureVideoFile(file);
  if (invalid) return { ok: false, message: invalid };

  const base = `/api/procedures/${encodeURIComponent(idOrSlug)}/attachments`;

  // 1) URL assinada de upload (+ token, bucket, url e chave pública)
  const signRes = await fetch(`${base}/upload-url`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ fileName: file.name, contentType: file.type, fileSize: file.size })
  });
  const signData = (await signRes.json().catch(() => null)) as
    | {
        ok?: boolean;
        storagePath?: string;
        token?: string;
        bucket?: string;
        supabaseUrl?: string;
        apiKey?: string;
        message?: string;
      }
    | null;
  if (
    !signRes.ok ||
    !signData?.ok ||
    !signData.storagePath ||
    !signData.token ||
    !signData.bucket ||
    !signData.supabaseUrl ||
    !signData.apiKey
  ) {
    return { ok: false, message: signData?.message ?? "Não foi possível iniciar o upload." };
  }

  // 2) envia o arquivo DIRETO ao Storage via SDK oficial (token autoriza)
  // Import dinâmico: mantém o supabase-js fora do bundle inicial das telas.
  const { createClient } = await import("@supabase/supabase-js");
  const supabase = createClient(signData.supabaseUrl, signData.apiKey, {
    auth: { persistSession: false, autoRefreshToken: false }
  });
  const { error: uploadError } = await supabase.storage
    .from(signData.bucket)
    .uploadToSignedUrl(signData.storagePath, signData.token, file, { contentType: file.type, upsert: false });
  if (uploadError) {
    return { ok: false, message: `Falha no envio do vídeo ao servidor (${uploadError.message}).` };
  }

  // 3) registra o anexo
  const regRes = await fetch(base, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      storagePath: signData.storagePath,
      fileName: opts.title?.trim() || file.name,
      description: opts.description?.trim() || undefined,
      fileSize: file.size
    })
  });
  const regData = (await regRes.json().catch(() => null)) as { ok?: boolean; message?: string } | null;
  if (!regRes.ok || !regData?.ok) return { ok: false, message: regData?.message ?? "Não foi possível salvar a videoaula." };

  return { ok: true };
}
