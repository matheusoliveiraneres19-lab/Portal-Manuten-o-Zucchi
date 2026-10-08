/**
 * ANÁLISE MRP — leitura da aba EM TRÂNSITO (FASE G).
 *
 * Fonte = compras da importação USADA PELO RUN vigente
 * (MrpAnalysisRun.purchaseImportId → MrpPurchaseItem), nunca a "última
 * importação" global nem as tabelas de compras do portal (Purchase /
 * PurchaseRecord). Os itens da análise (mesmo cache por runId da lista Comprar)
 * entram só para descrição, área e "Só materiais da base MRP".
 *
 * Cache por runId: run e fontes são imutáveis. Cache frio = run vigente +
 * compras + itens da análise (este último compartilhado com a lista Comprar);
 * cache quente = só a consulta do run vigente.
 */
import { prisma } from "@/lib/prisma";
import type { MrpEnginePurchase } from "@/lib/mrp/analysis-engine";
import { outputNumber } from "@/lib/mrp/mrp-math";
import {
  MRP_TRANSIT_INITIAL_LIMIT,
  MRP_TRANSIT_SITUATION,
  buildMrpTransitGroups,
  filterMrpTransit,
  mrpTransitRef,
  type MrpTransitFilters,
  type MrpTransitGroup
} from "@/lib/mrp/transit";
import { fromMrpDecimal } from "@/services/mrp-persistence.service";
import { getMrpRunItemsCached } from "@/services/mrp-listing.service";

/** Linha pronta para a tela. */
export type MrpTransitItem = {
  code: string;
  description: string;
  inBase: boolean;
  area: string;
  count: number;
  quantity: number;
  supplier: string;
  /** Pedido ou, na falta, requisição ("" se nenhum). */
  reference: string;
  requisitionDate: string;
  expectedDeliveryDate: string;
  status: MrpTransitGroup["status"];
  situation: string;
};

export type MrpTransitListing = {
  runId: string;
  purchaseImportId: string;
  /** Linhas da planilha de compras (KPI "Linhas de compra"). */
  purchaseLines: number;
  /** Códigos únicos nas compras. */
  totalGroups: number;
  items: MrpTransitItem[];
  filteredCount: number;
  hasMore: boolean;
  limit: number;
  queries: number;
};

type Cached = { runId: string; purchaseImportId: string; lines: number; groups: MrpTransitGroup[] };
const CACHE_MAX = 2;
const cache = new Map<string, Cached>();

async function loadTransit(runId: string, purchaseImportId: string): Promise<{ data: Cached; queries: number }> {
  const hit = cache.get(runId);
  if (hit) return { data: hit, queries: 0 };
  const rows = await prisma.mrpPurchaseItem.findMany({ where: { importId: purchaseImportId }, orderBy: { seq: "asc" } });
  const purchases: MrpEnginePurchase[] = rows.map((p) => ({
    seq: p.seq,
    code: p.code,
    text: p.text,
    quantity: fromMrpDecimal(p.quantity),
    requisitionDate: p.requisitionDate,
    requisitionNumber: p.requisitionNumber,
    purchaseOrderNumber: p.purchaseOrderNumber,
    receiptDate: p.receiptDate,
    expectedDeliveryDate: p.expectedDeliveryDate,
    supplier: p.supplier
  }));
  const items = await getMrpRunItemsCached(runId);
  const lookup = new Map(items.rows.map((r) => [r.code, { description: r.description, area: r.area }]));
  const data: Cached = { runId, purchaseImportId, lines: purchases.length, groups: buildMrpTransitGroups(purchases, lookup) };
  cache.set(runId, data);
  while (cache.size > CACHE_MAX) cache.delete(cache.keys().next().value as string);
  return { data, queries: 1 + items.queries };
}

function toItem(g: MrpTransitGroup): MrpTransitItem {
  return {
    code: g.code,
    description: g.description,
    inBase: g.inBase,
    area: g.area,
    count: g.count,
    quantity: outputNumber(g.quantity),
    supplier: g.supplier,
    reference: mrpTransitRef(g),
    requisitionDate: g.requisitionDate,
    expectedDeliveryDate: g.expectedDeliveryDate,
    status: g.status,
    situation: MRP_TRANSIT_SITUATION[g.status]
  };
}

/** Tabela "Última compra de cada material" sobre a análise vigente (null = sem análise). */
export async function getCurrentMrpTransitListing(filters: MrpTransitFilters, limit = MRP_TRANSIT_INITIAL_LIMIT): Promise<MrpTransitListing | null> {
  const run = await prisma.mrpAnalysisRun.findFirst({ where: { isCurrent: true }, select: { id: true, purchaseImportId: true } });
  if (!run) return null;
  return getMrpTransitListing(run.id, run.purchaseImportId, filters, limit, 1);
}

export async function getMrpTransitListing(
  runId: string,
  purchaseImportId: string,
  filters: MrpTransitFilters,
  limit = MRP_TRANSIT_INITIAL_LIMIT,
  priorQueries = 0
): Promise<MrpTransitListing> {
  const { data, queries } = await loadTransit(runId, purchaseImportId);
  const filtered = filterMrpTransit(data.groups, filters);
  return {
    runId,
    purchaseImportId: data.purchaseImportId,
    purchaseLines: data.lines,
    totalGroups: data.groups.length,
    items: filtered.slice(0, limit).map(toItem),
    filteredCount: filtered.length,
    hasMore: filtered.length > limit,
    limit,
    queries: priorQueries + queries
  };
}

/** Só para testes: esvazia o cache. */
export function clearMrpTransitCache() {
  cache.clear();
}
