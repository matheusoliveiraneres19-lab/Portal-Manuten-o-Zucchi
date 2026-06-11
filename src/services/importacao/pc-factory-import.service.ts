import * as XLSX from "xlsx";
import { ImportStatus, ImportType, PcFactorySource, PcFactoryStatusCategory } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { limparTexto, normalizarNomeColuna } from "@/utils/importacao";
import {
  buildPcFactoryTechnicalKey,
  classifyPcFactoryStatus,
  combineDateAndTime,
  computeDurationMinutes,
  isElectricalMaintenance,
  isMaintenanceStatus,
  isMechanicalMaintenance,
  isWaitingMaintenance,
  normalizeProductionLine,
  normalizeResourceName,
  parseDurationToMinutes,
  parsePcFactoryDate
} from "@/utils/pc-factory-normalizer";
import type { PcFactoryExcelRow, PcFactoryImportError, PcFactoryImportResult } from "@/types/pc-factory";

/**
 * Mapa flexível: cabeçalho normalizado (sem acento, com "_") -> chave da linha.
 * O campo obrigatório para a regra de manutenção é "Nome Status Recurso".
 */
const COLUMN_MAP: Record<string, keyof PcFactoryExcelRow> = {
  // Recurso / máquina
  recurso: "resourceName",
  nome_recurso: "resourceName",
  nome_do_recurso: "resourceName",
  descricao_recurso: "resourceName",
  maquina: "resourceName",
  equipamento: "resourceName",
  codigo_recurso: "resourceCode",
  codigo_do_recurso: "resourceCode",
  cod_recurso: "resourceCode",
  codigo: "resourceCode",
  // Status (Nome Status Recurso)
  nome_status_recurso: "status",
  nome_do_status_recurso: "status",
  status_recurso: "status",
  status_do_recurso: "status",
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
  // Datas e horas
  data_inicio: "startDate",
  inicio: "startDate",
  data_de_inicio: "startDate",
  data_hora_inicio: "startDate",
  data_fim: "endDate",
  fim: "endDate",
  data_de_fim: "endDate",
  data_hora_fim: "endDate",
  hora_inicio: "startTime",
  hora_de_inicio: "startTime",
  hora_fim: "endTime",
  hora_de_fim: "endTime",
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

/** Importa os registros a partir de linhas já lidas/mapeadas (com upsert e auditoria). */
export async function importPcFactoryRecords(
  rows: PcFactoryExcelRow[],
  options: ImportOptions = {}
): Promise<PcFactoryImportResult> {
  const result: PcFactoryImportResult = {
    totalRows: rows.length,
    importedRows: 0,
    createdRows: 0,
    updatedRows: 0,
    ignoredRows: 0,
    errorRows: 0,
    maintenanceRows: 0,
    mechanicalMaintenanceRows: 0,
    electricalMaintenanceRows: 0,
    waitingMaintenanceRows: 0,
    excludedFromPlannedTimeRows: 0,
    productionRows: 0,
    setupRows: 0,
    operationalLossRows: 0,
    otherRows: 0,
    periodDetected: { start: null, end: null },
    resourcesDetected: 0,
    statusDetected: [],
    errors: []
  };

  const importBatch = options.importBatch ?? `PC-FACTORY-${new Date().toISOString()}`;
  const seenKeys = new Set<string>();
  const resources = new Set<string>();
  const statuses = new Set<string>();
  let minDate: Date | null = null;
  let maxDate: Date | null = null;

  for (let index = 0; index < rows.length; index += 1) {
    const line = index + 2; // +1 cabeçalho, +1 base 1

    try {
      const parsed = parseRow(rows[index], line);
      if (!parsed) {
        result.ignoredRows += 1;
        continue;
      }

      // Auditoria de classificação (conta TODAS as linhas válidas, inclusive as excluídas do tempo planejado).
      tallyClassification(result, parsed.statusRaw, parsed.statusCategory);
      resources.add(parsed.resourceName);
      if (parsed.statusRaw) statuses.add(parsed.statusRaw);
      if (parsed.startDateTime) {
        if (!minDate || parsed.startDateTime < minDate) minDate = parsed.startDateTime;
        if (!maxDate || parsed.startDateTime > maxDate) maxDate = parsed.startDateTime;
      }

      // Dedup dentro do lote.
      if (seenKeys.has(parsed.technicalKey)) {
        result.ignoredRows += 1;
        continue;
      }
      seenKeys.add(parsed.technicalKey);

      const data = {
        resourceCode: parsed.resourceCode,
        resourceName: parsed.resourceName,
        productionLine: parsed.productionLine,
        sector: parsed.sector,
        statusRaw: parsed.statusRaw,
        statusCategory: parsed.statusCategory,
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
        importBatch
      };

      const existing = await prisma.pcFactoryRecord.findUnique({
        where: { technicalKey: parsed.technicalKey },
        select: { id: true }
      });

      if (existing) {
        await prisma.pcFactoryRecord.update({ where: { id: existing.id }, data });
        result.updatedRows += 1;
      } else {
        await prisma.pcFactoryRecord.create({ data: { ...data, technicalKey: parsed.technicalKey } });
        result.createdRows += 1;
      }
      result.importedRows += 1;
    } catch (error) {
      result.errorRows += 1;
      result.errors.push(toImportError(error, line));
    }
  }

  result.resourcesDetected = resources.size;
  result.statusDetected = Array.from(statuses).sort();
  result.periodDetected = {
    start: minDate ? minDate.toISOString() : null,
    end: maxDate ? maxDate.toISOString() : null
  };

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
  statusCategory: PcFactoryStatusCategory;
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
  technicalKey: string;
};

function parseRow(row: PcFactoryExcelRow, line: number): ParsedRow | null {
  const resourceName = normalizeResourceName(row.resourceName) || normalizeResourceName(row.resourceCode);
  if (!resourceName) {
    return null; // linha sem recurso — ignorada
  }

  const statusRaw = optionalText(row.status);
  if (!statusRaw) {
    return null; // linha sem status — ignorada (regra: não importar sem status)
  }
  const statusCategory = classifyPcFactoryStatus(statusRaw);

  const startDateTime = combineDateAndTime(parsePcFactoryDate(row.startDate), row.startTime);
  const endDateTime = combineDateAndTime(parsePcFactoryDate(row.endDate), row.endTime);
  const durationFallback = parseDurationToMinutes(row.duration);

  const durationMinutes = computeDurationMinutes(startDateTime, endDateTime, durationFallback);
  if (durationMinutes <= 0 && !startDateTime && durationFallback === null) {
    throw rowError(line, "Duração", row.duration, "Registro sem duração nem datas de início/fim válidas.");
  }

  const resourceCode = optionalText(row.resourceCode);
  const orderNumber = optionalText(row.orderNumber);

  return {
    resourceCode,
    resourceName,
    productionLine: normalizeProductionLine(row.productionLine),
    sector: optionalText(row.sector),
    statusRaw,
    statusCategory,
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
    technicalKey: buildPcFactoryTechnicalKey({
      resourceName,
      resourceCode,
      startDateTime,
      statusRaw,
      durationMinutes,
      orderNumber
    })
  };
}

function tallyClassification(result: PcFactoryImportResult, statusRaw: string | null, category: PcFactoryStatusCategory): void {
  if (isMaintenanceStatus(statusRaw)) {
    result.maintenanceRows += 1;
    if (isMechanicalMaintenance(statusRaw)) result.mechanicalMaintenanceRows += 1;
    if (isElectricalMaintenance(statusRaw)) result.electricalMaintenanceRows += 1;
    if (isWaitingMaintenance(statusRaw)) result.waitingMaintenanceRows += 1;
  }
  switch (category) {
    case PcFactoryStatusCategory.EXCLUIR_TEMPO_PLANEJADO:
      result.excludedFromPlannedTimeRows += 1;
      break;
    case PcFactoryStatusCategory.PRODUCAO:
      result.productionRows += 1;
      break;
    case PcFactoryStatusCategory.SETUP:
      result.setupRows += 1;
      break;
    case PcFactoryStatusCategory.PARADA_PERDA:
      result.operationalLossRows += 1;
      break;
    case PcFactoryStatusCategory.OUTROS:
    case PcFactoryStatusCategory.OPERACIONAL:
      result.otherRows += 1;
      break;
    default:
      break;
  }
}

async function createImportHistory(result: PcFactoryImportResult, options: ImportOptions): Promise<void> {
  const status =
    result.errorRows === 0
      ? ImportStatus.SUCESSO
      : result.importedRows > 0
        ? ImportStatus.PARCIAL
        : ImportStatus.ERRO;

  await prisma.importHistory.create({
    data: {
      type: ImportType.PC_FACTORY,
      fileName: options.fileName ?? "RELATORIO PC-FACTORY.xlsx",
      importedBy: options.importedBy ?? "importacao-local",
      totalRows: result.totalRows,
      createdRows: result.createdRows,
      updatedRows: result.updatedRows,
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
