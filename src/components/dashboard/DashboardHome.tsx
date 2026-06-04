import { AlertList } from "@/components/AlertList";
import { ChartCard } from "@/components/ChartCard";
import { HeroBanner } from "@/components/HeroBanner";
import { KPICard } from "@/components/KPICard";
import { RankingList } from "@/components/RankingList";
import { TableCard } from "@/components/TableCard";
import type { DashboardData } from "@/types/dashboard";

type DashboardHomeProps = {
  dashboard: DashboardData;
};

export function DashboardHome({ dashboard }: DashboardHomeProps) {
  return (
    <>
      <HeroBanner />

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
          title="OS abertas x fechadas"
        />
        <ChartCard
          className="xl:col-span-3"
          data={dashboard.correctivePreventive}
          kind="donut"
          title="Manutenção corretiva x preventiva"
        />
        <RankingList
          className="xl:col-span-5"
          items={dashboard.criticalEquipment}
          title="Top Equipamentos Críticos"
          variant="badges"
        />
        <ChartCard
          className="xl:col-span-4"
          data={dashboard.collaboratorHours}
          kind="bar-horizontal"
          title="Horas apontadas por colaborador"
        />
        <ChartCard
          className="xl:col-span-4"
          data={dashboard.monthlyPurchases}
          kind="bar"
          title="Compras por mês (R$)"
        />
        <ChartCard
          className="xl:col-span-4"
          data={dashboard.lubricantConsumption}
          kind="area"
          title="Consumo de Lubrificantes (L)"
        />
        <TableCard className="xl:col-span-6" purchases={dashboard.pendingPurchases} title="Compras Pendentes" />
        <div className="grid gap-3 xl:col-span-6">
          <AlertList alerts={dashboard.alerts} title="Alertas Críticos" />
          <RankingList
            items={dashboard.topBreakdownMachines}
            title="Top Máquinas - Maior Índice de Quebra"
            variant="bars"
          />
        </div>
      </section>
    </>
  );
}
