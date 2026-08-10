import { CalendarRange } from "lucide-react";
import { AlertList } from "@/components/AlertList";
import { ChartCardLazy as ChartCard } from "@/components/ChartCardLazy";
import { HeroBanner } from "@/components/HeroBanner";
import { KPICard } from "@/components/KPICard";
import { RankingList } from "@/components/RankingList";
import { TableCard } from "@/components/TableCard";
import type { DashboardData } from "@/types/dashboard";
import { formatPeriodRange } from "@/utils/period";

type DashboardHomeProps = {
  dashboard: DashboardData;
};

export function DashboardHome({ dashboard }: DashboardHomeProps) {
  // Preserva o período atual (mesmo store da URL) nos links "Ver todas", para a
  // aba de destino abrir já filtrada pelo mesmo intervalo do dashboard.
  const periodQuery = buildPeriodQuery(dashboard.period);
  const href = (path: string) => `${path}${periodQuery}`;

  return (
    <>
      <HeroBanner />

      {/* Fundo desta linha é o gradiente claro da página (não um painel), então usa
          os tons escuros de superfície clara — gold/champagne aqui ficariam ilegíveis. */}
      {dashboard.period ? (
        <div className="mt-3 flex items-center justify-end gap-1.5 text-[11px] text-zinc-600">
          <CalendarRange className="h-3.5 w-3.5 text-[#8a6a20]" />
          <span>
            Período analisado:{" "}
            <strong className="font-semibold text-[#5a3d12]">
              {formatPeriodRange(dashboard.period.startDate, dashboard.period.endDate)}
            </strong>
          </span>
        </div>
      ) : null}

      {/* 4 KPIs: uma linha só a partir de xl — abaixo disso a coluna de texto do
          card fica estreita demais e nomes longos ("Procedimentos Ativos") encostam
          na borda, então voltamos para 2 colunas. */}
      <section className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {dashboard.kpis.map((kpi) => (
          <KPICard key={kpi.title} kpi={kpi} />
        ))}
      </section>

      <section className="mt-3 grid grid-cols-1 gap-3 xl:grid-cols-12">
        <ChartCard
          className="xl:col-span-4"
          data={dashboard.openClosedOrders}
          kind="line"
          title="OS abertas x fechadas (por mês)"
          href={href("/dashboard/ordens-servico")}
          note={dashboard.openClosedNote ?? undefined}
          emptyTitle="Nenhuma Ordem de Manutenção no período"
          emptyDescription="Ajuste o filtro de período ou importe Ordens de Manutenção para visualizar este indicador."
        />
        <ChartCard
          className="xl:col-span-3"
          data={dashboard.correctivePreventive}
          kind="donut"
          title="Manutenção corretiva x preventiva"
          href={href("/dashboard/ordens-servico")}
          emptyTitle="Sem ordens classificadas"
          emptyDescription="Importe ordens corretivas/preventivas para visualizar a distribuição."
        />
        <RankingList
          className="xl:col-span-5"
          items={dashboard.criticalEquipment}
          title="Top Equipamentos Críticos"
          variant="badges"
          href={href("/dashboard/equipamentos-criticos")}
          emptyTitle="Sem equipamentos críticos no período"
          emptyDescription="Importe ordens ou ajuste o filtro para visualizar este indicador."
        />
        <TableCard
          className="xl:col-span-6"
          purchases={dashboard.pendingPurchases}
          title="Compras Pendentes"
          href={href("/dashboard/compras-pendentes")}
          emptyTitle="Sem compras pendentes"
          emptyDescription="Aguardando importação de compras para exibir este indicador."
        />
        <div className="xl:col-span-6">
          <AlertList alerts={dashboard.alerts} title="Alertas Críticos" href={href("/dashboard/equipamentos-criticos")} />
        </div>
      </section>
    </>
  );
}

/** Monta ?startDate&endDate (yyyy-mm-dd) a partir do período ISO do dashboard. */
function buildPeriodQuery(period: DashboardData["period"]): string {
  if (!period) {
    return "";
  }
  const startDate = period.startDate.slice(0, 10);
  const endDate = period.endDate.slice(0, 10);
  return `?startDate=${startDate}&endDate=${endDate}`;
}
