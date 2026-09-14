"use client";

import { AlertTriangle, Info, OctagonAlert } from "lucide-react";
import type { DataQualityNotice, DataQualityTone } from "@/types/data-quality";

type FieldNoticeProps = {
  notices: DataQualityNotice[];
  className?: string;
};

const TONE_STYLE: Record<DataQualityTone, { box: string; icon: typeof Info }> = {
  info: { box: "border-gold/25 bg-gold/5 text-champagne", icon: Info },
  warning: { box: "border-amber-500/35 bg-amber-500/10 text-amber-100", icon: AlertTriangle },
  danger: { box: "border-danger/40 bg-danger/10 text-rose-100", icon: OctagonAlert }
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
export function FieldNotice({ notices, className = "" }: FieldNoticeProps) {
  if (!notices.length) return null;

  return (
    <div className={`space-y-2 ${className}`}>
      {notices.map((notice) => {
        const style = TONE_STYLE[notice.tone ?? "info"];
        const Icon = style.icon;
        return (
          <div key={notice.id} className={`flex items-start gap-2 rounded-lg border px-3 py-2 text-[12px] ${style.box}`}>
            <Icon className="mt-0.5 h-4 w-4 shrink-0 opacity-90" />
            <span className="min-w-0">
              <strong className="font-semibold">{notice.message}</strong>
              {notice.detail ? <span className="mt-0.5 block text-[11px] opacity-80">{notice.detail}</span> : null}
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
  className = ""
}: {
  title: string;
  message: string;
  detail?: string;
  className?: string;
}) {
  return (
    <article className={`panel flex flex-col rounded-lg p-4 ${className}`}>
      <h3 className="text-[11px] font-extrabold uppercase tracking-wide text-gold-deep">{title}</h3>
      <div className="mt-3 flex flex-1 items-center">
        <FieldNotice notices={[{ id: "unavailable", message, detail, tone: "info" }]} className="w-full" />
      </div>
    </article>
  );
}
