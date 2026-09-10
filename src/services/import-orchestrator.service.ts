/**
 * Orquestrador central de importações — SOMENTE servidor.
 *
 * O QUE ELE RESOLVE
 * -----------------
 * Hoje cada importador faz tudo sozinho: lê a planilha, apaga a base e grava o
 * histórico no fim. O PC-Factory chega a rodar com `replaceAll: true`, ou seja,
 * APAGA a base inteira antes de recarregar — se a planilha falhar no meio, o
 * portal fica sem dado.
 *
 * O orquestrador quebra isso em etapas com ponto de não-retorno explícito:
 *
 *   1. startImport            → cria o ImportHistory (stage = UPLOADED)
 *   2. registerImportUpload   → guarda a planilha no bucket privado
 *   3. addStagingRows         → linhas cruas vão para ImportStagingRow, em lotes
 *   4. markImportAsValidating → validação roda SOBRE O STAGING
 *   5. markImportAsProcessing → só aqui a base oficial começa a ser tocada
 *   6. applyValidatedImport   → aplica em transação; recusa se houver inválida
 *   7. markImportAsCompleted / markImportAsFailed
 *
 * A base oficial só é tocada no passo 6. Qualquer falha antes disso deixa a
 * base ANTERIOR intacta — que é a garantia central desta etapa.
 *
 * ESCOPO DESTA ETAPA
 * ------------------
 * Aqui está só a ARQUITETURA. Nenhum importador existente (PC-Factory, Compras,
 * Ordens de Serviço, Lubrificantes, Locais de Instalação) foi alterado nem
 * passou a usar este orquestrador — a migração de cada um é passo seguinte, e a
 * regra de negócio de cada módulo permanece exatamente como está.
 */
import { Prisma, type ImportStatus, type ImportType } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { redactSecrets } from "@/lib/api-response";
import {
  DEFAULT_IMPORT_BATCH_SIZE,
  IMPORT_ROW_STATUSES,
  IMPORT_STAGES,
  chunk,
  resolveLegacyStatus,
  type ImportModule,
  type ImportResult,
  type ImportRowStatus,
  type ImportStage,
  type ImportSummary,
  type StagingRowInput
} from "@/types/imports";
import {
  ImportStorageNotConfiguredError,
  importStorageConfigured,
  uploadImportFile
} from "@/services/import-storage.service";

/* -------------------------------------------------------------------------- */
/*  1) Abertura                                                                */
/* -------------------------------------------------------------------------- */

export type StartImportParams = {
  module: ImportModule;
  fileName: string;
  importedBy?: string | null;
  fileSize?: number | null;
  mimeType?: string | null;
  metadata?: Record<string, unknown> | null;
};

export type ImportContext = {
  importHistoryId: string;
  module: ImportModule;
  fileName: string;
  startedAt: Date;
};

/**
 * Abre a importação: cria o registro de histórico em `UPLOADED`.
 *
 * Diferente de `createImportHistory` (audit.service), esta função PROPAGA o
 * erro. O histórico é o que protege a base oficial — se não conseguimos nem
 * registrar a tentativa, não é seguro seguir e mexer nos dados.
 */
export async function startImport(params: StartImportParams): Promise<ImportContext> {
  const startedAt = new Date();

  const row = await prisma.importHistory.create({
    data: {
      type: params.module,
      fileName: params.fileName,
      importedBy: params.importedBy ?? null,
      status: resolveLegacyStatus(IMPORT_STAGES.UPLOADED),
      stage: IMPORT_STAGES.UPLOADED,
      fileSize: params.fileSize ?? null,
      mimeType: params.mimeType ?? null,
      startedAt,
      metadata: toJson(params.metadata)
    },
    select: { id: true }
  });

  return { importHistoryId: row.id, module: params.module, fileName: params.fileName, startedAt };
}

/* -------------------------------------------------------------------------- */
/*  2) Arquivo no Storage                                                      */
/* -------------------------------------------------------------------------- */

export type RegisterImportUploadParams = {
  importHistoryId: string;
  module: ImportModule;
  fileName: string;
  body: Buffer | Uint8Array;
  contentType?: string;
};

