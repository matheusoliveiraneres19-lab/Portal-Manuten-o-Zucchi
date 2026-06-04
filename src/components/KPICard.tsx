import { ArrowDown, ArrowRight, ArrowUp } from "lucide-react";
import type { DashboardKPI } from "@/types/dashboard";

type KPICardProps = {
  kpi: DashboardKPI;
};

const toneMap = {
  blue: "bg-petroleum text-white",
  gold: "bg-gold text-white",
  red: "bg-danger text-white"
};

export function KPICard({ kpi }: KPICardProps) {
  const Icon = kpi.icon;
  const TrendIcon = kpi.direction === "up" ? ArrowUp : kpi.direction === "down" ? ArrowDown : ArrowRight;

  return (
    <article className="panel flex min-h-[110px] items-center gap-4 rounded-lg p-4 transition hover:-translate-y-0.5 hover:shadow-premium">
      <div className={`grid h-16 w-16 shrink-0 place-items-center rounded-full shadow-[inset_0_1px_0_rgba(255,255,255,0.22)] ${toneMap[kpi.tone]}`}>
        <Icon className="h-8 w-8" strokeWidth={1.8} />
      </div>
      <div className="min-w-0">
        <h3 className="text-[11px] font-extrabold uppercase tracking-wide text-zinc-800">{kpi.title}</h3>
        <div className="mt-1 text-3xl font-light tracking-normal text-zinc-950 sm:text-4xl">{kpi.value}</div>
        <div className={`mt-1 flex items-center gap-1 text-xs ${kpi.direction === "down" ? "text-emerald-700" : kpi.direction === "flat" ? "text-zinc-500" : "text-emerald-700"}`}>
          <TrendIcon className="h-3.5 w-3.5" />
          <span>{kpi.trend}</span>
        </div>
      </div>
    </article>
  );
}
