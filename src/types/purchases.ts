import type { ItemNature, PurchaseOperationalStatus, PurchaseType } from "@prisma/client";
import type {
  PurchaseKind,
  PurchaseNature,
  PurchaseReportGroup,
  PurchaseV31Audit,
  PurchaseV31Group
} from "@/utils/purchase-classification";
import type { PageDataSource } from "@/types/page-data";

export type {
  ItemNature,
  PurchaseOperationalStatus,
  PurchaseType,
  PurchaseKind,
  PurchaseNature,
  PurchaseReportGroup,
  PurchaseV31Audit,
  PurchaseV31Group
};

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
  /** Classificação hierárquica da planilha (N1 > N2 > N3 > N4). */
  classificationN1?: unknown;
  classificationN2?: unknown;
  classificationN3?: unknown;
  classificationN4?: unknown;
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
  /** Classificação hierárquica N1 > N2 > N3 > N4 (planilha de compras). */
  classificationN1: string | null;
  classificationN2: string | null;
  classificationN3: string | null;
  classificationN4: string | null;
  requester: string | null;
  purchasingGroup: string | null;
  deletionCode: string | null;
  purchaseType: PurchaseType;
  itemNature: ItemNature;
  /** Status canônico (regras do HTML) derivado por classifyPurchaseRecord. */
  operationalStatus: PurchaseOperationalStatus;
  isService: boolean;
  isBlocked: boolean;
  isFreight: boolean;
  isEliminatedSupplier: boolean;
  isDeletionExcluded: boolean;
  hasPurchaseOrder: boolean;
  hasMigo: boolean;
  hasMiro: boolean;
  isReceiptCompleted: boolean;
  isReceiptConfirmed: boolean;
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
  /** Fora do relatório: bloqueado + frete + fornecedor eliminado + CódElim "L". */
  totalExcluded: number;
  /** Comprados (base Y01 material com pedido de compra). */
  totalPurchased: number;
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
  /** Auditoria da classificação N1..N4 lida da planilha (TAREFA 11). */
  classificationAudit?: PurchaseClassificationAudit;
  /**
   * Auditoria da REGRA OFICIAL v3.1 (TAREFA 16) — os mesmos oito totais que o
   * painel `acompanhamento_compras_v3.1.html` imprime, para conferência direta.
   */
  v31Audit?: PurchaseV31Audit;
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
 * Filtro de "Tipo" da compra: material Y01, serviço (Y0008),
 * regularização (Y04) ou ignorado.
 */
export type PurchaseKindFilter = "material" | "servico" | "regularizacao" | "ignorado";

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
  /** Classificação N1..N4 (valores originais da planilha; OR dentro de cada nível). */
  classificationsN1?: string[];
  classificationsN2?: string[];
  classificationsN3?: string[];
  classificationsN4?: string[];
  /**
   * "Retrato atual": considerar SÓ as linhas presentes na última planilha
   * importada. A aba Compras Pendentes aplica esse recorte SEMPRE (regra da
   * aba); Compras Realizadas o expõe como alternância, com o histórico completo
   * de todas as importações como padrão.
   */
  latestImportOnly?: boolean;
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
  /** Total de registros do recorte (Y01 + serviços + Y04 + ignorados). */
  totalRecords: number;
  /** Base de análise Y01 material (não ignorado, não serviço, não Y04). */
  baseY01: number;
  /** Comprados = base Y01 com pedido de compra (COMPRADO + ATRASADO + ENTREGUE). */
  purchased: number;
  purchasedValue: number;
  /** Comprados ainda não entregues (com pedido, sem recebimento concluído). */
  purchasedNotDelivered: number;
  /** Pendente de compra (Y01 sem pedido de compra). */
  pendingPurchase: number;
  pendingValue: number;
  /** Comprado em trânsito (com pedido, sem receb., dentro do prazo). */
  inTransit: number;
  /** Atrasados (previsão vencida, sem recebimento concluído). */
  late: number;
  lateValue: number;
  /** Entregues (recebimento lançado + Recbconcl "X"). */
  delivered: number;
  deliveredValue: number;
  /** Entregues com atraso (recebimento após a previsão). */
  deliveredLate: number;
  /** Regularizações Y04 (separadas dos KPIs Y01). */
  regularizations: number;
  regularizationsDelivered: number;
  /** Serviços Y0008 (separados dos KPIs Y01). */
  services: number;
  servicesDelivered: number;
  /** Ignorados (CódElim L, bloqueado, frete, fornecedor eliminado). */
  ignored: number;
  /** Valor total do relatório (R$, sem ignorados). */
  totalValue: number;
};

