/**
 * Importação do PC-Factory pela infraestrutura Supabase Pro — SOMENTE servidor.
 *
 * FLUXO
 * -----
 *   1. o navegador envia a planilha DIRETO ao bucket privado (URL assinada);
 *   2. `startPcFactoryImport`   cria o ImportHistory apontando para o objeto;
 *   3. `processPcFactoryImport` baixa o arquivo no servidor, lê, valida e grava
 *      cada linha em ImportStagingRow — em fatias, com orçamento de tempo, para
 *      caber na janela da função serverless;
 *   4. `finishPcFactoryImport`  aplica o staging na base oficial DENTRO de uma
 *      única transação.
 *
 * O QUE ISSO CONSERTA
 * -------------------
 * O caminho antigo mandava o XLSX inteiro no corpo de um POST. A Vercel corta o
 * corpo em ~4,5 MB e responde `Request Entity Too Large` em TEXTO — a rota nem
 * chegava a rodar, e o `response.json()` do modal quebrava em "Unexpected token
 * 'R'". Aqui o arquivo nunca passa pela função: vai do navegador ao Storage.
 *
 * E o `replaceAll` legado apagava a base ANTES de gravar, em transações
 * separadas: uma falha no meio deixava a base parcial. Aqui o DELETE e os
 * INSERTs vivem na MESMA transação — falhou, a base antiga continua inteira.
 *
 * REGRAS DE NEGÓCIO
 * -----------------
 * Nenhuma foi reescrita. A leitura, a classificação, a duração oficial
 * (`durationHours`) e a dedução de datas vêm de `buildPcFactoryRecords`, a mesma
 * função que o caminho legado usa.
 */
import { Prisma, ImportStatus, ImportType } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { redactSecrets } from "@/lib/api-response";
import {
  IMPORT_MODULES,
  IMPORT_ROW_STATUSES,
  IMPORT_STAGES,
  chunk,
  resolveLegacyStatus
} from "@/types/imports";
import { downloadImportFile } from "@/services/import-storage.service";
import {
  buildLayoutDiagnostic,
  buildPcFactoryRecords,
  extractStatusColorsFromExcel,
  readPcFactorySource,
  type SheetStatusColor
} from "@/services/importacao/pc-factory-import.service";
import type { PcFactoryImportResult } from "@/types/pc-factory";

/** Linhas gravadas por round-trip. Ver DEFAULT_IMPORT_BATCH_SIZE em @/types/imports. */
const STAGING_BATCH_SIZE = 500;

/**
 * Orçamento de tempo de UMA chamada de `process`.
 *
 * A rota declara `maxDuration = 300`, mas devolver o controle bem antes disso é
 * o que mantém o progresso visível no modal e evita que um timeout da
 * plataforma mate a importação inteira sem deixar rastro. O cliente chama de
 * novo com o `nextOffset` até `done`.
 */
const PROCESS_TIME_BUDGET_MS = 45_000;

/** Teto de linhas por arquivo — trava contra planilha absurda derrubar a função. */
const MAX_ROWS = 500_000;

export class PcFactoryImportError extends Error {
  readonly userMessage: string;
  constructor(userMessage: string, technical?: string) {
    super(technical ?? userMessage);
    this.name = "PcFactoryImportError";
    this.userMessage = userMessage;
  }
}

/* -------------------------------------------------------------------------- */
/*  1) Start                                                                   */
/* -------------------------------------------------------------------------- */

export type StartPcFactoryImportParams = {
  fileName: string;
  /** Caminho do objeto no bucket, devolvido pela URL de upload assinada. */
  filePath: string;
  bucket: string;
  fileSize: number;
  mimeType: string;
  importedBy?: string | null;
};

/**
 * Abre a importação. O arquivo JÁ está no Storage neste ponto.
 *
 * Propaga o erro se não conseguir gravar o histórico: sem registro da tentativa
 * não é seguro seguir e mexer na base oficial.
 */
