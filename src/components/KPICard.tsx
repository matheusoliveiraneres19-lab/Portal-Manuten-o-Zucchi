import Link from "next/link";
import { ArrowDown, ArrowRight, ArrowUp, Clock, Minus } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { DashboardKPI } from "@/types/dashboard";

type KPICardProps = {
  kpi: DashboardKPI;
};

const toneMap = {
  blue: "bg-petroleum text-white",
  gold: "bg-gold text-white",
  red: "bg-danger text-white"
};

const directionIcon: Record<"up" | "down" | "stable", LucideIcon> = {
  up: ArrowUp,
  down: ArrowDown,
  stable: ArrowRight
};

const directionColor: Record<"up" | "down" | "stable", string> = {
  up: "text-emerald-700",
  down: "text-rose-600",
  stable: "text-zinc-500"
};

export function KPICard({ kpi }: KPICardProps) {
  const Icon = kpi.icon;
  const footer = resolveFooter(kpi);

  const card = (
    <article
      title={kpi.tooltip}
      className={`panel flex min-h-[110px] items-center gap-4 rounded-lg p-4 transition hover:-translate-y-0.5 hover:shadow-premium ${
        kpi.href ? "cursor-pointer" : ""
      }`}
    >
      <div className={`grid h-16 w-16 shrink-0 place-items-center rounded-full shadow-[inset_0_1px_0_rgba(255,255,255,0.22)] ${toneMap[kpi.tone]}`}>
        <Icon className="h-8 w-8" strokeWidth={1.8} />
      </div>
      <div className="min-w-0">
        <h3 className="text-[11px] font-extrabold uppercase tracking-wide text-zinc-800">{kpi.title}</h3>
        <div className="mt-1 text-3xl font-light tracking-normal text-zinc-950 sm:text-4xl">{kpi.value}</div>
        <div className={`mt-1 flex items-center gap-1 text-xs ${footer.className}`}>
          <footer.Icon className="h-3.5 w-3.5 shrink-0" />
          <span className="truncate">{footer.text}</span>
        </div>
      </div>
    </article>
  );

  if (kpi.href) {
    return (
      <Link href={kpi.href} className="block">
        {card}
      </Link>
    );
  }

  return card;
}

function resolveFooter(kpi: DashboardKPI): { Icon: LucideIcon; className: string; text: string } {
  // 1) Card sem dados no período: comunica estado de vazio em vez de comparar.
  if (kpi.isEmpty) {
    return {
      Icon: Clock,
      className: "text-zinc-400",
      text: kpi.emptyHint ?? "Sem registros no período"
    };
  }

  // 2) Comparativo real disponível.
  if (kpi.comparison.status === "available") {
    return {
      Icon: directionIcon[kpi.comparison.direction],
      className: directionColor[kpi.comparison.direction],
      text: kpi.comparison.label
    };
  }

  // 3) Sem histórico suficiente para comparar.
  return {
    Icon: Minus,
    className: "text-zinc-400",
    text: kpi.comparison.label
  };
}
