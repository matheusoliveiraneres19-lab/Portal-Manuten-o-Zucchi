/**
 * ANÁLISE MRP — "Atualizar MRP": o fluxo do processar() do HTML sobre a
 * infraestrutura das FASES C e D, sem duplicar nenhuma regra.
 *
 *   1. loadMrpPortalPurchases — lê as compras ATUAIS do Portal (sem gravar). Se
 *      a consulta falhar, nada é importado e a análise anterior continua;
 *   2. confirmMrpImport  — parser + staging + transação do estoque (obrigatório)
 *      e da planilha do MRP (opcional, gravada INATIVA);
 *   3. snapshot das compras lidas (MrpPurchaseImport PORTAL_DB);
 *   4. runMrpAnalysis    — motor sobre (base nova ou ativa + estoque + snapshot).
 *      Na MESMA transação: ativa a base nova (se houver) e torna o run vigente.
 *
 * Não existe mais planilha de compras no MRP. Se a análise falhar, nada vira
 * vigente: a base e a análise anteriores continuam valendo (as fontes
 * importadas ficam no histórico, sem uso).
 */
import { MrpImportError, confirmMrpImport, type MrpConfirmItem, type MrpPersistResult } from "@/services/mrp-import.service";
import { runMrpAnalysis, type RunMrpAnalysisResult } from "@/services/mrp-analysis.service";
import {
  MRP_PORTAL_PURCHASES_FAILED_MESSAGE,
  MrpPortalPurchasesError,
  loadMrpPortalPurchases,
  persistMrpPortalPurchaseSnapshot,
  type MrpPortalSnapshotResult
} from "@/services/mrp-portal-purchases.service";
import type { Prisma } from "@prisma/client";

export type UpdateAllMrpResult = { imported: MrpPersistResult; purchases: MrpPortalSnapshotResult; analysis: RunMrpAnalysisResult };

/** Mensagem ao usuário quando a importação deu certo mas a nova análise não foi aplicada. */
export const MRP_ANALYSIS_NOT_APPLIED_MESSAGE = "Os arquivos foram importados, mas a nova análise não pôde ser aplicada. A análise anterior continua vigente.";

/** Compras não são mais enviadas ao MRP: vêm do Portal. */
export const MRP_PURCHASE_UPLOAD_REMOVED_MESSAGE =
  "A planilha de compras não é mais usada no MRP: as compras são lidas automaticamente do Portal.";

/**
 * As planilhas FORAM importadas (fontes gravadas, histórico = sucesso), mas a
 * nova análise não pôde ser aplicada: a análise e a base anteriores continuam
 * vigentes e as fontes novas ficam no histórico, sem uso. A mensagem é a do
 * erro original (`original`). `stage: "purchases"` = falhou a gravação do
 * snapshot das compras do Portal.
 */
export class MrpAnalysisNotAppliedError extends Error {
  constructor(
    readonly imported: MrpPersistResult,
    readonly original: unknown,
    readonly stage: "purchases" | "analysis" = "analysis",
    readonly purchaseImportId: string | null = null
  ) {
    super(original instanceof Error ? original.message : String(original));
    this.name = "MrpAnalysisNotAppliedError";
  }

  get userMessage(): string {
    return this.stage === "purchases" ? MRP_PORTAL_PURCHASES_FAILED_MESSAGE : MRP_ANALYSIS_NOT_APPLIED_MESSAGE;
  }
}

export async function updateAllMrp(params: {
  items: MrpConfirmItem[];
  depositFilter?: string;
  defaultArea?: string;
  userId: string;
  download?: (path: string, bucket: string) => Promise<Buffer>;
  /** Só para testes: substitui a leitura das compras do Portal. */
  loadPurchases?: typeof loadMrpPortalPurchases;
  hooks?: { beforeAnalysisCommit?: (tx: Prisma.TransactionClient) => Promise<void> };
}): Promise<UpdateAllMrpResult> {
  const kinds = new Set(params.items.map((i) => i.kind));
  if (kinds.has("cmp")) throw new MrpImportError(MRP_PURCHASE_UPLOAD_REMOVED_MESSAGE);
  if (!kinds.has("est")) throw new MrpImportError("Anexe a planilha de estoque (MB52).");

  // 1) Compras do Portal ANTES de consumir os anexos: se a consulta falhar, nada
  //    é importado e o usuário pode tentar de novo com os mesmos arquivos.
  //    Zero compras é um resultado válido; erro de consulta, não.
  const loaded = await (params.loadPurchases ?? loadMrpPortalPurchases)();

  const imported = await confirmMrpImport({
    items: params.items,
    depositFilter: params.depositFilter,
    defaultArea: params.defaultArea,
    activateBase: false,
    createdBy: params.userId,
    download: params.download
  });

  let purchases: MrpPortalSnapshotResult;
  try {
    purchases = await persistMrpPortalPurchaseSnapshot(loaded, { createdBy: params.userId });
  } catch (error) {
    throw new MrpAnalysisNotAppliedError(imported, error instanceof MrpPortalPurchasesError ? error.original : error, "purchases");
  }

  let analysis: RunMrpAnalysisResult;
  try {
    analysis = await runMrpAnalysis({
      baseVersionId: imported.baseVersionId,
      stockImportId: imported.stockImportId!,
      purchaseImportId: purchases.purchaseImportId,
      trigger: "FULL_UPDATE",
      userId: params.userId,
      activateBaseVersion: !!imported.baseVersionId,
      hooks: params.hooks?.beforeAnalysisCommit ? { beforeCommit: params.hooks.beforeAnalysisCommit } : undefined
    });
  } catch (error) {
    throw new MrpAnalysisNotAppliedError(imported, error, "analysis", purchases.purchaseImportId);
  }

  return { imported, purchases, analysis };
}
