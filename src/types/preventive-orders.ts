// Tipos da aba "Preventivas Programadas" (fase 02).
// Classifica as Ordens de Serviço PL (Lubrificação) e PV (Preventiva Elétrica)
// importadas do SAP/Fiori e deriva indicadores de execução, aderência e pendências.

export type PreventiveType = "PL" | "PV";

export type PreventiveArea = "Lubrificação" | "Elétrica";

export type PreventiveExecutionStatus = "Realizada" | "Não Realizada";

export type PreventiveManagementStatus =
  | "Aberta sem execução"
  | "Em andamento"
  | "Realizada"
  | "Fechada sem execução"
  | "Atrasada"
  | "A vencer"
  | "Cancelada";

/** Filtros aplicados (vindos da URL/searchParams). */
export type PreventiveFilters = {
  startDate?: string;
  endDate?: string;
  /** undefined = Todos */
  type?: PreventiveType;
  /** undefined = Todas */
  area?: PreventiveArea;
  /** Status SAP (enum ServiceOrderStatus) — multi-seleção. */
  statusSap?: string[];
  /** Status gerencial derivado — multi-seleção. */
  managementStatus?: PreventiveManagementStatus[];
  responsibles?: string[];
  /** Local de instalação (busca textual). */
  technicalObject?: string;
  /** Equipamento (busca textual). */
  equipment?: string;
  search?: string;
  onlyNotDone?: boolean;
  onlyClosedNoExec?: boolean;
  onlyLate?: boolean;
};

export type PreventiveOrderRow = {
  id: string;
  osNumber: string;
  title: string;
  type: PreventiveType;
  typeLabel: string;
  area: PreventiveArea;
  technicalObject: string | null;
  equipmentName: string | null;
  equipmentCode: string | null;
  responsibleName: string | null;
  statusSapLabel: string;
  statusSapRaw: string | null;
  managementStatus: PreventiveManagementStatus;
  executionStatus: PreventiveExecutionStatus;
  workedHours: number;
  openedAt: string | null;
  closedAt: string | null;
  /** Dias em aberto (apenas para OS não concluídas); null quando não aplicável. */
  daysOpen: number | null;
  /** Operação (rótulo da operação SAP). */
  operation: string | null;
  /** Observação técnica (causa/solução), quando houver. */
  note: string | null;
};

export type PreventiveSummary = {
  total: number;
  totalPL: number;
  totalPV: number;
  realizadas: number;
  naoRealizadas: number;
  fechadasSemExecucao: number;
  horasApontadas: number;
  /** Aderência = realizadas / total * 100; null quando total = 0. */
  aderencia: number | null;
};

export type PreventiveTypeBreakdown = {
  type: PreventiveType;
  label: string;
  total: number;
  realizadas: number;
  naoRealizadas: number;
  horas: number;
};

export type PreventiveAreaBreakdown = {
  area: PreventiveArea;
  total: number;
  realizadas: number;
  naoRealizadas: number;
  horas: number;
  aderencia: number | null;
};

export type PreventiveStatusSlice = {
  status: PreventiveManagementStatus;
  count: number;
  color: string;
};

export type PreventiveMachineRow = {
  name: string;
  naoRealizadas: number;
  total: number;
  pl: number;
  pv: number;
  horas: number;
  lastOrderNumber: string | null;
  lastOrderAt: string | null;
  responsible: string | null;
};

export type PreventiveMonthlyPoint = {
  /** yyyy-MM */
  month: string;
  /** Rótulo curto (ex.: "abr/26") */
  label: string;
  total: number;
  realizadas: number;
  naoRealizadas: number;
  horas: number;
  aderencia: number | null;
  plTotal: number;
  plRealizadas: number;
  plAderencia: number | null;
  pvTotal: number;
  pvRealizadas: number;
  pvAderencia: number | null;
};

export type PreventiveBacklog = {
  total: number;
  pl: number;
  pv: number;
  /** Máquinas com maior backlog (top 5). */
  topMachines: Array<{ name: string; count: number }>;
};

export type PreventiveResponsibleRow = {
  name: string;
  total: number;
  realizadas: number;
  naoRealizadas: number;
  fechadasSemExecucao: number;
  horas: number;
  aderencia: number | null;
};

export type PreventiveCriticalAlerts = {
  closedNoExecCount: number;
  /** null quando não há data de vencimento na base (não deriva atraso). */
  overdueCount: number | null;
  /** Equipamentos com 3+ OS não realizadas no período. */
  recurrentMachines: Array<{ name: string; count: number }>;
  /** Áreas com aderência abaixo da meta (80%). */
  belowTargetAreas: Array<{ area: PreventiveArea; aderencia: number }>;
  withoutResponsibleCount: number;
};

/** Metas gerenciais fixas (fase 03). */
export const PREVENTIVE_TARGETS = {
  adherence: 85,
  closedWithoutExecution: 0,
  overdue: 0
} as const;

export type TargetLevel = "ok" | "warn" | "crit";

export type PreventiveAlerts = {
  closedNoExecCount: number;
  /** null quando não há data de vencimento na base (não deriva atraso). */
  overdueCount: number | null;
  recurrentMachine: { name: string; count: number } | null;
  /** Áreas com aderência abaixo de 80% (quando há dados). */
  lowAdherenceAreas: Array<{ area: PreventiveArea; aderencia: number }>;
};

export type PreventiveFilterOptions = {
  statuses: Array<{ value: string; label: string }>;
  managementStatuses: PreventiveManagementStatus[];
  responsibles: string[];
};

export type PreventivePageData = {
  summary: PreventiveSummary;
  byType: PreventiveTypeBreakdown[];
  byArea: PreventiveAreaBreakdown[];
  byStatus: PreventiveStatusSlice[];
  byMachine: PreventiveMachineRow[];
  monthlyTrend: PreventiveMonthlyPoint[];
  alerts: PreventiveAlerts;
  backlog: PreventiveBacklog;
  byResponsible: PreventiveResponsibleRow[];
  criticalAlerts: PreventiveCriticalAlerts;
  rows: PreventiveOrderRow[];
  totalRows: number;
  /** true quando a tabela foi truncada (totalRows > rows.length). */
  rowsCapped: boolean;
  filterOptions: PreventiveFilterOptions;
  /** Havia alguma OS PL/PV no período antes dos filtros secundários? (empty state global) */
  hasAnyPreventiveInPeriod: boolean;
  /** Meta de aderência (%) vinda das configurações (fallback 85). */
  adherenceTarget: number;
  source: "database" | "empty";
};
