import type { PcFactoryStatusCategory } from "@prisma/client";

export type { PcFactoryStatusCategory };

/* ------------------------------------------------------------------ */
/* Parâmetros de consulta/análise                                     */
/* ------------------------------------------------------------------ */

export type PcFactoryQueryParams = {
  /** Janela livre (yyyy-mm-dd) aplicada a startDateTime dos registros. */
  startDate?: string;
  endDate?: string;
  /** Filtros acumulativos (multi-seleção). */
  resources?: string[];
  productionLines?: string[];
  /** Grupo gerencial do portal (ex.: Indústria Granito, Indústria Mármore). */
  groupPortals?: string[];
  sectors?: string[];
  shifts?: string[];
  /** Valores exatos de "Nome Status Recurso". */
  statusNames?: string[];
  /** Classificações gerenciais. */
  categories?: PcFactoryStatusCategory[];
  /** Toggles de manutenção (booleanos). */
  onlyMaintenance?: boolean;
  onlyMechanical?: boolean;
  onlyElectrical?: boolean;
  onlyAutomation?: boolean;
  onlyWaiting?: boolean;
  /** Exclui Fora de Turno / Recurso Não Programado dos resultados. */
  excludeOutOfPlanned?: boolean;
  search?: string;
  page?: number;
  pageSize?: number;
};

/* ------------------------------------------------------------------ */
/* KPIs e indicadores                                                 */
/* ------------------------------------------------------------------ */

export type PcFactoryTopResource = {
  resourceName: string;
  resourceCode: string | null;
  hours: number;
} | null;

export type PcFactoryKpis = {
  totalRecords: number;
  totalResources: number;
  totalGroups: number;
  totalProductionLines: number;
  totalHours: number;
  /** Tempo planejado = total − (Fora de Turno + Recurso Não Programado). */
  plannedHours: number;
  productionHours: number;
  /** Horas dos 3 status de manutenção (Mecânica + Elétrica + Aguardando). */
  maintenanceHours: number;
  mechanicalMaintenanceHours: number;
  electricalMaintenanceHours: number;
  automationMaintenanceHours: number;
  waitingMaintenanceHours: number;
  setupHours: number;
  /** Perdas operacionais (não-manutenção): Falta de Material, Parada não Identificada e Setup (decisão da empresa). */
  lossHours: number;
  /** Tempo neutro planejado (Refeição + Outros). */
  operationalHours: number;
  /** Fora do tempo planejado (Fora de Turno + Recurso Não Programado). */
  excludedHours: number;
  /** Tempo de paradas para disponibilidade = manutenção + perdas operacionais. */
  stoppedHours: number;
  maintenanceEvents: number;
  mechanicalEvents: number;
  electricalEvents: number;
  automationEvents: number;
  waitingEvents: number;
  /** MTTR gerencial (horas) = horas de manutenção / eventos. null = dados insuficientes. */
  mttr: number | null;
  /** % manutenção sobre o tempo planejado. null = dados insuficientes. */
  maintenancePercentOfPlanned: number | null;
  /** Disponibilidade estimada (%). null = dados insuficientes. */
  availabilityPercent: number | null;
  topMaintenanceResource: PcFactoryTopResource;
};

export type PcFactoryCategorySlice = {
  category: PcFactoryStatusCategory;
  label: string;
  color: string;
  totalHours: number;
  percent: number;
};

export type PcFactoryMaintenanceSplit = {
  key: "MECANICA" | "ELETRICA" | "AUTOMACAO" | "AGUARDANDO";
  label: string;
  hours: number;
  events: number;
  color: string;
};

export type PcFactoryResourceRow = {
  resourceName: string;
  resourceCode: string | null;
  productionLine: string | null;
  groupPortal: string | null;
  plannedHours: number;
  productionHours: number;
  maintenanceHours: number;
  mechanicalHours: number;
  electricalHours: number;
  automationHours: number;
  waitingHours: number;
  lossHours: number;
  stoppedHours: number;
  maintenanceEvents: number;
  mttr: number | null;
  availabilityPercent: number | null;
};