export type PurchaseRow = {
  id: string;
  purchaseOrderNumber: string | null;
  requisitionNumber: string | null;
  /** Fornecedor (código SAP) — coluna "Fornecedor" da planilha. */
  supplierCode: string | null;
  /** Fornecedor (razão social) — coluna "Descrição Fornecedor". */
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
  /** Natureza: Y01/Y04/Y0008/Ignorado (coluna "Tipo"). */
  purchaseNature: PurchaseNature;
  /** Grupo de relatório (qual página lista o registro). */
  reportGroup: PurchaseReportGroup;
  /** Frase de auditoria (por que entrou/saiu do KPI). */
  classificationReason: string;
  isService: boolean;
  isBlocked: boolean;
  isRegularization: boolean;
  isIgnored: boolean;
  ignoreReason: string | null;
  purchaseKind: PurchaseKind;
  /** Dias em atraso (em aberto) ou de atraso no recebimento. */
  delayDays: number | null;
  hasPurchaseOrder: boolean;
  /** Recbconcl = "X". */
  isReceiptConfirmed: boolean;
  /** CódElim. */
  deletionCode: string | null;
  purchasingGroup: string | null;
  purchaseType: PurchaseType;
  goodsGroupCode: string | null;
  goodsGroupDescription: string | null;
  /** Classificação hierárquica N1 > N2 > N3 > N4 (exibida na tabela). */
  classificationN1: string | null;
  classificationN2: string | null;
  classificationN3: string | null;
  classificationN4: string | null;
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

/* ------------------------------------------------------------------ */
/* Classificação N1 > N2 > N3 > N4                                    */
/* ------------------------------------------------------------------ */

/** Uma fatia de um nível de classificação (barra do gráfico). */
export type PurchaseClassificationSlice = {
  /** Chave estável (sem acento/caixa) usada para agrupar e filtrar. */
  key: string;
  /** Rótulo exibido, com a grafia original da planilha. */
  label: string;
  count: number;
};

/** Nó da visão hierárquica N1 > N2 > N3 > N4. */
export type PurchaseClassificationNode = {
  key: string;
  label: string;
  count: number;
  children: PurchaseClassificationNode[];
};

/**
 * Opções dos filtros N1/N2/N3/N4, em CASCATA: `n2` já vem restrito ao `n1`
 * selecionado, `n3` ao `n1`+`n2`, e assim por diante. Fica no page data de cada
 * aba (não no `PurchaseFilterOptions` compartilhado) porque as opções derivam do
 * conjunto que AQUELA aba lista — as pendências em uma, as realizadas na outra.
 */
export type PurchaseClassificationOptions = {
  n1: Array<{ value: string; label: string }>;
  n2: Array<{ value: string; label: string }>;
  n3: Array<{ value: string; label: string }>;
  n4: Array<{ value: string; label: string }>;
};

/**
 * Bloco de análise por classificação. Serve as duas abas de Compras: o conteúdo
 * é sempre calculado sobre o MESMO conjunto que a aba lista na tabela —
 * pendências em Compras Pendentes, comprados/entregues em Compras Realizadas.
 */
export type PurchaseClassificationInsights = {
  /** false = a base importada não tem NENHUM N1..N4 (mostra aviso, não gráfico zerado). */
  available: boolean;
  /** Contagem por N1 no recorte da aba (maior → menor). */
  byN1: PurchaseClassificationSlice[];
  /** Contagem por N2 — já respeita o filtro de N1 aplicado. */
  byN2: PurchaseClassificationSlice[];
  /** Árvore N1 > N2 > N3 > N4 com a contagem em cada nível. */
  tree: PurchaseClassificationNode[];
  /** N1/N2 mais recorrentes no conjunto filtrado (cards de apoio). */
  topN1: PurchaseClassificationSlice | null;
  topN2: PurchaseClassificationSlice | null;
  /** Registros do recorte sem nenhum nível preenchido. */
  unclassified: number;
  /** Cobertura por nível dentro do recorte filtrado. */
  coverage: { n1: number; n2: number; n3: number; n4: number };
};

/** Auditoria da classificação na importação (TAREFA 11). */
export type PurchaseClassificationAudit = {
  /** Níveis cujo cabeçalho foi reconhecido na planilha (ex.: ["N1","N2"]). */
  columnsDetected: string[];
  withN1: number;
  withN2: number;
  withN3: number;
  withN4: number;
  /** Linhas sem nenhum dos quatro níveis. */
  withoutAny: number;
  /** Requisições pendentes de compra que vieram com N1. */
  pendingWithN1: number;
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
  /** KPIs gerenciais da base inteira (não são os cards desta aba). */
  kpis: PurchaseKpis;
  /**
   * Auditoria da REGRA OFICIAL v3.1 sobre a base filtrada (TAREFA 16): os oito
   * totais do painel HTML, para conferir a aba contra o arquivo original.
   */
  v31Audit: PurchaseV31Audit;
  /** Gráficos da aba — todos restritos a requisições pendentes (sem pedido). */
  pendingByMonth: PurchaseMonthlyPoint[];
  topPendingSuppliers: PurchaseSupplierSlice[];
  pendingByGoodsGroup: PurchaseGroupCount[];
  topRequesters: PurchaseRequesterCount[];
  /** Valor pendente somado sobre TODO o conjunto filtrado (não só a página). */
  pendingValue: number;
  /** Materiais únicos entre as requisições pendentes filtradas. */
  materialsPending: number;
  /** Requisitantes únicos entre as requisições pendentes filtradas. */
  requestersPending: number;
  /** Data (ISO) da requisição pendente mais antiga do conjunto filtrado. */
  oldestPendingDate: string | null;
  /** Análise por classificação N1 > N2 > N3 > N4 das pendências filtradas. */
  classification: PurchaseClassificationInsights;
  /** Opções em cascata dos filtros N1/N2/N3/N4. */
  classificationOptions: PurchaseClassificationOptions;
  purchases: PaginatedPurchases;
  filterOptions: PurchaseFilterOptions;
  source: PageDataSource;
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
  /**
   * Análise por classificação N1 > N2 > N3 > N4 das compras realizadas
   * filtradas — calculada sobre o MESMO conjunto da tabela (COMPRADO +
   * ENTREGUE), como em Compras Pendentes.
   */
  classification: PurchaseClassificationInsights;
  /** Opções em cascata dos filtros N1/N2/N3/N4. */
  classificationOptions: PurchaseClassificationOptions;
  purchases: PaginatedPurchases;
  filterOptions: PurchaseFilterOptions;
  source: PageDataSource;
};
