import { ExternalLink, Film, PlayCircle } from "lucide-react";
import { getEmbeddableVideoUrl, getVideoProvider, videoProviderLabel } from "@/utils/video-embed";

type ProcedureVideoLessonProps = {
  title?: string;
  videoUrl?: string;
  description?: string;
  /** Cabeçalho padrão "Videoaula do procedimento". Passe false para vídeos extras. */
  showHeader?: boolean;
  /** Slot opcional (ex.: botões de admin) renderizado no rodapé do card. */
  footer?: React.ReactNode;
};

const CARD =
  "rounded-2xl border border-gold/30 bg-gradient-to-br from-[#1A1710] to-ink p-5 shadow-[0_18px_45px_rgba(0,0,0,0.35)] sm:p-6";

/**
 * Player premium da videoaula. Toca dentro do portal:
 * - YouTube / Google Drive / Vimeo → iframe responsivo 16:9
 * - MP4 → <video controls>
 * - URL desconhecida → não renderiza iframe; oferece link externo seguro
 * - sem vídeo → empty state
 */
export function ProcedureVideoLesson({ title, videoUrl, description, showHeader = true, footer }: ProcedureVideoLessonProps) {
  const url = videoUrl?.trim() ?? "";
  const provider = url ? getVideoProvider(url) : "unknown";
  const embedUrl = url ? getEmbeddableVideoUrl(url) : null;
  const heading = title?.trim() || "Videoaula do procedimento";

  // ---- Empty state ----
  if (!url) {
    return (
      <div className={CARD}>
        {showHeader ? <Header heading="Videoaula do procedimento" description="Assista ao passo a passo antes de executar a atividade." /> : null}
        <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-gold/25 bg-black/30 px-4 py-10 text-center">
          <Film className="h-9 w-9 text-neutralized" />
          <p className="text-sm font-semibold text-surface">Nenhuma videoaula cadastrada para este procedimento.</p>
          <p className="max-w-md text-[13px] text-parchment-dim">
            Adicione um vídeo demonstrando o passo a passo para facilitar o treinamento da equipe.
          </p>
        </div>
        {footer ? <div className="mt-3 border-t border-gold/15 pt-3">{footer}</div> : null}
      </div>
    );
  }

  return (
    <div className={CARD}>
      {showHeader ? (
        <Header
          heading={heading}
          description={description?.trim() || "Assista ao passo a passo antes de executar a atividade."}
        />
      ) : (
        (title?.trim() || description?.trim()) && (
          <div className="mb-3">
            {title?.trim() ? <h3 className="text-base font-semibold text-surface">{title}</h3> : null}
            {description?.trim() ? <p className="text-sm text-parchment">{description}</p> : null}
          </div>
        )
      )}

      {provider === "mp4" ? (
        <div className="aspect-video w-full overflow-hidden rounded-xl border border-gold/25 bg-black">
          {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
          <video src={url} controls preload="metadata" className="h-full w-full bg-black object-contain">
            Seu navegador não suporta a reprodução de vídeo.
          </video>
        </div>
      ) : embedUrl ? (
        <div className="relative aspect-video w-full overflow-hidden rounded-xl border border-gold/25 bg-black">
          <div className="pointer-events-none absolute inset-0 z-0 flex items-center justify-center gap-2 text-[12px] text-neutralized">
            <Film className="h-4 w-4 animate-pulse" /> Carregando player…
          </div>
          <iframe
            src={embedUrl}
            title={heading}
            loading="lazy"
            referrerPolicy="strict-origin-when-cross-origin"
            className="relative z-10 h-full w-full"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen"
            allowFullScreen
          />
        </div>
      ) : (
        // Provedor desconhecido — não incorpora; oferece link externo seguro.
        <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-gold/25 bg-black/40 px-4 py-10 text-center">
          <PlayCircle className="h-9 w-9 text-gold" />
          <p className="text-sm text-parchment">
            Este link não pôde ser incorporado com segurança no portal.
          </p>
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex h-9 items-center gap-2 rounded-lg border border-gold/55 bg-gold/15 px-3 text-[12px] font-bold text-gold-soft transition hover:bg-gold/25"
          >
            <ExternalLink className="h-4 w-4" /> Abrir vídeo em nova aba
          </a>
        </div>
      )}

      <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
        <span className="inline-flex items-center gap-1.5 rounded-full border border-gold/30 bg-gold/10 px-2.5 py-0.5 text-[11px] font-semibold text-gold-soft">
          <Film className="h-3.5 w-3.5" /> {videoProviderLabel(provider)}
        </span>
        {provider !== "unknown" ? (
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-[12px] font-semibold text-parchment transition hover:text-white"
          >
            <ExternalLink className="h-3.5 w-3.5" /> Abrir em nova aba
          </a>
        ) : null}
      </div>

      {footer ? <div className="mt-3 border-t border-gold/15 pt-3">{footer}</div> : null}
    </div>
  );
}

function Header({ heading, description }: { heading: string; description: string }) {
  return (
    <div className="mb-4 flex items-start gap-3">
      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-gold/35 bg-gold/12 text-gold">
        <PlayCircle className="h-5 w-5" />
      </span>
      <div>
        <h2 className="font-serif text-xl font-semibold text-surface">{heading}</h2>
        <p className="text-sm text-parchment">{description}</p>
      </div>
    </div>
  );
}
