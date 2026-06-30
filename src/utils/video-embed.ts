/**
 * Conversão segura de links de vídeo em URLs incorporáveis (embed) para a
 * Central de Procedimentos. Apenas provedores conhecidos são reconhecidos;
 * qualquer outra URL é tratada como "unknown" e NUNCA vira iframe sem validação.
 *
 * Usado tanto no client (player da aba Videoaula) quanto no server
 * (procedures.service classifica anexos do tipo "link").
 */

export type VideoProvider = "youtube" | "drive" | "vimeo" | "mp4" | "unknown";

const YOUTUBE_RE = /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/|youtube\.com\/shorts\/)([\w-]{11})/;
const DRIVE_RE = /drive\.google\.com\/(?:file\/d\/|open\?id=|uc\?(?:export=\w+&)?id=)([\w-]+)/;
const VIMEO_RE = /vimeo\.com\/(?:video\/)?(\d+)/;

/** Remove query/hash para detecção de extensão (.mp4) de forma confiável. */
function pathnameOf(url: string): string {
  try {
    return new URL(url).pathname.toLowerCase();
  } catch {
    return url.split(/[?#]/)[0].toLowerCase();
  }
}

/** Identifica o provedor de vídeo a partir da URL. */
export function getVideoProvider(url: string): VideoProvider {
  const value = (url ?? "").trim();
  if (!value) return "unknown";
  if (YOUTUBE_RE.test(value)) return "youtube";
  if (DRIVE_RE.test(value)) return "drive";
  if (VIMEO_RE.test(value)) return "vimeo";
  if (/\.mp4$/.test(pathnameOf(value))) return "mp4";
  return "unknown";
}

/** true quando a URL é reconhecida como vídeo (qualquer provedor conhecido). */
export function isVideoUrl(url: string): boolean {
  return getVideoProvider(url) !== "unknown";
}

/**
 * Converte a URL em endereço de incorporação por iframe.
 * - YouTube → https://www.youtube.com/embed/VIDEO_ID
 * - Google Drive → https://drive.google.com/file/d/FILE_ID/preview
 * - Vimeo → https://player.vimeo.com/video/VIDEO_ID
 * - MP4 → null (o caller deve usar <video controls>, não iframe)
 * - desconhecido → null (o caller deve oferecer link externo seguro)
 */
export function getEmbeddableVideoUrl(url: string): string | null {
  const value = (url ?? "").trim();
  if (!value) return null;

  const yt = value.match(YOUTUBE_RE);
  if (yt) return `https://www.youtube.com/embed/${yt[1]}`;

  const drive = value.match(DRIVE_RE);
  if (drive) return `https://drive.google.com/file/d/${drive[1]}/preview`;

  const vimeo = value.match(VIMEO_RE);
  if (vimeo) return `https://player.vimeo.com/video/${vimeo[1]}`;

  // MP4 e desconhecidos não têm URL de iframe.
  return null;
}

/** Rótulo amigável do provedor (para hints no formulário). */
export function videoProviderLabel(provider: VideoProvider): string {
  switch (provider) {
    case "youtube":
      return "YouTube";
    case "drive":
      return "Google Drive";
    case "vimeo":
      return "Vimeo";
    case "mp4":
      return "Vídeo MP4";
    default:
      return "Link não reconhecido";
  }
}
