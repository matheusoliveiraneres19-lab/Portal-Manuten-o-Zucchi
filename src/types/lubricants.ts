import type { LubricantMovementCategory } from "@prisma/client";

export type { LubricantMovementCategory };

/** Parâmetros de consulta/análise (lidos da URL ou de API routes). */
export type LubricantQueryParams = {
  /** Janela livre (yyyy-mm-dd) usada por histórico e gráficos. */
  startDate?: string;
  endDate?: string;
  /** Ano e mês de referência para os KPIs e agregações "mês/ano". */
  year?: number;
  month?: number; // 1-12
  code?: string;
  search?: string;
  movementCategory?: LubricantMovementCategory;
  unit?: string;
  page?: number;
  pageSize?: number;
};

/** Período de referência resolvido (default = movimentação mais recente). */
export type LubricantReferencePeriod = {
  year: number;
  month: number; // 1-12
  startDate: string;
  endDate: string;
  monthLabel: string;
};

export type LubricantMostUsed = {
  code: string;
  description: string;
  quantity: number;
  unit: string;
};

export type LubricantKpis = {
  totalLubricants: number;
  totalOutputMonth: number;
  totalOutputYear: number;
  totalInputMonth: number;
  totalInputYear: number;
  currentBalance: number;
  mostUsedLubricant: LubricantMostUsed | null;
  movementsCount: number;
  itemsWithoutMachineApplication: number;
  itemsWithoutTechnicalSheet: number;
  itemsBelowMinimum: number;
};

/** Item com saldo estimado abaixo do estoque mínimo (necessita reposição). */
export type LubricantReplenishmentItem = {
  code: string;
  description: string;
  unit: string;
  balance: number;
  minimumStock: number;
  deficit: number;
};

/** Agregação genérica por material (saídas OU entradas). */
export type LubricantMaterialAggregate = {
  code: string;
  description: string;
  unit: string;
  quantity: number;
  movementsCount: number;
};

export type LubricantBalanceRow = {
  code: string;
  description: string;
  unit: string;
  totalInputs: number;
  totalOutputs: number;
  initialStock: number;
  balance: number;
};

export type LubricantUsageIndicators = {
  topConsumedItems: LubricantMaterialAggregate[];
  lowMovementItems: LubricantMaterialAggregate[];
  noOutputItems: Array<{ code: string; description: string; unit: string }>;
  highOutputItems: LubricantMaterialAggregate[];
  inputVsOutputRatio: number | null;
  averageMonthlyConsumption: number;
};

export type LubricantCodeRow = {
  id: string;
  code: string;
  description: string;
  unit: string;
  currentStock: number;
  minimumStock: number;
  totalInputs: number;
  totalOutputs: number;
  monthlyInputs: number;
  monthlyOutputs: number;
  annualInputs: number;
  annualOutputs: number;
  balance: number;
  belowMinimum: boolean;
  machinesUsed: string[];
  technicalSheetUrl: string | null;
  hasTechnicalSheet: boolean;
  hasMachineApplication: boolean;
};

export type LubricantMovementRow = {
  id: string;
  movementDate: string;
  movementTime: string | null;
  code: string;
  description: string;
  movementCategory: LubricantMovementCategory;
  movementTypeCode: string | null;
  movementTypeText: string | null;
  quantity: number;
  absoluteQuantity: number;
  unit: string;
  center: string | null;
  storageLocation: string | null;
};

export type LubricantMovementsResult = {
  data: LubricantMovementRow[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
};

export type LubricantMachineApplicationView = {
  id: string;
  equipmentName: string;
  equipmentCode: string | null;
  applicationPoint: string | null;
  recommendation: string | null;
};

export type LubricantDetails = {
  id: string;
  code: string;
  description: string;
  unit: string;
  category: string | null;
  currentStock: number;
  minimumStock: number;
  totalInputs: number;
  totalOutputs: number;
  initialStock: number;
  balance: number;
  belowMinimum: boolean;
  averageMonthlyConsumption: number;
  lastMovementDate: string | null;
  technicalSheetUrl: string | null;
  hasTechnicalSheet: boolean;
  machineApplications: LubricantMachineApplicationView[];
  recentMovements: LubricantMovementRow[];
};

export type LubricantMovementTypeSlice = {
  category: LubricantMovementCategory;
  label: string;
  value: number;
  color: string;
};

export type LubricantMonthlyFlowPoint = {
  period: string; // yyyy-mm
  label: string;
  inputs: number;
  outputs: number;
};

export type LubricantFilterOptions = {
  codes: Array<{ value: string; label: string }>;
  units: string[];
  years: number[];
  movementCategories: LubricantMovementCategory[];
};

export type LubricantsPageData = {
  reference: LubricantReferencePeriod;
  period: { startDate: string; endDate: string };
  kpis: LubricantKpis;
  monthlyOutputs: LubricantMaterialAggregate[];
  annualOutputs: LubricantMaterialAggregate[];
  monthlyFlow: LubricantMonthlyFlowPoint[];
  movementTypeDistribution: LubricantMovementTypeSlice[];
  balanceByCode: LubricantBalanceRow[];
  indicators: LubricantUsageIndicators;
  replenishment: LubricantReplenishmentItem[];
  codes: LubricantCodeRow[];
  movements: LubricantMovementsResult;
  filterOptions: LubricantFilterOptions;
  source: "database" | "empty";
};

/* ------------------------------------------------------------------ */
/* Importação                                                         */
/* ------------------------------------------------------------------ */

export type LubricantImportError = {
  linha: number;
  campo?: string;
  valor?: unknown;
  mensagem: string;
};

export type LubricantImportResult = {
  totalRows: number;
  importedRows: number;
  createdLubricants: number;
  createdMovements: number;
  ignoredRows: number;
  errorRows: number;
  errors: LubricantImportError[];
};

/** Linha bruta da planilha SAP/Fiori após mapeamento de colunas. */
export type LubricantExcelRow = {
  material?: unknown;
  materialDescription?: unknown;
  center?: unknown;
  companyName?: unknown;
  storageLocation?: unknown;
  movementTypeCode?: unknown;
  movementTypeText?: unknown;
  registerTime?: unknown;
  postingDate?: unknown;
  quantity?: unknown;
  unit?: unknown;
};