/** Agregação de manutenção por Grupo Portal (ex.: Indústria Granito). */
export type PcFactoryGroupRow = {
  groupPortal: string;
  resourcesCount: number;
  plannedHours: number;
  maintenanceHours: number;
  mechanicalHours: number;
  electricalHours: number;
  automationHours: number;
  waitingHours: number;
  lossHours: number;
  stoppedHours: number;
  maintenanceEvents: number;
  mttr: number | null;
  availabilityPercent: number | null;
};

export type PcFactoryProductionLineRow = {
  productionLine: string;
  resourcesCount: number;
  plannedHours: number;
  productionHours: number;
  maintenanceHours: number;
  lossHours: number;
  stoppedHours: number;
  availabilityPercent: number | null;
};

export type PcFactoryTrendPoint = {
  period: string;
  label: string;
  maintenanceHours: number;
  mechanicalHours: number;
  electricalHours: number;
  automationHours: number;
  waitingHours: number;
  plannedHours: number;
  availabilityPercent: number | null;
};

export type PcFactoryRecordRow = {
  id: string;
  resourceName: string;
  resourceCode: string | null;
  productionLine: string | null;
  groupPortal: string | null;
  sector: string | null;
  statusRaw: string | null;
  statusCategory: PcFactoryStatusCategory;
  classificationLabel: string;
  maintenanceType: string | null;
  isMaintenance: boolean;
  isMaintenanceKpi: boolean;
  isInPlannedTime: boolean;
  startDateTime: string | null;
  endDateTime: string | null;
  durationHours: number;
  shift: string | null;
  orderNumber: string | null;
  productDescription: string | null;
  observation: string | null;
};

