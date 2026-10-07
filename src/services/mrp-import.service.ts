/**
 * ANÁLISE MRP — importação das planilhas (FASE C), sobre a infra já existente:
 *
 *   navegador ──PUT──▶ Supabase Storage (URL assinada, sem passar pela Vercel)
 *        │
 *        ▼
 *   inspect  : baixa, detecta tipo/aba (analisarArquivo), encaixa nos slots
 *              (receberArquivos) e abre um ImportHistory UPLOADED por arquivo
 *   preview  : recalcula para outro tipo/aba (reatribuir/trocarAba) — sem reenviar
 *   confirm  : parser (ordem e mensagens de processar()) → ImportStagingRow →
 *              validação do staging → UMA transação gravando as fontes MRP
 *
 * Nada vira vigente antes da confirmação; a Base MRP nova só é ATIVADA quando
 * `activateBase` é pedido explicitamente. O motor (analisar) NÃO roda aqui —
 * nenhuma MrpAnalysisRun é criada nesta fase.
 *
 * As regras de leitura moram em src/lib/mrp (puras, testadas contra o HTML).
 */
import { createHash } from "node:crypto";
import { ImportStatus, ImportType, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { MrpImportError, buildMrpFilePreview, buildMrpImportPlan, type MrpImportPlan, type MrpPlanFile } from "@/lib/mrp/import-plan";
import { analyzeMrpWorkbook, assignMrpSlots, emptyMrpSlots, evaluateMrpLock } from "@/lib/mrp/file-detection";
import { MRP_FILE_KIND_IMPORT_TYPE, MRP_FILE_KINDS, isMrpFileKind, type MrpFileKind, type MrpSlots } from "@/lib/mrp/types";
import { readMrpWorkbook } from "@/lib/mrp/workbook";
import { createMrpBaseVersion, getActiveMrpBaseVersion, getMrpDefaultDeposit, toMrpDecimal } from "@/services/mrp-persistence.service";
import { downloadImportFile } from "@/services/import-storage.service";
import { IMPORT_ROW_STATUSES, IMPORT_STAGES, chunk, getImportsBucket } from "@/types/imports";

export { MrpImportError } from "@/lib/mrp/import-plan";

/** Prefixo obrigatório dos arquivos da Análise MRP no bucket. */
export const MRP_UPLOAD_PREFIX = "imports/analise-mrp/";
/** receberArquivos() do HTML considera no máximo 4 arquivos por envio. */
export const MRP_MAX_FILES_PER_BATCH = 4;

const STAGING_BATCH = 500;
const ITEM_BATCH = 500;
const TX_OPTIONS = { maxWait: 15_000, timeout: 240_000 } as const;

const IMPORT_TYPE_TO_KIND: Record<string, MrpFileKind> = {
  [ImportType.MRP_BASE]: "base",
  [ImportType.MRP_STOCK]: "est",
  [ImportType.MRP_PURCHASES]: "cmp"
};

const REASON_LABELS: Record<string, string> = {
  SEM_CODIGO: "sem código de material",
  DUPLICADO: "código repetido — vale a 1ª ocorrência",
  OUTRO_DEPOSITO: "outro depósito"
};

export type MrpUploadedFileRef = {
  fileName: string;
  filePath: string;
  bucket?: string;
  fileSize?: number;
  mimeType?: string;
};

type MrpHistoryMeta = {
  flow: "analise-mrp";
  sha256?: string;
  detectedKind?: MrpFileKind;
  detectedSheet?: string;
  kind?: MrpFileKind;
  sheet?: string;
  sheetNames?: string[];
  confidence?: string;
  warnings?: string[];
  depositFilter?: string;
  defaultArea?: string;
  result?: Record<string, unknown>;
};

function readMeta(value: Prisma.JsonValue | null): MrpHistoryMeta {
  const mrp = value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>).mrp : null;
  return (mrp && typeof mrp === "object" ? mrp : { flow: "analise-mrp" }) as MrpHistoryMeta;
}

function sha256(data: Buffer): string {
  return createHash("sha256").update(data).digest("hex");
}

