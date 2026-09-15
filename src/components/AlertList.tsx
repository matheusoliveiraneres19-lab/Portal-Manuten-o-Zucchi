import Link from "next/link";
import { BellOff } from "lucide-react";
import { EmptyState } from "@/components/EmptyState";
import { SeeAllLink } from "@/components/SeeAllLink";
import type { AlertItem, AlertSeverity } from "@/types/dashboard";

/**
 * Cor por GRAVIDADE. Antes todo alerta era vermelho, inclusive o informativo — com
 * tudo crítico, nada é crítico, e a faixa vermelha deixava de ser lida.
 */
const SEVERITY_STYLE: Record<AlertSeverity, { box: string; icon: string; chip: string }> = {
  CRITICO: {
    box: "border-danger/20 border-l-danger bg-danger/[0.06] hover:border-danger/40 hover:bg-danger/[0.11]",
    icon: "text-danger",
    chip: "bg-danger/[0.14] text-danger-strong"
  },
  ATENCAO: {
    box: "border-gold/25 border-l-gold bg-gold/[0.06] hover:border-gold/45 hover:bg-gold/[0.11]",
    icon: "text-gold-deep",
    chip: "bg-gold/[0.18] text-gold-deep"
  },
  INFORMATIVO: {
    box: "border-black/10 border-l-neutralized bg-black/[0.03] hover:border-black/20 hover:bg-black/[0.05]",
    icon: "text-neutralized-strong",
    chip: "bg-black/[0.06] text-neutralized-strong"
  }
};

type AlertListProps = {
  title: string;
  alerts: AlertItem[];
  /** Rota da aba oficial para o botão "Ver todas" (com query params de período). */
  href?: string;
  className?: string;
};

/**
 * Alertas críticos da home. Cada alerta é um bloco com faixa vermelha à esquerda —
 * antes eram linhas de texto separadas por um filete cinza, sem peso visual de
 * criticidade. O tipo do alerta (`time`) vira etiqueta, e não texto solto.
 */
export function AlertList({ title, alerts, href, className = "" }: AlertListProps) {
  return (
    <article className={`panel panel-accent flex h-full flex-col p-4 ${className}`}>
      <div className="mb-3 flex items-center justify-between gap-3">
        <h3 className="text-[11px] font-extrabold uppercase tracking-wide text-gold-deep">{title}</h3>
        {href && alerts.length ? <SeeAllLink href={href} /> : null}
      </div>

      {alerts.length === 0 ? (
        <EmptyState
          icon={BellOff}
          title="Nenhum alerta crítico no período"
          description="Os alertas aparecerão aqui quando houver ocorrências registradas."
        />
      ) : (
        <ul className="space-y-2">
          {alerts.map((alert, index) => {
            const Icon = alert.icon;
            const style = SEVERITY_STYLE[alert.severity];
            return (
              <li key={`${alert.time}-${index}`}>
                {/* Cada alerta leva à aba que o originou, com o período preservado:
                    sem isso o usuário lê "existe um problema" e não tem como ir vê-lo. */}
                <Link
                  href={alert.href}
                  className={`flex items-start gap-2.5 rounded-lg border border-l-[3px] px-3 py-2.5 transition-colors duration-200 ease-premium focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-gold ${style.box}`}
                >
                  <Icon className={`mt-0.5 h-4 w-4 shrink-0 ${style.icon}`} />
                  {/* Etiqueta do tipo ACIMA da descrição, não ao lado: como rótulos
                      do portal são longos ("LUBRIFICANTE ABAIXO DO MÍNIMO: 4537"),
                      lado a lado eles estrangulavam o texto em muitas linhas. */}
                  <div className="min-w-0 flex-1">
                    <span className={`mb-1 inline-block rounded-md px-1.5 py-0.5 text-[10px] font-bold uppercase leading-tight tracking-wide ${style.chip}`}>
                      {alert.time}
                    </span>
                    <p className="text-xs leading-relaxed text-ink sm:text-[13px]">{alert.text}</p>
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </article>
  );
}
