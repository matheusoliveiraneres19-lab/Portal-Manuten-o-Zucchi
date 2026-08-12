import Link from "next/link";
import { ArrowDown, ArrowRight, ArrowUp, Clock, Minus } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { DashboardKPI, KPITone } from "@/types/dashboard";

type KPICardProps = {
  kpi: DashboardKPI;
};

/**
 * Medalhão do ícone. Gradiente sutil + anel interno de luz: o mesmo tom chapado de
 * antes lia como um círculo plano de cor.
 */
const toneMedallion: Record<KPITone, string> = {
  blue: "bg-gradient-to-br from-[#1B6285] to-petroleum text-white ring-petroleum/25",
  gold: "bg-gradient-to-br from-[#E2BC55] to-[#B98C22] text-ink ring-gold/30",
  red: "bg-gradient-to-br from-[#C6304A] to-danger text-white ring-danger/25",
  green: "bg-gradient-to-br from-[#3AA76B] to-success text-white ring-success/25",
  amber: "bg-gradient-to-br from-[#E4BB4F] to-warning text-ink ring-warning/30"
};

/** Cor do filete lateral que identifica o tom do card. */
const toneRail: Record<KPITone, string> = {
  blue: "bg-petroleum",
  gold: "bg-gold",
  red: "bg-danger",
  green: "bg-success",
  amber: "bg-warning"
};

const directionIcon: Record<"up" | "down" | "stable", LucideIcon> = {
  up: ArrowUp,
  down: ArrowDown,
  stable: ArrowRight
};

/**
 * Cor do comparativo. Usa as variantes `-strong`, escurecidas para atingir
 * contraste AA sobre o card claro — o tom sólido reprovaria em texto pequeno.
 */
const directionColor: Record<"up" | "down" | "stable", string> = {
  up: "text-success-strong",
  down: "text-danger-strong",
  stable: "text-neutralized-strong"
};

export function KPICard({ kpi }: KPICardProps) {
  const Icon = kpi.icon;
  const footer = resolveFooter(kpi);

  const card = (
    <article
      title={kpi.tooltip}
      className={`panel panel-interactive relative flex min-h-[118px] items-center gap-4 overflow-hidden p-4 pl-5 ${
        kpi.href ? "cursor-pointer" : ""
      }`}
    >
      {/* Filete lateral: identifica o tom sem depender só da cor do ícone. */}
      <span aria-hidden className={`absolute inset-y-0 left-0 w-1 ${toneRail[kpi.tone]}`} />

      <div
        className={`grid h-16 w-16 shrink-0 place-items-center rounded-full ring-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.28)] ${
          toneMedallion[kpi.tone]
        }`}
      >
        <Icon className="h-8 w-8" strokeWidth={1.8} />
      </div>

      <div className="min-w-0">
        <h3 className="text-[11px] font-extrabold uppercase tracking-wide text-gold-deep">{kpi.title}</h3>
        {/* font-semibold + tracking-tight: o antigo font-light deixava o número
            visualmente fraco, que era a queixa de "contraste nos números". */}
        <div className="mt-0.5 text-3xl font-semibold tracking-tight text-ink sm:text-[2.5rem] sm:leading-[1.1]">
          {kpi.value}
        </div>
        {/* Duas linhas em vez de truncate: os subtítulos do portal são
            explicativos ("Total em aberto (abertas + em andamento)") e cortá-los
            na primeira palavra útil tirava justamente a informação. */}
        <div className={`mt-1 flex items-start gap-1 text-xs font-medium ${footer.className}`}>
          <footer.Icon className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span className="line-clamp-2 leading-snug">{footer.text}</span>
        </div>
      </div>
    </article>
  );

  if (kpi.href) {
    return (
      <Link href={kpi.href} className="block rounded-card focus-visible:outline-none">
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
      className: "text-neutralized-strong",
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
    className: "text-neutralized-strong",
    text: kpi.comparison.label
  };
}