export type RegisterImportUploadResult = {
  stored: boolean;
  bucket: string | null;
  path: string | null;
  /** Por que não guardou (quando `stored` é false). */
  reason?: string;
};

/**
 * Guarda a planilha original no bucket privado e anota bucket/caminho/tamanho
 * no histórico.
 *
 * NÃO É BLOQUEANTE. Se o Storage não estiver configurado, ou o upload falhar, a
 * importação continua — perder a cópia do arquivo custa auditoria, não dado. O
 * motivo fica em `metadata.storageError` para o administrador ver na tela de
 * detalhes.
 */
export async function registerImportUpload(
  params: RegisterImportUploadParams
): Promise<RegisterImportUploadResult> {
  const fileSize = params.body.byteLength;

  if (!importStorageConfigured()) {
    const reason = new ImportStorageNotConfiguredError().message;
    await mergeMetadata(params.importHistoryId, { storageError: reason });
    await safeUpdate(params.importHistoryId, { fileSize });
    return { stored: false, bucket: null, path: null, reason };
  }

  try {
    const uploaded = await uploadImportFile({
      module: params.module,
      fileName: params.fileName,
      body: params.body,
      contentType: params.contentType
    });

    await safeUpdate(params.importHistoryId, {
      bucket: uploaded.bucket,
      filePath: uploaded.path,
      fileSize: uploaded.fileSize,
      mimeType: uploaded.mimeType
    });

    return { stored: true, bucket: uploaded.bucket, path: uploaded.path };
  } catch (error) {
    const reason = redactSecrets(error instanceof Error ? error.message : String(error));
    console.error("[import] Falha ao guardar o arquivo no Storage (importação segue).", reason);
    await mergeMetadata(params.importHistoryId, { storageError: reason });
    await safeUpdate(params.importHistoryId, { fileSize });
    return { stored: false, bucket: null, path: null, reason };
  }
}

/* -------------------------------------------------------------------------- */
/*  3) Staging                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * Grava as linhas cruas no staging, em lotes.
 *
 * `createMany` por lote em vez de um INSERT gigante: em serverless com
 * `connection_limit=1`, uma transação longa segura a única conexão disponível e
 * derruba todo o resto do portal enquanto a planilha é processada.
 *
 * `skipDuplicates` não é usado: o id é cuid gerado por linha, então duplicata
 * aqui seria bug, e engolir isso silenciosamente esconderia o problema.
 */
export async function addStagingRows(
  importHistoryId: string,
  rows: readonly StagingRowInput[],
  options: { module?: ImportModule; batchSize?: number } = {}
): Promise<number> {
  if (rows.length === 0) return 0;

  // Não chamar de `module`: o ESLint do Next proíbe reatribuir esse nome, que
  // colide com o `module` do CommonJS.
  const importModule = options.module ?? (await getImportModule(importHistoryId));
  const batchSize = options.batchSize ?? DEFAULT_IMPORT_BATCH_SIZE;

  let inserted = 0;
  for (const batch of chunk(rows, batchSize)) {
    const result = await prisma.importStagingRow.createMany({
      data: batch.map((row) => ({
        importHistoryId,
        module: importModule,
        rowNumber: row.rowNumber,
        raw: toJson(row.raw) ?? Prisma.JsonNull,
        normalized: toJson(row.normalized),
        status: row.status ?? IMPORT_ROW_STATUSES.PENDING,
        errorMessage: row.errorMessage ?? null
      }))
    });
    inserted += result.count;
  }

  return inserted;
}

/** Marca o resultado da validação de uma linha já no staging. */
export async function setStagingRowStatus(
  stagingRowId: string,
  status: ImportRowStatus,
  data: { normalized?: Record<string, unknown> | null; errorMessage?: string | null } = {}
): Promise<void> {
  await prisma.importStagingRow.update({
    where: { id: stagingRowId },
    data: {
      status,
      ...(data.normalized !== undefined ? { normalized: toJson(data.normalized) } : {}),
      ...(data.errorMessage !== undefined ? { errorMessage: data.errorMessage } : {})
    }
  });
}

