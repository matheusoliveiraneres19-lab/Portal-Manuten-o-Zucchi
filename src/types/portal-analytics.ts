import type {
  CorrectivePreventiveChartData,
  CriticalAlertData,
  DashboardKPIsData,
  HoursByCollaboratorData,
  LubricantConsumptionPoint,
  OpenClosedServiceOrdersPoint,
  PendingPurchaseData,
  PurchasesByMonthData,
  TopCriticalEquipmentData,
  TopMachineBreakIndexData
} from "@/types/dashboard";
import type { MostUsedMaterial } from "@/services/materials.service";

export type PortalAnalyticsPeriod = { startDate: string; endDate: string };

/**
 * Snapshot único e coerente do portal para um período. Todos os módulos derivam
 * seus números deste objeto (ou das funções que ele agrega), garantindo que
 * dashboard e páginas internas nunca divirjam.
 */
export type PortalAnalytics = {
  period: PortalAnalyticsPeriod;
  kpis: DashboardKPIsData;
  serviceOrders: {
    openClosed: OpenClosedServiceOrdersPoint[];
    correctivePreventive: CorrectivePreventiveChartData;
  };
  purchases: {
    pendingCount: number;
    pending: PendingPurchaseData[];
    byMonth: PurchasesByMonthData[];
  };
  lubricants: {
    consumption: number;
    consumptionByPeriod: LubricantConsumptionPoint[];
  };
  materials: {
    mostUsedCount: number;
    mostUsed: MostUsedMaterial[];
  };
  criticalEquipments: {
    topByOrders: TopCriticalEquipmentData[];
    topByBreakIndex: TopMachineBreakIndexData[];
  };
  alerts: {
    criticalCount: number;
    critical: CriticalAlertData[];
  };
  timeEntries: {
    hoursByCollaborator: HoursByCollaboratorData[];
  };
  /** Subconjunto pronto para gráficos (referencia os mesmos dados das seções acima). */
  charts: {
    openClosedOrders: OpenClosedServiceOrdersPoint[];
    correctivePreventive: CorrectivePreventiveChartData;
    purchasesByMonth: PurchasesByMonthData[];
    lubricantConsumption: LubricantConsumptionPoint[];
    hoursByCollaborator: HoursByCollaboratorData[];
    topBreakdownMachines: TopMachineBreakIndexData[];
  };
  /** Momento (ISO) em que o snapshot foi calculado. */
  updatedAt: string;
};