function assertMrpPath(filePath: string) {
  if (!filePath.startsWith(MRP_UPLOAD_PREFIX)) {
    throw new MrpImportError(`Caminho de arquivo inválido para a Análise MRP (esperado "${MRP_UPLOAD_PREFIX}…").`);
  }
}

/* -------------------------------------------------------------------------- */
/*  inspect                                                                    */
/* -------------------------------------------------------------------------- */

export type MrpInspectSlot = {
  importId: string;
  fileName: string;
  kind: MrpFileKind;
  preview: ReturnType<typeof buildMrpFilePreview>;
};

export type MrpInspectResult = {
  slots: MrpSlots<MrpInspectSlot>;
  /** Arquivos que não puderam ser lidos ou que foram substituídos no slot. */
  rejected: { fileName: string; importId?: string; reason: string }[];
  /** Arquivos além do 4º (o HTML ignora). */
  ignoredFiles: string[];
  lock: ReturnType<typeof evaluateMrpLock>;
  hasActiveBase: boolean;
  depositFilter: string;
  defaultArea: string;
};

/**
 * Lê os arquivos já enviados ao bucket, detecta tipo e aba, encaixa nos slots
 * como o receberArquivos() do HTML e abre um ImportHistory (UPLOADED) por
 * arquivo aceito. Não grava nenhum dado de MRP.
 */
export async function inspectMrpUploads(params: {
  files: MrpUploadedFileRef[];
  importedBy: string;
  depositFilter?: string;
  defaultArea?: string;
  download?: (path: string, bucket: string) => Promise<Buffer>;
}): Promise<MrpInspectResult> {
  const download = params.download ?? ((path, bucket) => downloadImportFile(path, bucket));
  const depositFilter = params.depositFilter ?? (await getMrpDefaultDeposit());
  const defaultArea = params.defaultArea || "Mecânica";
  const files = params.files.slice(0, MRP_MAX_FILES_PER_BATCH);
  const ignoredFiles = params.files.slice(MRP_MAX_FILES_PER_BATCH).map((f) => f.fileName);
  const rejected: MrpInspectResult["rejected"] = [];

  type Detected = { ref: MrpUploadedFileRef; data: Buffer; kind: MrpFileKind; detection: NonNullable<ReturnType<typeof analyzeMrpWorkbook>>; wb: ReturnType<typeof readMrpWorkbook> };
  const detected: Detected[] = [];
  for (const ref of files) {
    assertMrpPath(ref.filePath);
    const data = await download(ref.filePath, ref.bucket || getImportsBucket());
    let wb: ReturnType<typeof readMrpWorkbook>;
    try {
      wb = readMrpWorkbook(data);
    } catch (error) {
      rejected.push({ fileName: ref.fileName, reason: `Erro ao ler ${ref.fileName}: ${(error as Error).message}` });
      continue;
    }
    const detection = analyzeMrpWorkbook(ref.fileName, wb);
    if (!detection) {
      rejected.push({ fileName: ref.fileName, reason: `Não foi possível ler ${ref.fileName}` });
      continue;
    }
    detected.push({ ref, data, kind: detection.kind, detection, wb });
  }

  // Encaixe idêntico ao HTML; quem ficou fora (substituído) é registrado e cancelado.
  const slotted = assignMrpSlots(emptyMrpSlots<Detected>(), detected);
  const kept = new Set(MRP_FILE_KINDS.map((k) => slotted[k]).filter(Boolean));

  const slots = emptyMrpSlots<MrpInspectSlot>();
  for (const d of detected) {
    const slotKind = MRP_FILE_KINDS.find((k) => slotted[k] === d);
    const kind = slotKind ?? d.kind;
    const preview = buildMrpFilePreview(d.ref.fileName, d.wb, { kind, sheet: d.detection.table.sheet, depositFilter, defaultArea });
    const meta: MrpHistoryMeta = {
      flow: "analise-mrp",
      sha256: sha256(d.data),
      detectedKind: d.detection.kind,
      detectedSheet: d.detection.table.sheet,
      kind,
      sheet: d.detection.table.sheet,
      sheetNames: d.detection.sheetNames,
      confidence: preview.diagnosis.confidence,
      warnings: preview.diagnosis.warnings,
      depositFilter,
      defaultArea
    };
    const history = await prisma.importHistory.create({
      data: {
        type: MRP_FILE_KIND_IMPORT_TYPE[kind],
        fileName: d.ref.fileName,
        importedBy: params.importedBy,
        status: kept.has(d) ? ImportStatus.EM_PROCESSAMENTO : ImportStatus.ERRO,
        stage: kept.has(d) ? IMPORT_STAGES.UPLOADED : IMPORT_STAGES.CANCELLED,
        errorMessage: kept.has(d) ? null : "Substituído por outro arquivo do mesmo tipo no envio.",
        bucket: d.ref.bucket || getImportsBucket(),
        filePath: d.ref.filePath,
        fileSize: d.ref.fileSize ?? d.data.byteLength,
        mimeType: d.ref.mimeType ?? null,
        totalRows: preview.dataRows,
        startedAt: new Date(),
        metadata: { mrp: meta } as Prisma.InputJsonValue
      }
    });
    if (slotKind) slots[slotKind] = { importId: history.id, fileName: d.ref.fileName, kind, preview };
    else rejected.push({ fileName: d.ref.fileName, importId: history.id, reason: "Substituído por outro arquivo do mesmo tipo no envio." });
  }

  const hasActiveBase = !!(await getActiveMrpBaseVersion());
  const lock = evaluateMrpLock(
    { base: slots.base && { headers: slots.base.preview.headers }, est: slots.est && { headers: slots.est.preview.headers }, cmp: slots.cmp && { headers: slots.cmp.preview.headers } },
    hasActiveBase
  );
  return { slots, rejected, ignoredFiles, lock, hasActiveBase, depositFilter, defaultArea };
}

