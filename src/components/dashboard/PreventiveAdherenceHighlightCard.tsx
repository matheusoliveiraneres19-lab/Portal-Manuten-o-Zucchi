import Link from "next/link";
import { ArrowRight, FileWarning, Gauge, ShieldCheck, TriangleAlert } from "lucide-react";
import type { PreventiveAdherenceHighlight } from "@/types/dashboard";

type Props = {
  highlight: PreventiveAdherenceHighlight;
  /** Rota da aba Preventivas, já com o período da home. */
  href: string;
  className?: string;
};

/**
 * Destaque de ADERÊNCIA PREVENTIVA na tela inicial (FASE 9).
 *
 * A aderência estava crítica e só aparecia depois de abrir a aba Preventivas — a home,
 * que é por onde a gestão entra, não dizia nada. Aqui ela fica na primeira dobra, com a
 * meta ao lado (um percentual sozinho não diz se é bom) e o número de OS fechadas sem
 * execução real, que é a causa imediata quando a aderência despenca.
 *
 * Todos os valores vêm prontos de `getPreventiveOrdersPageData`, o MESMO service da
 * aba. Este componente não calcula nada — nem a faixa de cor, que vem em `level`.
 */
export function PreventiveAdherenceHighlightCard({ highlight, href, className = "" }: Props) {
  const tone = TONE[highlight.level];
  const Icon = tone.icon;
  const percent =
    highlight.adherence === null
      ? "—"
      : `${highlight.adherence.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`;

  return (
    <article className={`panel panel-accent flex flex-col gap-3 rounded-lg p-4 sm:flex-row sm:items-center ${className}`}>
      <div className={`grid h-14 w-14 shrink-0 place-items-center rounded-full ${tone.badge}`}>
        <Icon className="h-7 w-7" strokeWidth={1.8} />
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <h3 className="text-[11px] font-extrabold uppercase tracking-wide text-gold-deep">Aderência Preventiva</h3>
          <span className={`rounded-md border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${tone.chip}`}>
            {tone.label}
          </span>
        </div>

        <div className="mt-1 flex flex-wrap items-baseline gap-x-4 gap-y-1">
          <span className={`text-3xl font-semibold tabular-nums ${tone.value}`}>{percent}</span>
          <span className="text-[11px] text-neutralized-strong">
            Meta ≥ {highlight.target.toLocaleString("pt-BR", { maximumFractionDigits: 0 })}%
          </span>
          <span className="text-[11px] text-neutralized-strong">
            {highlight.realizadas.toLocaleString("pt-BR")} de {highlight.total.toLocaleString("pt-BR")} OS PL/PV
            realizadas
          </span>
        </div>

        {highlight.closedWithoutExecution > 0 ? (
          <p className="mt-1.5 flex items-center gap-1.5 text-[11px] text-neutralized-strong">
            <FileWarning className="h-3.5 w-3.5 shrink-0 text-danger" />
            <span>
              <strong className="font-semibold text-ink">
                {highlight.closedWithoutExecution.toLocaleString("pt-BR")} OS fechadas sem execução real
              </strong>{" "}
              — trabalho apontado ≤ 0,1 h.
            </span>
          </p>
        ) : null}
      </div>

      <Link
        href={href}
        className="inline-flex h-9 shrink-0 items-center gap-1.5 self-start rounded-lg border border-gold/40 px-3 text-xs font-semibold text-gold-deep transition hover:border-gold hover:bg-gold/10 sm:self-center"
      >
        Ver preventivas <ArrowRight className="h-3.5 w-3.5" />
      </Link>
    </article>
  );
}

const TONE = {
  ok: {
    label: "Na meta",
    icon: ShieldCheck,
    badge: "bg-success text-white",
    chip: "border-success/40 bg-success/10 text-success-strong",
    value: "text-success-strong"
  },
  warn: {
    label: "Atenção",
    icon: Gauge,
    badge: "bg-gold text-white",
    chip: "border-gold/45 bg-gold/15 text-gold-deep",
    value: "text-gold-deep"
  },
  crit: {
    label: "Crítico",
    icon: TriangleAlert,
    badge: "bg-danger text-white",
    chip: "border-danger/40 bg-danger/10 text-danger",
    value: "text-danger"
  },
  unknown: {
    label: "Sem base",
    icon: Gauge,
    badge: "bg-petroleum text-white",
    chip: "border-black/10 bg-black/[0.04] text-neutralized-strong",
    value: "text-neutralized-strong"
  }
} as const;
