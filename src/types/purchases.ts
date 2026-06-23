import type { ItemNature, PurchaseOperationalStatus, PurchaseType } from "@prisma/client";
import type { PurchaseKind } from "@/utils/purchase-classification";

export type { ItemNature, PurchaseOperationalStatus, PurchaseType, PurchaseKind };

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
  pendingQuantity?: unknown;
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
  pendingQuantity: number | null;
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
  /** Status canônico (regras do HTML) derivado por classifyPurchaseRecord. */
  operationalStatus: PurchaseOperationalStatus;
  isService: boolean;
  isBlocked: boolean;
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

/** Período detectado na planilha (confirma se todos os meses foram lidos). */
export type PurchaseImportPeriod = {
  start: string | null; // yyyy-mm-dd (menor data de referência)
  end: string | null; // yyyy-mm-dd (maior data de referência)
  months: string[]; // yyyy-mm distintos, ordenados
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
  /** Contagens canônicas por status operacional (REGRA 16). */
  totalBlocked: number;
  totalReceived: number;
  totalReceivedLate: number;
  totalPendingPurchase: number;
  totalNotDelivered: number;
  /** Fornecedores distintos detectados na planilha. */
  suppliersDetected: number;
  errors: PurchaseImportError[];
  /** Período detectado na planilha (menor/maior data + meses encontrados). */
  periodDetected?: PurchaseImportPeriod;
  /** Avisos de qualidade da importação (ex.: registros sem data do pedido). */
  warnings?: string[];
  /** Colunas obrigatórias não reconhecidas (vazio quando tudo certo). */
  missingColumns?: string[];
};

/* ------------------------------------------------------------------ */
/* Consulta / filtros                                                 */
/* ------------------------------------------------------------------ */

/** Campo de data sobre o qual o filtro de período atua (REGRA 14). */
export type PurchaseDateField =
  | "requisitionDate"
  | "purchaseOrderDate"
  | "expectedDeliveryDate"
  | "receiptDate";

/**
 * Filtro de "Tipo" da compra (REGRA 14): material físico, serviço,
 * regularização (Y04) ou item bloqueado.
 */
export type PurchaseKindFilter = "material" | "servico" | "regularizacao" | "bloqueado";

/**
 * Parâmetros de consulta/filtro. Multi-seleção em arrays: dentro de um mesmo
 * grupo as opções são combinadas por OR; entre grupos diferentes, por AND.
 */
export type PurchaseQueryParams = {
  /** Busca textual: materialCode / itemDescription / requisição / pedido. */
  search?: string;
  suppliers?: string[];
  categories?: string[];
  purchasingGroups?: string[];
  /** Filtro de Tipo (material/serviço/regularização/bloqueado). */
  kinds?: PurchaseKindFilter[];
  /** Filtro por status operacional canônico (enum). */
  statuses?: PurchaseOperationalStatus[];
  requesters?: string[];
  /** Período sobre o campo escolhido (default: data de referência). */
  dateField?: PurchaseDateField;
  startDate?: string;
  endDate?: string;
  page?: number;
  pageSize?: number;
};

/* ------------------------------------------------------------------ */
/* Indicadores                                                        */
/* ------------------------------------------------------------------ */

/**
 * Resumo canônico de compras (regras do HTML). Serve as duas páginas:
 * cada card escolhe os campos relevantes. Bloqueados NUNCA entram nos
 * totais Y01; aparecem só em `blocked`.
 */
