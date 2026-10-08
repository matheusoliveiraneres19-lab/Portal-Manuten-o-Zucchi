/**
 * ANÁLISE MRP — leitura da aba ESTOQUE PARADO (FASE H).
 *
 * Fonte = SÓ os itens do run vigente (MrpAnalysisItem: noMovement, free, área,
 * conjunto, grupo, UM), pelo mesmo cache por runId das outras abas. Não lê o
 * estoque importado nem recalcula regra do MRP. Os KPIs globais da aba vêm de
 * MrpAnalysisRun.kpis (semMov, parado, qtdParada).
 */
import { prisma } from "@/lib/prisma";
import { MRP_IDLE_INITIAL_LIMIT, filterMrpIdle, mrpIdleSituation, type MrpIdleFilters } from "@/lib/mrp/idle";
import { getMrpRunItemsCached, type MrpBuyListItem } from "@/services/mrp-listing.service";

export type MrpIdleItem = Pick<MrpBuyListItem, "code" | "description" | "area" | "family" | "group" | "unit" | "free"> & {
  situation: "Capital parado" | "Zerado";
};

export type MrpIdleListing = {
  runId: string;
  items: MrpIdleItem[];
  filteredCount: number;
  /** Itens com noMovement no run (independe dos filtros). */
  totalNoMovement: number;
  hasMore: boolean;
  limit: number;
  queries: number;
};

/** Tabela "Materiais sem movimentação" da análise vigente (null = sem análise). */
export async function getCurrentMrpIdleListing(filters: MrpIdleFilters, limit = MRP_IDLE_INITIAL_LIMIT): Promise<MrpIdleListing | null> {
  const run = await prisma.mrpAnalysisRun.findFirst({ where: { isCurrent: true }, select: { id: true } });
  if (!run) return null;
  return getMrpIdleListing(run.id, filters, limit, 1);
}

export async function getMrpIdleListing(runId: string, filters: MrpIdleFilters, limit = MRP_IDLE_INITIAL_LIMIT, priorQueries = 0): Promise<MrpIdleListing> {
  const { rows, queries } = await getMrpRunItemsCached(runId);
  const filtered = filterMrpIdle(rows, filters);
  return {
    runId,
    items: filtered.slice(0, limit).map((a) => ({
      code: a.code,
      description: a.description,
      area: a.area,
      family: a.family,
      group: a.group,
      unit: a.unit,
      free: a.free,
      situation: mrpIdleSituation(a.free)
    })),
    filteredCount: filtered.length,
    totalNoMovement: rows.filter((a) => a.noMovement).length,
    hasMore: filtered.length > limit,
    limit,
    queries: priorQueries + queries
  };
}
