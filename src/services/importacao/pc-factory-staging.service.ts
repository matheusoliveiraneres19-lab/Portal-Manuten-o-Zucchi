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
 *   4. `previewPcFactoryImport`  mede período, novos e duplicados — sem escrever;
 *   5. `finishPcFactoryImport`  aplica o staging na base oficial DENTRO de uma
 *      única transação.
 *
 * IMPORTAÇÃO INCREMENTAL (2026-09-21)
 * -----------------------------------
 * Até esta data toda importação começava com `deleteMany({})`: a base era um
 * retrato do ÚLTIMO arquivo, e importar setembro apagava janeiro a agosto.
 * Agora o padrão é INCREMENTAL — nada é apagado, e a deduplicação acontece pelo
 * índice único `fingerprint` (`createMany({ skipDuplicates: true })`).
 * REPLACE_PERIOD existe para corrigir um mês e apaga SOMENTE a janela do
 * arquivo. Não há mais delete global em nenhum caminho de importação.
 *
 * O QUE ISSO CONSERTA
 * -------------------
 * O caminho antigo mandava o XLSX inteiro no corpo de um POST. A Vercel corta o
 * corpo em ~4,5 MB e responde `Request Entity Too Large` em TEXTO — a rota nem
 * chegava a rodar, e o `response.json()` do modal quebrava em "Unexpected token
 * 'R'". Aqui o arquivo nunca passa pela função: vai do navegador ao Storage.
 *
 * E o `replaceAll` legado apagava a base ANTES de gravar, em transações
 * separadas: uma falha no meio deixava a base parcial. Aqui qualquer DELETE (só
 * no REPLACE_PERIOD, e só da janela do arquivo) vive na MESMA transação dos
 * INSERTs — falhou, a base antiga continua inteira.
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
import {
  PC_FACTORY_DEFAULT_IMPORT_MODE,
  isPcFactoryImportMode,
  type PcFactoryDetectedPeriod,
  type PcFactoryImportMode,
  type PcFactoryImportPreview
} from "@/types/pc-factory-import-mode";

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

/**
 * Acima disto, não se lê cor de status com o exceljs. Ver o comentário em
 * processPcFactoryImport: é uma trava de MEMÓRIA, não de tempo.
 */
const STATUS_COLOR_MAX_ROWS = 20_000;

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
  /** Todas as abas do arquivo — é o que responde "por que não achou a aba?". */
  sheetNames: string[];
  /** Células de data vazias neutralizadas antes do parse (export do PC-Factory). */
  repairedCells: number;
  /** Cores por status puladas por tamanho do arquivo — o gráfico usa a paleta padrão. */
  statusColorsSkipped: boolean;
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
  // As cores por status são cosméticas (o gráfico tem paleta padrão em
  // @/constants/pc-factory-colors), mas o exceljs carrega a planilha INTEIRA de
  // novo: no export do G0015 são ~1 GB só aqui, somados aos ~950 MB que o
  // sheetjs ainda segura. Acima do teto, pula — melhor cor padrão que OOM.
  const statusColorsSkipped = read.readAs === "xlsx" && read.rows.length > STATUS_COLOR_MAX_ROWS;
  const statusColorMap: Map<string, SheetStatusColor> =
    read.readAs === "csv" || statusColorsSkipped
      ? new Map()
      : await extractStatusColorsFromExcel(buffer, read.sheetUsed);

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
  const audit = done ? buildAudit(result, read, statusColorsSkipped) : null;

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
  /** Registros efetivamente INSERIDOS na base. */
  appliedRows: number;
  /**
   * Registros históricos REMOVIDOS. Em INCREMENTAL é sempre 0 — é o número que
   * prova, no retorno da própria API, que nada do histórico foi apagado. Em
   * REPLACE_PERIOD é quanto havia dentro da janela do arquivo.
   */
  replacedRows: number;
  /** Linhas do arquivo que já existiam na base (mesma fingerprint) e foram puladas. */
  duplicateRows: number;
  mode: PcFactoryImportMode;
  period: PcFactoryDetectedPeriod;
  audit: PcFactoryAudit | null;
};

