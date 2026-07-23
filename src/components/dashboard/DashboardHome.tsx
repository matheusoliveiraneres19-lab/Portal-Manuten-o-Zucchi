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
  const purchasesYear = dashboard.period ? new Date(dashboard.period.endDate).getUTCFullYear() : null;

  return (
    <>
      <HeroBanner />

      {dashboard.period ? (
        <div className="mt-3 flex items-center justify-end gap-1.5 text-[11px] text-zinc-400">
          <CalendarRange className="h-3.5 w-3.5 text-gold" />
          <span>
            Período analisado:{" "}
            <strong className="font-semibold text-champagne">
              {formatPeriodRange(dashboard.period.startDate, dashboard.period.endDate)}
            </strong>
          </span>
        </div>
      ) : null}

      <section className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
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
          emptyTitle="Sem ordens no período"
          emptyDescription="Importe ordens ou ajuste o filtro para visualizar este indicador."
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
        <ChartCard
          className="xl:col-span-4"
          data={dashboard.collaboratorHours}
          kind="bar-horizontal"
          title="Horas apontadas por colaborador"
          href={href("/dashboard/equipe-horas")}
          emptyTitle="Nenhuma hora apontada no período."
          emptyDescription="Aguardando importação de apontamentos de horas."
        />
        <ChartCard
          className="xl:col-span-4"
          data={dashboard.monthlyPurchases}
          kind="bar"
          title={purchasesYear ? `Compras por mês · ${purchasesYear} (R$ mil, Data do Pedido)` : "Compras por mês (R$ mil)"}
          href={href("/dashboard/compras-realizadas")}
          emptyTitle="Sem compras no período"
          emptyDescription="Aguardando importação de compras."
        />
        <ChartCard
          className="xl:col-span-4"
          data={dashboard.lubricantConsumption}
          kind="area"
          title="Consumo de Lubrificantes (L)"
          href={href("/dashboard/lubrificantes")}
          emptyTitle="Sem consumo registrado no período"
          emptyDescription="Aguardando importação de movimentações de lubrificantes."
        />
        <TableCard
          className="xl:col-span-6"
          purchases={dashboard.pendingPurchases}
          title="Compras Pendentes"
          href={href("/dashboard/compras-pendentes")}
          emptyTitle="Sem compras pendentes"
          emptyDescription="Aguardando importação de compras para exibir este indicador."
        />
        <div className="grid gap-3 xl:col-span-6">
          <AlertList alerts={dashboard.alerts} title="Alertas Críticos" href={href("/dashboard/equipamentos-criticos")} />
          <RankingList
            items={dashboard.topBreakdownMachines}
            title="Top Máquinas por Volume de OS Corretiva"
            variant="bars"
            unit="count"
            href={href("/dashboard/equipamentos-criticos")}
            emptyTitle="Sem OS corretiva no período"
            emptyDescription="Importe ordens corretivas para visualizar este indicador."
          />
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
