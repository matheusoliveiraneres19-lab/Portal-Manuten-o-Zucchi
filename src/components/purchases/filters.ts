import type {
  PurchaseDateField,
  PurchaseKindFilter,
  PurchaseOperationalStatus,
  PurchaseQueryParams
} from "@/types/purchases";

/** Estado de filtros aplicado nas páginas de compras (multi-seleção). */
export type AppliedPurchaseFilters = {
  search: string;
  suppliers: string[];
  categories: string[];
  purchasingGroups: string[];
  /** Tipo: material / servico / regularizacao / ignorado. */
  kinds: string[];
  /** Status operacional canônico (enum). */
  statuses: string[];
  requesters: string[];
  /** Classificação N1..N4 (só usada na aba Compras Pendentes). */
  classificationsN1: string[];
  classificationsN2: string[];
  classificationsN3: string[];
  classificationsN4: string[];
  /** "" = data de referência (padrão); senão um campo de data específico. */
  dateField: string;
  startDate: string;
  endDate: string;
};

export const EMPTY_PURCHASE_FILTERS: AppliedPurchaseFilters = {
  search: "",
  suppliers: [],
  categories: [],
  purchasingGroups: [],
  kinds: [],
  statuses: [],
  requesters: [],
  classificationsN1: [],
  classificationsN2: [],
  classificationsN3: [],
  classificationsN4: [],
  dateField: "",
  startDate: "",
  endDate: ""
};

/** Chaves de grupos multi-seleção (para iterar em chips/contagem). */
export const MULTI_FILTER_KEYS = [
  "suppliers",
  "categories",
  "purchasingGroups",
  "kinds",
  "statuses",
  "requesters",
  "classificationsN1",
  "classificationsN2",
  "classificationsN3",
  "classificationsN4"
] as const;

/** Níveis de classificação e a chave de filtro correspondente (ordem hierárquica). */
export const CLASSIFICATION_FILTER_KEYS = [
  { level: "N1", key: "classificationsN1", param: "n1" },
  { level: "N2", key: "classificationsN2", param: "n2" },
  { level: "N3", key: "classificationsN3", param: "n3" },
  { level: "N4", key: "classificationsN4", param: "n4" }
] as const satisfies ReadonlyArray<{ level: string; key: keyof AppliedPurchaseFilters; param: string }>;

const DATE_FIELDS = ["requisitionDate", "purchaseOrderDate", "expectedDeliveryDate", "receiptDate"];
export const PURCHASE_KIND_VALUES = ["material", "servico", "regularizacao", "ignorado"];
export const PURCHASE_STATUS_VALUES = [
  "PENDENTE_COMPRA",
  "COMPRADO",
  "ATRASADO",
  "ENTREGUE",
  "REGULARIZACAO",
  "SERVICO",
  "IGNORADO"
];

/** Conta quantos grupos/filtros estão ativos. */
export function countActiveFilters(filters: AppliedPurchaseFilters): number {
  let count = 0;
  for (const key of MULTI_FILTER_KEYS) {
    count += filters[key].length;
  }
  if (filters.search.trim()) count += 1;
  if (filters.startDate || filters.endDate) count += 1;
  return count;
}

/** Converte os filtros aplicados em query string da URL (arrays como CSV). */
export function purchaseFiltersToParams(filters: AppliedPurchaseFilters): URLSearchParams {
  const params = new URLSearchParams();
  const setCsv = (key: string, values: string[]) => {
    if (values.length) {
      params.set(key, values.join(","));
    }
  };
  if (filters.search.trim()) params.set("q", filters.search.trim());
  setCsv("fornecedores", filters.suppliers);
  setCsv("categorias", filters.categories);
  setCsv("grupos", filters.purchasingGroups);
  setCsv("tipos", filters.kinds);
  setCsv("status", filters.statuses);
  setCsv("requisitantes", filters.requesters);
  setCsv("n1", filters.classificationsN1);
  setCsv("n2", filters.classificationsN2);
  setCsv("n3", filters.classificationsN3);
  setCsv("n4", filters.classificationsN4);
  if (filters.dateField) params.set("campoData", filters.dateField);
  if (filters.startDate) params.set("startDate", filters.startDate);
  if (filters.endDate) params.set("endDate", filters.endDate);
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

function csvParam(value: string | string[] | undefined, allowed?: string[]): string[] {
  const raw = firstParam(value);
  if (!raw) {
    return [];
  }
  const list = raw
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
  const unique = Array.from(new Set(list));
  return allowed ? unique.filter((item) => allowed.includes(item)) : unique;
}

/** Lê os searchParams da URL e devolve PurchaseQueryParams tipado. */
export function parsePurchaseQueryParams(searchParams: SearchParams): PurchaseQueryParams {
  const dateFieldRaw = firstParam(searchParams.campoData);
  const page = Number(firstParam(searchParams.page));
  const pageSize = Number(firstParam(searchParams.tamanho));

  return {
    search: firstParam(searchParams.q),
    suppliers: csvParam(searchParams.fornecedores),
    categories: csvParam(searchParams.categorias),
    purchasingGroups: csvParam(searchParams.grupos),
    kinds: csvParam(searchParams.tipos, PURCHASE_KIND_VALUES) as PurchaseKindFilter[],
    statuses: csvParam(searchParams.status, PURCHASE_STATUS_VALUES) as PurchaseOperationalStatus[],
    requesters: csvParam(searchParams.requisitantes),
    // Valores livres (vêm da planilha) — só normalizamos espaços/duplicatas.
    classificationsN1: csvParam(searchParams.n1),
    classificationsN2: csvParam(searchParams.n2),
    classificationsN3: csvParam(searchParams.n3),
    classificationsN4: csvParam(searchParams.n4),
    dateField: dateFieldRaw && DATE_FIELDS.includes(dateFieldRaw) ? (dateFieldRaw as PurchaseDateField) : undefined,
    startDate: firstParam(searchParams.startDate),
    endDate: firstParam(searchParams.endDate),
    page: Number.isFinite(page) && page > 0 ? page : undefined,
    pageSize: Number.isFinite(pageSize) && pageSize > 0 ? pageSize : undefined
  };
}

/** Reflete os params resolvidos de volta no estado de filtros da UI. */
export function queryParamsToFilters(params: PurchaseQueryParams): AppliedPurchaseFilters {
  return {
    search: params.search ?? "",
    suppliers: params.suppliers ?? [],
    categories: params.categories ?? [],
    purchasingGroups: params.purchasingGroups ?? [],
    kinds: params.kinds ?? [],
    statuses: params.statuses ?? [],
    requesters: params.requesters ?? [],
    classificationsN1: params.classificationsN1 ?? [],
    classificationsN2: params.classificationsN2 ?? [],
    classificationsN3: params.classificationsN3 ?? [],
    classificationsN4: params.classificationsN4 ?? [],
    dateField: params.dateField ?? "",
    startDate: params.startDate ?? "",
    endDate: params.endDate ?? ""
  };
}
