"use client";

import { ClipboardList, Clock, FolderOpen, Gauge, Timer, User, Wrench } from "lucide-react";
import { ServiceOrderAreaAdherenceSection } from "@/components/service-orders/ServiceOrderAreaAdherence";
import { ServiceOrderEquipmentRanking } from "@/components/service-orders/ServiceOrderEquipmentRanking";
import { RankingList } from "@/components/RankingList";
import { KpiGrid, type KpiCardData } from "@/components/ui/KpiGrid";
import { UnavailableIndicator } from "@/components/ui/FieldNotice";
import type { ServiceOrderDashboard } from "@/types/service-orders";

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

export function ServiceOrderCharts({
  dashboard,
  filterQuery,
  periodLabel
}: {
  dashboard: ServiceOrderDashboard;
  /** Query string dos filtros aplicados — os detalhes (área, máquina) usam o mesmo recorte. */
  filterQuery: string;
  /** Período dos filtros, formatado para o cabeçalho do detalhe da máquina. */
  periodLabel: string;
}) {
  return (
    <section className="grid grid-cols-1 gap-3 xl:grid-cols-12">
      {/* Painel único da análise por área: absorveu "OS por status", "OS por grupo de
          planejamento" e "Corretivas x planejadas". A análise da área clicada abre em
          largura total logo abaixo. */}
      <ServiceOrderAreaAdherenceSection
        className="xl:col-span-12"
        adherence={dashboard.adherenceByArea}
        filterQuery={filterQuery}
      />

      {/* Absorveu "Top equipamentos por OS"; "OS abertas x fechadas (por mês)" e "Top
          responsáveis por OS" saíram — responsáveis agora vivem no detalhe de cada máquina. */}
      <ServiceOrderEquipmentRanking
        className="xl:col-span-12"
        items={dashboard.equipmentRanking}
        filterQuery={filterQuery}
        periodLabel={periodLabel}
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
