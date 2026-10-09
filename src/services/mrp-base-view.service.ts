/**
 * ANÁLISE MRP — leitura da aba BASE MRP (FASE I).
 *
 * Qual base mostrar (auditoria): a base USADA PELA ANÁLISE VIGENTE
 * (MrpAnalysisRun.baseVersionId), para todas as abas representarem o mesmo
 * snapshot; sem análise vigente, a Base MRP ativa. Se a base ativa for outra,
 * a tela avisa — mas não troca a base exibida nem recalcula nada.
 *
 * Fonte da tabela = MrpBaseMaterial da versão, na ordem de materiais()
 * (orderMrpBaseMaterials). Cache por versionId (versões são imutáveis).
 */
import { prisma } from "@/lib/prisma";
import { orderMrpBaseMaterials } from "@/lib/mrp/analysis-engine";
import {
  MRP_BASE_INITIAL_LIMIT,
  filterMrpBase,
  mrpBaseHasNoParams,
  summarizeMrpBase,
  type MrpBaseSummaryCounts,
  type MrpBaseViewFilters,
  type MrpBaseViewRow
} from "@/lib/mrp/base-view";
import { outputNumber } from "@/lib/mrp/mrp-math";
import { fromMrpDecimal } from "@/services/mrp-persistence.service";

export type MrpBaseVersionInfo = {
  id: string;
  source: string;
  fileName: string;
  createdAt: string;
  createdBy: string | null;
  materialCount: number;
};

type Cached = { info: MrpBaseVersionInfo; rows: MrpBaseViewRow[]; summary: MrpBaseSummaryCounts };
const CACHE_MAX = 3;
const cache = new Map<string, Cached>();

async function loadVersion(versionId: string): Promise<{ data: Cached | null; queries: number }> {
  const hit = cache.get(versionId);
  if (hit) return { data: hit, queries: 0 };
  const version = await prisma.mrpBaseVersion.findUnique({ where: { id: versionId } });
  if (!version) return { data: null, queries: 1 };
  const materials = await prisma.mrpBaseMaterial.findMany({ where: { versionId } });
  const sheetOrder = Array.isArray(version.sheets) ? (version.sheets as { name?: string }[]).map((s) => String(s?.name ?? "")) : [];
  const rows: MrpBaseViewRow[] = orderMrpBaseMaterials(materials, sheetOrder).map((m) => ({
    code: m.code,
    description: m.description,
    group: m.group,
    unit: m.unit,
    min: outputNumber(fromMrpDecimal(m.min)),
    max: outputNumber(fromMrpDecimal(m.max)),
    statusMrp: m.statusMrp,
    family: m.family,
    area: m.area
  }));
  const data: Cached = {
    info: {
      id: version.id,
      source: version.source,
      fileName: version.fileName,
      createdAt: version.createdAt.toISOString(),
      createdBy: version.createdBy,
      materialCount: version.materialCount
    },
    rows,
    summary: summarizeMrpBase(rows)
  };
  cache.set(versionId, data);
  while (cache.size > CACHE_MAX) cache.delete(cache.keys().next().value as string);
  return { data, queries: 2 };
}

/** currentBaseForView = run vigente?.baseVersionId ?? base ativa. */
export async function resolveMrpBaseForView(): Promise<{
  versionId: string | null;
  origin: "run" | "active" | null;
  runId: string | null;
  activeVersionId: string | null;
  queries: number;
}> {
  const run = await prisma.mrpAnalysisRun.findFirst({ where: { isCurrent: true }, select: { id: true, baseVersionId: true } });
  const active = await prisma.mrpBaseVersion.findFirst({ where: { isActive: true }, select: { id: true } });
  if (run) return { versionId: run.baseVersionId, origin: "run", runId: run.id, activeVersionId: active?.id ?? null, queries: 2 };
  return { versionId: active?.id ?? null, origin: active ? "active" : null, runId: null, activeVersionId: active?.id ?? null, queries: 2 };
}

export type MrpBaseView = {
  version: MrpBaseVersionInfo;
  summary: MrpBaseSummaryCounts;
  origin: "run" | "active";
  /** Base ativa ≠ base da análise vigente (aviso, sem trocar a exibição). */
  activeDiffers: boolean;
  activeVersionId: string | null;
  queries: number;
};

/** Resumo da base exibida (null = nenhuma base cadastrada). */
export async function getMrpBaseView(): Promise<MrpBaseView | null> {
  const resolved = await resolveMrpBaseForView();
  if (!resolved.versionId) return null;
  const { data, queries } = await loadVersion(resolved.versionId);
  if (!data) return null;
  return {
    version: data.info,
    summary: data.summary,
    origin: resolved.origin!,
    activeDiffers: resolved.origin === "run" && resolved.activeVersionId !== resolved.versionId,
    activeVersionId: resolved.activeVersionId,
    queries: resolved.queries + queries
  };
}

export type MrpBaseItem = MrpBaseViewRow & { noParams: boolean };

export type MrpBaseListing = {
  versionId: string;
  items: MrpBaseItem[];
  filteredCount: number;
  total: number;
  hasMore: boolean;
  limit: number;
  queries: number;
};

/** Tabela "Materiais cadastrados" da base exibida. */
export async function getCurrentMrpBaseListing(filters: MrpBaseViewFilters, limit = MRP_BASE_INITIAL_LIMIT): Promise<MrpBaseListing | null> {
  const resolved = await resolveMrpBaseForView();
  if (!resolved.versionId) return null;
  return getMrpBaseListing(resolved.versionId, filters, limit, resolved.queries);
}

export async function getMrpBaseListing(versionId: string, filters: MrpBaseViewFilters, limit = MRP_BASE_INITIAL_LIMIT, priorQueries = 0): Promise<MrpBaseListing | null> {
  const { data, queries } = await loadVersion(versionId);
  if (!data) return null;
  const filtered = filterMrpBase(data.rows, filters);
  return {
    versionId,
    items: filtered.slice(0, limit).map((m) => ({ ...m, noParams: mrpBaseHasNoParams(m) })),
    filteredCount: filtered.length,
    total: data.rows.length,
    hasMore: filtered.length > limit,
    limit,
    queries: priorQueries + queries
  };
}

/** baseFiltrada() COMPLETA da base exibida pela aba (exportação Excel da base). */
export async function getCurrentMrpBaseRows(filters: MrpBaseViewFilters): Promise<{ versionId: string; rows: MrpBaseViewRow[]; queries: number } | null> {
  const resolved = await resolveMrpBaseForView();
  if (!resolved.versionId) return null;
  const { data, queries } = await loadVersion(resolved.versionId);
  if (!data) return null;
  return { versionId: resolved.versionId, rows: filterMrpBase(data.rows, filters), queries: resolved.queries + queries };
}

/** Só para testes: esvazia o cache. */
export function clearMrpBaseViewCache() {
  cache.clear();
}
