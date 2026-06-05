import { cn } from "@/lib/utils";

/** Placeholder com a mesma moldura dos cards de gráfico, evitando layout shift no lazy-load. */
export function ChartSkeleton({ className = "" }: { className?: string }) {
  return (
    <article className={cn("panel rounded-lg p-4", className)}>
      <div className="h-3 w-44 animate-pulse rounded bg-zinc-300/70" />
      <div className="mt-3 h-3 w-60 animate-pulse rounded bg-zinc-200/60" />
      <div className="mt-4 h-[200px] animate-pulse rounded bg-zinc-200/70" />
    </article>
  );
}
