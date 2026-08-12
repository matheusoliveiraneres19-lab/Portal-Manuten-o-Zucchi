import { BellOff } from "lucide-react";
import { EmptyState } from "@/components/EmptyState";
import { SeeAllLink } from "@/components/SeeAllLink";
import type { AlertItem } from "@/types/dashboard";

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
          {alerts.map((alert) => {
            const Icon = alert.icon;
            return (
              <li
                key={alert.text}
                className="flex items-start gap-2.5 rounded-lg border border-danger/15 border-l-[3px] border-l-danger bg-danger/[0.05] px-3 py-2.5 transition-colors duration-200 ease-premium hover:border-danger/30 hover:bg-danger/[0.09]"
              >
                <Icon className="mt-0.5 h-4 w-4 shrink-0 text-danger" />
                {/* Etiqueta do tipo ACIMA da descrição, não ao lado: como rótulos
                    do portal são longos ("LUBRIFICANTE ABAIXO DO MÍNIMO: 4537"),
                    lado a lado eles estrangulavam o texto em muitas linhas. */}
                <div className="min-w-0 flex-1">
                  <span className="mb-1 inline-block rounded-md bg-danger/[0.12] px-1.5 py-0.5 text-[10px] font-bold uppercase leading-tight tracking-wide text-danger-strong">
                    {alert.time}
                  </span>
                  <p className="text-xs leading-relaxed text-ink sm:text-[13px]">{alert.text}</p>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </article>
  );
}
