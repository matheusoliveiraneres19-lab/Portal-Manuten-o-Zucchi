/**
 * ANÁLISE MRP — aba ESTOQUE PARADO (FASE H), porta 1:1 de `paradoRows()` e
 * `renderParado()` do `Analise_MRP_Compacto (1).html`.
 *
 * Opera sobre os itens JÁ CALCULADOS do run (noMovement e free gravados pelo
 * motor), em ordem de position; nada do MRP é recalculado aqui.
 *   - entram só itens com noMovement = true;
 *   - "Capital parado" = free > 0; "Zerado" = free <= 0 (negativo também);
 *   - ordem = maior saldo primeiro (sort estável: empates em ordem de position).
 */
import { MRP_BUY_AREAS } from "./buy-list";
import { norm } from "./normalization";

export const MRP_IDLE_TYPES = ["com", "sem", "all"] as const;
export type MrpIdleType = (typeof MRP_IDLE_TYPES)[number];

export const MRP_IDLE_TYPE_LABELS: Record<MrpIdleType, string> = {
  com: "Com saldo em estoque (capital parado)",
  sem: "Zerados",
  all: "Todos"
};

export type MrpIdleFilters = { q: string; type: MrpIdleType; area: string };
export const MRP_IDLE_DEFAULT_FILTERS: MrpIdleFilters = { q: "", type: "com", area: "" };

export function isMrpIdleType(v: unknown): v is MrpIdleType {
  return typeof v === "string" && (MRP_IDLE_TYPES as readonly string[]).includes(v);
}

/** Filtros na URL com nomes próprios (idle*), sem colidir com as outras abas. */
export function parseMrpIdleFilters(get: (key: string) => string | null | undefined): MrpIdleFilters {
  const type = get("idleType");
  const area = get("idleArea") ?? "";
  return {
    q: (get("idleQ") ?? "").slice(0, 200),
    type: isMrpIdleType(type) ? type : "com",
    area: (MRP_BUY_AREAS as readonly string[]).includes(area) ? area : ""
  };
}

export type MrpIdleRow = { code: string; description: string; area: string; noMovement: boolean; free: number };

/** `paradoRows()` — filtra e ordena (estável). Não altera a entrada. */
export function filterMrpIdle<T extends MrpIdleRow>(rows: readonly T[], f: MrpIdleFilters): T[] {
  const q = norm(f.q);
  return rows
    .filter((a) => {
      if (!a.noMovement) return false;
      if (f.type === "com" && !(a.free > 0)) return false;
      if (f.type === "sem" && a.free > 0) return false;
      if (f.area && a.area !== f.area) return false;
      if (q && !(norm(a.code).includes(q) || norm(a.description).includes(q))) return false;
      return true;
    })
    .sort((x, y) => y.free - x.free);
}

/** Situação visual (sem status novo no banco). */
export function mrpIdleSituation(free: number): "Capital parado" | "Zerado" {
  return free > 0 ? "Capital parado" : "Zerado";
}

/**
 * Percentual "X% da base" do KPI Sem movimentação:
 * semMov / max(1, total) * 100 com 1 casa (toFixed(1) do HTML), exibido em pt-BR.
 */
export function mrpIdleShareText(semMov: number, total: number): string {
  return `${((semMov / Math.max(1, total)) * 100).toFixed(1).replace(".", ",")}% da base`;
}

export const MRP_IDLE_INITIAL_LIMIT = 200;
export const MRP_IDLE_LIMIT_STEP = 400;
