import type { ItemNature, PurchaseType } from "@prisma/client";

export type { ItemNature, PurchaseType };

/* ------------------------------------------------------------------ */
/* Importação                                                         */
/* ------------------------------------------------------------------ */

/** Linha bruta da planilha SAP/Fiori (aba "Data") após mapeamento de colunas. */
export type PurchaseExcelRow = {
  purchaseOrderNumber?: unknown;
  requisitionDate?: unknown;
  requisitionNumber?: unknown;
  requisitionLevel?: unknown;
  supplierCode?: unknown;
  supplierName?: unknown;
  materialCode?: unknown;
  itemDescription?: unknown;
  quantity?: unknown;
  receiptCompletedFlag?: unknown;
  deletionCode?: unknown;
  unit?: unknown;
  purchaseOrderDate?: unknown;
  expectedDeliveryDate?: unknown;
  grossPrice?: unknown;
  netPrice?: unknown;
  grossTotal?: unknown;
  netTotal?: unknown;
  receiptNumber?: unknown;
  receiptDate?: unknown;
  migoNumber?: unknown;
  migoDate?: unknown;
  goodsGroupCode?: unknown;
  goodsGroupDescription?: unknown;
  requester?: unknown;
  miroNumber?: unknown;
  miroDate?: unknown;
  purchasingGroup?: unknown;
};

/** Registro normalizado, pronto para gravação em PurchaseRecord. */
export type ParsedPurchaseRecord = {
  purchaseOrderNumber: string | null;
  requisitionNumber: string | null;
  requisitionLevel: string | null;
  supplierCode: string | null;
  supplierName: string | null;
  materialCode: string | null;
  itemDescription: string;
  quantity: number | null;
  unit: string | null;
  requisitionDate: Date | null;
  purchaseOrderDate: Date | null;
  expectedDeliveryDate: Date | null;
  receiptDate: Date | null;
  migoDate: Date | null;
  miroDate: Date | null;
  receiptNumber: string | null;
  migoNumber: string | null;
  miroNumber: string | null;
  grossPrice: number | null;
  netPrice: number | null;
  grossTotal: number | null;
  netTotal: number | null;
  goodsGroupCode: string | null;
  goodsGroupDescription: string | null;
  requester: string | null;
  purchasingGroup: string | null;
  deletionCode: string | null;
  purchaseType: PurchaseType;
  itemNature: ItemNature;
  hasPurchaseOrder: boolean;
  hasMigo: boolean;
  hasMiro: boolean;
  isReceiptCompleted: boolean;
  isLateOpen: boolean;
  isLateReceived: boolean;
  delayDays: number | null;
  requisitionToOrderDays: number | null;
  orderToReceiptDays: number | null;
  migoToMiroDays: number | null;
  totalProcessDays: number | null;
  ignored: boolean;
  ignoredReason: string | null;
  technicalKey: string;
};

export type PurchaseImportError = {
  linha: number;
  campo?: string;
  valor?: unknown;
  mensagem: string;
};

/** Resumo retornado pela importação (TAREFA 3). */
export type PurchaseImportResult = {
  totalRows: number;
  importedRows: number;
  ignoredRows: number;
  createdRows: number;
  updatedRows: number;
  errorRows: number;
  totalWithoutPurchaseOrder: number;
  totalWithPurchaseOrder: number;
  totalMigo: number;
  totalMiro: number;
  totalLateOpen: number;
  totalLateReceived: number;
  totalRegularizations: number;
  totalNormalPurchases: number;
  totalServices: number;
  totalMaterials: number;
  totalValue: number;
  errors: PurchaseImportError[];
};

/* ------------------------------------------------------------------ */
/* Consulta / filtros                                                 */
/* ------------------------------------------------------------------ */

/** Filtro de status na página de pendentes. */
export type PendingPurchaseStatusFilter =
  | "sem-pedido"
  | "pendente-migo"
  | "pendente-miro"
  | "atrasado"
  | "recebido-atraso";

export type PurchaseQueryParams = {
  startDate?: string;
  endDate?: string;
  requisition?: string;
  purchaseOrder?: string;
  supplier?: string;
  material?: string;
  category?: string;
  purchaseType?: PurchaseType;
  nature?: ItemNature;
  pendingStatus?: PendingPurchaseStatusFilter;
  requester?: string;
  search?: string;
  page?: number;
  pageSize?: number;
};

/* ------------------------------------------------------------------ */
/* Indicadores                                                        */
/* ------------------------------------------------------------------ */

export type PurchaseKpis = {
  totalRecords: number;
  requisitionsWithoutPurchaseOrder: number;
  requisitionsWithPurchaseOrder: number;
  completedWithMigo: number;
  completedWithMiro: number;
  lateOrders: number;
  lateOpenOrders: number;
  lateReceivedOrders: number;
  regularizationsY04: number;
  normalPurchasesY01: number;
  totalValue: number;
  totalServices: number;
  totalMaterials: number;
  pendingValue: number;
  pendingServices: number;
  averageRequisitionToOrderDays: number | null;
  averageOrderToReceiptDays: number | null;
  averageMigoToMiroDays: number | null;
  averageTotalProcessDays: number | null;
};

