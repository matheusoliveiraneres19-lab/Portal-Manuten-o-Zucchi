import * as XLSX from "xlsx";
import { ImportStatus, ImportType, PcFactorySource, type PcFactoryStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { limparTexto, normalizarNomeColuna } from "@/utils/importacao";
import {
  buildPcFactoryTechnicalKey,
  computeDurationMinutes,
  normalizePcFactoryStatus,
  normalizeProductionLine,
  normalizeResourceName,
  parseDurationToMinutes,
  parsePcFactoryDate
} from "@/utils/pc-factory-normalizer";
import type { PcFactoryExcelRow, PcFactoryImportError, PcFactoryImportResult } from "@/types/pc-factory";

/**
 * Mapa flexível: cabeçalho normalizado (sem acento, com "_") -> chave da linha.
 * Aceita os vários nomes prováveis da exportação do PC-Factory; o layout real
 * pode ser ajustado depois acrescentando entradas aqui.
 */
const COLUMN_MAP: Record<string, keyof PcFactoryExcelRow> = {
  // Recurso / máquina
  recurso: "resourceName",
  maquina: "resourceName",
  equipamento: "resourceName",
  nome_do_recurso: "resourceName",
  nome_recurso: "resourceName",
  descricao_recurso: "resourceName",
  codigo_recurso: "resourceCode",
  codigo_do_recurso: "resourceCode",
  cod_recurso: "resourceCode",
  codigo: "resourceCode",
  // Status
  status_do_recurso: "status",
  status_recurso: "status",
  status: "status",
  situacao: "status",
  estado: "status",
  // Linha / setor / turno
  linha: "productionLine",
  linha_de_producao: "productionLine",
  linha_producao: "productionLine",
  setor: "sector",
  area: "sector",
  turno: "shift",
  // Datas
  data_inicio: "startDateTime",
  inicio: "startDateTime",
  data_hora_inicio: "startDateTime",
  data_de_inicio: "startDateTime",
  data_fim: "endDateTime",
  fim: "endDateTime",
  data_hora_fim: "endDateTime",
  data_de_fim: "endDateTime",
  // Duração
  duracao: "duration",
  tempo: "duration",
  duracao_minutos: "duration",
  duracao_horas: "duration",
  // Ordem / produto
  ordem: "orderNumber",
  ordem_de_producao: "orderNumber",
  op: "orderNumber",
  produto: "productDescription",
  descricao_produto: "productDescription",
  codigo_produto: "productCode",
  cod_produto: "productCode",
  // Operador / observação
  operador: "operatorName",
  nome_operador: "operatorName",
  observacao: "observation",
  obs: "observation",
  observacoes: "observation"
};

type ImportOptions = {
  fileName?: string;
  importedBy?: string;
  importBatch?: string;
  sheetName?: string;
};

/** Lê e mapeia as linhas da planilha a partir de um arquivo ou buffer. */
export function readPcFactoryRows(source: string | Buffer | ArrayBuffer, sheetName?: string): PcFactoryExcelRow[] {
  const workbook =
    typeof source === "string"
      ? XLSX.readFile(source, { cellDates: true })
      : XLSX.read(source, { type: "buffer", cellDates: true });

  const worksheet = sheetName
    ? workbook.Sheets[sheetName] ?? workbook.Sheets[workbook.SheetNames[0]]
    : workbook.Sheets[workbook.SheetNames[0]];

  if (!worksheet) {
    throw new Error("Não foi possível localizar uma aba com dados na planilha do PC-Factory.");
  }

  const rawRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(worksheet, { defval: "", raw: true });
  return rawRows.map(mapRow);
}

function mapRow(row: Record<string, unknown>): PcFactoryExcelRow {
  const mapped: PcFactoryExcelRow = {};
  for (const key of Object.keys(row)) {
    const normalized = normalizarNomeColuna(key);
    const target = COLUMN_MAP[normalized] ?? COLUMN_MAP[normalized.replace(/_/g, "")];
    if (target && mapped[target] === undefined) {
      mapped[target] = row[key];
    }
  }
  return mapped;
}

/** Importa os registros a partir de linhas já lidas/mapeadas. */
export async function importPcFactoryRecords(
  rows: PcFactoryExcelRow[],
  options: ImportOptions = {}
): Promise<PcFactoryImportResult> {
  const result: PcFactoryImportResult = {
    totalRows: rows.length,
    importedRows: 0,
    createdRecords: 0,
    ignoredRows: 0,
    errorRows: 0,
    errors: []
  };

  const importBatch = options.importBatch ?? `PC-FACTORY-${new Date().toISOString()}`;
  // Dedup dentro do próprio lote (planilha pode repetir linhas idênticas).
  const seenKeys = new Set<string>();

  for (let index = 0; index < rows.length; index += 1) {
    const line = index + 2; // +1 cabeçalho, +1 base 1

    try {
      const parsed = parseRow(rows[index], line);
      if (!parsed) {
        result.ignoredRows += 1;
        continue;
      }

      if (parsed.technicalKey && seenKeys.has(parsed.technicalKey)) {
        result.ignoredRows += 1;
        continue;
      }

      if (parsed.technicalKey) {
        const duplicate = await prisma.pcFactoryRecord.findUnique({
          where: { technicalKey: parsed.technicalKey },
          select: { id: true }
        });
        if (duplicate) {
          result.ignoredRows += 1;
          continue;
        }
        seenKeys.add(parsed.technicalKey);
      }

      await prisma.pcFactoryRecord.create({
        data: {
          resourceCode: parsed.resourceCode,
          resourceName: parsed.resourceName,
          productionLine: parsed.productionLine,
          sector: parsed.sector,
          statusRaw: parsed.statusRaw,
          statusNormalized: parsed.statusNormalized,
          startDateTime: parsed.startDateTime,
          endDateTime: parsed.endDateTime,
          durationMinutes: parsed.durationMinutes,
          durationHours: parsed.durationHours,
          orderNumber: parsed.orderNumber,
          productCode: parsed.productCode,
          productDescription: parsed.productDescription,
          operatorName: parsed.operatorName,
          shift: parsed.shift,
          observation: parsed.observation,
          source: PcFactorySource.EXCEL,
          importBatch,
          technicalKey: parsed.technicalKey
        }
      });

      result.createdRecords += 1;
      result.importedRows += 1;
    } catch (error) {
      result.errorRows += 1;
      result.errors.push(toImportError(error, line));
    }
  }

  await createImportHistory(result, options);
  return result;
}

/** Lê o arquivo Excel e importa. Atalho usado pelo script CLI e pela API. */
export async function importPcFactoryFromExcel(
  source: string | Buffer | ArrayBuffer,
  options: ImportOptions = {}
): Promise<PcFactoryImportResult> {
  const rows = readPcFactoryRows(source, options.sheetName);
  return importPcFactoryRecords(rows, options);
}

type ParsedRow = {
  resourceCode: string | null;
  resourceName: string;
  productionLine: string | null;
  sector: string | null;
  statusRaw: string | null;
  statusNormalized: PcFactoryStatus;
  startDateTime: Date | null;
  endDateTime: Date | null;
  durationMinutes: number;
  durationHours: number;
  orderNumber: string | null;
  productCode: string | null;
  productDescription: string | null;
  operatorName: string | null;
  shift: string | null;
  observation: string | null;
  technicalKey: string | null;
};

function parseRow(row: PcFactoryExcelRow, line: number): ParsedRow | null {
  const resourceName = normalizeResourceName(row.resourceName) || normalizeResourceName(row.resourceCode);
  if (!resourceName) {
    // Linha sem identificação de recurso — ignorada (não é erro fatal).
    return null;
  }

  const statusRaw = optionalText(row.status);
  const statusNormalized = normalizePcFactoryStatus(row.status);

  const startDateTime = parsePcFactoryDate(row.startDateTime);
  const endDateTime = parsePcFactoryDate(row.endDateTime);
  const durationFallback = parseDurationToMinutes(row.duration);

  const durationMinutes = computeDurationMinutes(startDateTime, endDateTime, durationFallback);
  if (durationMinutes <= 0 && !startDateTime && durationFallback === null) {
    throw rowError(line, "Duração", row.duration, "Registro sem duração nem datas de início/fim válidas.");
  }

  const resourceCode = optionalText(row.resourceCode);
  const orderNumber = optionalText(row.orderNumber);

  const technicalKey = buildPcFactoryTechnicalKey({
    resourceName,
    resourceCode,
    startDateTime,
    statusNormalized,
    durationMinutes,
    orderNumber
  });

  return {
    resourceCode,
    resourceName,
    productionLine: normalizeProductionLine(row.productionLine),
    sector: optionalText(row.sector),
    statusRaw,
    statusNormalized,
    startDateTime,
    endDateTime,
    durationMinutes,
    durationHours: Math.round((durationMinutes / 60) * 100) / 100,
    orderNumber,
    productCode: optionalText(row.productCode),
    productDescription: optionalText(row.productDescription),
    operatorName: optionalText(row.operatorName),
    shift: optionalText(row.shift),
    observation: optionalText(row.observation),
    technicalKey
  };
}

async function createImportHistory(result: PcFactoryImportResult, options: ImportOptions): Promise<void> {
  const status =
    result.errorRows === 0
      ? ImportStatus.SUCESSO
      : result.createdRecords > 0
        ? ImportStatus.PARCIAL
        : ImportStatus.ERRO;

  await prisma.importHistory.create({
    data: {
      type: ImportType.PC_FACTORY,
      fileName: options.fileName ?? "RELATORIO PC-FACTORY.xlsx",
      importedBy: options.importedBy ?? "importacao-local",
      totalRows: result.totalRows,
      createdRows: result.createdRecords,
      updatedRows: 0,
      errorRows: result.errorRows,
      status,
      errorMessage: result.errors.length ? summarizeErrors(result.errors) : null
    }
  });
}

function optionalText(value: unknown): string | null {
  const text = limparTexto(value);
  return text || null;
}

function rowError(line: number, campo: string, valor: unknown, mensagem: string): PcFactoryImportError {
  return { linha: line, campo, valor, mensagem };
}

function toImportError(error: unknown, line: number): PcFactoryImportError {
  if (error && typeof error === "object" && "linha" in error && "mensagem" in error) {
    return error as PcFactoryImportError;
  }
  return { linha: line, mensagem: error instanceof Error ? error.message : "Erro inesperado ao importar a linha." };
}

function summarizeErrors(errors: PcFactoryImportError[]): string {
  return errors
    .slice(0, 10)
    .map((error) => `Linha ${error.linha}: ${error.mensagem}`)
    .join(" | ");
}
