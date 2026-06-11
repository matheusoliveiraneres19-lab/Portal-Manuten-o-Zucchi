import type { PcFactoryStatus } from "@prisma/client";

export type { PcFactoryStatus };

/* ------------------------------------------------------------------ */
/* Parâmetros de consulta/análise                                     */
/* ------------------------------------------------------------------ */

/** Parâmetros de consulta/análise (lidos da URL ou de API routes). */
export type PcFactoryQueryParams = {
  /** Janela livre (yyyy-mm-dd) aplicada a startDateTime dos registros. */
  startDate?: string;
  endDate?: string;
  /** Filtros acumulativos (multi-seleção). */
  resources?: string[];
  productionLines?: string[];
  statuses?: PcFactoryStatus[];
  sectors?: string[];
  shifts?: string[];
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
  totalProductionLines: number;
  totalAnalyzedHours: number;
  productionHours: number;
  stoppedHours: number;
  maintenanceHours: number;
  setupHours: number;
  waitingHours: number;
  availabilityPercent: number | null;
  utilizationPercent: number | null;
  maintenanceImpactPercent: number | null;
  /** Tempo médio entre falhas/paradas (horas). null = dados insuficientes. */
  mtbf: number | null;
  /** Tempo médio de recuperação/manutenção (horas). null = dados insuficientes. */
  mttr: number | null;
  /** Tempo médio até falha (horas). null = dados insuficientes. */
  mttf: number | null;
  topStoppedResource: PcFactoryTopResource;
  topMaintenanceResource: PcFactoryTopResource;
  topFailureResource: PcFactoryTopResource;
};

export type PcFactoryStatusSlice = {
  status: PcFactoryStatus;
  label: string;
  color: string;
  totalHours: number;
  percent: number;
};

export type PcFactoryResourceRow = {
  resourceName: string;
  resourceCode: string | null;
  productionLine: string | null;
  productionHours: number;
  stoppedHours: number;
  maintenanceHours: number;
  totalHours: number;
  availabilityPercent: number | null;
  utilizationPercent: number | null;
  mtbf: number | null;
  mttr: number | null;
  failureCount: number;
};

export type PcFactoryProductionLineRow = {
  productionLine: string;
  resourcesCount: number;
  productionHours: number;
  stoppedHours: number;
  maintenanceHours: number;
  totalHours: number;
  availabilityPercent: number | null;
  utilizationPercent: number | null;
  /** Status (≠ produção) com maior impacto de horas na linha. */
  mainImpactStatus: { status: PcFactoryStatus; label: string; hours: number } | null;
};

export type PcFactoryTrendPoint = {
  period: string; // yyyy-mm
  label: string;
  availabilityPercent: number | null;
  utilizationPercent: number | null;
  productionHours: number;
  stoppedHours: number;
  maintenanceHours: number;
};

export type PcFactoryRecordRow = {
  id: string;
  resourceName: string;
  resourceCode: string | null;
  productionLine: string | null;
  sector: string | null;
  status: PcFactoryStatus;
  statusRaw: string | null;
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
  sectors: Array<{ value: string; label: string }>;
  shifts: Array<{ value: string; label: string }>;
  statuses: Array<{ value: PcFactoryStatus; label: string }>;
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
  totalHours: number;
  productionHours: number;
  stoppedHours: number;
  maintenanceHours: number;
  availabilityPercent: number | null;
  utilizationPercent: number | null;
  mtbf: number | null;
  mttr: number | null;
  mttf: number | null;
  statusDistribution: PcFactoryStatusSlice[];
  recentRecords: PcFactoryRecordRow[];
  maintenanceEvents: PcFactoryRecordRow[];
  recommendations: PcFactoryRecommendation[];
};

/* ------------------------------------------------------------------ */
/* Orquestrador da página                                             */
/* ------------------------------------------------------------------ */

export type PcFactoryPageData = {
  reference: PcFactoryReferencePeriod;
  kpis: PcFactoryKpis;
  statusDistribution: PcFactoryStatusSlice[];
  topStopped: PcFactoryResourceRow[];
  topMaintenance: PcFactoryResourceRow[];
  resourceRanking: PcFactoryResourceRow[];
  productionLines: PcFactoryProductionLineRow[];
  trend: PcFactoryTrendPoint[];
  records: PcFactoryRecordsResult;
  filterOptions: PcFactoryFilterOptions;
  source: "database" | "empty";
};

/** Resumo enxuto para futura integração com o dashboard principal (TAREFA 12). */
export type PcFactoryDashboardSummary = {
  hasData: boolean;
  availabilityPercent: number | null;
  utilizationPercent: number | null;
  maintenanceImpactPercent: number | null;
  topStoppedResources: Array<{ resourceName: string; hours: number }>;
  topMaintenanceResources: Array<{ resourceName: string; hours: number }>;
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
  createdRecords: number;
  ignoredRows: number;
  errorRows: number;
  errors: PcFactoryImportError[];
};

/** Linha bruta da planilha PC-Factory após mapeamento flexível de colunas. */
export type PcFactoryExcelRow = {
  resourceCode?: unknown;
  resourceName?: unknown;
  productionLine?: unknown;
  sector?: unknown;
  status?: unknown;
  startDateTime?: unknown;
  endDateTime?: unknown;
  duration?: unknown;
  orderNumber?: unknown;
  productCode?: unknown;
  productDescription?: unknown;
  operatorName?: unknown;
  shift?: unknown;
  observation?: unknown;
};