/* -------------------------------------------------------------------------- */
/*  preview (reatribuir / trocarAba)                                           */
/* -------------------------------------------------------------------------- */

async function loadOpenHistory(importId: string) {
  const history = await prisma.importHistory.findUnique({ where: { id: importId } });
  if (!history || !(history.type in IMPORT_TYPE_TO_KIND)) throw new MrpImportError("Importação MRP não encontrada.");
  if (history.stage === IMPORT_STAGES.COMPLETED) throw new MrpImportError("Esta importação já foi confirmada — envie o arquivo de novo para importar outra vez.");
  if (history.stage === IMPORT_STAGES.CANCELLED) throw new MrpImportError("Esta importação foi cancelada.");
  if (!history.filePath) throw new MrpImportError("Importação sem arquivo no Storage.");
  return history;
}

/**
 * Prévia para o tipo/aba escolhidos, sem reenviar o arquivo. Grava a escolha no
 * histórico (metadata + type), sem tocar em dados de MRP.
 */
export async function previewMrpImport(params: {
  importId: string;
  kind?: MrpFileKind;
  sheet?: string;
  depositFilter?: string;
  defaultArea?: string;
  download?: (path: string, bucket: string) => Promise<Buffer>;
}) {
  const history = await loadOpenHistory(params.importId);
  const meta = readMeta(history.metadata);
  const download = params.download ?? ((path, bucket) => downloadImportFile(path, bucket));
  const data = await download(history.filePath!, history.bucket || getImportsBucket());
  const kind = params.kind ?? meta.kind ?? IMPORT_TYPE_TO_KIND[history.type];
  const depositFilter = params.depositFilter ?? meta.depositFilter ?? (await getMrpDefaultDeposit());
  const defaultArea = params.defaultArea ?? meta.defaultArea ?? "Mecânica";
  const preview = buildMrpFilePreview(history.fileName, readMrpWorkbook(data), { kind, sheet: params.sheet ?? meta.sheet, depositFilter, defaultArea });

  await prisma.importHistory.update({
    where: { id: history.id },
    data: {
      type: MRP_FILE_KIND_IMPORT_TYPE[kind],
      totalRows: preview.dataRows,
      metadata: {
        mrp: { ...meta, kind, sheet: preview.sheet, depositFilter, defaultArea, confidence: preview.diagnosis.confidence, warnings: preview.diagnosis.warnings }
      } as Prisma.InputJsonValue
    }
  });
  return { importId: history.id, preview };
}