export type PurchaseKpis = {
  /** Total de registros do recorte (sem bloqueados). */
  totalRecords: number;
  /** Base de análise Y01 (não serviço, não Y04, não bloqueado). */
  baseY01: number;
  /** Recebidos (RECEBIDO + RECEBIDO_COM_ATRASO) na base Y01. */
  received: number;
  /** Recebidos no prazo (RECEBIDO). */
  receivedOnTime: number;
  /** Recebidos com atraso (RECEBIDO_COM_ATRASO). */
  receivedLate: number;
  /** Pendente de compra (sem pedido e sem recebimento). */
  pendingPurchase: number;
  /** Em atraso (previsão vencida, sem recebimento). */
  lateOpen: number;
  /** Não entregue / dentro do prazo. */
  notDelivered: number;
  /** Total pendente Y01 = pendingPurchase + lateOpen + notDelivered. */
  totalPending: number;
  /** Regularizações Y04 (separadas dos KPIs Y01). */
  regularizationsY04: number;
  /** Regularizações Y04 recebidas. */
  regularizationsY04Received: number;
  /** Serviços (separados dos KPIs Y01). */
  services: number;
  /** Serviços recebidos. */
  servicesReceived: number;
  /** Itens bloqueados/ignorados (auditoria). */
  blocked: number;
  /** Valores (R$). */
  totalValue: number;
  pendingValue: number;
  receivedValue: number;
};

export type PurchaseRow = {
  id: string;
  purchaseOrderNumber: string | null;
  requisitionNumber: string | null;
  supplierName: string | null;
  materialCode: string | null;
  itemDescription: string;
  quantity: number | null;
  pendingQuantity: number | null;
  unit: string | null;
  value: number | null;
  requisitionDate: string | null;
  purchaseOrderDate: string | null;
  expectedDeliveryDate: string | null;
  receiptDate: string | null;
  /** Status operacional canônico + rótulo legível (badge). */
  operationalStatus: PurchaseOperationalStatus;
  statusLabel: string;
  isService: boolean;
  isBlocked: boolean;
  isRegularization: boolean;
  purchaseKind: PurchaseKind;
  /** Dias em atraso (em aberto) ou de atraso no recebimento. */
  delayDays: number | null;
  hasPurchaseOrder: boolean;
  purchasingGroup: string | null;
  purchaseType: PurchaseType;
  goodsGroupCode: string | null;
  goodsGroupDescription: string | null;
  itemNature: ItemNature;
  requester: string | null;
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
  count: number;
};

export type PurchaseSupplierSlice = {
  supplierName: string;
  totalValue: number;
  count: number;
};

/** Fatia de distribuição por status operacional (gráfico "Status das pendências"). */
export type PurchaseStatusSlice = {
  status: PurchaseOperationalStatus;
  label: string;
  count: number;
  color: string;
};

/** Contagem por grupo de mercadoria (pendências / Y04 por grupo). */
export type PurchaseGroupCount = {
  code: string;
  description: string;
  count: number;
};

/** Contagem por requisitante (requisitantes com mais pendências). */
export type PurchaseRequesterCount = {
  requester: string;
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
  purchasingGroups: Array<{ value: string; label: string }>;
  requesters: string[];
  /** Status operacionais presentes no recorte (para o filtro de Status). */
  statuses: PurchaseOperationalStatus[];
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
  /** Gráficos da REGRA 11. */
  lateByMonth: PurchaseMonthlyPoint[];
  topLateSuppliers: PurchaseSupplierSlice[];
  pendingByGoodsGroup: PurchaseGroupCount[];
  statusDistribution: PurchaseStatusSlice[];
  topRequesters: PurchaseRequesterCount[];
  purchases: PaginatedPurchases;
  filterOptions: PurchaseFilterOptions;
  source: "database" | "empty";
};

export type CompletedPurchasesPageData = {
  period: PurchasesPeriodWindow;
  kpis: PurchaseKpis;
  /** Gráficos da REGRA 12. */
  receivedByMonth: PurchaseMonthlyPoint[];
  receivedLateByMonth: PurchaseMonthlyPoint[];
  topDelayedReceiptSuppliers: PurchaseSupplierSlice[];
  receivedByGoodsGroup: PurchaseGroupCount[];
  regularizationByGoodsGroup: PurchaseGroupCount[];
  processTimes: PurchaseProcessTimes;
  purchases: PaginatedPurchases;
  filterOptions: PurchaseFilterOptions;
  source: "database" | "empty";
};
