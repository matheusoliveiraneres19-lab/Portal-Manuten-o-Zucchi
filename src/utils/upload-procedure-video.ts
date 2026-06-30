/**
 * Upload de videoaula (MP4) DIRETO do navegador ao Supabase Storage — client-side.
 *
 * Fluxo (contorna o limite ~4,5 MB da função serverless da Vercel):
 *  1) pede URL assinada (`/attachments/upload-url`);
 *  2) faz `PUT` multipart no formato do supabase-js (FormData: cacheControl + arquivo no campo "");
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

  // 1) URL assinada de upload
  const signRes = await fetch(`${base}/upload-url`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ fileName: file.name, contentType: file.type, fileSize: file.size })
  });
  const signData = (await signRes.json().catch(() => null)) as
    | { ok?: boolean; uploadUrl?: string; storagePath?: string; message?: string }
    | null;
  if (!signRes.ok || !signData?.ok || !signData.uploadUrl || !signData.storagePath) {
    return { ok: false, message: signData?.message ?? "Não foi possível iniciar o upload." };
  }

  // 2) envia o arquivo DIRETO ao Storage (multipart, no formato do supabase-js)
  const form = new FormData();
  form.append("cacheControl", "3600");
  form.append("", file);
  const putRes = await fetch(signData.uploadUrl, { method: "PUT", headers: { "x-upsert": "false" }, body: form });
  if (!putRes.ok) return { ok: false, message: `Falha no envio do vídeo ao servidor (HTTP ${putRes.status}).` };

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