/* -------------------------------------------------------------------------- */
/*  confirm                                                                    */
/* -------------------------------------------------------------------------- */

export type MrpConfirmItem = { importId: string; kind: MrpFileKind; sheet?: string };

export type MrpPersistHooks = {
  /** Só para testes: roda dentro da transação, antes do commit. */
  beforeCommit?: (tx: Prisma.TransactionClient) => Promise<void>;
};

export type MrpPersistResult = {
  baseVersionId?: string;
  baseActivated?: boolean;
  stockImportId?: string;
  purchaseImportId?: string;
  counts: {
    base?: { materials: number; duplicateRows: number; sheets: number; ignoredSheets: string[] };
    stock?: { rowsRead: number; rowsAccepted: number; duplicateRows: number; otherDepositRows: number; depositInfo: string };
    purchases?: { rowsRead: number; rowsAccepted: number };
  };
  warnings: string[];
  /** Texto de resultado no formato do HTML. */
  message: string;
};

/**
 * Confirma a importação: baixa os arquivos, roda o plano (ordem e mensagens de
 * processar()), grava staging, valida e persiste numa transação.
 */
export async function confirmMrpImport(params: {
  items: MrpConfirmItem[];
  depositFilter?: string;
  defaultArea?: string;
  activateBase?: boolean;
  createdBy: string;
  download?: (path: string, bucket: string) => Promise<Buffer>;
  hooks?: MrpPersistHooks;
}): Promise<MrpPersistResult> {
  if (!params.items.length) throw new MrpImportError("Nenhuma planilha informada.");
  for (const item of params.items) if (!isMrpFileKind(item.kind)) throw new MrpImportError(`Tipo de planilha inválido: ${String(item.kind)}`);

  const download = params.download ?? ((path, bucket) => downloadImportFile(path, bucket));
  const depositFilter = params.depositFilter ?? (await getMrpDefaultDeposit());
  const defaultArea = params.defaultArea || "Mecânica";

  const histories = [];
  for (const item of params.items) histories.push({ item, history: await loadOpenHistory(item.importId) });
  const historyIds: Partial<Record<MrpFileKind, string>> = {};
  for (const { item, history } of histories) historyIds[item.kind] = history.id;
  if (new Set(params.items.map((i) => i.kind)).size !== params.items.length) {
    throw new MrpImportError("Cada tipo de planilha pode aparecer só uma vez.");
  }

  // Reserva ANTES de qualquer escrita: só uma confirmação por vez trabalha nestes
  // históricos (a outra é recusada sem tocar no staging dela).
  await claimMrpHistories(Object.values(historyIds));

  try {
    const files: MrpPlanFile[] = [];
    for (const { item, history } of histories) {
      const meta = readMeta(history.metadata);
      const data = await download(history.filePath!, history.bucket || getImportsBucket());
      const wb = readMrpWorkbook(data);
      const sheet = item.sheet ?? meta.sheet ?? analyzeMrpWorkbook(history.fileName, wb)?.table.sheet ?? wb.SheetNames[0];
      files.push({ fileName: history.fileName, wb, kind: item.kind, sheet });
    }
    // Sem Base vigente, a planilha do MRP é obrigatória (equivale à base embutida do HTML).
    if (!files.some((f) => f.kind === "base") && !(await getActiveMrpBaseVersion())) {
      throw new MrpImportError("Não há Base MRP vigente — anexe também a planilha do MRP.");
    }
    const plan = buildMrpImportPlan(files, { depositFilter, defaultArea });
    return await persistMrpImportPlan(plan, {
      historyIds,
      createdBy: params.createdBy,
      activateBase: params.activateBase === true,
      hooks: params.hooks
    });
  } catch (error) {
    await markMrpHistoriesFailed(Object.values(historyIds), error);
    throw error;
  }
}

/** Reserva abandonada (função caiu no meio) pode ser retomada depois disto. */
const STALE_CLAIM_MS = 10 * 60 * 1000;

