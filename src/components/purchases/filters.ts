import type { ItemNature, PendingPurchaseStatusFilter, PurchaseQueryParams, PurchaseType } from "@/types/purchases";

/** Estado de filtros aplicado nas páginas de compras (espelha PurchaseQueryParams). */
export type AppliedPurchaseFilters = {
  startDate: string;
  endDate: string;
  requisition: string;
  purchaseOrder: string;
  supplier: string;
  material: string;
  category: string;
  purchaseType: string;
  nature: string;
  requester: string;
  pendingStatus: string;
  search: string;
};

export const EMPTY_PURCHASE_FILTERS: AppliedPurchaseFilters = {
  startDate: "",
  endDate: "",
  requisition: "",
  purchaseOrder: "",
  supplier: "",
  material: "",
  category: "",
  purchaseType: "",
  nature: "",
  requester: "",
  pendingStatus: "",
  search: ""
};

/** Converte os filtros aplicados em query string da URL. */
export function purchaseFiltersToParams(filters: AppliedPurchaseFilters): URLSearchParams {
  const params = new URLSearchParams();
  if (filters.startDate) params.set("startDate", filters.startDate);
  if (filters.endDate) params.set("endDate", filters.endDate);
  if (filters.requisition) params.set("req", filters.requisition);
  if (filters.purchaseOrder) params.set("pedido", filters.purchaseOrder);
  if (filters.supplier) params.set("fornecedor", filters.supplier);
  if (filters.material) params.set("material", filters.material);
  if (filters.category) params.set("categoria", filters.category);
  if (filters.purchaseType) params.set("grupo", filters.purchaseType);
  if (filters.nature) params.set("natureza", filters.nature);
  if (filters.requester) params.set("requisitante", filters.requester);
  if (filters.pendingStatus) params.set("status", filters.pendingStatus);
  if (filters.search) params.set("q", filters.search);
  return params;
}

/* ------------------------------------------------------------------ */
/* Parsing dos searchParams no server component                       */
/* ------------------------------------------------------------------ */

type SearchParams = Record<string, string | string[] | undefined>;

function firstParam(value: string | string[] | undefined): string | undefined {
  const raw = Array.isArray(value) ? value[0] : value;
  return raw && raw.trim() ? raw.trim() : undefined;
}

const PURCHASE_TYPES = ["NORMAL", "REGULARIZACAO", "OUTROS"];
const NATURES = ["MATERIAL", "SERVICO"];
const PENDING_STATUSES = ["sem-pedido", "pendente-migo", "pendente-miro", "atrasado", "recebido-atraso"];

/** Lê os searchParams da URL e devolve PurchaseQueryParams tipado. */
export function parsePurchaseQueryParams(searchParams: SearchParams): PurchaseQueryParams {
  const purchaseTypeRaw = firstParam(searchParams.grupo);
  const natureRaw = firstParam(searchParams.natureza);
  const statusRaw = firstParam(searchParams.status);
  const page = Number(firstParam(searchParams.page));
  const pageSize = Number(firstParam(searchParams.tamanho));

  return {
    startDate: firstParam(searchParams.startDate),
    endDate: firstParam(searchParams.endDate),
    requisition: firstParam(searchParams.req),
    purchaseOrder: firstParam(searchParams.pedido),
    supplier: firstParam(searchParams.fornecedor),
    material: firstParam(searchParams.material),
    category: firstParam(searchParams.categoria),
    purchaseType: purchaseTypeRaw && PURCHASE_TYPES.includes(purchaseTypeRaw) ? (purchaseTypeRaw as PurchaseType) : undefined,
    nature: natureRaw && NATURES.includes(natureRaw) ? (natureRaw as ItemNature) : undefined,
    pendingStatus:
      statusRaw && PENDING_STATUSES.includes(statusRaw) ? (statusRaw as PendingPurchaseStatusFilter) : undefined,
    requester: firstParam(searchParams.requisitante),
    search: firstParam(searchParams.q),
    page: Number.isFinite(page) && page > 0 ? page : undefined,
    pageSize: Number.isFinite(pageSize) && pageSize > 0 ? pageSize : undefined
  };
}

/** Reflete os params resolvidos de volta no estado de filtros da UI. */
export function queryParamsToFilters(params: PurchaseQueryParams): AppliedPurchaseFilters {
  return {
    startDate: params.startDate ?? "",
    endDate: params.endDate ?? "",
    requisition: params.requisition ?? "",
    purchaseOrder: params.purchaseOrder ?? "",
    supplier: params.supplier ?? "",
    material: params.material ?? "",
    category: params.category ?? "",
    purchaseType: params.purchaseType ?? "",
    nature: params.nature ?? "",
    requester: params.requester ?? "",
    pendingStatus: params.pendingStatus ?? "",
    search: params.search ?? ""
  };
}