export async function startPcFactoryImport(
  params: StartPcFactoryImportParams
): Promise<{ importId: string }> {
  const row = await prisma.importHistory.create({
    data: {
      type: ImportType.PC_FACTORY,
      fileName: params.fileName,
      importedBy: params.importedBy ?? null,
      status: resolveLegacyStatus(IMPORT_STAGES.UPLOADED),
      stage: IMPORT_STAGES.UPLOADED,
      bucket: params.bucket,
      filePath: params.filePath,
      fileSize: params.fileSize,
      mimeType: params.mimeType,
      startedAt: new Date(),
      metadata: { module: IMPORT_MODULES.PC_FACTORY, flow: "supabase-storage-staging" }
    },
    select: { id: true }
  });

  // Rastro de auditoria: identificadores e metadados apenas. Nunca a URL
  // assinada, a service role key ou o conteúdo da planilha.
  console.info(
    `[PC_FACTORY_IMPORT_START] importId=${row.id} file="${params.fileName}" bytes=${params.fileSize} path=${params.filePath}`
  );

  return { importId: row.id };
}

/* -------------------------------------------------------------------------- */
/*  2) Process                                                                 */
/* -------------------------------------------------------------------------- */

export type ProcessPcFactoryImportResult = {
  importId: string;
  /** false quando ainda há linhas; o cliente deve chamar de novo com nextOffset. */
  done: boolean;
  nextOffset: number;
  totalRows: number;
  processedRows: number;
  validRows: number;
  ignoredRows: number;
  /** Auditoria completa da leitura — só preenchida quando `done`. */
  audit: PcFactoryAudit | null;
};

export type PcFactoryAudit = {
  layoutType: string;
  sheetUsed: string | null;
  readAs: "xlsx" | "csv";
  delimiterUsed: string | null;
  bomRemoved: boolean;
  totalRows: number;
  validRows: number;
  ignoredRows: number;
  machines: number;
  statuses: number;
  dateMin: string | null;
  dateMax: string | null;
  totalDurationHours: number;
  maintenanceHours: number;
  invalidEndDates: number;
  derivedEndDates: number;
  multiMonthIntervals: number;
  originalVsSegmentedDifference: number;
  missingRecommendedColumns: string[];
  groupsDetected: string[];
  statusDetected: string[];
};

/**
 * Lê o arquivo do Storage e grava as linhas no staging.
 *
 * Idempotente por fatia: cada chamada apaga o que já existia a partir de
 * `offset` antes de gravar, então repetir uma fatia (retry de rede) não duplica.
 */