/** Lê o staging de uma importação, com paginação por lote. */
export async function getStagingRows(
  importHistoryId: string,
  options: { status?: ImportRowStatus; skip?: number; take?: number } = {}
) {
  return prisma.importStagingRow.findMany({
    where: { importHistoryId, ...(options.status ? { status: options.status } : {}) },
    orderBy: { rowNumber: "asc" },
    skip: options.skip ?? 0,
    take: Math.min(options.take ?? DEFAULT_IMPORT_BATCH_SIZE, 2000)
  });
}

/** Contagem por status — a base do resumo mostrado na tela de detalhes. */
export async function countStagingRowsByStatus(importHistoryId: string): Promise<Record<string, number>> {
  const grouped = await prisma.importStagingRow.groupBy({
    by: ["status"],
    where: { importHistoryId },
    _count: { _all: true }
  });

  const out: Record<string, number> = {};
  for (const g of grouped) out[g.status] = g._count._all;
  return out;
}

/**
 * Descarta o staging de uma importação já encerrada.
 *
 * O staging é lixo de processo: guarda a planilha crua linha a linha e cresce
 * rápido. O arquivo original no Storage é que é a trilha de auditoria — por
 * isso limpar aqui é seguro. Só roda em estágio terminal, para nunca puxar o
 * tapete de uma importação em andamento.
 */
export async function clearStagingRows(importHistoryId: string): Promise<number> {
  const history = await prisma.importHistory.findUnique({
    where: { id: importHistoryId },
    select: { stage: true }
  });
  if (!history) return 0;
  if (history.stage && !isTerminal(history.stage)) return 0;

  const { count } = await prisma.importStagingRow.deleteMany({ where: { importHistoryId } });
  return count;
}

/* -------------------------------------------------------------------------- */
/*  4-7) Transições de estágio                                                 */
/* -------------------------------------------------------------------------- */

export async function markImportAsValidating(importHistoryId: string, totalRows?: number): Promise<void> {
  await safeUpdate(importHistoryId, {
    stage: IMPORT_STAGES.VALIDATING,
    status: resolveLegacyStatus(IMPORT_STAGES.VALIDATING),
    ...(typeof totalRows === "number" ? { totalRows } : {})
  });
}

export async function markImportAsProcessing(importHistoryId: string, summary: ImportSummary = {}): Promise<void> {
  await safeUpdate(importHistoryId, {
    stage: IMPORT_STAGES.PROCESSING,
    status: resolveLegacyStatus(IMPORT_STAGES.PROCESSING),
    ...counterFields(summary)
  });
}

export async function markImportAsCompleted(
  importHistoryId: string,
  summary: ImportSummary = {}
): Promise<ImportResult> {
  const counts = counterFields(summary);
  const status: ImportStatus = resolveLegacyStatus(IMPORT_STAGES.COMPLETED, {
    errorRows: counts.errorRows,
    validRows: counts.validRows
  });

  const row = await prisma.importHistory.update({
    where: { id: importHistoryId },
    data: {
      stage: IMPORT_STAGES.COMPLETED,
      status,
      finishedAt: new Date(),
      ...counts,
      ...(summary.metadata ? { metadata: toJson(summary.metadata) } : {})
    },
    select: importResultSelect
  });

  return toImportResult(row, summary.message ?? "Importação concluída.");
}

/**
 * Encerra a importação em falha.
 *
 * A mensagem passa por `redactSecrets`: erros de conexão do Prisma trazem a
 * connection string inteira, e este texto vai para o banco e depois para a tela
 * de detalhes no navegador.
 */
export async function markImportAsFailed(
  importHistoryId: string,
  error: unknown,
  summary: ImportSummary = {}
): Promise<ImportResult> {
  const message = redactSecrets(error instanceof Error ? error.message : String(error ?? "Falha na importação."));

  const row = await prisma.importHistory.update({
    where: { id: importHistoryId },
    data: {
      stage: IMPORT_STAGES.FAILED,
      status: resolveLegacyStatus(IMPORT_STAGES.FAILED),
      finishedAt: new Date(),
      errorMessage: message.slice(0, 4000),
      ...counterFields(summary),
      ...(summary.metadata ? { metadata: toJson(summary.metadata) } : {})
    },
    select: importResultSelect
  });

  return toImportResult(row, message);
}

