/**
 * ANÁLISE MRP — lista da aba COMPRAR (FASE E), porta 1:1 de `filtrarCompra()`
 * e `bgStatus()` do `Analise_MRP_Compacto (1).html`.
 *
 * Opera sobre o resultado JÁ CALCULADO (MrpAnalysisItem); não recalcula nada do
 * motor. A entrada tem de vir na ordem de materiais() (position ASC): o sort é
 * estável, então empates completos ficam na ordem original — como no HTML.
 */
import type { MrpAnalysisStatus } from "./analysis-engine";
import { MRP_FAMILIES } from "./classification";
import { norm } from "./normalization";

/** Valores do filtro de status (`fStatus`). "all" = '' no HTML. */
export const MRP_BUY_STATUS_FILTERS = ["need", "Comprar", "Verificar", "Comprado", "OK", "all"] as const;
export type MrpBuyStatusFilter = (typeof MRP_BUY_STATUS_FILTERS)[number];

export const MRP_BUY_STATUS_LABELS: Record<MrpBuyStatusFilter, string> = {
  need: "Precisa comprar (Comprar + Verificar)",
  Comprar: "Só Comprar (zerados)",
  Verificar: "Só Verificar (abaixo do mínimo)",
  Comprado: "Em trânsito (já comprado)",
  OK: "Sem necessidade (OK)",
  all: "Todos os materiais"
};

/** Ordenações (`fSort`). */
export const MRP_BUY_SORTS = ["need", "qtd", "saldo", "cod", "desc"] as const;
export type MrpBuySort = (typeof MRP_BUY_SORTS)[number];

export const MRP_BUY_SORT_LABELS: Record<MrpBuySort, string> = {
  need: "Prioridade de compra",
  qtd: "Maior quantidade",
  saldo: "Menor saldo",
  cod: "Código",
  desc: "Descrição"
};

export const MRP_BUY_AREAS = ["Mecânica", "Elétrica"] as const;

/** Paginação do HTML: 200 iniciais, "mostrar mais" soma 400. */
export const MRP_BUY_INITIAL_LIMIT = 200;
export const MRP_BUY_LIMIT_STEP = 400;

export type MrpBuyFilters = {
  q: string;
  status: MrpBuyStatusFilter;
  area: string;
  family: string;
  sort: MrpBuySort;
};

export const MRP_BUY_DEFAULT_FILTERS: MrpBuyFilters = { q: "", status: "need", area: "", family: "", sort: "need" };

export function isMrpBuyStatusFilter(v: unknown): v is MrpBuyStatusFilter {
  return typeof v === "string" && (MRP_BUY_STATUS_FILTERS as readonly string[]).includes(v);
}
export function isMrpBuySort(v: unknown): v is MrpBuySort {
  return typeof v === "string" && (MRP_BUY_SORTS as readonly string[]).includes(v);
}

/** Campos que filtro e ordenação usam. */
export type MrpBuyRow = {
  code: string;
  description: string;
  area: string;
  family: string;
  status: MrpAnalysisStatus;
  suggested: number;
  free: number;
};

const ORD: Record<MrpAnalysisStatus, number> = { Comprar: 0, Verificar: 1, Comprado: 2, OK: 3 };

const COMPARATORS: Record<MrpBuySort, (x: MrpBuyRow, y: MrpBuyRow) => number> = {
  need: (x, y) => ORD[x.status] - ORD[y.status] || y.suggested - x.suggested || x.free - y.free,
  qtd: (x, y) => y.suggested - x.suggested,
  saldo: (x, y) => x.free - y.free,
  cod: (x, y) => String(x.code).localeCompare(String(y.code), "pt-BR", { numeric: true }),
  desc: (x, y) => x.description.localeCompare(y.description, "pt-BR")
};

/** `filtrarCompra()` — filtra e ordena (estável). Não altera a entrada. */
export function filterMrpBuyList<T extends MrpBuyRow>(rows: readonly T[], f: MrpBuyFilters): T[] {
  const q = norm(f.q);
  const st = f.status === "all" ? "" : f.status;
  const r = rows.filter((a) => {
    if (st === "need") {
      if (a.status !== "Comprar" && a.status !== "Verificar") return false;
    } else if (st && a.status !== st) return false;
    if (f.area && a.area !== f.area) return false;
    if (f.family && a.family !== f.family) return false;
    if (q && !(norm(a.code).includes(q) || norm(a.description).includes(q))) return false;
    return true;
  });
  return r.sort(COMPARATORS[f.sort] ?? COMPARATORS.need);
}

/** Soma da sugerida no filtro, na ordem da lista (como o `compraSub` do HTML). */
export function sumSuggested(rows: readonly Pick<MrpBuyRow, "suggested">[]): number {
  return rows.reduce((s, a) => s + a.suggested, 0);
}

/** Conjuntos presentes na análise, na ordem de `FAMS`. */
export function presentMrpFamilies(rows: readonly Pick<MrpBuyRow, "family">[]): string[] {
  const set = new Set(rows.map((r) => r.family));
  return MRP_FAMILIES.filter((f) => set.has(f));
}

/** Rótulo e tom da situação (`bgStatus()`); "Sem MRP" é só visual. */
export type MrpSituationTone = "critical" | "attention" | "info" | "muted" | "ok";
export function mrpSituation(a: { status: MrpAnalysisStatus; noParams: boolean }): { label: string; tone: MrpSituationTone } {
  if (a.status === "Comprar") return { label: "Comprar", tone: "critical" };
  if (a.status === "Verificar") return { label: "Verificar", tone: "attention" };
  if (a.status === "Comprado") return { label: "Em trânsito", tone: "info" };
  if (a.noParams) return { label: "Sem MRP", tone: "muted" };
  return { label: "OK", tone: "ok" };
}

/** Lê filtros de query string (valores inválidos caem no padrão do HTML). */
export function parseMrpBuyFilters(get: (key: string) => string | null | undefined): MrpBuyFilters {
  const status = get("status");
  const sort = get("sort");
  const area = get("area") ?? "";
  return {
    q: (get("q") ?? "").slice(0, 200),
    status: isMrpBuyStatusFilter(status) ? status : MRP_BUY_DEFAULT_FILTERS.status,
    area: (MRP_BUY_AREAS as readonly string[]).includes(area) ? area : "",
    family: get("family") ?? "",
    sort: isMrpBuySort(sort) ? sort : MRP_BUY_DEFAULT_FILTERS.sort
  };
}

/** Limite de linhas: 200, 600, 1000… (múltiplos válidos da paginação do HTML). */
export function parseMrpBuyLimit(raw: string | null | undefined): number {
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= MRP_BUY_INITIAL_LIMIT) return MRP_BUY_INITIAL_LIMIT;
  const steps = Math.ceil((Math.min(n, 100_000) - MRP_BUY_INITIAL_LIMIT) / MRP_BUY_LIMIT_STEP);
  return MRP_BUY_INITIAL_LIMIT + steps * MRP_BUY_LIMIT_STEP;
}
