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
        <div className="mt-3 flex justify-end">
          <div className="inline-flex items-center gap-1.5 rounded-full border border-gold/25 bg-white/60 px-3 py-1 text-[11px] text-neutralized-strong shadow-sm backdrop-blur">
            <CalendarRange className="h-3.5 w-3.5 text-gold-deep" />
            <span>
              Período analisado:{" "}
              <strong className="font-semibold text-gold-deep">
                {formatPeriodRange(dashboard.period.startDate, dashboard.period.endDate)}
              </strong>
            </span>
          </div>
        </div>
      ) : null}

      {/* 4 KPIs: uma linha só a partir de xl — abaixo disso a coluna de texto do
          card fica estreita demais e nomes longos ("Procedimentos Ativos") encostam
          na borda, então voltamos para 2 colunas. */}
      <section className="mt-4 grid animate-fade-in-up grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {dashboard.kpis.map((kpi) => (
          <KPICard key={kpi.title} kpi={kpi} />
        ))}
      </section>

      {/*
        Duas linhas de 12 colunas. Todos os cards usam `h-full`, então o grid
        equaliza a altura dentro de cada linha — é isso que elimina os "buracos"
        que apareciam quando um gráfico era mais baixo que o card vizinho.

        Larguras escolhidas pelo conteúdo: o donut precisa de espaço para a legenda
        lateral (3), a tabela de compras tem 4 colunas e min-width de 560px (7).
      */}
      <section
        className="mt-3 grid animate-fade-in-up grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-12"
        style={{ animationDelay: "80ms" }}
      >
        <ChartCard
          className="xl:col-span-5"
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
          className="md:col-span-2 xl:col-span-4"
          items={dashboard.criticalEquipment}
          title="Top Equipamentos Críticos"
          variant="badges"
          href={href("/dashboard/equipamentos-criticos")}
          emptyTitle="Sem equipamentos críticos no período"
          emptyDescription="Importe ordens ou ajuste o filtro para visualizar este indicador."
        />
      </section>

      {/*
        `items-start` nesta linha (e não na de cima): aqui os dois cards têm
        alturas naturalmente muito diferentes — a tabela mostra 5 compras, a lista
        de alertas até 6 blocos de texto. Com o esticamento padrão do grid, a
        tabela ficava com ~40% de área vazia. Cada card assume sua altura real.
      */}
      <section
        className="mt-3 grid animate-fade-in-up grid-cols-1 items-start gap-3 xl:grid-cols-12"
        style={{ animationDelay: "160ms" }}
      >
        <TableCard
          className="xl:col-span-7"
          purchases={dashboard.pendingPurchases}
          title="Compras Pendentes"
          href={href("/dashboard/compras-pendentes")}
          emptyTitle="Sem compras pendentes"
          emptyDescription="Aguardando importação de compras para exibir este indicador."
        />
        <AlertList
          className="xl:col-span-5"
          alerts={dashboard.alerts}
          title="Alertas Críticos"
          href={href("/dashboard/equipamentos-criticos")}
        />
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