/**
 * Reserva atômica dos históricos para UMA confirmação: UPLOADED/FAILED (ou
 * reserva abandonada há mais de 10 min) -> VALIDATING. Se algum não puder ser
 * reservado, nenhum é (transação) e a requisição é recusada.
 */
async function claimMrpHistories(ids: string[]) {
  const staleBefore = new Date(Date.now() - STALE_CLAIM_MS);
  await prisma.$transaction(async (tx) => {
    for (const id of ids) {
      const { count } = await tx.importHistory.updateMany({
        where: {
          id,
          OR: [
            { stage: { in: [IMPORT_STAGES.UPLOADED, IMPORT_STAGES.FAILED] } },
            { stage: { in: [IMPORT_STAGES.VALIDATING, IMPORT_STAGES.PROCESSING] }, updatedAt: { lt: staleBefore } }
          ]
        },
        data: { stage: IMPORT_STAGES.VALIDATING, status: ImportStatus.EM_PROCESSAMENTO, errorMessage: null }
      });
      if (count !== 1) throw new MrpImportError("Esta importação já está sendo processada por outra requisição.");
    }
  });
}

/** Marca os históricos como FAILED (fora da transação). A base atual não muda. */
export async function markMrpHistoriesFailed(ids: string[], error: unknown) {
  const message = error instanceof MrpImportError ? error.userMessage : error instanceof Error ? error.message : String(error);
  await prisma.importHistory
    .updateMany({
      where: { id: { in: ids }, NOT: { stage: IMPORT_STAGES.COMPLETED } },
      data: { stage: IMPORT_STAGES.FAILED, status: ImportStatus.ERRO, errorMessage: message.slice(0, 2000), finishedAt: new Date() }
    })
    .catch(() => undefined);
}

/* -------------------------------------------------------------------------- */
/*  staging + transação                                                        */
/* -------------------------------------------------------------------------- */

type StagingRow = Prisma.ImportStagingRowCreateManyInput;

/** Célula crua serializável (Date -> ISO, -0 -> 0) para a trilha de auditoria. */
function rawCells(cells: unknown[]): Prisma.InputJsonValue {
  return cells.map((c) =>
    c instanceof Date ? c.toISOString() : typeof c === "number" ? (Object.is(c, -0) ? 0 : isFinite(c) ? c : String(c)) : c == null ? null : c
  ) as Prisma.InputJsonValue;
}

/** Número em texto exato (o jsonb guardaria o valor, mas o texto é inequívoco). */
const numText = (n: number) => String(n);

function stagingFor(plan: MrpImportPlan, historyIds: Partial<Record<MrpFileKind, string>>): Record<MrpFileKind, StagingRow[]> {
  const out: Record<MrpFileKind, StagingRow[]> = { base: [], est: [], cmp: [] };
  if (plan.base && historyIds.base) {
    const order = new Map(plan.base.result.materials.map((m, i) => [m.code, i]));
    const byCode = new Map(plan.base.result.materials.map((m) => [m.code, m]));
    for (const row of plan.base.result.rows) {
      const final = row.status === "VALID" ? byCode.get(row.code)! : null;
      out.base.push({
        importHistoryId: historyIds.base,
        module: ImportType.MRP_BASE,
        rowNumber: row.sourceRow,
        raw: { sheet: row.sheet, cells: rawCells(row.cells) },
        normalized: final ? { ...final, min: numText(final.min), max: numText(final.max), order: order.get(final.code)! } : Prisma.DbNull,
        status: row.status === "VALID" ? IMPORT_ROW_STATUSES.VALID : IMPORT_ROW_STATUSES.IGNORED,
        errorMessage: row.reason ? REASON_LABELS[row.reason] : null
      });
    }
  }
  if (plan.stock && historyIds.est) {
    const byCode = new Map(plan.stock.result.items.map((it) => [it.code, it]));
    for (const row of plan.stock.result.rows) {
      const it = row.status === "VALID" ? byCode.get(row.code)! : null;
      out.est.push({
        importHistoryId: historyIds.est,
        module: ImportType.MRP_STOCK,
        rowNumber: row.sourceRow,
        raw: { sheet: plan.stock.table.sheet, cells: rawCells(row.cells) },
        normalized: it ? { code: it.code, freeQty: numText(it.freeQty), sourceRow: it.sourceRow } : Prisma.DbNull,
        status: row.status === "VALID" ? IMPORT_ROW_STATUSES.VALID : IMPORT_ROW_STATUSES.IGNORED,
        errorMessage: row.reason ? REASON_LABELS[row.reason] : null
      });
    }
  }
  if (plan.purchases && historyIds.cmp) {
    const bySeq = new Map(plan.purchases.result.items.map((it) => [it.seq, it]));
    for (const row of plan.purchases.result.rows) {
      const it = row.status === "VALID" ? bySeq.get(row.seq!)! : null;
      out.cmp.push({
        importHistoryId: historyIds.cmp,
        module: ImportType.MRP_PURCHASES,
        rowNumber: row.sourceRow,
        raw: { sheet: plan.purchases.table.sheet, cells: rawCells(row.cells) },
        normalized: it ? { ...it, quantity: numText(it.quantity) } : Prisma.DbNull,
        status: row.status === "VALID" ? IMPORT_ROW_STATUSES.VALID : IMPORT_ROW_STATUSES.IGNORED,
        errorMessage: row.reason ? REASON_LABELS[row.reason] : null
      });
    }
  }
  return out;
}