export async function processPcFactoryImport(params: {
  importId: string;
  offset?: number;
  timeBudgetMs?: number;
}): Promise<ProcessPcFactoryImportResult> {
  const offset = Math.max(0, params.offset ?? 0);
  const deadline = Date.now() + (params.timeBudgetMs ?? PROCESS_TIME_BUDGET_MS);

  const history = await prisma.importHistory.findUnique({
    where: { id: params.importId },
    select: { id: true, type: true, fileName: true, filePath: true, bucket: true, stage: true }
  });

  if (!history) throw new PcFactoryImportError("Importação não encontrada.");
  if (history.type !== ImportType.PC_FACTORY) {
    throw new PcFactoryImportError("Esta importação não é do módulo PC-Factory.");
  }
  if (!history.filePath) {
    throw new PcFactoryImportError(
      "O arquivo desta importação não está no armazenamento.",
      "ImportHistory.filePath vazio"
    );
  }

  if (offset === 0) {
    await prisma.importHistory.update({
      where: { id: history.id },
      data: { stage: IMPORT_STAGES.VALIDATING, status: resolveLegacyStatus(IMPORT_STAGES.VALIDATING) }
    });
  }

  // 1) Baixa e lê. O arquivo é relido a cada fatia: a função é stateless, e
  //    reler um XLSX de 10 mil linhas custa segundos — menos que arriscar um
  //    cache entre invocações que não existe em serverless.
  const buffer = await downloadImportFile(history.filePath, history.bucket ?? undefined);
  const read = readPcFactorySource(buffer, { fileName: history.fileName });

  if (read.layoutType === "UNKNOWN") {
    throw new PcFactoryImportError(
      "Layout do arquivo não reconhecido.",
      buildLayoutDiagnostic(read, { fileName: history.fileName })
    );
  }
  if (read.rows.length > MAX_ROWS) {
    throw new PcFactoryImportError(
      `Arquivo com ${read.rows.length.toLocaleString("pt-BR")} linhas — acima do limite de ${MAX_ROWS.toLocaleString("pt-BR")}.`
    );
  }

  // 2) Converte TODAS as linhas pelas regras oficiais (mesma função do caminho
  //    legado). É barato e em memória; o custo real está na gravação.
  const statusColorMap: Map<string, SheetStatusColor> =
    read.readAs === "csv" ? new Map() : await extractStatusColorsFromExcel(buffer, read.sheetUsed);

  const { records, result } = await buildPcFactoryRecords(
    read.rows,
    { fileName: history.fileName },
    read.sheetUsed,
    statusColorMap,
    read.layoutType,
    read
  );

  // 3) Grava a fatia atual no staging.
  await prisma.importStagingRow.deleteMany({
    where: { importHistoryId: history.id, rowNumber: { gte: offset + 1 } }
  });

  let cursor = offset;
  while (cursor < records.length) {
    const slice = records.slice(cursor, cursor + STAGING_BATCH_SIZE);
    await prisma.importStagingRow.createMany({
      data: slice.map((record, i) => ({
        importHistoryId: history.id,
        module: ImportType.PC_FACTORY,
        // 1-based: é o número que o operador procura no Excel.
        rowNumber: cursor + i + 1,
        // `raw` guarda a linha da planilha; `normalized`, o registro pronto.
        raw: (read.rows[cursor + i] ?? {}) as Prisma.InputJsonValue,
        normalized: serializeRecord(record),
        status: IMPORT_ROW_STATUSES.VALID
      }))
    });
    cursor += slice.length;

    // Devolve o controle antes de a plataforma matar a função.
    if (Date.now() > deadline && cursor < records.length) break;
  }

  const done = cursor >= records.length;
  const audit = done ? buildAudit(result, read) : null;

  await prisma.importHistory.update({
    where: { id: history.id },
    data: {
      totalRows: result.totalRows,
      validRows: cursor,
      ignoredRows: result.ignoredRows,
      errorRows: result.errorRows,
      ...(audit ? { metadata: audit as unknown as Prisma.InputJsonValue } : {})
    }
  });

  return {
    importId: history.id,
    done,
    nextOffset: cursor,
    totalRows: records.length,
    processedRows: cursor,
    validRows: cursor,
    ignoredRows: result.ignoredRows,
    audit
  };
}

/* -------------------------------------------------------------------------- */
/*  3) Finish — aplicação transacional                                         */
/* -------------------------------------------------------------------------- */

export type FinishPcFactoryImportResult = {
  importId: string;
  appliedRows: number;
  replacedRows: number;
  audit: PcFactoryAudit | null;
};

/**
 * Aplica o staging validado em `PcFactoryRecord`, dentro de UMA transação.
 *
 * As travas rodam ANTES de abrir a transação:
 *  - existe ao menos uma linha válida (sem isso, um arquivo vazio zeraria a base);
 *  - nenhuma linha marcada como inválida.
 *
 * Dentro da transação o DELETE e os INSERTs são atômicos: qualquer erro desfaz
 * tudo e a base anterior permanece exatamente como estava.
 */
