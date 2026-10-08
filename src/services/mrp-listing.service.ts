/**
 * ANÁLISE MRP — leitura da lista da aba COMPRAR (FASE E).
 *
 * Lê SÓ o que já foi calculado e persistido (MrpAnalysisRun / MrpAnalysisItem);
 * nenhuma regra do motor roda aqui. Filtro e ordenação = filtrarCompra() do HTML
 * (src/lib/mrp/buy-list.ts), sobre os itens em ordem de `position`.
 *
 * Cache por runId: um run é um snapshot IMUTÁVEL, então os itens de um run
 * podem ficar em memória na instância do servidor. Cada requisição faz 1
 * consulta (qual é o run vigente?) e só busca os itens quando o run mudou.
 */
import { prisma } from "@/lib/prisma";
import { mrpObservation } from "@/lib/mrp/analysis-engine";
import {
  MRP_BUY_INITIAL_LIMIT,
  filterMrpBuyList,
  mrpSituation,
  presentMrpFamilies,
  sumSuggested,
  type MrpBuyFilters,
  type MrpSituationTone
} from "@/lib/mrp/buy-list";
import { outputNumber } from "@/lib/mrp/mrp-math";
import { mrpAnalysisItemToResult } from "@/services/mrp-analysis.service";

/** Linha pronta para a tela (números já sem -0; textos do HTML prontos). */
export type MrpBuyListItem = {
  code: string;
  description: string;
  group: string;
  unit: string;
  area: string;
  family: string;
  min: number;
  max: number;
  free: number;
  suggested: number;
  status: "Comprar" | "Verificar" | "Comprado" | "OK";
  noParams: boolean;
  notFound: boolean;
  /** Rótulo de bgStatus(): Comprar / Verificar / Em trânsito / Sem MRP / OK. */
  situation: string;
  tone: MrpSituationTone;
  /** obsDe() */
  observation: string;
};

export type MrpBuyListing = {
  runId: string;
  items: MrpBuyListItem[];
  filteredCount: number;
  totalCount: number;
  /** Soma da sugerida dos materiais do filtro (diferente do KPI global). */
  suggestedFiltered: number;
  hasMore: boolean;
  limit: number;
  /** Conjuntos presentes na análise (ordem de FAMS). */
  families: string[];
  /** Consultas feitas nesta leitura (diagnóstico). */
  queries: number;
};

type Cached = { runId: string; rows: MrpBuyListItem[]; families: string[] };
const CACHE_MAX = 2;
const cache = new Map<string, Cached>();

async function loadRun(runId: string): Promise<{ data: Cached; queries: number }> {
  const hit = cache.get(runId);
  if (hit) return { data: hit, queries: 0 };
  const rows = await prisma.mrpAnalysisItem.findMany({ where: { runId }, orderBy: { position: "asc" } });
  const items: MrpBuyListItem[] = rows.map((r) => {
    const a = mrpAnalysisItemToResult(r);
    const sit = mrpSituation(a);
    return {
      code: a.code,
      description: a.description,
      group: a.group,
      unit: a.unit,
      area: a.area,
      family: a.family,
      min: outputNumber(a.min),
      max: outputNumber(a.max),
      free: outputNumber(a.free),
      suggested: outputNumber(a.suggested),
      status: a.status,
      noParams: a.noParams,
      notFound: a.notFound,
      situation: sit.label,
      tone: sit.tone,
      observation: mrpObservation(a)
    };
  });
  const data = { runId, rows: items, families: presentMrpFamilies(items) };
  cache.set(runId, data);
  while (cache.size > CACHE_MAX) cache.delete(cache.keys().next().value as string);
  return { data, queries: 1 };
}

/** Lista da aba Comprar sobre a análise vigente (null = não há análise). */
export async function getCurrentMrpBuyListing(filters: MrpBuyFilters, limit = MRP_BUY_INITIAL_LIMIT): Promise<MrpBuyListing | null> {
  const current = await prisma.mrpAnalysisRun.findFirst({ where: { isCurrent: true }, select: { id: true } });
  if (!current) return null;
  return getMrpBuyListing(current.id, filters, limit, 1);
}

export async function getMrpBuyListing(runId: string, filters: MrpBuyFilters, limit = MRP_BUY_INITIAL_LIMIT, priorQueries = 0): Promise<MrpBuyListing> {
  const { data, queries } = await loadRun(runId);
  const filtered = filterMrpBuyList(data.rows, filters);
  return {
    runId,
    items: filtered.slice(0, limit),
    filteredCount: filtered.length,
    totalCount: data.rows.length,
    suggestedFiltered: outputNumber(sumSuggested(filtered)),
    hasMore: filtered.length > limit,
    limit,
    families: data.families,
    queries: priorQueries + queries
  };
}

/** Só para testes: esvazia o cache. */
export function clearMrpBuyListingCache() {
  cache.clear();
}
