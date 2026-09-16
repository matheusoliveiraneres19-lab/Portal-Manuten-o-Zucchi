"use client";

import { AlertTriangle, Info, OctagonAlert } from "lucide-react";
import type { DataQualityNotice, DataQualityTone } from "@/types/data-quality";

/**
 * Superfície onde o aviso será renderizado.
 *
 * O portal tem duas, e é a confusão entre elas que produzia avisos ilegíveis: o
 * mesmo `text-amber-100` que funciona sobre painel preto vira amarelo-claro sobre
 * bege-claro (~1,4:1) e some. Cada tom tem paleta própria por superfície.
 */
type NoticeSurface = "light" | "dark";

type FieldNoticeProps = {
  notices: DataQualityNotice[];
  className?: string;
  /** Padrão "light": a página do portal é clara, e os painéis também. */
  surface?: NoticeSurface;
};

/**
 * Paletas por tom e superfície.
 *
 * Em superfície CLARA o corpo do texto é sempre grafite escuro (`text-ink`) — nunca
 * a cor do tom. Só a borda, o fundo suave, o ícone e o título carregam a cor; o
 * texto corrido colorido é justamente o que ficava ilegível. Contraste do corpo
 * sobre os fundos usados: acima de 10:1.
 */
const TONE_STYLE: Record<NoticeSurface, Record<DataQualityTone, { box: string; icon: string; title: string; body: string; Icon: typeof Info }>> = {
  light: {
    info: {
      box: "border-gold/45 bg-gold/[0.08]",
      icon: "text-gold-deep",
      title: "text-gold-deep",
      body: "text-neutralized-strong",
      Icon: Info
    },
    warning: {
      box: "border-warning/60 bg-warning/[0.12]",
      icon: "text-warning-strong",
      title: "text-warning-strong",
      body: "text-ink",
      Icon: AlertTriangle
    },
    danger: {
      box: "border-danger/55 bg-danger/[0.10]",
      icon: "text-danger-strong",
      title: "text-danger-strong",
      body: "text-ink",
      Icon: OctagonAlert
    }
  },
  dark: {
    info: {
      box: "border-gold/25 bg-gold/[0.07]",
      icon: "text-gold",
      title: "text-champagne",
      body: "text-parchment",
      Icon: Info
    },
    warning: {
      box: "border-warning/45 bg-warning/[0.12]",
      icon: "text-warning-soft",
      title: "text-warning-soft",
      body: "text-parchment",
      Icon: AlertTriangle
    },
    danger: {
      box: "border-danger/50 bg-danger/[0.15]",
      icon: "text-danger-soft",
      title: "text-danger-soft",
      body: "text-parchment",
      Icon: OctagonAlert
    }
  }
};

/**
 * Aviso de campo ausente / indicador indisponível.
 *
 * Versão genérica do padrão que já existia em `CriticalEquipmentFieldNotice`, agora
 * compartilhada por todas as abas. A regra é simples: um indicador só some da tela
 * acompanhado de um aviso que diz POR QUE sumiu e COMO trazê-lo de volta. Gráfico
 * vazio e "n/d" passam a impressão de portal quebrado; isto aqui passa a informação
 * de que a base não tem o campo — que é a verdade, e é acionável.
 */
export function FieldNotice({ notices, className = "", surface = "light" }: FieldNoticeProps) {
  if (!notices.length) return null;

  return (
    <div className={`space-y-2 ${className}`}>
      {notices.map((notice) => {
        const style = TONE_STYLE[surface][notice.tone ?? "info"];
        const Icon = style.Icon;
        return (
          <div key={notice.id} className={`flex items-start gap-2.5 rounded-lg border px-3 py-2.5 text-[12px] ${style.box}`}>
            <Icon className={`mt-0.5 h-4 w-4 shrink-0 ${style.icon}`} />
            <span className="min-w-0">
              <strong className={`font-bold ${style.title}`}>{notice.message}</strong>
              {notice.detail ? (
                <span className={`mt-1 block text-[11px] leading-relaxed ${style.body}`}>{notice.detail}</span>
              ) : null}
            </span>
          </div>
        );
      })}
    </div>
  );
}

/**
 * Espaço de um gráfico/indicador que NÃO foi renderizado por falta de campo na base.
 *
 * Diferente do EmptyState ("sem dados no período", que é um recorte sem movimento):
 * aqui o dado não existe na origem, e nenhum ajuste de filtro vai trazê-lo. Por isso
 * o texto fala de reimportação, não de filtro.
 */
export function UnavailableIndicator({
  title,
  message,
  detail,
  className = "",
  surface = "light"
}: {
  title: string;
  message: string;
  detail?: string;
  className?: string;
  surface?: NoticeSurface;
}) {
  return (
    <article className={`panel flex flex-col rounded-lg p-4 ${className}`}>
      <h3 className="text-[11px] font-extrabold uppercase tracking-wide text-gold-deep">{title}</h3>
      <div className="mt-3 flex flex-1 items-center">
        <FieldNotice notices={[{ id: "unavailable", message, detail, tone: "info" }]} className="w-full" surface={surface} />
      </div>
    </article>
  );
}
