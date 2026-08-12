import type { LucideIcon } from "lucide-react";
import type { AlertStatus, AlertType, Criticality, Priority, PurchaseStatus } from "@prisma/client";
import type { PcFactoryMachinesBelowAverageResult } from "@/services/pc-factory.service";

export type KPITrendDirection = "up" | "down" | "stable";

/**
 * Tom visual do card de KPI. `green`/`amber` existem para indicadores de estado
 * positivo e de atenção — sem eles, um KPI "tudo em ordem" e um KPI crítico
 * ficavam visualmente iguais.
 */
export type KPITone = "blue" | "gold" | "red" | "green" | "amber";

/**
 * Comparativo com o período anterior.
 * - "available": variação calculada com dados reais.
 * - "unavailable": sem histórico suficiente para comparar (não exibir percentual).
 */
export type KPIComparison =
  | { status: "available"; direction: KPITrendDirection; percentage: number; label: string }
  | { status: "unavailable"; label: string };

export type DashboardKPI = {
  title: string;
  value: string;
  tone: KPITone;
  icon: LucideIcon;
  comparison: KPIComparison;
  /** true quando o valor atual é zero / não há registros no período. */
  isEmpty: boolean;
  /** Texto auxiliar exibido quando isEmpty (ex.: "Sem registros no período"). */
  emptyHint?: string;
  /** Rota de destino ao clicar no card (opcional). */
  href?: string;
  /** Texto auxiliar mostrado ao passar o mouse no card (tooltip nativo). */
  tooltip?: string;
};

export type ChartPoint = Record<string, string | number>;

export type RankingItem = {
  name: string;
  value: number;
};

export type PendingPurchase = {
  item: string;
  supplier: string;
  date: string;
  value: string;
};

export type AlertItem = {
  text: string;
  time: string;
  icon: LucideIcon;
};

export type DashboardData = {
  kpis: DashboardKPI[];
  openClosedOrders: ChartPoint[];
  correctivePreventive: ChartPoint[];
  criticalEquipment: RankingItem[];
  pendingPurchases: PendingPurchase[];
  alerts: AlertItem[];
  /** Aviso técnico do gráfico OS abertas x fechadas (ex.: closedAt não importado). */
  openClosedNote: string | null;
  source: "database" | "empty";
  /** Intervalo analisado (ISO) para exibição discreta no dashboard. */
  period: { startDate: string; endDate: string } | null;
};

export type DashboardPeriod = {
  startDate: Date;
  endDate: Date;
};

export type DashboardPeriodInput =
  | string
  | {
      startDate?: Date | string;
      endDate?: Date | string;
      year?: number;
      month?: number;
    };

/**
 * KPIs efetivamente RENDERIZADOS na aba Início.
 *
 * A home exibe 4 cards: OS Abertas, Compras Pendentes, Máquinas Críticas e
 * Procedimentos Ativos. "Máquinas Críticas" não entra aqui porque vem do
 * resultado detalhado do PC-Factory (`DatabaseDashboardData.pcFactoryCritical`),
 * que já traz média e ranking para o subtítulo/tooltip do card.
 *
 * Este é o ÚNICO conjunto de KPIs do portal: cada card consulta o que exibe.
 * Não existe um agregador "de todos os indicadores" — havia um
 * (`portal-analytics.service`), mas ficou sem consumidor e foi removido.
 */
export type HomeKpisData = {
  openServiceOrders: number;
  pendingPurchases: number;
  activeProcedures: number;
};

export type OpenClosedServiceOrdersPoint = {
  date: Date;
  abertas: number;
  fechadas: number;
};

export type CorrectivePreventiveChartData = {
  corrective: number;
  preventive: number;
  total: number;
  correctivePercent: number;
  preventivePercent: number;
};

export type TopCriticalEquipmentData = {
  equipmentName: string;
  totalOrders: number;
  criticality: Criticality;
};

export type PendingPurchaseData = {
  item: string;
  supplier: string | null;
  expectedDate: Date | null;
  totalValue: number | null;
  status: PurchaseStatus;
};

export type CriticalAlertData = {
  title: string;
  description: string;
  equipmentName: string | null;
  severity: Priority;
  status: AlertStatus;
  type: AlertType;
  createdAt: Date;
};

export type HoursByCollaboratorData = {
  userName: string;
  hours: number;
  /** Quantidade de Ordens de Serviço atribuídas ao colaborador no período. */
  orders: number;
  /**
   * Matrícula do responsável (SAP `responsibleId`), quando a fonte das horas são
   * as Ordens de Serviço. Chave preferencial de casamento com o colaborador
   * (mais confiável que o nome). `null` quando a fonte é TimeEntry.
   */
  responsibleId?: string | null;
};

export type PurchasesByMonthData = {
  month: number;
  value: number;
};

export type DatabaseDashboardData = {
  period: DashboardPeriod;
  /** Apenas os KPIs exibidos na home — ver HomeKpisData. */
  kpis: HomeKpisData;
  openClosedServiceOrders: OpenClosedServiceOrdersPoint[];
  openClosedNote: string | null;
  correctivePreventiveChart: CorrectivePreventiveChartData;
  topCriticalEquipments: TopCriticalEquipmentData[];
  pendingPurchases: PendingPurchaseData[];
  criticalAlerts: CriticalAlertData[];
  /** Máquinas abaixo da média de disponibilidade do PC-Factory (card Máquinas Críticas). */
  pcFactoryCritical: PcFactoryMachinesBelowAverageResult;
};