async function readValidStaging<T>(importHistoryId: string, tx: Prisma.TransactionClient): Promise<T[]> {
  const rows = await tx.importStagingRow.findMany({
    where: { importHistoryId, status: IMPORT_ROW_STATUSES.VALID },
    select: { normalized: true },
    orderBy: [{ rowNumber: "asc" }, { id: "asc" }]
  });
  return rows.map((r) => r.normalized as unknown as T);
}

/**
 * Grava o plano: staging (fora da transação) → validação → UMA transação com as
 * fontes MRP e o fechamento dos históricos. Falhou = rollback; o staging fica
 * para diagnóstico e o histórico vira FAILED.
 */
export async function persistMrpImportPlan(
  plan: MrpImportPlan,
  options: { historyIds: Partial<Record<MrpFileKind, string>>; createdBy: string; activateBase: boolean; hooks?: MrpPersistHooks }
): Promise<MrpPersistResult> {
  const { historyIds } = options;
  const kinds = MRP_FILE_KINDS.filter((k) => historyIds[k]);
  for (const k of kinds) {
    const present = k === "base" ? plan.base : k === "est" ? plan.stock : plan.purchases;
    if (!present) throw new MrpImportError(`Planilha "${k}" sem dados no plano.`);
  }

  // 1) staging
  const staging = stagingFor(plan, historyIds);
  for (const k of kinds) {
    const id = historyIds[k]!;
    await prisma.importStagingRow.deleteMany({ where: { importHistoryId: id } });
    for (const batch of chunk(staging[k], STAGING_BATCH)) await prisma.importStagingRow.createMany({ data: batch });
    await prisma.importHistory.update({
      where: { id },
      data: { stage: IMPORT_STAGES.VALIDATING, status: ImportStatus.EM_PROCESSAMENTO, errorMessage: null }
    });
  }

  // 2) validação: o staging gravado tem de bater com o plano.
  const expectedValid: Record<MrpFileKind, number> = {
    base: plan.base?.result.materials.length ?? 0,
    est: plan.stock?.result.items.length ?? 0,
    cmp: plan.purchases?.result.items.length ?? 0
  };
  for (const k of kinds) {
    const valid = await prisma.importStagingRow.count({ where: { importHistoryId: historyIds[k]!, status: IMPORT_ROW_STATUSES.VALID } });
    if (valid !== expectedValid[k] || valid === 0) {
      throw new MrpImportError(`Staging inconsistente para "${k}": ${valid} linhas válidas, esperado ${expectedValid[k]}.`);
    }
    await prisma.importHistory.update({ where: { id: historyIds[k]! }, data: { stage: IMPORT_STAGES.PROCESSING } });
  }

  // 3) transação
  const result = await prisma.$transaction(async (tx) => {
    const out: MrpPersistResult = { counts: {}, warnings: [...plan.warnings], message: "" };
    const now = new Date();

    // Trava de idempotência: cada histórico só é concluído UMA vez. Uma segunda
    // confirmação concorrente espera este lock, encontra COMPLETED e reverte.
    for (const k of kinds) {
      const { count } = await tx.importHistory.updateMany({
        where: { id: historyIds[k]!, NOT: { stage: IMPORT_STAGES.COMPLETED } },
        data: { stage: IMPORT_STAGES.PROCESSING }
      });
      if (count !== 1) throw new MrpImportError("Esta importação já foi confirmada por outra requisição.");
    }

    if (plan.base && historyIds.base) {
      type BaseNorm = { code: string; description: string; group: string; unit: string; min: string; max: string; statusMrp: string; family: string; area: string; sourceSheet: string; sourceRow: number; order: number };
      const rows = (await readValidStaging<BaseNorm>(historyIds.base, tx)).sort((a, b) => a.order - b.order);
      const r = plan.base.result;
      const version = await createMrpBaseVersion(
        {
          fileName: plan.base.file.fileName,
          source: "UPLOAD",
          sheets: r.sheets.map((s) => ({ name: s.name, area: s.area, areaFromSheetName: s.areaFromSheetName, rows: s.dataRows, materials: s.materials })),
          ignoredSheets: r.ignoredSheets,
          defaultArea: plan.defaultArea,
          materials: rows.map((m) => ({ ...m, min: Number(m.min), max: Number(m.max) })),
          metadata: { summary: r.summary, duplicateRows: r.duplicateRows, emptyCodeRows: r.emptyCodeRows, skippedSheets: r.skippedSheets },
          createdBy: options.createdBy,
          importHistoryId: historyIds.base,
          activate: options.activateBase
        },
        tx
      );
      out.baseVersionId = version.id;
      out.baseActivated = version.isActive;
      out.counts.base = { materials: rows.length, duplicateRows: r.duplicateRows, sheets: r.sheets.length, ignoredSheets: r.ignoredSheets };
      await tx.importHistory.update({
        where: { id: historyIds.base },
        data: {
          stage: IMPORT_STAGES.COMPLETED,
          status: ImportStatus.SUCESSO,
          createdRows: rows.length,
          validRows: rows.length,
          ignoredRows: r.duplicateRows + r.emptyCodeRows,
          totalRows: r.rows.length,
          finishedAt: now
        }
      });
    }

    if (plan.stock && historyIds.est) {
      const s = plan.stock.result;
      const rows = await readValidStaging<{ code: string; freeQty: string; sourceRow: number }>(historyIds.est, tx);
      const imp = await tx.mrpStockImport.create({
        data: {
          importHistoryId: historyIds.est,
          fileName: plan.stock.file.fileName,
          sheet: plan.stock.table.sheet,
          depositFilter: s.depositFilter,
          depositInfo: s.depositInfo,
          depositColumnFound: s.depositColumnFound,
          rowsRead: s.rowsRead,
          rowsAccepted: s.rowsAccepted,
          duplicateRows: s.duplicateRows,
          otherDepositRows: s.otherDepositRows,
          createdBy: options.createdBy
        }
      });
      for (const batch of chunk(rows, ITEM_BATCH)) {
        await tx.mrpStockItem.createMany({
          data: batch.map((it) => ({ importId: imp.id, code: it.code, freeQty: toMrpDecimal(Number(it.freeQty)), sourceRow: it.sourceRow }))
        });
      }
      out.stockImportId = imp.id;
      out.counts.stock = { rowsRead: s.rowsRead, rowsAccepted: s.rowsAccepted, duplicateRows: s.duplicateRows, otherDepositRows: s.otherDepositRows, depositInfo: s.depositInfo };
      await tx.importHistory.update({
        where: { id: historyIds.est },
        data: {
          stage: IMPORT_STAGES.COMPLETED,
          status: ImportStatus.SUCESSO,
          createdRows: rows.length,
          validRows: rows.length,
          ignoredRows: s.duplicateRows + s.otherDepositRows + s.emptyCodeRows,
          totalRows: s.rowsRead,
          finishedAt: now
        }
      });
    }

    if (plan.purchases && historyIds.cmp) {
      const c = plan.purchases.result;
      type PurchaseNorm = Omit<(typeof c.items)[number], "quantity"> & { quantity: string };
      const rows = (await readValidStaging<PurchaseNorm>(historyIds.cmp, tx)).sort((a, b) => a.seq - b.seq);
      const imp = await tx.mrpPurchaseImport.create({
        data: {
          importHistoryId: historyIds.cmp,
          fileName: plan.purchases.file.fileName,
          sheet: plan.purchases.table.sheet,
          rowsRead: c.rowsRead,
          rowsAccepted: c.rowsAccepted,
          createdBy: options.createdBy
        }
      });
      for (const batch of chunk(rows, ITEM_BATCH)) {
        await tx.mrpPurchaseItem.createMany({
          data: batch.map((it) => ({
            importId: imp.id,
            seq: it.seq,
            code: it.code,
            text: it.text,
            quantity: toMrpDecimal(Number(it.quantity)),
            requisitionDate: it.requisitionDate,
            receiptDate: it.receiptDate,
            expectedDeliveryDate: it.expectedDeliveryDate,
            requisitionNumber: it.requisitionNumber,
            purchaseOrderNumber: it.purchaseOrderNumber,
            supplier: it.supplier,
            sourceRow: it.sourceRow
          }))
        });
      }
      out.purchaseImportId = imp.id;
      out.counts.purchases = { rowsRead: c.rowsRead, rowsAccepted: c.rowsAccepted };
      await tx.importHistory.update({
        where: { id: historyIds.cmp },
        data: {
          stage: IMPORT_STAGES.COMPLETED,
          status: ImportStatus.SUCESSO,
          createdRows: rows.length,
          validRows: rows.length,
          ignoredRows: c.emptyCodeRows,
          totalRows: c.rowsRead,
          finishedAt: now
        }
      });
    }

    if (options.hooks?.beforeCommit) await options.hooks.beforeCommit(tx);
    out.message = buildResultMessage(plan, out);
    return out;
  }, TX_OPTIONS);

  // O staging já cumpriu o papel; a trilha é o arquivo no bucket + sourceRow.
  await prisma.importStagingRow.deleteMany({ where: { importHistoryId: { in: kinds.map((k) => historyIds[k]!) } } }).catch(() => undefined);
  return result;
}