export async function finishPcFactoryImport(params: {
  importId: string;
  /** Teto da transação. Generoso: 10 mil linhas em lotes de 500. */
  timeoutMs?: number;
}): Promise<FinishPcFactoryImportResult> {
  const history = await prisma.importHistory.findUnique({
    where: { id: params.importId },
    select: { id: true, type: true, stage: true, metadata: true }
  });

  if (!history) throw new PcFactoryImportError("Importação não encontrada.");
  if (history.type !== ImportType.PC_FACTORY) {
    throw new PcFactoryImportError("Esta importação não é do módulo PC-Factory.");
  }
  if (history.stage === IMPORT_STAGES.COMPLETED) {
    throw new PcFactoryImportError("Esta importação já foi aplicada.");
  }

  const [validCount, invalidCount] = await Promise.all([
    prisma.importStagingRow.count({
      where: { importHistoryId: history.id, status: IMPORT_ROW_STATUSES.VALID }
    }),
    prisma.importStagingRow.count({
      where: { importHistoryId: history.id, status: IMPORT_ROW_STATUSES.INVALID }
    })
  ]);

  if (invalidCount > 0) {
    throw new PcFactoryImportError(
      `${invalidCount} linha(s) reprovada(s) na validação. A base atual do PC-Factory NÃO foi alterada.`
    );
  }
  if (validCount === 0) {
    throw new PcFactoryImportError(
      "Nenhuma linha válida para aplicar. A base atual do PC-Factory NÃO foi alterada."
    );
  }

  await prisma.importHistory.update({
    where: { id: history.id },
    data: { stage: IMPORT_STAGES.PROCESSING, status: resolveLegacyStatus(IMPORT_STAGES.PROCESSING) }
  });

  const applied = await prisma.$transaction(
    async (tx) => {
      // Substituição total: a base do PC-Factory é sempre um retrato completo do
      // arquivo. Aqui o DELETE está DENTRO da transação — foi por estar fora que
      // o caminho legado conseguia deixar a base vazia.
      const removed = await tx.pcFactoryRecord.deleteMany({});

      let inserted = 0;
      let cursorId: string | null = null;

      // Pagina o staging por cursor em vez de carregar 10 mil JSONs de uma vez.
      for (;;) {
        const page: Array<{ id: string; normalized: Prisma.JsonValue | null }> =
          await tx.importStagingRow.findMany({
            where: { importHistoryId: history.id, status: IMPORT_ROW_STATUSES.VALID },
            orderBy: { id: "asc" },
            ...(cursorId ? { cursor: { id: cursorId }, skip: 1 } : {}),
            take: STAGING_BATCH_SIZE,
            select: { id: true, normalized: true }
          });

        if (page.length === 0) break;
        cursorId = page[page.length - 1].id;

        const data = page
          .map((row) => deserializeRecord(row.normalized))
          .filter((record): record is Prisma.PcFactoryRecordCreateManyInput => record !== null);

        if (data.length > 0) {
          const created = await tx.pcFactoryRecord.createMany({ data, skipDuplicates: true });
          inserted += created.count;
        }
      }

      if (inserted === 0) {
        // Rollback: o DELETE acima volta atrás e a base anterior é preservada.
        throw new PcFactoryImportError(
          "Nenhum registro pôde ser gravado. A base atual do PC-Factory foi mantida."
        );
      }

      await tx.importStagingRow.updateMany({
        where: { importHistoryId: history.id, status: IMPORT_ROW_STATUSES.VALID },
        data: { status: IMPORT_ROW_STATUSES.APPLIED }
      });

      return { inserted, removed: removed.count };
    },
    { timeout: params.timeoutMs ?? 240_000, maxWait: 15_000 }
  );

  const audit = (history.metadata ?? null) as PcFactoryAudit | null;

  await prisma.importHistory.update({
    where: { id: history.id },
    data: {
      stage: IMPORT_STAGES.COMPLETED,
      status: ImportStatus.SUCESSO,
      finishedAt: new Date(),
      createdRows: applied.inserted,
      validRows: applied.inserted
    }
  });

  return {
    importId: history.id,
    appliedRows: applied.inserted,
    replacedRows: applied.removed,
    audit
  };
}

/* -------------------------------------------------------------------------- */
/*  4) Falha e leitura de estado                                               */
/* -------------------------------------------------------------------------- */

/** Fecha a importação em falha. A base oficial nunca é tocada aqui. */
export async function failPcFactoryImport(importId: string, error: unknown): Promise<void> {
  const technical = redactSecrets(
    error instanceof Error ? error.message : String(error ?? "Falha desconhecida.")
  );
  try {
    await prisma.importHistory.update({
      where: { id: importId },
      data: {
        stage: IMPORT_STAGES.FAILED,
        status: ImportStatus.ERRO,
        finishedAt: new Date(),
        errorMessage: technical.slice(0, 4000)
      }
    });
  } catch (updateError) {
    console.error(
      "[pc-factory/import] Falha ao marcar a importação como FAILED (ignorado).",
      updateError instanceof Error ? updateError.message : updateError
    );
  }
}

