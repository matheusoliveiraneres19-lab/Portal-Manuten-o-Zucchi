import { Trophy } from "lucide-react";
import { EmptyState } from "@/components/EmptyState";
import { SeeAllLink } from "@/components/SeeAllLink";

type RankingItem = {
  name: string;
  value: number;
};

type RankingListProps = {
  title: string;
  items: RankingItem[];
  variant: "badges" | "bars";
  className?: string;
  emptyTitle?: string;
  emptyDescription?: string;
  /** Rota da aba oficial para o botão "Ver todas" (com query params de período). */
  href?: string;
  /** Como formatar o valor na variante "bars": contagem inteira (padrão) ou %. */
  unit?: "count" | "percent";
};

/**
 * Ranking dos cards da home (equipamentos críticos, máquinas etc.).
 *
 * Os três primeiros colocados recebem destaque de posição — num ranking de
 * criticidade, "quem está no topo" é a informação que o gestor busca primeiro, e
 * antes todas as posições tinham o mesmo peso visual.
 */
export function RankingList({
  title,
  items,
  variant,
  className = "",
  emptyTitle = "Sem dados no período",
  emptyDescription = "Importe ordens ou ajuste o filtro para visualizar este indicador.",
  href,
  unit = "count"
}: RankingListProps) {
  const maxValue = Math.max(...items.map((item) => item.value), 0) || 1;

  return (
    <article className={`panel panel-accent flex h-full flex-col p-4 ${className}`}>
      <div className="mb-3 flex items-center justify-between gap-3">
        <h3 className="text-[11px] font-extrabold uppercase tracking-wide text-gold-deep">{title}</h3>
        {href && items.length ? <SeeAllLink href={href} /> : null}
      </div>

      {items.length === 0 ? (
        <EmptyState icon={Trophy} title={emptyTitle} description={emptyDescription} />
      ) : (
        <ol className="space-y-1">
          {items.map((item, index) => (
            <li
              key={item.name}
              className="grid grid-cols-[26px_1fr_auto] items-center gap-3 rounded-lg border-b border-black/[0.06] px-1 py-2 transition-colors duration-200 ease-premium last:border-0 hover:bg-gold/[0.07]"
            >
              <span
                className={`grid h-6 w-6 place-items-center rounded-md text-[11px] font-bold tabular-nums ${
                  index < 3 ? "bg-danger/12 text-danger-strong" : "text-neutralized-strong"
                }`}
              >
                {index + 1}
              </span>

              <div className="min-w-0">
                <div className="truncate text-sm font-medium text-ink" title={item.name}>
                  {item.name}
                </div>
                {variant === "bars" ? (
                  <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-black/[0.07]">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-danger to-[#C6304A]"
                      style={{ width: `${(item.value / maxValue) * 100}%` }}
                    />
                  </div>
                ) : null}
              </div>

              {variant === "badges" ? (
                <span className="rounded-lg border border-danger/30 bg-danger/[0.10] px-3 py-1 text-sm font-bold tabular-nums text-danger-strong">
                  {item.value}
                </span>
              ) : (
                <span className="text-sm font-semibold tabular-nums text-ink">
                  {unit === "percent"
                    ? `${item.value.toFixed(1).replace(".", ",")}%`
                    : item.value.toLocaleString("pt-BR")}
                </span>
              )}
            </li>
          ))}
        </ol>
      )}
    </article>
  );
}
