/**
 * ANÁLISE MRP — compras lidas do Portal (substitui a planilha de compras).
 *
 *   Compras (PurchaseRecord) ──getPurchaseAnalysisBaseSnapshot──▶ regra v3.1 / retrato atual
 *        └─▶ buildMrpPortalPurchases (puro) ──▶ MrpPurchaseImport source=PORTAL_DB
 *            + MrpPurchaseItem[] (snapshot imutável) ──▶ runMrpAnalysis
 *
 * O run aponta para o SNAPSHOT, nunca para PurchaseRecord: mudanças posteriores
 * nas compras geram outro snapshot no próximo run; o anterior não é tocado.
 * Runs antigos continuam com o MrpPurchaseImport FILE_UPLOAD deles.
 */
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { buildMrpPortalPurchases, portalBatchHasReceiptData, type MrpPortalPurchaseCounts } from "@/lib/mrp/portal-purchases";
import { getLatestPurchaseImportBatch, getPurchaseAnalysisBaseSnapshot } from "@/services/purchases-analysis-base.service";
import { MRP_CURRENT_RUN_CHANGED_MESSAGE, runMrpAnalysis, type RunMrpAnalysisResult } from "@/services/mrp-analysis.service";
import { MrpPersistenceError, toMrpDecimal } from "@/services/mrp-persistence.service";
import { createAuditLog } from "@/services/audit.service";
import { AUDIT_ACTIONS, AUDIT_MODULES } from "@/types/audit";

export const MRP_PURCHASE_SOURCES = ["FILE_UPLOAD", "PORTAL_DB"] as const;
export type MrpPurchaseSource = (typeof MRP_PURCHASE_SOURCES)[number];

/** Regra de leitura gravada no snapshot (auditoria). */
export const MRP_PORTAL_PURCHASE_RULE = "compras-v31-retrato-atual";

export const MRP_PORTAL_PURCHASES_FAILED_MESSAGE =
  "Não foi possível consultar as compras do Portal. A análise anterior continua vigente.";

export const MRP_PORTAL_PURCHASES_NO_RECEIPT_MESSAGE =
  "A importação de compras mais recente do Portal não traz dados de recebimento (Data Recebimento, Previsão de entrega, Quant Pendente). " +
  "Sem eles o MRP não distingue compra pendente de recebida. A análise anterior continua vigente.";

/**
 * Falha ao LER as compras do Portal — nunca confundir com "0 compras".
 * NO_RECEIPT_DATA: o lote atual veio de um export sem as colunas de recebimento
 * (ex.: requisicoes_compra diário); usá-lo marcaria toda compra como em trânsito.
 */
export class MrpPortalPurchasesError extends Error {
  readonly userMessage: string;
  constructor(
    readonly original: unknown,
    readonly kind: "QUERY_FAILED" | "NO_RECEIPT_DATA" = "QUERY_FAILED"
  ) {
    super(original instanceof Error ? original.message : String(original));
    this.name = "MrpPortalPurchasesError";
    this.userMessage = kind === "NO_RECEIPT_DATA" ? MRP_PORTAL_PURCHASES_NO_RECEIPT_MESSAGE : MRP_PORTAL_PURCHASES_FAILED_MESSAGE;
  }
}

export type MrpPortalSnapshotMetadata = {
  rule: typeof MRP_PORTAL_PURCHASE_RULE;
  /** Lote de PurchaseRecord lido (retrato atual); null = Portal sem compras importadas. */
  importBatch: string | null;
  /** Momento da leitura (ISO). */
  syncedAt: string;
  counts: MrpPortalPurchaseCounts;
};

export type MrpPortalSnapshotResult = {
  purchaseImportId: string;
  metadata: MrpPortalSnapshotMetadata;
};

const ITEM_BATCH = 1000;
const TX_OPTIONS = { maxWait: 15_000, timeout: 120_000 } as const;

export type MrpPortalPurchasesLoaded = Awaited<ReturnType<typeof loadMrpPortalPurchases>>;

/** Lê as compras do Portal e converte (sem gravar). Falha de leitura → MrpPortalPurchasesError. */
export async function loadMrpPortalPurchases(today?: Date) {
  let snapshot: Awaited<ReturnType<typeof getPurchaseAnalysisBaseSnapshot>>;
  try {
    snapshot = await getPurchaseAnalysisBaseSnapshot(today);
  } catch (error) {
    throw new MrpPortalPurchasesError(error);
  }
  if (!portalBatchHasReceiptData(snapshot.records)) {
    throw new MrpPortalPurchasesError(`Lote ${snapshot.importBatch} sem colunas de recebimento.`, "NO_RECEIPT_DATA");
  }
  return { importBatch: snapshot.importBatch, readAt: new Date(), ...buildMrpPortalPurchases(snapshot.records) };
}