export async function getPcFactoryImportState(importId: string) {
  const history = await prisma.importHistory.findUnique({
    where: { id: importId },
    select: {
      id: true,
      type: true,
      fileName: true,
      fileSize: true,
      stage: true,
      status: true,
      totalRows: true,
      validRows: true,
      ignoredRows: true,
      errorRows: true,
      createdRows: true,
      errorMessage: true,
      startedAt: true,
      finishedAt: true,
      metadata: true
    }
  });
  if (!history || history.type !== ImportType.PC_FACTORY) return null;

  const stagingRows = await prisma.importStagingRow.count({ where: { importHistoryId: importId } });

  return {
    ...history,
    startedAt: history.startedAt?.toISOString() ?? null,
    finishedAt: history.finishedAt?.toISOString() ?? null,
    stagingRows
  };
}

/**
 * Descarta o staging de uma importação já encerrada.
 *
 * O staging guarda a planilha crua linha a linha e cresce rápido; a trilha de
 * auditoria é o arquivo original no bucket, que continua lá.
 */
export async function clearPcFactoryStaging(importId: string): Promise<number> {
  const { count } = await prisma.importStagingRow.deleteMany({ where: { importHistoryId: importId } });
  return count;
}

/* -------------------------------------------------------------------------- */
/*  Internos                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * Registro → JSON do staging.
 *
 * As datas viram ISO porque JSONB não tem tipo data; `deserializeRecord` as
 * reconstrói. Sem isso, o `createMany` receberia string onde espera Date.
 */
function serializeRecord(record: Prisma.PcFactoryRecordCreateManyInput): Prisma.InputJsonValue {
  return {
    ...record,
    startDateTime: toIso(record.startDateTime),
    endDateTime: toIso(record.endDateTime)
  } as unknown as Prisma.InputJsonValue;
}

function deserializeRecord(value: Prisma.JsonValue | null): Prisma.PcFactoryRecordCreateManyInput | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const raw = value as Record<string, unknown>;
  if (typeof raw.resourceName !== "string" || !raw.resourceName) return null;

  return {
    ...(raw as unknown as Prisma.PcFactoryRecordCreateManyInput),
    startDateTime: fromIso(raw.startDateTime),
    endDateTime: fromIso(raw.endDateTime)
  };
}

function toIso(value: Prisma.PcFactoryRecordCreateManyInput["startDateTime"]): string | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value as string);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function fromIso(value: unknown): Date | null {
  if (typeof value !== "string" || !value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** Projeta o resultado da leitura no resumo que a tela mostra (TAREFA 14). */
function buildAudit(
  result: PcFactoryImportResult,
  read: { sheetUsed: string | null; readAs: "xlsx" | "csv"; delimiterUsed: string | null; bomRemoved: boolean }
): PcFactoryAudit {
  return {
    layoutType: result.layoutType,
    sheetUsed: read.sheetUsed,
    readAs: read.readAs,
    delimiterUsed: read.delimiterUsed,
    bomRemoved: read.bomRemoved,
    totalRows: result.totalRows,
    validRows: result.totalRows - result.ignoredRows - result.errorRows,
    ignoredRows: result.ignoredRows,
    machines: result.resourcesDetected,
    statuses: result.statusDetected.length,
    dateMin: result.periodDetected.start,
    dateMax: result.periodDetected.end,
    totalDurationHours: result.totalHours,
    maintenanceHours: result.maintenanceHours,
    invalidEndDates: result.invalidEndDatesCount,
    derivedEndDates: result.derivedEndDatesCount,
    multiMonthIntervals: result.multiMonthIntervals,
    originalVsSegmentedDifference: result.originalVsSegmentedDifference,
    missingRecommendedColumns: result.missingRecommendedColumns,
    groupsDetected: result.groupsDetected,
    statusDetected: result.statusDetected
  };
}

/** Reexportado para a rota montar lotes com o mesmo tamanho do staging. */
export { STAGING_BATCH_SIZE, chunk };