export type PcFactoryRecordsResult = {
  data: PcFactoryRecordRow[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
};

export type PcFactoryFilterOptions = {
  resources: Array<{ value: string; label: string }>;
  productionLines: Array<{ value: string; label: string }>;
  groupPortals: Array<{ value: string; label: string }>;
  sectors: Array<{ value: string; label: string }>;
  shifts: Array<{ value: string; label: string }>;
  /** Valores exatos de "Nome Status Recurso" presentes nos dados. */
  statusNames: Array<{ value: string; label: string }>;
  categories: Array<{ value: PcFactoryStatusCategory; label: string }>;
};

export type PcFactoryReferencePeriod = {
  startDate: string;
  endDate: string;
  label: string;
};

export type PcFactoryRecommendation = {
  tone: "danger" | "warning" | "info";
  message: string;
};

export type PcFactoryResourceDetails = {
  resourceName: string;
  resourceCode: string | null;
  productionLine: string | null;
  sector: string | null;
  groupPortal: string | null;
  plannedHours: number;
  maintenanceHours: number;
  mechanicalHours: number;
  electricalHours: number;
  automationHours: number;
  waitingHours: number;
  stoppedHours: number;
  maintenanceEvents: number;
  mttr: number | null;
  availabilityPercent: number | null;
  categoryDistribution: PcFactoryCategorySlice[];
  maintenanceTimeline: PcFactoryRecordRow[];
  recentRecords: PcFactoryRecordRow[];
  recommendations: PcFactoryRecommendation[];
};

/* ------------------------------------------------------------------ */
/* Orquestrador da página                                             */
/* ------------------------------------------------------------------ */

export type PcFactoryPageData = {
  reference: PcFactoryReferencePeriod;
  kpis: PcFactoryKpis;
  categoryDistribution: PcFactoryCategorySlice[];
  maintenanceSplit: PcFactoryMaintenanceSplit[];
  criticalResources: PcFactoryResourceRow[];
  topMechanical: PcFactoryResourceRow[];
  topElectrical: PcFactoryResourceRow[];
  topAutomation: PcFactoryResourceRow[];
  topWaiting: PcFactoryResourceRow[];
  productionLines: PcFactoryProductionLineRow[];
  groupSummary: PcFactoryGroupRow[];
  trend: PcFactoryTrendPoint[];
  records: PcFactoryRecordsResult;
  filterOptions: PcFactoryFilterOptions;
  /** Diagnóstico de qualidade da importação refletido nos dados atuais. */
  dataQuality: PcFactoryDataQuality;
  source: "database" | "empty";
};

/** Painel "Qualidade da importação" (TAREFA 8). */
export type PcFactoryDataQuality = {
  totalRecords: number;
  periodStart: string | null;
  periodEnd: string | null;
  groupsDetected: string[];
  resourcesDetected: number;
  statusDetected: string[];
  recordsWithIssue: number;
};

/** Resumo enxuto para futura integração com o dashboard principal (TAREFA 12). */
export type PcFactoryDashboardSummary = {
  hasData: boolean;
  maintenanceHours: number;
  availabilityPercent: number | null;
  mttr: number | null;
  topMaintenanceResources: Array<{ resourceName: string; hours: number }>;
  waitingMaintenanceResources: Array<{ resourceName: string; hours: number }>;
};

/* ------------------------------------------------------------------ */
/* Importação                                                         */
/* ------------------------------------------------------------------ */

export type PcFactoryImportError = {
  linha: number;
  campo?: string;
  valor?: unknown;
  mensagem: string;
};

export type PcFactoryImportResult = {
  totalRows: number;
  importedRows: number;
  createdRows: number;
  updatedRows: number;
  ignoredRows: number;
  errorRows: number;
  /** Contagens por classificação (auditoria da regra de manutenção). */
  maintenanceRows: number;
  mechanicalMaintenanceRows: number;
  electricalMaintenanceRows: number;
  automationMaintenanceRows: number;
  waitingMaintenanceRows: number;
  excludedFromPlannedTimeRows: number;
  productionRows: number;
  setupRows: number;
  operationalLossRows: number;
  otherRows: number;
  dataQualityRows: number;
  /** Aba efetivamente lida (Import_PC_FACTORY, ag-grid, etc.). */
  sheetUsed: string | null;
  periodDetected: { start: string | null; end: string | null };
  resourcesDetected: number;
  groupsDetected: string[];
  statusDetected: string[];
  errors: PcFactoryImportError[];
};

/**
 * Linha bruta da planilha PC-Factory após mapeamento flexível de colunas.
 * Cobre tanto a aba ajustada `Import_PC_FACTORY` (camelCase) quanto a aba bruta `ag-grid`.
 */
export type PcFactoryExcelRow = {
  resourceCode?: unknown;
  resourceName?: unknown;
  productionLine?: unknown;
  groupPortal?: unknown;
  sector?: unknown;
  status?: unknown;
  statusDetails?: unknown;
  /** Início/Término — podem vir como data+hora num único campo ou separados. */
  startDate?: unknown;
  endDate?: unknown;
  startTime?: unknown;
  endTime?: unknown;
  /** Duração genérica (minutos / hh:mm / "1,5h"). */
  duration?: unknown;
  /** Duração explícita em minutos (coluna durationMinutes). */
  durationMinutes?: unknown;
  /** Duração explícita em horas reais (coluna durationHours). */
  durationHours?: unknown;
  /** "Tempo Decorrido [hr]" da aba bruta — fração de dia (multiplicar por 24). */
  elapsedDayFraction?: unknown;
  orderNumber?: unknown;
  operationCode?: unknown;
  operationName?: unknown;
  productCode?: unknown;
  productDescription?: unknown;
  operatorName?: unknown;
  initialResponsible?: unknown;
  finalResponsible?: unknown;
  shift?: unknown;
  observation?: unknown;
  rootCause?: unknown;
};
