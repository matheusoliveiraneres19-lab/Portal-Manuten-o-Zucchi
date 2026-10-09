/**
 * ANÁLISE MRP — exportações Excel (FASE J).
 *
 * Tudo do MESMO snapshot que a tela mostra: o run vigente (lido UMA vez por
 * exportação) → itens da análise (cache por runId), compras da importação do
 * run (cache por runId) e, para a Base MRP, a mesma base da aba (run vigente
 * ou, sem run, a base ativa). Nunca a "última importação" global, Material,
 * MaterialMovement nem PurchaseRecord.
 */
import { prisma } from "@/lib/prisma";
import { filterMrpBuyList, type MrpBuyFilters } from "@/lib/mrp/buy-list";
import { filterMrpIdle, type MrpIdleFilters } from "@/lib/mrp/idle";
import type { MrpBaseViewFilters } from "@/lib/mrp/base-view";
import {
  MRP_EXPORT_MESSAGES,
  buildMrpBaseExport,
  buildMrpBuyByAreaExport,
  buildMrpBuyExport,
  buildMrpFamiliesExport,
  buildMrpIdleExport,
  buildMrpTransitExport,
  mrpExportFileName,
  type MrpExportResult,
  type MrpExportType
} from "@/lib/mrp/export";
import { writeMrpExportWorkbook } from "@/lib/mrp/export-workbook";
import { getMrpRunItemsCached } from "@/services/mrp-listing.service";
import { getMrpTransitGroups } from "@/services/mrp-transit.service";
import { getCurrentMrpBaseRows } from "@/services/mrp-base-view.service";

export type MrpExportParams = { buy: MrpBuyFilters; idle: MrpIdleFilters; base: MrpBaseViewFilters };

export type MrpExportFile =
  | { ok: true; fileName: string; data: Buffer; sheets: string[]; rows: number; runId: string | null; baseVersionId: string | null; queries: number; ms: number }
  | { ok: false; message: string; queries: number };

/** Monta o conteúdo da exportação (sem gravar o .xlsx). */
export async function buildMrpExport(
  type: MrpExportType,
  params: MrpExportParams
): Promise<{ result: MrpExportResult; runId: string | null; baseVersionId: string | null; queries: number }> {
  if (type === "base") {
    const base = await getCurrentMrpBaseRows(params.base);
    if (!base) return { result: { ok: false, message: MRP_EXPORT_MESSAGES.noBase }, runId: null, baseVersionId: null, queries: 2 };
    return { result: buildMrpBaseExport(base.rows), runId: null, baseVersionId: base.versionId, queries: base.queries };
  }

  const run = await prisma.mrpAnalysisRun.findFirst({ where: { isCurrent: true }, select: { id: true, baseVersionId: true, purchaseImportId: true } });
  if (!run) return { result: { ok: false, message: MRP_EXPORT_MESSAGES.noAnalysis }, runId: null, baseVersionId: null, queries: 1 };
  const snap = { runId: run.id, baseVersionId: run.baseVersionId };

  if (type === "transit") {
    const { groups, queries } = await getMrpTransitGroups(run.id, run.purchaseImportId);
    return { result: buildMrpTransitExport(groups), ...snap, queries: 1 + queries };
  }

  const { rows, queries } = await getMrpRunItemsCached(run.id);
  const result =
    type === "buy"
      ? buildMrpBuyExport(filterMrpBuyList(rows, params.buy))
      : type === "buy-by-area"
        ? buildMrpBuyByAreaExport(filterMrpBuyList(rows, params.buy))
        : type === "families"
          ? buildMrpFamiliesExport(rows)
          : buildMrpIdleExport(filterMrpIdle(rows, params.idle));
  return { result, ...snap, queries: 1 + queries };
}

/** Exportação pronta para download (.xlsx em memória). */
export async function exportMrp(type: MrpExportType, params: MrpExportParams, now = new Date()): Promise<MrpExportFile> {
  const t0 = Date.now();
  const built = await buildMrpExport(type, params);
  if (!built.result.ok) return { ok: false, message: built.result.message, queries: built.queries };
  const spec = built.result.spec;
  const data = writeMrpExportWorkbook(spec);
  return {
    ok: true,
    fileName: mrpExportFileName(type, now),
    data,
    sheets: spec.sheets.map((s) => s.name),
    rows: spec.sheets.reduce((n, s) => n + s.rows.length - 1, 0),
    runId: built.runId,
    baseVersionId: built.baseVersionId,
    queries: built.queries,
    ms: Date.now() - t0
  };
}