/** Lê as compras atuais do Portal e grava o snapshot. */
export async function createMrpPortalPurchaseSnapshot(params: {
  createdBy: string | null;
  today?: Date;
  client?: Prisma.TransactionClient;
}): Promise<MrpPortalSnapshotResult> {
  return persistMrpPortalPurchaseSnapshot(await loadMrpPortalPurchases(params.today), params);
}

/**
 * Grava compras já lidas como snapshot (MrpPurchaseImport PORTAL_DB + itens),
 * numa transação. `client` permite rodar dentro de uma transação de teste.
 */
export async function persistMrpPortalPurchaseSnapshot(
  loaded: MrpPortalPurchasesLoaded,
  params: { createdBy: string | null; client?: Prisma.TransactionClient }
): Promise<MrpPortalSnapshotResult> {
  const metadata: MrpPortalSnapshotMetadata = {
    rule: MRP_PORTAL_PURCHASE_RULE,
    importBatch: loaded.importBatch,
    syncedAt: loaded.readAt.toISOString(),
    counts: loaded.counts
  };

  const write = async (tx: Prisma.TransactionClient) => {
    const imp = await tx.mrpPurchaseImport.create({
      data: {
        source: "PORTAL_DB",
        // Sem arquivo: nada de nome fictício. A tela mostra "Compras do Portal".
        fileName: "",
        sheet: "",
        rowsRead: loaded.counts.sourceLines,
        rowsAccepted: loaded.counts.lines,
        metadata: metadata as unknown as Prisma.InputJsonValue,
        createdBy: params.createdBy
      }
    });
    for (let i = 0; i < loaded.items.length; i += ITEM_BATCH) {
      await tx.mrpPurchaseItem.createMany({
        data: loaded.items.slice(i, i + ITEM_BATCH).map((it) => ({
          importId: imp.id,
          seq: it.seq,
          code: it.code,
          text: it.text,
          quantity: toMrpDecimal(it.quantity),
          requisitionDate: it.requisitionDate,
          receiptDate: it.receiptDate,
          expectedDeliveryDate: it.expectedDeliveryDate,
          requisitionNumber: it.requisitionNumber,
          purchaseOrderNumber: it.purchaseOrderNumber,
          supplier: it.supplier,
          sourceRow: null
        }))
      });
    }
    const written = await tx.mrpPurchaseItem.count({ where: { importId: imp.id } });
    if (written !== loaded.items.length) {
      throw new MrpPersistenceError(`Snapshot de compras incompleto: ${written} de ${loaded.items.length}.`);
    }
    return imp.id;
  };

  const purchaseImportId = params.client ? await write(params.client) : await prisma.$transaction(write, TX_OPTIONS);
  return { purchaseImportId, metadata };
}

/** Metadata de um MrpPurchaseImport PORTAL_DB (null para planilha/legado). */
export function readMrpPortalSnapshotMetadata(source: string, metadata: Prisma.JsonValue | null): MrpPortalSnapshotMetadata | null {
  if (source !== "PORTAL_DB" || !metadata || typeof metadata !== "object" || Array.isArray(metadata)) return null;
  return metadata as unknown as MrpPortalSnapshotMetadata;
}

/**
 * Há compras mais recentes no Portal do que no snapshot da análise? Cada
 * importação de compras regrava `importBatch` em todas as linhas do arquivo, então
 * lote diferente = compras reimportadas depois do snapshot. Só para PORTAL_DB.
 * Falha de leitura → null (o aviso simplesmente não aparece).
 */
export async function isMrpPortalSnapshotOutdated(snapshot: MrpPortalSnapshotMetadata | null): Promise<boolean | null> {
  if (!snapshot) return null;
  try {
    return (await getLatestPurchaseImportBatch()) !== snapshot.importBatch;
  } catch {
    return null;
  }
}

export type MrpPurchaseSyncResult =
  | { status: "applied"; previousRunId: string; snapshot: MrpPortalSnapshotResult; analysis: RunMrpAnalysisResult }
  | { status: "skipped"; reason: "NO_CURRENT_RUN" | "CURRENT_RUN_CHANGED" | "NO_RECEIPT_DATA"; previousRunId: string | null; snapshot?: MrpPortalSnapshotResult };

/**
 * PURCHASE_SYNC: recalcula a análise vigente com as compras ATUAIS do Portal,
 * reaproveitando a base e o estoque do run vigente (sem MB52 novo). Sem análise
 * vigente não há o que sincronizar. Se outra atualização trocar a análise
 * vigente durante o cálculo, este run é descartado (a outra vence).
 */
