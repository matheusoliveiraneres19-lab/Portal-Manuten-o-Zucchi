import * as XLSX from "xlsx";
import { ImportStatus, ImportType, PcFactorySource, PcFactoryStatusCategory } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { converterNumeroBrasileiro, limparTexto, normalizarNomeColuna } from "@/utils/importacao";
import {
  buildPcFactoryTechnicalKey,
  classifyPcFactoryStatus,
  combineDateAndTime,
  computeDurationMinutes,
  isAutomationMaintenance,
  isDowntimeForAvailability,
  isElectricalMaintenance,
  isExcludedFromPlannedTime,
  isMaintenanceStatus,
  isMechanicalMaintenance,
  isWaitingMaintenance,
  maintenanceKind,
  normalizeProductionLine,
  normalizeResourceName,
  parseAgGridElapsedToMinutes,
  parseDurationToMinutes,
  parsePcFactoryDate
} from "@/utils/pc-factory-normalizer";
import type { PcFactoryExcelRow, PcFactoryImportError, PcFactoryImportResult } from "@/types/pc-factory";

/**
 * Abas preferidas, em ordem. A aba ajustada `Import_PC_FACTORY` é a fonte
 * canônica; caso ausente, aceita a aba bruta `ag-grid`; senão, a primeira aba.
 */
const PREFERRED_SHEETS = ["Import_PC_FACTORY", "ag-grid"];

/**
 * Mapa flexível: cabeçalho normalizado (sem acento, com "_" e também sem separadores)
 * -> chave da linha. Cobre TANTO a aba ajustada `Import_PC_FACTORY` (camelCase em inglês)
 * QUANTO a aba bruta `ag-grid` (cabeçalhos em português do PC-Factory).
 * O campo obrigatório para a regra de manutenção é "Nome Status Recurso" / statusRaw.
 */
const COLUMN_MAP: Record<string, keyof PcFactoryExcelRow> = {
  // Recurso / máquina
  recurso: "resourceName",
  nome_recurso: "resourceName",
  nome_do_recurso: "resourceName",
  descricao_recurso: "resourceName",
  apelido_recurso: "resourceName", // ag-grid: "Apelido Recurso"
  maquina: "resourceName",
  equipamento: "resourceName",
  resourcename: "resourceName", // Import_PC_FACTORY
  codigo_recurso: "resourceCode",
  codigo_do_recurso: "resourceCode",
  cod_recurso: "resourceCode",
  codigo: "resourceCode",
  resourcecode: "resourceCode",
  // Status (Nome Status Recurso)
  nome_status_recurso: "status",
  nome_do_status_recurso: "status",
  status_recurso: "status",
  status_do_recurso: "status",
  status: "status",
  situacao: "status",
  estado: "status",
  statusraw: "status",
  // Detalhes do status
  detalhes_status_recurso: "statusDetails", // ag-grid: "Detalhes Status Recurso"
  detalhes_do_status_recurso: "statusDetails",
  statusdetails: "statusDetails",
  // Linha / grupo / setor / turno
  linha: "productionLine",
  linha_de_producao: "productionLine",
  linha_producao: "productionLine",
  productionline: "productionLine",
  grupo_portal: "groupPortal",
  grupo: "groupPortal",
  groupportal: "groupPortal",
  setor: "sector",
  area: "sector",
  sector: "sector",
  turno: "shift",
  shift: "shift",
  // Datas e horas
  data_inicio: "startDate",
  inicio: "startDate", // ag-grid: "Início"
  data_de_inicio: "startDate",
  data_hora_inicio: "startDate",
  startdatetime: "startDate", // Import_PC_FACTORY
  data_fim: "endDate",
  fim: "endDate",
  termino: "endDate", // ag-grid: "Término"
  data_de_fim: "endDate",
  data_hora_fim: "endDate",
  enddatetime: "endDate",
  hora_inicio: "startTime",
  hora_de_inicio: "startTime",
  hora_fim: "endTime",
  hora_de_fim: "endTime",
  // Duração — minutos explícitos, horas explícitas, fração-de-dia (ag-grid) e genérica
  duracao_minutos: "durationMinutes",
  durationminutes: "durationMinutes",
  duracao_horas: "durationHours",
  durationhours: "durationHours",
  tempo_decorrido_hr: "elapsedDayFraction", // ag-grid: "Tempo Decorrido [hr]"
  tempo_decorrido_real_hr: "elapsedDayFraction", // ag-grid: "Tempo Decorrido Real[hr]" (preferido)
  duracao: "duration",
  tempo: "duration",
  // Ordem / operação / produto
  ordem: "orderNumber",
  ordem_de_producao: "orderNumber",
  op: "orderNumber",
  cod_da_ordem: "orderNumber", // ag-grid: "Cód. da Ordem"
  ordernumber: "orderNumber",
  cod_da_operacao: "operationCode", // ag-grid: "Cód da Operação"
  cod_operacao: "operationCode",
  operationcode: "operationCode",
  nome_da_operacao: "operationName", // ag-grid: "Nome da Operação"
  operationname: "operationName",
  produto: "productDescription",
  descricao_produto: "productDescription",
  nome_produto: "productDescription", // ag-grid: "Nome Produto"
  productdescription: "productDescription",
  codigo_produto: "productCode",
  cod_produto: "productCode", // ag-grid: "Cód. Produto"
  productcode: "productCode",
  // Responsáveis / operador
  operador: "operatorName",
  nome_operador: "operatorName", // ag-grid: "Nome Operador"
  operatorname: "operatorName",
  resp_inicial: "initialResponsible", // ag-grid: "Resp.Inicial"
  responsavel_inicial: "initialResponsible",
  initialresponsible: "initialResponsible",
  resp_final: "finalResponsible", // ag-grid: "Resp.Final"
  responsavel_final: "finalResponsible",
  finalresponsible: "finalResponsible",
  // Observação / causa raiz / qualidade
  observacao: "observation",
  obs: "observation",
  observacoes: "observation",
  comentarios: "observation", // ag-grid: "Comentários" / Import: comments
  comments: "observation",
  causa_raiz: "rootCause", // ag-grid: "Causa Raiz"
  rootcause: "rootCause"
};

