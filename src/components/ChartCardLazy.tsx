"use client";

import dynamic from "next/dynamic";

type ChartCardLazyProps = {
  title: string;
  kind: "line" | "donut";
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
// As alturas do skeleton acompanham CHART_HEIGHT do ChartCard — se mudarem lá,
// mude aqui também, senão volta o layout shift no lazy-load.
const ChartCard = dynamic(() => import("@/components/ChartCard").then((m) => m.ChartCard), {
  ssr: false,
  loading: () => (
    <div className="panel panel-accent h-full p-4">
      <div className="h-3 w-40 animate-pulse rounded bg-neutralized/25" />
      <div className="mt-4 h-[200px] animate-pulse rounded-lg bg-neutralized/15 sm:h-[224px] xl:h-[248px] 2xl:h-[288px]" />
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