/**
 * Aplica o staging validado em `PcFactoryRecord`, dentro de UMA transação.
 *
 * INCREMENTAL (padrão) — NENHUM registro é apagado. Os inserts passam por
 * `createMany({ skipDuplicates: true })` sobre o índice único `fingerprint`:
 * evento que já existe é pulado pelo próprio banco, então importar setembro
 * mantém janeiro a agosto intactos e reimportar setembro não duplica horas.
 *
 * REPLACE_PERIOD — apaga SOMENTE a janela do arquivo (`startDateTime` entre o
 * primeiro e o último início detectados) e insere. Nunca a tabela inteira.
 *
 * As travas rodam ANTES de abrir a transação:
 *  - existe ao menos uma linha válida;
 *  - nenhuma linha marcada como inválida;
 *  - em REPLACE_PERIOD, o arquivo tem período datado (sem data não há janela
 *    para apagar, e apagar "tudo" é exatamente o que esta tarefa proíbe).
 *
 * Dentro da transação, DELETE e INSERTs são atômicos: qualquer erro desfaz tudo
 * e a base anterior permanece exatamente como estava.
 */
export async function finishPcFactoryImport(params: {
  importId: string;
  /** Ver PcFactoryImportMode. Ausente = INCREMENTAL (não apaga nada). */
  mode?: PcFactoryImportMode;
  /** Teto da transação. Generoso: 10 mil linhas em lotes de 500. */
  timeoutMs?: number;
}): Promise<FinishPcFactoryImportResult> {
  const mode: PcFactoryImportMode = isPcFactoryImportMode(params.mode)
    ? params.mode
    : PC_FACTORY_DEFAULT_IMPORT_MODE;

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

  // Período REAL do arquivo, lido do staging. É a janela que o REPLACE_PERIOD
  // apaga e o que a tela mostra como "período detectado".
  const period = await detectStagingPeriod(history.id);

  if (mode === "REPLACE_PERIOD" && (!period.start || !period.end)) {
    throw new PcFactoryImportError(
      "Não foi possível identificar o período do arquivo — nenhuma linha tem data de início. " +
        "Use o modo incremental: substituir sem janela definida apagaria dados de outros meses."
    );
  }

  await prisma.importHistory.update({
    where: { id: history.id },
    data: { stage: IMPORT_STAGES.PROCESSING, status: resolveLegacyStatus(IMPORT_STAGES.PROCESSING) }
  });

  const applied = await prisma.$transaction(
    async (tx) => {
      // REPLACE_PERIOD apaga SOMENTE a janela do arquivo. Nunca
      // `deleteMany({})`: apagar a tabela inteira porque um arquivo novo chegou
      // é justamente o que destruía janeiro–agosto ao importar setembro.
      //
      // Registros SEM startDateTime ficam de fora do delete de propósito: não
      // pertencem a janela nenhuma, então não há como afirmar que são deste
      // período. Eles são tratados pela deduplicação por fingerprint.
      let removed = 0;
      if (mode === "REPLACE_PERIOD") {
        const window = resolveReplacementWindow(period);
        if (window) {
          const deleted = await tx.pcFactoryRecord.deleteMany({
            where: { startDateTime: { gte: window.start, lte: window.end } }
          });
          removed = deleted.count;
        }
      }

      let inserted = 0;
      let considered = 0;
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
          considered += data.length;
          // `skipDuplicates` sobre o índice único `fingerprint`: quem já existe
          // é descartado pelo próprio banco. É o que torna a reimportação do
          // mesmo arquivo inofensiva — insere 0 em vez de duplicar horas.
          const created = await tx.pcFactoryRecord.createMany({ data, skipDuplicates: true });
          inserted += created.count;
        }
      }

      // INCREMENTAL com tudo já presente é um resultado LEGÍTIMO (reimportar o
      // mesmo mês), não uma falha: inserir 0 aqui significa "nada novo", e a
      // base continua íntegra. Só o REPLACE_PERIOD precisa ter gravado algo —
      // ele apagou a janela antes, e terminar com 0 deixaria o mês vazio.
      if (mode === "REPLACE_PERIOD" && inserted === 0) {
        // Rollback: o DELETE acima volta atrás e a base anterior é preservada.
        throw new PcFactoryImportError(
          "Nenhum registro pôde ser gravado. A base atual do PC-Factory foi mantida."
        );
      }

      await tx.importStagingRow.updateMany({
        where: { importHistoryId: history.id, status: IMPORT_ROW_STATUSES.VALID },
        data: { status: IMPORT_ROW_STATUSES.APPLIED }
      });

      return { inserted, removed, duplicates: Math.max(0, considered - inserted) };
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
      // Reimportação idempotente: as linhas já existentes entram como
      // "atualizadas" no histórico, não como criadas nem como erro.
      updatedRows: applied.duplicates,
      validRows: applied.inserted,
      // O lote fica identificável no histórico: modo, janela e quanto foi
      // removido. É o que responde "o que esta importação fez com a base".
      metadata: {
        ...((audit ?? {}) as Record<string, unknown>),
        importMode: mode,
        periodStart: period.start,
        periodEnd: period.end,
        periodMonths: period.months,
        insertedRows: applied.inserted,
        duplicateRows: applied.duplicates,
        replacedRows: applied.removed
      } as unknown as Prisma.InputJsonValue
    }
  });

  return {
    importId: history.id,
    appliedRows: applied.inserted,
    replacedRows: applied.removed,
    duplicateRows: applied.duplicates,
    mode,
    period,
    audit
  };
}