type ImportOptions = {
  fileName?: string;
  importedBy?: string;
  importBatch?: string;
  sheetName?: string;
};

type ReadResult = { rows: PcFactoryExcelRow[]; sheetUsed: string | null };

/** Lê e mapeia as linhas da planilha a partir de um arquivo ou buffer. */
export function readPcFactoryRows(source: string | Buffer | ArrayBuffer, sheetName?: string): PcFactoryExcelRow[] {
  return readPcFactorySheet(source, sheetName).rows;
}

/** Lê a planilha resolvendo a aba preferida e devolve as linhas e o nome da aba usada. */
export function readPcFactorySheet(source: string | Buffer | ArrayBuffer, sheetName?: string): ReadResult {
  const workbook =
    typeof source === "string"
      ? XLSX.readFile(source, { cellDates: true })
      : XLSX.read(source, { type: "buffer", cellDates: true });

  const resolvedName = resolveSheetName(workbook.SheetNames, sheetName);
  const worksheet = resolvedName ? workbook.Sheets[resolvedName] : undefined;

  if (!worksheet) {
    throw new Error("Não foi possível localizar uma aba com dados na planilha do PC-Factory.");
  }

  const rawRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(worksheet, { defval: "", raw: true });
  return { rows: rawRows.map(mapRow), sheetUsed: resolvedName };
}