export async function markImportAsCancelled(importHistoryId: string, reason = "Cancelada pelo operador."): Promise<ImportResult> {
  const row = await prisma.importHistory.update({
    where: { id: importHistoryId },
    data: {
      stage: IMPORT_STAGES.CANCELLED,
      status: resolveLegacyStatus(IMPORT_STAGES.CANCELLED),
      finishedAt: new Date(),
      errorMessage: reason.slice(0, 4000)
    },
    select: importResultSelect
  });

  return toImportResult(row, reason);
}

/* -------------------------------------------------------------------------- */
/*  8) Aplicação na base oficial                                               */
/* -------------------------------------------------------------------------- */

export type ApplyImportOptions = {
  /**
   * Aplica as linhas VALID na base oficial. Recebe um cliente TRANSACIONAL —
   * use SÓ ele: `prisma` direto escaparia da transação e a metade gravada
   * sobreviveria a um rollback.
   */
  apply: (tx: Prisma.TransactionClient, rows: ApplicableRow[]) => Promise<ImportSummary | void>;
  /**
   * Deixa passar mesmo com linhas inválidas (aplica só as válidas).
   * Padrão false: a política é tudo-ou-nada.
   */
  allowPartial?: boolean;
  /** Teto da transação em ms. Padrão 120s. */
  timeoutMs?: number;
};

export type ApplicableRow = {
  id: string;
  rowNumber: number;
  raw: Prisma.JsonValue;
  normalized: Prisma.JsonValue | null;
};

/**
 * Aplica o staging validado na base oficial, dentro de UMA transação.
 *
 * É este passo que substitui o `replaceAll` destrutivo: o `apply` recebe o
 * cliente transacional, então "apagar e recarregar" acontece dentro da mesma
 * transação — se a carga falhar, o DELETE volta atrás junto e a base antiga
 * continua lá.
 *
 * Recusa antes de abrir a transação quando há linha INVALID (salvo
 * `allowPartial`) e quando não há nenhuma linha válida — recarregar a base
 * oficial a partir de um staging vazio é justamente como se perde tudo.
 */
export async function applyValidatedImport(
  importHistoryId: string,
  options: ApplyImportOptions
): Promise<ImportSummary> {
  const counts = await countStagingRowsByStatus(importHistoryId);
  const invalid = counts[IMPORT_ROW_STATUSES.INVALID] ?? 0;
  const valid = counts[IMPORT_ROW_STATUSES.VALID] ?? 0;

  if (invalid > 0 && !options.allowPartial) {
    throw new Error(
      `Importação bloqueada: ${invalid} linha(s) reprovada(s) na validação. ` +
        "A base oficial NÃO foi alterada. Corrija a planilha e reenvie."
    );
  }

  if (valid === 0) {
    throw new Error(
      "Importação bloqueada: nenhuma linha válida para aplicar. A base oficial NÃO foi alterada."
    );
  }

  const rows = (await prisma.importStagingRow.findMany({
    where: { importHistoryId, status: IMPORT_ROW_STATUSES.VALID },
    orderBy: { rowNumber: "asc" },
    select: { id: true, rowNumber: true, raw: true, normalized: true }
  })) as ApplicableRow[];

  const summary = await prisma.$transaction(
    async (tx) => {
      const applied = (await options.apply(tx, rows)) ?? {};

      // Dentro da MESMA transação: se o apply reverter, as linhas voltam a VALID
      // e a importação pode ser reaplicada sem duplicar nada.
      await tx.importStagingRow.updateMany({
        where: { importHistoryId, status: IMPORT_ROW_STATUSES.VALID },
        data: { status: IMPORT_ROW_STATUSES.APPLIED }
      });

      return applied;
    },
    { timeout: options.timeoutMs ?? 120_000, maxWait: 10_000 }
  );

  return {
    validRows: valid,
    failedRows: invalid,
    ignoredRows: counts[IMPORT_ROW_STATUSES.IGNORED] ?? 0,
    ...summary
  };
}

/* -------------------------------------------------------------------------- */
/*  Leitura                                                                    */
/* -------------------------------------------------------------------------- */