/* -------------------------------------------------------------------------- */
/*  3b) Período e prévia — o que a tela mostra ANTES de aplicar                */
/* -------------------------------------------------------------------------- */

/**
 * Período REAL coberto pelas linhas válidas do staging.
 *
 * Lê `startDateTime` — a MESMA data que o modo oficial (G0134) já usa para
 * dizer a que mês um registro pertence. A importação não fatia nem reinterpreta
 * registro nenhum por causa disso: eventos que atravessam a virada do mês
 * (31/08 22:00 → 01/09 06:00) são gravados brutos, como sempre foram.
 *
 * O SQL roda sobre o JSON do staging, então nenhuma linha precisa ser
 * desserializada em memória só para descobrir a janela.
 */
export async function detectStagingPeriod(importId: string): Promise<PcFactoryDetectedPeriod> {
  const rows = await prisma.$queryRaw<Array<{ month: string | null; count: bigint; min: Date | null; max: Date | null }>>`
    select to_char((normalized->>'startDateTime')::timestamptz, 'YYYY-MM') as month,
           count(*)::bigint                                                as count,
           min((normalized->>'startDateTime')::timestamptz)                as min,
           max((normalized->>'startDateTime')::timestamptz)                as max
      from "ImportStagingRow"
     where "importHistoryId" = ${importId}
       and status = ${IMPORT_ROW_STATUSES.VALID}
     group by 1
     order by 1
  `;

  const dated = rows.filter((row) => row.month && row.min && row.max);
  const rowsWithoutDate = rows
    .filter((row) => !row.month)
    .reduce((sum, row) => sum + Number(row.count), 0);

  if (dated.length === 0) {
    return { start: null, end: null, months: [], singleMonth: false, rowsWithoutDate };
  }

  const start = dated.reduce((min, row) => (row.min! < min ? row.min! : min), dated[0].min!);
  const end = dated.reduce((max, row) => (row.max! > max ? row.max! : max), dated[0].max!);

  return {
    start: start.toISOString(),
    end: end.toISOString(),
    months: dated.map((row) => row.month as string),
    singleMonth: dated.length === 1,
    rowsWithoutDate
  };
}