const fmt = (n: number) => new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 2 }).format(n || 0);

/** Mensagem de resultado no estilo do processar() (sem a análise, que é FASE D). */
function buildResultMessage(plan: MrpImportPlan, out: MrpPersistResult): string {
  const parts: string[] = [];
  if (plan.base) parts.push(`Base do MRP: ${plan.base.result.summary}${out.baseActivated ? " (ativada)" : " (não ativada)"}`);
  if (plan.stock) {
    const s = plan.stock.result;
    parts.push(
      `Estoque: ${fmt(s.rowsAccepted)} materiais · ${s.depositInfo}` +
        (s.duplicateRows ? ` · ${s.duplicateRows} linhas duplicadas descartadas (vale a 1ª)` : "") +
        (s.otherDepositRows ? ` · ${fmt(s.otherDepositRows)} linhas de outros depósitos ignoradas` : "")
    );
  }
  if (plan.purchases) parts.push(`Compras: ${fmt(plan.purchases.result.rowsAccepted)} linhas`);
  return parts.join(" | ");
}

/** Estado de uma importação MRP (para a UI acompanhar). */
export async function getMrpImportState(importId: string) {
  const history = await prisma.importHistory.findUnique({ where: { id: importId } });
  if (!history || !(history.type in IMPORT_TYPE_TO_KIND)) return null;
  return {
    importId: history.id,
    fileName: history.fileName,
    kind: IMPORT_TYPE_TO_KIND[history.type],
    stage: history.stage,
    status: history.status,
    errorMessage: history.errorMessage,
    metadata: readMeta(history.metadata),
    createdAt: history.createdAt
  };
}
