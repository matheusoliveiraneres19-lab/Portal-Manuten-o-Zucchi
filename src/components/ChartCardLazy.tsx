"use client";

import dynamic from "next/dynamic";

type ChartCardLazyProps = {
  title: string;
  kind: "line" | "donut" | "bar-horizontal" | "bar" | "area";
  data: Array<Record<string, string | number>>;
  className?: string;
  emptyTitle?: string;
  emptyDescription?: string;
  /** Rota da aba oficial para o botão "Ver todas" (com query params de período). */
  href?: string;
  /** Aviso técnico opcional exibido abaixo do gráfico. */
  note?: string;
};

// Recharts só é baixado quando o gráfico monta no cliente.
const ChartCard = dynamic(() => import("@/components/ChartCard").then((m) => m.ChartCard), {
  ssr: false,
  loading: () => (
    <div className="panel h-full min-h-[244px] rounded-lg p-4">
      <div className="h-3 w-40 animate-pulse rounded bg-zinc-300/70" />
      <div className="mt-4 h-[185px] animate-pulse rounded bg-zinc-200/70" />
    </div>
  )
});

/**
 * O col-span fica no wrapper; o ChartCard interno preenche a célula.
 * Assim o skeleton ocupa o mesmo espaço e não há layout shift.
 */
export function ChartCardLazy({ className, ...props }: ChartCardLazyProps) {
  return (
    <div className={className}>
      <ChartCard {...props} />
    </div>
  );
}
