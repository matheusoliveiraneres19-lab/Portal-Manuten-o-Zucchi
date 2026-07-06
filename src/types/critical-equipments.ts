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
  /** Chave estável de agrupamento (código, ou derivada do nome quando ausente). */
  id: string;
  position: number;
  equipmentName: string;
  /** Código técnico / local de instalação resolvido (ex.: ZC-SR-G07-MF-0006). */
  equipmentCode: string;
  /** Prefixo/família da máquina derivado do código (ex.: ZC-SR-G07-MF). */
  machinePrefix: string;
  /** true quando a máquina não tem local de instalação estruturado (agrupada por nome). */
  dataQualityIssue: boolean;
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
  /** Nº de ordens sem local de instalação estruturado (agrupadas só por nome). */
  ordersWithoutTechnicalCode: number;
  /** Nº de OS preventivas programadas (PL/PV) ignoradas nesta análise. */
  ignoredPreventiveOrders: number;
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
  id: string;
  equipmentName: string;
  equipmentCode: string;
  totalWorkedHours: number;
};

/** Ordem de manutenção com todos os campos exibíveis no detalhe. */
export type CriticalEquipmentServiceOrder = {
  id: string;
  osNumber: string;
  title: string;
  description: string | null;
  status: ServiceOrderStatusLabel;
  openedAt: string | null;
  closedAt: string | null;
  workedHours: number | null;
  responsibleName: string | null;
  planningGroup: string | null;
  operation: string | null;
  equipmentName: string | null;
  equipmentCode: string | null;
  technicalObjectRaw: string | null;
  failureCause: string | null;
  solution: string | null;
  source: string | null;
  importBatch: string | null;
};

export type CriticalEquipmentResponsibleStat = {
  name: string;
  count: number;
  hours: number;
};

export type CriticalEquipmentDetails = {
  item: CriticalEquipmentItem;
  statusDistribution: CriticalEquipmentStatusSlice[];
  frequentResponsibles: CriticalEquipmentResponsibleStat[];
  planningGroupBreakdown: Array<{ name: string; count: number }>;
  /** Todas as ordens vinculadas ao equipamento no período. */
  serviceOrders: CriticalEquipmentServiceOrder[];
};

export type EquipmentHoursResponsible = {
  name: string;
  totalHours: number;
  totalOrders: number;
  participationPercent: number;
};

export type EquipmentHoursByResponsible = {
  equipmentName: string;
  equipmentCode: string;
  totalWorkedHours: number;
  responsibles: EquipmentHoursResponsible[];
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