/**
 * JANELA DE SUBSTITUIÇÃO do REPLACE_PERIOD — os meses CIVIS inteiros que o
 * arquivo toca, não o min/max exato das linhas.
 *
 * Por quê: "substituir setembro" quer dizer o mês, não "de 03/09 às 14h até
 * 28/09 às 9h". Um arquivo corrigido quase nunca tem a mesma primeira e última
 * linha do anterior — se a janela fosse o min/max das linhas, sobrariam
 * registros da importação errada nas pontas do mês, que é exatamente o
 * problema que o modo existe para resolver.
 *
 * Continua sem tocar em agosto nem outubro: os limites são o primeiro instante
 * do primeiro mês e o último do último mês DETECTADOS no arquivo. Quando o
 * arquivo cobre vários meses, todos eles entram — e a tela avisa isso com todas
 * as letras antes de o operador confirmar.
 */
export function resolveReplacementWindow(period: PcFactoryDetectedPeriod): { start: Date; end: Date } | null {
  if (period.months.length === 0) return null;

  const first = period.months[0].split("-").map(Number);
  const last = period.months[period.months.length - 1].split("-").map(Number);
  if (first.length !== 2 || last.length !== 2) return null;

  return {
    start: new Date(Date.UTC(first[0], first[1] - 1, 1, 0, 0, 0, 0)),
    // Dia 0 do mês seguinte = último dia deste mês, no último milissegundo.
    end: new Date(Date.UTC(last[0], last[1], 0, 23, 59, 59, 999))
  };
}

/**
 * PRÉVIA da aplicação — tudo que a tela de confirmação precisa, medido de
 * verdade contra o banco antes de qualquer escrita.
 *
 * Nenhuma linha é gravada aqui. A contagem de novos/duplicados compara as
 * fingerprints do staging com as já presentes em `PcFactoryRecord`.
 */
export async function previewPcFactoryImport(importId: string): Promise<PcFactoryImportPreview> {
  const period = await detectStagingPeriod(importId);

  const [{ total, duplicates }] = await prisma.$queryRaw<Array<{ total: bigint; duplicates: bigint }>>`
    select count(*)::bigint                                          as total,
           count(existing."fingerprint")::bigint                     as duplicates
      from "ImportStagingRow" staging
      left join "PcFactoryRecord" existing
        on existing."fingerprint" = staging.normalized->>'fingerprint'
     where staging."importHistoryId" = ${importId}
       and staging.status = ${IMPORT_ROW_STATUSES.VALID}
  `;

  const validRows = Number(total);
  const duplicateRecords = Number(duplicates);

  // MESMA janela que o REPLACE_PERIOD apagaria: o número mostrado na tela é o
  // número de registros que seriam removidos, não uma contagem aproximada.
  const window = resolveReplacementWindow(period);
  const existingInPeriod = window
    ? await prisma.pcFactoryRecord.count({
        where: { startDateTime: { gte: window.start, lte: window.end } }
      })
    : 0;

  return {
    period,
    validRows,
    newRecords: validRows - duplicateRecords,
    duplicateRecords,
    existingInPeriod,
    replacementStart: window ? window.start.toISOString() : null,
    replacementEnd: window ? window.end.toISOString() : null,
    // Só sugere substituir quando o período já tem dados. O padrão continua
    // sendo acrescentar — a operação normal é mensal e não apaga nada.
    suggestedMode: existingInPeriod > 0 ? "REPLACE_PERIOD" : PC_FACTORY_DEFAULT_IMPORT_MODE,
    spansMultipleMonths: period.months.length > 1
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
  read: {
    sheetUsed: string | null;
    readAs: "xlsx" | "csv";
    delimiterUsed: string | null;
    bomRemoved: boolean;
    sheetNames: string[];
    repairedCells: number;
  },
  statusColorsSkipped = false
): PcFactoryAudit {
  return {
    layoutType: result.layoutType,
    sheetUsed: read.sheetUsed,
    sheetNames: read.sheetNames,
    repairedCells: read.repairedCells,
    statusColorsSkipped,
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
