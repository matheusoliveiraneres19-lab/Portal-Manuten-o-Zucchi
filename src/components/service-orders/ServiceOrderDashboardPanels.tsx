"use client";

import { Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { ClipboardList, Clock, FolderOpen, Gauge, Timer, User, Wrench } from "lucide-react";
import { EmptyState } from "@/components/EmptyState";
import { RankingList } from "@/components/RankingList";
import { KpiGrid, type KpiCardData } from "@/components/ui/KpiGrid";
import { UnavailableIndicator } from "@/components/ui/FieldNotice";
import { CHART_SERIES, TOOLTIP } from "@/constants/theme";
import type { ServiceOrderDashboard, ServiceOrderSlice } from "@/types/service-orders";

/**
 * Cards e gráficos gerenciais da aba Ordens de Serviço (FASE 10).
 *
 * Tudo vem pronto de `getServiceOrderDashboard`, calculado sobre o MESMO recorte da
 * tabela — nenhum número é recalculado aqui. Indicador sem campo na base não vira
 * gráfico vazio: vira aviso de qualidade, com a coluna que falta e o que reimportar.
 */
export function ServiceOrderKpis({ dashboard }: { dashboard: ServiceOrderDashboard }) {
  const int = (value: number) => value.toLocaleString("pt-BR");

  const cards: KpiCardData[] = [
    {
      title: "Total de OS",
      value: int(dashboard.total),
      description: "No recorte filtrado",
      icon: ClipboardList,
      tone: "gold"
    },
    {
      title: "OS abertas",
      value: int(dashboard.abertas),
      description: "Aberta, liberada, em andamento e aguardando material",
      icon: FolderOpen,
      tone: "red"
    },
    {
      title: "OS fechadas",
      value: int(dashboard.fechadas),
      description: "Status Fechada no SAP",
      icon: Gauge,
      tone: "green"
    },
    {
      title: "Horas apontadas",
      value: `${dashboard.workedHours.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} h`,
      valueTitle: `${dashboard.workedHours.toLocaleString("pt-BR", { minimumFractionDigits: 2 })} h — soma de trabalho real no recorte`,
      description: "Soma do trabalho real",
      icon: Clock,
      tone: "blue"
    },
    {
      title: "Tempo médio de execução",
      value:
        dashboard.averageExecutionDays === null
          ? "—"
          : `${dashboard.averageExecutionDays.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} dias`,
      description:
        dashboard.averageExecutionDays === null
          ? "Sem OS fechadas com as duas datas"
          : `Sobre ${int(dashboard.executionSampleSize)} OS fechadas`,
      icon: Timer,
      tone: "blue"
    },
    {
      title: "Equipamento com mais OS",
      value: dashboard.topEquipment?.name ?? "—",
      valueTitle: dashboard.topEquipment
        ? `${dashboard.topEquipment.name} — ${int(dashboard.topEquipment.value)} OS`
        : undefined,
      description: dashboard.topEquipment ? `${int(dashboard.topEquipment.value)} ordens` : "Sem ordens no recorte",
      icon: Wrench,
      tone: "gold"
    },
    {
      title: "Responsável com mais OS",
      value: dashboard.topResponsible?.name ?? "—",
      valueTitle: dashboard.topResponsible
        ? `${dashboard.topResponsible.name} — ${int(dashboard.topResponsible.value)} OS`
        : undefined,
      description: dashboard.topResponsible ? `${int(dashboard.topResponsible.value)} ordens` : "Sem ordens no recorte",
      icon: User,
      tone: "blue"
    }
    // "OS em atraso" NÃO entra: o model não tem data de vencimento planejada, então
    // atraso não é calculável. O painel de Qualidade dos Dados declara o motivo —
    // um card "n/d" no meio de seis números reais sugeriria falha de carregamento.
  ];

  return <KpiGrid cards={cards} className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4" />;
}

export function ServiceOrderCharts({ dashboard }: { dashboard: ServiceOrderDashboard }) {
  return (
    <section className="grid grid-cols-1 gap-3 xl:grid-cols-12">
      <MonthlyCard className="xl:col-span-7" points={dashboard.openClosedByMonth} />

      <DonutCard
        className="xl:col-span-5"
        title="OS por status"
        slices={dashboard.byStatus}
        palette={[CHART_SERIES.corretiva, CHART_SERIES.preventiva, CHART_SERIES.compras, "#8C6B2F", "#5B7B7A", "#9B3B3B"]}
      />

      <DonutCard
        className="xl:col-span-5"
        title="Corretivas x planejadas"
        subtitle="Planejada = plano programado (PL/PV no título), mesma regra da home."
        slices={dashboard.correctiveVsPlanned}
        palette={[CHART_SERIES.corretiva, CHART_SERIES.preventiva]}
      />

      {dashboard.fieldAvailability.planningGroup ? (
        <RankingList
          className="xl:col-span-7"
          title="OS por grupo de planejamento"
          items={dashboard.byPlanningGroup}
          variant="bars"
          emptyTitle="Sem grupo de planejamento no recorte"
          emptyDescription="Ajuste o filtro ou reimporte as ordens com a coluna de grupo."
        />
      ) : (
        <UnavailableIndicator
          className="xl:col-span-7"
          title="OS por grupo de planejamento"
          message="Indicador indisponível: a base importada não possui o campo Grupo de Planejamento."
          detail="Reimporte a planilha de Ordens com essa coluna para habilitar o gráfico."
        />
      )}

      <RankingList
        className="xl:col-span-6"
        title="Top equipamentos por OS"
        items={dashboard.topEquipments}
        variant="bars"
        emptyTitle="Sem equipamentos no recorte"
        emptyDescription="Ajuste os filtros para visualizar o ranking."
      />

      <RankingList
        className="xl:col-span-6"
        title="Top responsáveis por OS"
        items={dashboard.topResponsibles}
        variant="bars"
        emptyTitle="Sem responsáveis no recorte"
        emptyDescription="Ajuste os filtros para visualizar o ranking."
      />

      {/* Tipo de atividade está 100% nulo nas 19.780 ordens importadas. Por decisão
          desta entrega, campo ausente vira aviso — nunca derivação automática, que
          produziria um número plausível e sem rastreabilidade. */}
      {dashboard.fieldAvailability.planningActivityType ? (
        <RankingList
          className="xl:col-span-12"
          title="OS por tipo de atividade"
          items={dashboard.byActivityType}
          variant="bars"
        />
      ) : (
        <UnavailableIndicator
          className="xl:col-span-12"
          title="OS por tipo de atividade"
          message="Indicador indisponível: a base importada não possui o campo Tipo de Atividade."
          detail="Reimporte a planilha de Ordens com essa coluna para habilitar o gráfico. Nenhum valor é derivado no lugar dela."
        />
      )}
    </section>
  );
}

/* ------------------------------------------------------------------ */

function MonthlyCard({ points, className = "" }: { points: ServiceOrderDashboard["openClosedByMonth"]; className?: string }) {
  const max = Math.max(...points.flatMap((p) => [p.abertas, p.fechadas]), 0) || 1;

  return (
    <article className={`panel flex h-full flex-col rounded-lg p-4 ${className}`}>
      <h3 className="text-[11px] font-extrabold uppercase tracking-wide text-gold-deep">OS abertas x fechadas (por mês)</h3>
      <p className="mb-3 text-[11px] text-zinc-500">
        Abertas pelo mês de abertura; fechadas pelo mês de fechamento.
      </p>

      {points.length === 0 ? (
        <EmptyState title="Sem ordens no período" description="Ajuste o filtro de período para visualizar a série." />
      ) : (
        <div className="flex-1 space-y-1.5 overflow-y-auto pr-1">
          {points.map((point) => (
            <div key={point.name} className="flex items-center gap-2 text-[11px]">
              <span className="w-14 shrink-0 tabular-nums text-zinc-500">{point.name}</span>
              <div className="flex flex-1 flex-col gap-0.5">
                <Bar value={point.abertas} max={max} color={CHART_SERIES.corretiva} label="abertas" />
                <Bar value={point.fechadas} max={max} color={CHART_SERIES.preventiva} label="fechadas" />
              </div>
              <span className="w-24 shrink-0 text-right tabular-nums text-zinc-600">
                {point.abertas.toLocaleString("pt-BR")} / {point.fechadas.toLocaleString("pt-BR")}
              </span>
            </div>
          ))}
        </div>
      )}
    </article>
  );
}

function Bar({ value, max, color, label }: { value: number; max: number; color: string; label: string }) {
  return (
    <div
      className="h-2 w-full overflow-hidden rounded-full bg-black/[0.06]"
      title={`${value.toLocaleString("pt-BR")} ${label}`}
    >
      <div
        className="h-full rounded-full transition-[width] duration-500 ease-premium"
        style={{ width: `${(value / max) * 100}%`, background: color }}
      />
    </div>
  );
}

function DonutCard({
  title,
  subtitle,
  slices,
  palette,
  className = ""
}: {
  title: string;
  subtitle?: string;
  slices: ServiceOrderSlice[];
  palette: string[];
  className?: string;
}) {
  const total = slices.reduce((sum, slice) => sum + slice.value, 0);

  return (
    <article className={`panel flex h-full flex-col rounded-lg p-4 ${className}`}>
      <h3 className="text-[11px] font-extrabold uppercase tracking-wide text-gold-deep">{title}</h3>
      {subtitle ? <p className="mb-2 text-[11px] text-zinc-500">{subtitle}</p> : null}

      {total === 0 ? (
        <EmptyState title="Sem ordens no recorte" description="Ajuste os filtros para visualizar a distribuição." />
      ) : (
        <div className="mt-2 h-[220px]">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie data={slices} dataKey="value" nameKey="name" innerRadius="58%" outerRadius="82%" paddingAngle={2}>
                {slices.map((slice, index) => (
                  <Cell key={slice.name} fill={palette[index % palette.length]} stroke="transparent" />
                ))}
              </Pie>
              <Tooltip
                contentStyle={{
                  background: TOOLTIP.background,
                  border: `1px solid ${TOOLTIP.border}`,
                  borderRadius: 8,
                  color: TOOLTIP.text,
                  fontSize: 12
                }}
                formatter={(value: number, name: string) => [
                  `${value.toLocaleString("pt-BR")} (${((value / total) * 100).toFixed(1)}%)`,
                  name
                ]}
              />
              <Legend verticalAlign="bottom" height={28} iconType="circle" wrapperStyle={{ fontSize: 11 }} />
            </PieChart>
          </ResponsiveContainer>
        </div>
      )}
    </article>
  );
}