export async function syncMrpWithPortalPurchases(params: { userId: string | null }): Promise<MrpPurchaseSyncResult> {
  const run = await prisma.mrpAnalysisRun.findFirst({
    where: { isCurrent: true },
    select: { id: true, baseVersionId: true, stockImportId: true }
  });
  if (!run) return { status: "skipped", reason: "NO_CURRENT_RUN", previousRunId: null };

  let snapshot: MrpPortalSnapshotResult;
  try {
    snapshot = await createMrpPortalPurchaseSnapshot({ createdBy: params.userId });
  } catch (error) {
    // Export sem colunas de recebimento (ex.: requisicoes_compra diário): a análise vigente fica.
    if (error instanceof MrpPortalPurchasesError && error.kind === "NO_RECEIPT_DATA") {
      return { status: "skipped", reason: "NO_RECEIPT_DATA", previousRunId: run.id };
    }
    throw error;
  }
  try {
    const analysis = await runMrpAnalysis({
      baseVersionId: run.baseVersionId,
      stockImportId: run.stockImportId,
      purchaseImportId: snapshot.purchaseImportId,
      trigger: "PURCHASE_SYNC",
      userId: params.userId,
      expectedCurrentRunId: run.id
    });
    return { status: "applied", previousRunId: run.id, snapshot, analysis };
  } catch (error) {
    if (error instanceof MrpPersistenceError && error.message === MRP_CURRENT_RUN_CHANGED_MESSAGE) {
      return { status: "skipped", reason: "CURRENT_RUN_CHANGED", previousRunId: run.id, snapshot };
    }
    throw error;
  }
}

/** Tempo máximo já gasto pela importação de compras para ainda tentar a sincronização (função serverless de 300 s). */
const SYNC_TIME_BUDGET_MS = 180_000;

/**
 * Chamado DEPOIS de uma importação de compras bem-sucedida (rota e CLI). Nunca
 * lança: as compras já estão gravadas e continuam válidas mesmo que o MRP falhe.
 * Sucesso, desistência e falha ficam na auditoria (mrp_update_success/failed,
 * trigger PURCHASE_SYNC). Se a importação já consumiu quase toda a janela da
 * função, não tenta — a tela do MRP mostra o aviso de compras mais recentes.
 */
export async function syncMrpAfterPurchaseImport(params: {
  userId: string | null;
  userName: string | null;
  ipAddress?: string | null;
  importStartedAt?: number;
}): Promise<MrpPurchaseSyncResult | { status: "failed"; error: string } | { status: "skipped"; reason: "TIME_BUDGET" }> {
  const startedAt = Date.now();
  const audit = (action: string, details: Record<string, unknown>, entityId?: string | null) =>
    createAuditLog({
      action,
      module: AUDIT_MODULES.IMPORTACAO,
      userId: params.userId,
      userName: params.userName,
      entityId: entityId ?? undefined,
      entityName: "Análise MRP — Sincronização de compras",
      ipAddress: params.ipAddress ?? null,
      details: { trigger: "PURCHASE_SYNC", purchasesSource: "PORTAL", routeMs: Date.now() - startedAt, ...details }
    });

  if (params.importStartedAt !== undefined && startedAt - params.importStartedAt > SYNC_TIME_BUDGET_MS) {
    console.warn("[MRP_PURCHASE_SYNC] ignorada: importação de compras longa demais para recalcular o MRP na mesma requisição.");
    return { status: "skipped", reason: "TIME_BUDGET" };
  }
  try {
    const result = await syncMrpWithPortalPurchases({ userId: params.userName ?? params.userId ?? "sincronizacao-compras" });
    if (result.status === "applied") {
      await audit(
        AUDIT_ACTIONS.MRP_UPDATE_SUCCESS,
        {
          result: "MRP_UPDATE_SUCCESS",
          previousRunId: result.previousRunId,
          newRunId: result.analysis.runId,
          baseVersionId: result.analysis.baseVersionId,
          stockImportId: result.analysis.stockImportId,
          purchaseImportId: result.analysis.purchaseImportId,
          snapshotId: result.snapshot.purchaseImportId,
          purchasesImportBatch: result.snapshot.metadata.importBatch,
          pendingCount: result.snapshot.metadata.counts.open,
          receivedCount: result.snapshot.metadata.counts.received,
          purchaseLines: result.snapshot.metadata.counts.lines,
          kpis: result.analysis.kpis,
          metrics: result.analysis.metrics
        },
        result.analysis.runId
      );
    } else if (result.reason === "CURRENT_RUN_CHANGED" || result.reason === "NO_RECEIPT_DATA") {
      await audit(AUDIT_ACTIONS.MRP_UPDATE_FAILED, { result: "MRP_UPDATE_FAILED", stage: "purchase-sync", reason: result.reason, previousRunId: result.previousRunId, newRunId: null }, result.previousRunId);
    }
    console.info(`[MRP_PURCHASE_SYNC] ${result.status}${result.status === "skipped" ? ` (${result.reason})` : ` run=${result.analysis.runId}`}`);
    return result;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[MRP_PURCHASE_SYNC_FAILED]", message);
    await audit(AUDIT_ACTIONS.MRP_UPDATE_FAILED, { result: "MRP_UPDATE_FAILED", stage: "purchase-sync", newRunId: null, error: message });
    return { status: "failed", error: message };
  }
}
