import type { ServiceOrderStatusLabel } from "@/types/service-orders";

export type CriticalityLabel = "Monitorado" | "Atenção" | "Crítico";

/** Filtros acumulativos da análise (lidos da URL). */
export type CriticalEquipmentFilters = {
  startDate: string;
  endDate: string;
  statuses: ServiceOrderStatusLabel[];
  responsibleNames: string[];
  planningGroups: string[];
  areas: string[];
  onlyOpenOrders: boolean;
  onlyWithWorkedHours: boolean;
  limit: number;
};

export type CriticalEquipmentItem = {
  position: number;
  equipmentName: string;
  equipmentCode: string;
  totalOrders: number;
  openOrders: number;
  releasedOrders: number;
  inProgressOrders: number;
  waitingMaterialOrders: number;
  closedOrders: number;
  canceledOrders: number;
  /** Ordens em aberto (não fechadas e não canceladas) — usado no score e nos KPIs. */
  backlogOrders: number;
  totalWorkedHours: number;
  lastOrderDate: string | null;
  mainResponsible: string;
  mainPlanningGroup: string;
  criticalityScore: number;
  criticalityLabel: CriticalityLabel;
};

export type CriticalEquipmentSummary = {
  totalEquipmentsAnalyzed: number;
  totalOrdersInPeriod: number;
  equipmentWithMostOrders: string;
  highestOrderCount: number;
  totalWorkedHours: number;
  averageOrdersPerEquipment: number;
  totalOpenOrders: number;
  totalCriticalEquipments: number;
};

export type CriticalEquipmentTrendPoint = {
  /** Chave do período (YYYY-MM). */
  period: string;
  /** Rótulo amigável (MM/AAAA). */
  label: string;
  totalOrders: number;
};

export type CriticalEquipmentStatusSlice = {
  status: ServiceOrderStatusLabel;
  label: string;
  value: number;
  color: string;
};

export type CriticalEquipmentHoursPoint = {
  equipmentName: string;
  equipmentCode: string;
  totalWorkedHours: number;
};

export type CriticalEquipmentDetails = {
  item: CriticalEquipmentItem;
  lastOrders: Array<{
    osNumber: string;
    title: string;
    status: ServiceOrderStatusLabel;
    openedAt: string | null;
    workedHours: number | null;
    operation: string | null;
  }>;
  responsibleBreakdown: Array<{ name: string; count: number }>;
  planningGroupBreakdown: Array<{ name: string; count: number }>;
  statusDistribution: CriticalEquipmentStatusSlice[];
};

/** Opções para os multiselects de filtro. */
export type CriticalEquipmentFilterOptions = {
  statuses: ServiceOrderStatusLabel[];
  areas: string[];
  planningGroups: string[];
  responsibles: string[];
};

export type CriticalEquipmentsPageData = {
  period: { startDate: string; endDate: string };
  summary: CriticalEquipmentSummary;
  ranking: CriticalEquipmentItem[];
  hours: CriticalEquipmentHoursPoint[];
  statusDistribution: CriticalEquipmentStatusSlice[];
  trend: CriticalEquipmentTrendPoint[];
  filterOptions: CriticalEquipmentFilterOptions;
  source: "database" | "empty";
};

export type CriticalityScoreInput = {
  totalOrders: number;
  maxOrders: number;
  totalWorkedHours: number;
  maxWorkedHours: number;
  openOrders: number;
  maxOpenOrders: number;
};
