import type { LucideIcon } from "lucide-react";
import type { AlertStatus, AlertType, Criticality, Priority, PurchaseStatus } from "@prisma/client";

export type KPITrendDirection = "up" | "down" | "flat";
export type KPITone = "blue" | "gold" | "red";

export type DashboardKPI = {
  title: string;
  value: string;
  trend: string;
  direction: KPITrendDirection;
  tone: KPITone;
  icon: LucideIcon;
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
  collaboratorHours: ChartPoint[];
  monthlyPurchases: ChartPoint[];
  lubricantConsumption: ChartPoint[];
  topBreakdownMachines: RankingItem[];
  source: "database" | "mock";
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

export type DashboardKPIsData = {
  openServiceOrders: number;
  pendingPurchases: number;
  criticalMachines: number;
  lubricantConsumption: number;
  mostUsedMaterials: number;
  activeProcedures: number;
  criticalAlerts: number;
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

export type TopMachineBreakIndexData = {
  equipmentName: string;
  breakIndex: number;
};

export type HoursByCollaboratorData = {
  userName: string;
  hours: number;
};

export type PurchasesByMonthData = {
  month: number;
  value: number;
};

export type LubricantConsumptionPoint = {
  date: Date;
  consumption: number;
};

export type DatabaseDashboardData = {
  period: DashboardPeriod;
  kpis: DashboardKPIsData;
  openClosedServiceOrders: OpenClosedServiceOrdersPoint[];
  correctivePreventiveChart: CorrectivePreventiveChartData;
  topCriticalEquipments: TopCriticalEquipmentData[];
  pendingPurchases: PendingPurchaseData[];
  criticalAlerts: CriticalAlertData[];
  topMachinesBreakIndex: TopMachineBreakIndexData[];
  hoursByCollaborator: HoursByCollaboratorData[];
  purchasesByMonth: PurchasesByMonthData[];
  lubricantConsumptionByPeriod: LubricantConsumptionPoint[];
};
