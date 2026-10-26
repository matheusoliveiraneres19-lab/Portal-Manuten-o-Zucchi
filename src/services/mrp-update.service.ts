/**
 * ANÁLISE MRP — "Atualizar tudo" (FASE E): o fluxo do processar() do HTML sobre
 * a infraestrutura das FASES C e D, sem duplicar nenhuma regra.
 *
 *   1. confirmMrpImport  — parser + staging + transação das fontes. A planilha do
 *      MRP nova (se enviada) é gravada INATIVA;
 *   2. runMrpAnalysis    — motor sobre (base nova ou ativa + estoque + compras).
 *      Na MESMA transação: ativa a base nova (se houver) e torna o run vigente.
 *
 * Se a análise falhar, nada vira vigente: a base e a análise anteriores
 * continuam valendo (as fontes importadas ficam no histórico, sem uso).
 */
import { MrpImportError, confirmMrpImport, type MrpConfirmItem, type MrpPersistResult } from "@/services/mrp-import.service";
import { runMrpAnalysis, type RunMrpAnalysisResult } from "@/services/mrp-analysis.service";
import type { Prisma } from "@prisma/client";

export type UpdateAllMrpResult = { imported: MrpPersistResult; analysis: RunMrpAnalysisResult };

/** Mensagem ao usuário quando a importação deu certo mas a análise não foi aplicada. */
export const MRP_ANALYSIS_NOT_APPLIED_MESSAGE = "Os arquivos foram importados, mas a nova análise não pôde ser aplicada. A análise anterior continua vigente.";

/**
 * As planilhas FORAM importadas (fontes gravadas, histórico = sucesso), mas a
 * nova análise não pôde ser aplicada: a análise e a base anteriores continuam
 * vigentes e as fontes novas ficam no histórico, sem uso. A mensagem é a do
 * erro original (`original`).
 */
export class MrpAnalysisNotAppliedError extends Error {
  readonly stage = "analysis" as const;
  constructor(
    readonly imported: MrpPersistResult,
    readonly original: unknown
  ) {
    super(original instanceof Error ? original.message : String(original));
    this.name = "MrpAnalysisNotAppliedError";
  }
}

export async function updateAllMrp(params: {
  items: MrpConfirmItem[];
  depositFilter?: string;
  defaultArea?: string;
  userId: string;
  download?: (path: string, bucket: string) => Promise<Buffer>;
  hooks?: { beforeAnalysisCommit?: (tx: Prisma.TransactionClient) => Promise<void> };
}): Promise<UpdateAllMrpResult> {
  const kinds = new Set(params.items.map((i) => i.kind));
  if (!kinds.has("est") || !kinds.has("cmp")) {
    throw new MrpImportError("Anexe as planilhas de estoque e de compras.");
  }

  const imported = await confirmMrpImport({
    items: params.items,
    depositFilter: params.depositFilter,
    defaultArea: params.defaultArea,
    activateBase: false,
    createdBy: params.userId,
    download: params.download
  });

  let analysis: RunMrpAnalysisResult;
  try {
    analysis = await runMrpAnalysis({
      baseVersionId: imported.baseVersionId,
      stockImportId: imported.stockImportId!,
      purchaseImportId: imported.purchaseImportId!,
      trigger: "FULL_UPDATE",
      userId: params.userId,
      activateBaseVersion: !!imported.baseVersionId,
      hooks: params.hooks?.beforeAnalysisCommit ? { beforeCommit: params.hooks.beforeAnalysisCommit } : undefined
    });
  } catch (error) {
    throw new MrpAnalysisNotAppliedError(imported, error);
  }

  return { imported, analysis };
}
