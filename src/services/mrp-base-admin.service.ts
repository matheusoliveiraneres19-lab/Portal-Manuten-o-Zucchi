/**
 * ANÁLISE MRP — troca e restauração da Base MRP pela aba Base MRP (FASE I).
 *
 * Equivale ao envio da planilha do MRP pela aba Base (importarBase + analisar)
 * e ao "Voltar à base embutida" (restaurarBase) do HTML — com a garantia que
 * o HTML não tinha: tudo ou nada.
 *
 *   Com análise vigente:
 *     nova base gravada INATIVA (FASE C)
 *     → runMrpAnalysis(nova base + MESMO estoque + MESMAS compras do run atual,
 *       trigger BASE_REIMPORT | BASE_RESTORE, activateBaseVersion)
 *     → na MESMA transação: base nova ativa + run novo vigente.
 *     Falhou a análise: base e análise anteriores continuam vigentes (a versão
 *     nova fica gravada, inativa, no histórico).
 *   Sem análise vigente:
 *     só grava e ativa a base (não há estoque/compras para recalcular).
 *
 * Nenhuma regra nova: parser (FASE C), motor (FASE D) e ativação (FASE B).
 */
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { MrpImportError, confirmMrpImport } from "@/services/mrp-import.service";
import { runMrpAnalysis, type RunMrpAnalysisResult } from "@/services/mrp-analysis.service";
import { MrpPersistenceError, activateMrpBaseVersion } from "@/services/mrp-persistence.service";

export type MrpBaseChangeResult = {
  baseVersionId: string;
  /** Análise nova (null quando não havia análise vigente para recalcular). */
  analysis: RunMrpAnalysisResult | null;
  /** Base já era a vigente — nada feito. */
  unchanged?: boolean;
  message: string;
};

type Hooks = { beforeAnalysisCommit?: (tx: Prisma.TransactionClient) => Promise<void> };

async function currentRunSources() {
  return prisma.mrpAnalysisRun.findFirst({
    where: { isCurrent: true },
    select: { id: true, baseVersionId: true, stockImportId: true, purchaseImportId: true }
  });
}

/** Envio de nova planilha do MRP pela aba Base MRP. */
export async function replaceMrpBaseFromImport(params: {
  importId: string;
  sheet?: string;
  defaultArea?: string;
  userId: string;
  download?: (path: string, bucket: string) => Promise<Buffer>;
  hooks?: Hooks;
}): Promise<MrpBaseChangeResult> {
  const run = await currentRunSources();
  const imported = await confirmMrpImport({
    items: [{ importId: params.importId, kind: "base", sheet: params.sheet }],
    defaultArea: params.defaultArea,
    // Sem análise vigente a base já pode nascer ativa; com análise, só junto com o run novo.
    activateBase: !run,
    createdBy: params.userId,
    download: params.download
  });
  const baseVersionId = imported.baseVersionId;
  if (!baseVersionId) throw new MrpImportError("A planilha do MRP não gerou uma nova Base MRP.");
  if (!run) {
    return { baseVersionId, analysis: null, message: `Base MRP atualizada (${imported.counts.base?.materials ?? 0} materiais). Não há análise vigente para recalcular.` };
  }
  const analysis = await runMrpAnalysis({
    baseVersionId,
    stockImportId: run.stockImportId,
    purchaseImportId: run.purchaseImportId,
    trigger: "BASE_REIMPORT",
    userId: params.userId,
    activateBaseVersion: true,
    hooks: params.hooks?.beforeAnalysisCommit ? { beforeCommit: params.hooks.beforeAnalysisCommit } : undefined
  });
  return {
    baseVersionId,
    analysis,
    message: `Base MRP atualizada (${analysis.kpis.total} materiais). A análise foi recalculada com o mesmo estoque e as mesmas compras.`
  };
}

/** Versão SEED_HTML original (a "base embutida" do HTML), sem duplicar materiais. */
export async function getMrpSeedBaseVersion() {
  return prisma.mrpBaseVersion.findFirst({ where: { source: "SEED_HTML" }, orderBy: { createdAt: "asc" } });
}

/** "Restaurar base inicial" (= "Voltar à base embutida" do HTML). */
export async function restoreMrpSeedBase(params: { userId: string; hooks?: Hooks }): Promise<MrpBaseChangeResult> {
  const seed = await getMrpSeedBaseVersion();
  if (!seed) throw new MrpPersistenceError("Base inicial (SEED_HTML) não encontrada.");
  const run = await currentRunSources();
  if (!run) {
    if (seed.isActive) return { baseVersionId: seed.id, analysis: null, unchanged: true, message: "A base inicial já está em uso." };
    await activateMrpBaseVersion(seed.id);
    return { baseVersionId: seed.id, analysis: null, message: "Base inicial restaurada. Não há análise vigente para recalcular." };
  }
  if (seed.isActive && run.baseVersionId === seed.id) {
    return { baseVersionId: seed.id, analysis: null, unchanged: true, message: "A base inicial já está em uso." };
  }
  const analysis = await runMrpAnalysis({
    baseVersionId: seed.id,
    stockImportId: run.stockImportId,
    purchaseImportId: run.purchaseImportId,
    trigger: "BASE_RESTORE",
    userId: params.userId,
    activateBaseVersion: true,
    hooks: params.hooks?.beforeAnalysisCommit ? { beforeCommit: params.hooks.beforeAnalysisCommit } : undefined
  });
  return {
    baseVersionId: seed.id,
    analysis,
    message: `Base inicial restaurada (${analysis.kpis.total} materiais). A análise foi recalculada com o mesmo estoque e as mesmas compras.`
  };
}