export async function getImportById(importHistoryId: string) {
  return prisma.importHistory.findUnique({ where: { id: importHistoryId } });
}

/* -------------------------------------------------------------------------- */
/*  Internos                                                                   */
/* -------------------------------------------------------------------------- */

const importResultSelect = {
  id: true,
  type: true,
  stage: true,
  totalRows: true,
  validRows: true,
  ignoredRows: true,
  errorRows: true
} as const;

type ImportResultRow = {
  id: string;
  type: ImportType;
  stage: string | null;
  totalRows: number;
  validRows: number;
  ignoredRows: number;
  errorRows: number;
};

function toImportResult(row: ImportResultRow, message: string): ImportResult {
  const stage = (row.stage ?? IMPORT_STAGES.COMPLETED) as ImportStage;
  return {
    success: stage === IMPORT_STAGES.COMPLETED,
    importId: row.id,
    // ImportModule é o subconjunto de ImportType coberto pela infra. A linha lida
    // aqui foi criada por startImport, que só aceita ImportModule — o cast é o
    // estreitamento que o Prisma não consegue provar sozinho.
    module: row.type as ImportModule,
    status: stage,
    totalRows: row.totalRows,
    validRows: row.validRows,
    ignoredRows: row.ignoredRows,
    failedRows: row.errorRows,
    message
  };
}

/** `failedRows` do contrato público mapeia para a coluna legada `errorRows`. */
function counterFields(summary: ImportSummary) {
  const out: {
    totalRows?: number;
    validRows?: number;
    ignoredRows?: number;
    errorRows?: number;
    createdRows?: number;
    updatedRows?: number;
  } = {};
  if (typeof summary.totalRows === "number") out.totalRows = summary.totalRows;
  if (typeof summary.validRows === "number") out.validRows = summary.validRows;
  if (typeof summary.ignoredRows === "number") out.ignoredRows = summary.ignoredRows;
  if (typeof summary.failedRows === "number") out.errorRows = summary.failedRows;
  if (typeof summary.createdRows === "number") out.createdRows = summary.createdRows;
  if (typeof summary.updatedRows === "number") out.updatedRows = summary.updatedRows;
  return out;
}

function isTerminal(stage: string): boolean {
  return (
    stage === IMPORT_STAGES.COMPLETED || stage === IMPORT_STAGES.FAILED || stage === IMPORT_STAGES.CANCELLED
  );
}

function toJson(value: unknown): Prisma.InputJsonValue | undefined {
  if (value === null || value === undefined) return undefined;
  return value as Prisma.InputJsonValue;
}

async function getImportModule(importHistoryId: string): Promise<ImportModule> {
  const row = await prisma.importHistory.findUnique({
    where: { id: importHistoryId },
    select: { type: true }
  });
  if (!row) throw new Error(`Histórico de importação ${importHistoryId} não encontrado.`);
  return row.type as ImportModule;
}

/**
 * Funde chaves em `metadata` sem perder o que já estava lá.
 * BEST-EFFORT: metadata é contexto, nunca motivo para derrubar a importação.
 */
async function mergeMetadata(importHistoryId: string, patch: Record<string, unknown>): Promise<void> {
  try {
    const row = await prisma.importHistory.findUnique({
      where: { id: importHistoryId },
      select: { metadata: true }
    });
    const current = (row?.metadata && typeof row.metadata === "object" && !Array.isArray(row.metadata)
      ? row.metadata
      : {}) as Record<string, unknown>;

    await prisma.importHistory.update({
      where: { id: importHistoryId },
      data: { metadata: { ...current, ...patch } as Prisma.InputJsonValue }
    });
  } catch (error) {
    console.error("[import] Falha ao atualizar metadata (ignorado).", error instanceof Error ? error.message : error);
  }
}

/** Atualização best-effort do histórico — nunca derruba a importação em si. */
async function safeUpdate(importHistoryId: string, data: Prisma.ImportHistoryUpdateInput): Promise<void> {
  try {
    await prisma.importHistory.update({ where: { id: importHistoryId }, data });
  } catch (error) {
    console.error(
      "[import] Falha ao atualizar histórico (ignorado).",
      error instanceof Error ? error.message : error
    );
  }
}
