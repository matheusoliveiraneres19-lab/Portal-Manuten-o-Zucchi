import type { AlertItem } from "@/types/dashboard";

type AlertListProps = {
  title: string;
  alerts: AlertItem[];
};

export function AlertList({ title, alerts }: AlertListProps) {
  return (
    <article className="panel rounded-lg p-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h3 className="text-[11px] font-extrabold uppercase tracking-wide text-[#5a3d12]">{title}</h3>
        <button className="text-xs font-semibold text-petroleum">Ver todas</button>
      </div>
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
    </article>
  );
}