export type PurchaseRow = {
  id: string;
  purchaseOrderNumber: string | null;
  requisitionNumber: string | null;
  supplierName: string | null;
  materialCode: string | null;
  itemDescription: string;
  quantity: number | null;
  unit: string | null;
  value: number | null;
  requisitionDate: string | null;
  purchaseOrderDate: string | null;
  expectedDeliveryDate: string | null;
  receiptDate: string | null;
  migoNumber: string | null;
  miroNumber: string | null;
  hasMigo: boolean;
  hasMiro: boolean;
  hasPurchaseOrder: boolean;
  isReceiptCompleted: boolean;
  isLateOpen: boolean;
  isLateReceived: boolean;
  delayDays: number | null;
  purchasingGroup: string | null;
  purchaseType: PurchaseType;
  goodsGroupCode: string | null;
  goodsGroupDescription: string | null;
  itemNature: ItemNature;
  requester: string | null;
  statusLabel: string;
};

export type PaginatedPurchases = {
  data: PurchaseRow[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
};

export type PurchaseValueByOrder = {
  purchaseOrderNumber: string;
  supplierName: string | null;
  totalValue: number;
  itemCount: number;
  status: string;
};

export type PurchaseCategoryRow = {
  code: string;
  description: string;
  quantity: number;
  totalValue: number;
  regularizationCount: number;
  regularizationValue: number;
  normalPurchaseCount: number;
  normalPurchaseValue: number;
  servicesCount: number;
  materialsCount: number;
};

export type RegularizationVsNormal = {
  regularizationCount: number;
  regularizationValue: number;
  normalCount: number;
  normalValue: number;
  otherCount: number;
  otherValue: number;
  regularizationPercent: number;
  normalPercent: number;
};

export type ServicesAnalysis = {
  totalServices: number;
  serviceValue: number;
  pendingServices: number;
  completedServices: number;
  servicesWithMiro: number;
  servicesWithoutMiro: number;
  topServiceSuppliers: Array<{ supplierName: string; totalValue: number; count: number }>;
};

export type LatePurchaseRow = {
  id: string;
  purchaseOrderNumber: string | null;
  supplierName: string | null;
  itemDescription: string;
  expectedDeliveryDate: string | null;
  receiptDate: string | null;
  migoDate: string | null;
  delayDays: number | null;
  value: number | null;
  kind: "aberto" | "recebido-atraso";
};

export type LatePurchasesResult = {
  lateOpen: LatePurchaseRow[];
  lateReceived: LatePurchaseRow[];
};

export type PurchaseProcessTimes = {
  averageRequisitionToOrderDays: number | null;
  averageOrderToReceiptDays: number | null;
  averageMigoToMiroDays: number | null;
  averageTotalProcessDays: number | null;
  slowestRequisitionToOrder: PurchaseProcessRankItem[];
  slowestTotalProcess: PurchaseProcessRankItem[];
};

export type PurchaseProcessRankItem = {
  id: string;
  reference: string;
  supplierName: string | null;
  itemDescription: string;
  days: number;
};

export type PurchaseMonthlyPoint = {
  period: string; // yyyy-mm
  label: string;
  value: number;
};

export type PurchaseSupplierSlice = {
  supplierName: string;
  totalValue: number;
  count: number;
};

export type PurchaseNatureSlice = {
  nature: ItemNature;
  label: string;
  value: number;
  count: number;
  color: string;
};

export type PurchaseFilterOptions = {
  suppliers: Array<{ value: string; label: string }>;
  categories: Array<{ value: string; label: string }>;
  requesters: string[];
  purchaseTypes: PurchaseType[];
  natures: ItemNature[];
  years: number[];
};

/* ------------------------------------------------------------------ */
/* Orquestradores de página                                           */
/* ------------------------------------------------------------------ */

export type PurchasesPeriodWindow = {
  startDate: string;
  endDate: string;
};

export type PendingPurchasesPageData = {
  period: PurchasesPeriodWindow;
  kpis: PurchaseKpis;
  late: LatePurchasesResult;
  purchases: PaginatedPurchases;
  filterOptions: PurchaseFilterOptions;
  source: "database" | "empty";
};

export type CompletedPurchasesPageData = {
  period: PurchasesPeriodWindow;
  kpis: PurchaseKpis;
  monthly: PurchaseMonthlyPoint[];
  byCategory: PurchaseCategoryRow[];
  regularizationVsNormal: RegularizationVsNormal;
  natureDistribution: PurchaseNatureSlice[];
  topSuppliers: PurchaseSupplierSlice[];
  processTimes: PurchaseProcessTimes;
  purchases: PaginatedPurchases;
  filterOptions: PurchaseFilterOptions;
  source: "database" | "empty";
};