/** Resolve a aba a ler: explícita > Import_PC_FACTORY > ag-grid > primeira. Case-insensitive. */
function resolveSheetName(sheetNames: string[], requested?: string): string | null {
  if (sheetNames.length === 0) return null;
  const find = (name: string) => sheetNames.find((s) => s.trim().toLowerCase() === name.trim().toLowerCase());

  if (requested) {
    return find(requested) ?? sheetNames[0];
  }
  for (const preferred of PREFERRED_SHEETS) {
    const match = find(preferred);
    if (match) return match;
  }
  return sheetNames[0];
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
  options: ImportOptions = {},
  sheetUsed: string | null = null
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
    automationMaintenanceRows: 0,
    waitingMaintenanceRows: 0,
    excludedFromPlannedTimeRows: 0,
    productionRows: 0,
    setupRows: 0,
    operationalLossRows: 0,
    otherRows: 0,
    dataQualityRows: 0,
    sheetUsed,
    periodDetected: { start: null, end: null },
    resourcesDetected: 0,
    groupsDetected: [],
    statusDetected: [],
    errors: []
  };

  const importBatch = options.importBatch ?? `PC-FACTORY-${new Date().toISOString()}`;
  const seenKeys = new Set<string>();
  const resources = new Set<string>();
  const groups = new Set<string>();
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
      if (parsed.dataQualityIssue) result.dataQualityRows += 1;
      resources.add(parsed.resourceName);
      if (parsed.groupPortal) groups.add(parsed.groupPortal);
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
        groupPortal: parsed.groupPortal,
        sector: parsed.sector,
        statusRaw: parsed.statusRaw,
        statusDetails: parsed.statusDetails,
        statusCategory: parsed.statusCategory,
        maintenanceType: parsed.maintenanceType,
        isMaintenanceKpi: parsed.isMaintenanceKpi,
        excludePlannedTime: parsed.excludePlannedTime,
        isDowntimeForAvailability: parsed.isDowntimeForAvailability,
        startDateTime: parsed.startDateTime,
        endDateTime: parsed.endDateTime,
        durationMinutes: parsed.durationMinutes,
        durationHours: parsed.durationHours,
        initialResponsible: parsed.initialResponsible,
        finalResponsible: parsed.finalResponsible,
        operatorName: parsed.operatorName,
        orderNumber: parsed.orderNumber,
        operationCode: parsed.operationCode,
        operationName: parsed.operationName,
        productCode: parsed.productCode,
        productDescription: parsed.productDescription,
        shift: parsed.shift,
        observation: parsed.observation,
        rootCause: parsed.rootCause,
        dataQualityIssue: parsed.dataQualityIssue,
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
  result.groupsDetected = Array.from(groups).sort();
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
  const { rows, sheetUsed } = readPcFactorySheet(source, options.sheetName);
  return importPcFactoryRecords(rows, options, sheetUsed);
}

