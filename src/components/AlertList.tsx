import { BellOff } from "lucide-react";
import { EmptyState } from "@/components/EmptyState";
import { SeeAllLink } from "@/components/SeeAllLink";
import type { AlertItem } from "@/types/dashboard";

type AlertListProps = {
  title: string;
  alerts: AlertItem[];
  /** Rota da aba oficial para o botão "Ver todas" (com query params de período). */
  href?: string;
};

export function AlertList({ title, alerts, href }: AlertListProps) {
  return (
    <article className="panel rounded-lg p-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h3 className="text-[11px] font-extrabold uppercase tracking-wide text-[#5a3d12]">{title}</h3>
        {href && alerts.length ? <SeeAllLink href={href} /> : null}
      </div>
      {alerts.length === 0 ? (
        <EmptyState
          icon={BellOff}
          title="Nenhum alerta crítico no período"
          description="Os alertas aparecerão aqui quando houver ocorrências registradas."
        />
      ) : (
      <div className="space-y-2.5">
        {alerts.map((alert) => {
          const Icon = alert.icon;
          return (
            <div key={alert.text} className="flex items-center gap-3 border-b border-zinc-100 pb-2.5 last:border-0 last:pb-0">
              <Icon className="h-4 w-4 shrink-0 text-danger" />
              <span className="min-w-0 flex-1 text-xs text-zinc-800 sm:text-sm">{alert.text}</span>
              <span className="shrink-0 text-xs text-zinc-500">{alert.time}</span>
            </div>
          );
        })}
      </div>
      )}
    </article>
  );
}
