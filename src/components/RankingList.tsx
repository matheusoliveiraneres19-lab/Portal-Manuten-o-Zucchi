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
    <article className={`panel rounded-lg p-4 ${className}`}>
      <div className="mb-3 flex items-center justify-between gap-3">
        <h3 className="text-[11px] font-extrabold uppercase tracking-wide text-[#5a3d12]">{title}</h3>
        {href && items.length ? <SeeAllLink href={href} /> : null}
      </div>
      {items.length === 0 ? (
        <EmptyState icon={Trophy} title={emptyTitle} description={emptyDescription} />
      ) : (
      <div className="space-y-2.5">
        {items.map((item, index) => (
          <div key={item.name} className="grid grid-cols-[28px_1fr_auto] items-center gap-3 border-b border-zinc-100 pb-2.5 last:border-0 last:pb-0">
            <span className="text-xs font-bold text-zinc-500">{String(index + 1).padStart(2, "0")}</span>
            <div className="min-w-0">
              <div className="truncate text-sm text-zinc-900">{item.name}</div>
              {variant === "bars" ? (
                <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-zinc-200">
                  <div className="h-full rounded-full bg-danger" style={{ width: `${(item.value / maxValue) * 100}%` }} />
                </div>
              ) : null}
            </div>
            {variant === "badges" ? (
              <span className="rounded-md border border-danger/30 bg-danger/10 px-3 py-1 text-sm font-bold text-danger">
                {item.value}
              </span>
            ) : (
              <span className="text-sm font-semibold text-zinc-800">
                {unit === "percent"
                  ? `${item.value.toFixed(1).replace(".", ",")}%`
                  : item.value.toLocaleString("pt-BR")}
              </span>
            )}
          </div>
        ))}
      </div>
      )}
    </article>
  );
}