type ParsedRow = {
  resourceCode: string | null;
  resourceName: string;
  productionLine: string | null;
  groupPortal: string | null;
  sector: string | null;
  statusRaw: string | null;
  statusDetails: string | null;
  statusCategory: PcFactoryStatusCategory;
  maintenanceType: string | null;
  isMaintenanceKpi: boolean;
  excludePlannedTime: boolean;
  isDowntimeForAvailability: boolean;
  startDateTime: Date | null;
  endDateTime: Date | null;
  durationMinutes: number;
  durationHours: number;
  initialResponsible: string | null;
  finalResponsible: string | null;
  operatorName: string | null;
  orderNumber: string | null;
  operationCode: string | null;
  operationName: string | null;
  productCode: string | null;
  productDescription: string | null;
  shift: string | null;
  observation: string | null;
  rootCause: string | null;
  dataQualityIssue: string | null;
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

  // Classificação derivada de statusRaw (fonte da verdade — independe de colunas pré-calculadas).
  const statusCategory = classifyPcFactoryStatus(statusRaw);
  const kind = maintenanceKind(statusRaw);
  const isMaintenanceKpi = isMaintenanceStatus(statusRaw);
  const excludePlannedTime = isExcludedFromPlannedTime(statusRaw);
  const downtimeForAvailability = isDowntimeForAvailability(statusRaw);

  const startDateTime = combineDateAndTime(parsePcFactoryDate(row.startDate), row.startTime);
  const endDateTime = combineDateAndTime(parsePcFactoryDate(row.endDate), row.endTime);
  const durationFallback = resolveFallbackMinutes(row);

  const durationMinutes = computeDurationMinutes(startDateTime, endDateTime, durationFallback);
  if (durationMinutes <= 0 && !startDateTime && durationFallback === null) {
    throw rowError(line, "Duração", row.duration, "Registro sem duração nem datas de início/fim válidas.");
  }

  const resourceCode = optionalText(row.resourceCode);
  const orderNumber = optionalText(row.orderNumber);
  const operationCode = optionalText(row.operationCode);

  return {
    resourceCode,
    resourceName,
    productionLine: normalizeProductionLine(row.productionLine),
    groupPortal: optionalText(row.groupPortal),
    sector: optionalText(row.sector),
    statusRaw,
    statusDetails: optionalText(row.statusDetails),
    statusCategory,
    maintenanceType: kind,
    isMaintenanceKpi,
    excludePlannedTime,
    isDowntimeForAvailability: downtimeForAvailability,
    startDateTime,
    endDateTime,
    durationMinutes,
    durationHours: Math.round((durationMinutes / 60) * 100) / 100,
    initialResponsible: optionalText(row.initialResponsible),
    finalResponsible: optionalText(row.finalResponsible),
    operatorName: optionalText(row.operatorName),
    orderNumber,
    operationCode,
    operationName: optionalText(row.operationName),
    productCode: optionalText(row.productCode),
    productDescription: optionalText(row.productDescription),
    shift: optionalText(row.shift),
    observation: optionalText(row.observation),
    rootCause: optionalText(row.rootCause),
    dataQualityIssue: detectDataQualityIssue(statusCategory, startDateTime, endDateTime, durationMinutes),
    technicalKey: buildPcFactoryTechnicalKey({
      resourceName,
      resourceCode,
      startDateTime,
      statusRaw,
      durationMinutes,
      orderNumber: orderNumber ?? operationCode
    })
  };
}

/**
 * Resolve a duração de fallback (minutos), respeitando a origem da coluna:
 * 1) durationMinutes explícito; 2) durationHours real (×60);
 * 3) "Tempo Decorrido [hr]" da aba bruta (fração de dia, regra <1.5 → ×24);
 * 4) coluna genérica de duração.
 */
function resolveFallbackMinutes(row: PcFactoryExcelRow): number | null {
  const explicitMinutes = parsePlainNumber(row.durationMinutes);
  if (explicitMinutes !== null && explicitMinutes >= 0) return round(explicitMinutes);

  const explicitHours = parsePlainNumber(row.durationHours);
  if (explicitHours !== null && explicitHours >= 0) return round(explicitHours * 60);

  if (row.elapsedDayFraction !== undefined && row.elapsedDayFraction !== "") {
    const fromElapsed = parseAgGridElapsedToMinutes(row.elapsedDayFraction);
    if (fromElapsed !== null) return fromElapsed;
  }

  return parseDurationToMinutes(row.duration);
}

function parsePlainNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (value === undefined || value === null || value === "") return null;
  return converterNumeroBrasileiro(limparTexto(value));
}

/** Sinaliza problemas simples de qualidade para o painel de diagnóstico (TAREFA 8). */
function detectDataQualityIssue(
  category: PcFactoryStatusCategory,
  start: Date | null,
  end: Date | null,
  durationMinutes: number
): string | null {
  if (start && end && end.getTime() < start.getTime()) return "Término anterior ao início";
  if (durationMinutes <= 0) return "Duração ausente ou zero";
  if (category === PcFactoryStatusCategory.OUTROS) return "Status não reconhecido pela regra do portal";
  return null;
}

function tallyClassification(result: PcFactoryImportResult, statusRaw: string | null, category: PcFactoryStatusCategory): void {
  if (isMaintenanceStatus(statusRaw)) {
    result.maintenanceRows += 1;
    if (isMechanicalMaintenance(statusRaw)) result.mechanicalMaintenanceRows += 1;
    if (isElectricalMaintenance(statusRaw)) result.electricalMaintenanceRows += 1;
    if (isAutomationMaintenance(statusRaw)) result.automationMaintenanceRows += 1;
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

function round(value: number): number {
  return Math.round(value * 100) / 100;
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
