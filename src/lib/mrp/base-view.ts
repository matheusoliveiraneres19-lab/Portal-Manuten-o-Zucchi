/**
 * ANÁLISE MRP — aba BASE MRP (FASE I), porta 1:1 de `baseFiltrada()` e do
 * resumo de `renderBase()` do `Analise_MRP_Compacto (1).html`.
 *
 * Opera sobre os MrpBaseMaterial de UMA versão, na ordem de materiais()
 * (orderMrpBaseMaterials: ordem das abas da versão + linha de origem). Não usa
 * itens da análise: a base continua visível mesmo sem análise vigente.
 */
import { MRP_BUY_AREAS } from "./buy-list";
import { MRP_AREA_ELE, MRP_AREA_MEC } from "./classification";
import { norm } from "./normalization";

export const MRP_BASE_FILTERS = ["all", "semparam", "conj"] as const;
export type MrpBaseFilter = (typeof MRP_BASE_FILTERS)[number];

export const MRP_BASE_FILTER_LABELS: Record<MrpBaseFilter, string> = {
  all: "Todos os materiais",
  semparam: "Sem mín/máx definido",
  conj: "Só satélites e coroas"
};

export type MrpBaseViewFilters = { q: string; area: string; filter: MrpBaseFilter };
export const MRP_BASE_DEFAULT_FILTERS: MrpBaseViewFilters = { q: "", area: "", filter: "all" };

export function isMrpBaseFilter(v: unknown): v is MrpBaseFilter {
  return typeof v === "string" && (MRP_BASE_FILTERS as readonly string[]).includes(v);
}

/** Filtros na URL com nomes próprios (base*). */
export function parseMrpBaseViewFilters(get: (key: string) => string | null | undefined): MrpBaseViewFilters {
  const filter = get("baseFilter");
  const area = get("baseArea") ?? "";
  return {
    q: (get("baseQ") ?? "").slice(0, 200),
    area: (MRP_BUY_AREAS as readonly string[]).includes(area) ? area : "",
    filter: isMrpBaseFilter(filter) ? filter : "all"
  };
}

/** Um material da Base MRP (um registro de materiais()). */
export type MrpBaseViewRow = {
  code: string;
  description: string;
  group: string;
  unit: string;
  min: number;
  max: number;
  statusMrp: string;
  family: string;
  area: string;
};

/** Sem mín/máx na BASE (min <= 0 && max <= 0) — lido do material, não da análise. */
export const mrpBaseHasNoParams = (m: Pick<MrpBaseViewRow, "min" | "max">) => m.min <= 0 && m.max <= 0;

/** `baseFiltrada()` — mantém a ordem da base (não ordena). */
export function filterMrpBase<T extends MrpBaseViewRow>(rows: readonly T[], f: MrpBaseViewFilters): T[] {
  const q = norm(f.q);
  return rows.filter((m) => {
    if (f.area && m.area !== f.area) return false;
    if (f.filter === "semparam" && !mrpBaseHasNoParams(m)) return false;
    if (f.filter === "conj" && !m.family) return false;
    if (q && !(norm(m.code).includes(q) || norm(m.description).includes(q))) return false;
    return true;
  });
}

export type MrpBaseSummaryCounts = { total: number; mechanical: number; electrical: number; noParams: number; inFamilies: number };

/** Resumo de renderBase(): total, Mecânica, Elétrica, sem mín/máx, em satélites/coroas. */
export function summarizeMrpBase(rows: readonly MrpBaseViewRow[]): MrpBaseSummaryCounts {
  return {
    total: rows.length,
    mechanical: rows.filter((m) => m.area === MRP_AREA_MEC).length,
    // Contada pela área (o HTML fazia total − Mecânica; iguais enquanto só existem as duas áreas).
    electrical: rows.filter((m) => m.area === MRP_AREA_ELE).length,
    noParams: rows.filter(mrpBaseHasNoParams).length,
    inFamilies: rows.filter((m) => m.family).length
  };
}

export const MRP_BASE_INITIAL_LIMIT = 200;
export const MRP_BASE_LIMIT_STEP = 400;
