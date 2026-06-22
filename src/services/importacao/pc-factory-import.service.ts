import * as XLSX from "xlsx";
import { ImportStatus, ImportType, PcFactorySource, PcFactoryStatusCategory, Prisma } from "@prisma/client";
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
  tempo_decorrido_hr: "elapsedDayFraction", // ag-grid: "Tempo Decorrido [hr]" (planejado/auditoria)
  tempo_decorrido_real_hr: "elapsedRealDayFraction", // ag-grid: "Tempo Decorrido Real[hr]" (base dos KPIs)
  tempo_decorrido_real: "elapsedRealDayFraction",
  realdurationhours: "realDurationHours", // aba ajustada (Tempo Decorrido Real em horas)
  realdurationminutes: "realDurationMinutes",
  duracao_real_horas: "realDurationHours",
  duracao_real_minutos: "realDurationMinutes",
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
  rootcause: "rootCause",
  // Colunas pré-calculadas da aba ajustada (usadas como fallback / chave / lote)
  statuscategory: "statusCategory",
  maintenancetype: "maintenanceType",
  ismaintenancekpi: "isMaintenanceKpi",
  excludeplannedtime: "excludePlannedTime",
  includeplannedtime: "includePlannedTime",
  isdowntimeforavailability: "isDowntimeForAvailability",
  technicalkey: "technicalKey",
  importbatch: "importBatch",
  dataqualityissue: "dataQualityIssue"
};

/** Normaliza booleanos vindos da planilha: true/false, TRUE, Sim/Não, 1/0, S/N. */
function normalizeBool(value: unknown): boolean | null {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;
  const text = limparTexto(value)
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim()
    .toLowerCase();
  if (!text) return null;
  if (["true", "sim", "s", "1", "verdadeiro", "yes", "y"].includes(text)) return true;
  if (["false", "nao", "n", "0", "falso", "no"].includes(text)) return false;
  return null;
}

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
    ignoredReasons: { noResource: 0, noStatus: 0, noDuration: 0, emptyRow: 0, duplicate: 0, other: 0 },
    errorRows: 0,
    totalHours: 0,
    maintenanceHours: 0,
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
    missingRealDurationRows: 0,
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

  // Acumula os registros válidos em memória; a gravação acontece em massa depois do loop.
  const toPersist: Prisma.PcFactoryRecordCreateManyInput[] = [];

  for (let index = 0; index < rows.length; index += 1) {
    const line = index + 2; // +1 cabeçalho, +1 base 1

    try {
      const outcome = parseRow(rows[index], line);
      if ("ignore" in outcome) {
        result.ignoredRows += 1;
        result.ignoredReasons[outcome.ignore] += 1;
        continue;
      }
      const parsed = outcome.row;

      // Auditoria de classificação (conta TODAS as linhas válidas, inclusive as excluídas do tempo planejado).
      tallyClassification(result, parsed.statusRaw, parsed.statusCategory);
      if (parsed.dataQualityIssue) result.dataQualityRows += 1;
      if (parsed.realDurationHours === null) result.missingRealDurationRows += 1;
      result.totalHours = round(result.totalHours + parsed.durationHours);
      if (parsed.isMaintenanceKpi) result.maintenanceHours = round(result.maintenanceHours + parsed.durationHours);
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
        result.ignoredReasons.duplicate += 1;
        continue;
      }
      seenKeys.add(parsed.technicalKey);

      toPersist.push({
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
        realDurationMinutes: parsed.realDurationMinutes,
        realDurationHours: parsed.realDurationHours,
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
        importBatch,
        technicalKey: parsed.technicalKey
      });
    } catch (error) {
      result.errorRows += 1;
      result.errors.push(toImportError(error, line));
    }
  }

  // Gravação em massa (substitui o antigo N+1: 2 round-trips por linha contra o banco remoto).
  await persistRecords(toPersist, result);

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

/** Tamanho do lote para as operações em massa contra o banco. */
const PERSIST_CHUNK = 500;

/**
 * Persiste os registros em massa. Em vez de 2 round-trips por linha (findUnique +
 * update/create), faz: (1) checagem das chaves já existentes em poucas queries —
 * só para contar created vs updated; (2) regravação por chunk com deleteMany +
 * createMany dentro de uma transação. PcFactoryRecord é tabela-folha (sem FKs de
 * entrada), então apagar e recriar a chave é seguro e idempotente.
 */
async function persistRecords(
  records: Prisma.PcFactoryRecordCreateManyInput[],
  result: PcFactoryImportResult
): Promise<void> {
  if (records.length === 0) return;

  const keys = records.map((r) => r.technicalKey).filter((k): k is string => Boolean(k));

  // (1) Quais chaves já existem — apenas para a contagem created/updated.
  const existingKeys = new Set<string>();
  try {
    for (let i = 0; i < keys.length; i += PERSIST_CHUNK) {
      const found = await prisma.pcFactoryRecord.findMany({
        where: { technicalKey: { in: keys.slice(i, i + PERSIST_CHUNK) } },
        select: { technicalKey: true }
      });
      for (const f of found) if (f.technicalKey) existingKeys.add(f.technicalKey);
    }
  } catch {
    /* a checagem é só para a contagem; se falhar, a regravação abaixo segue normalmente */
  }

  // (2) Regrava por chunk: apaga as chaves do chunk e recria, de forma atômica.
  for (let i = 0; i < records.length; i += PERSIST_CHUNK) {
    const slice = records.slice(i, i + PERSIST_CHUNK);
    const sliceKeys = slice.map((r) => r.technicalKey).filter((k): k is string => Boolean(k));
    try {
      await prisma.$transaction([
        prisma.pcFactoryRecord.deleteMany({ where: { technicalKey: { in: sliceKeys } } }),
        prisma.pcFactoryRecord.createMany({ data: slice, skipDuplicates: true })
      ]);
      for (const record of slice) {
        if (record.technicalKey && existingKeys.has(record.technicalKey)) result.updatedRows += 1;
        else result.createdRows += 1;
        result.importedRows += 1;
      }
    } catch (error) {
      result.errorRows += slice.length;
      result.errors.push(toImportError(error, i + 2));
    }
  }
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
  realDurationMinutes: number | null;
  realDurationHours: number | null;
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

type IgnoreReason = "noResource" | "noStatus" | "noDuration" | "emptyRow";
type ParseOutcome = { row: ParsedRow } | { ignore: IgnoreReason };

function parseRow(row: PcFactoryExcelRow, line: number): ParseOutcome {
  const resourceName = normalizeResourceName(row.resourceName) || normalizeResourceName(row.resourceCode);
  const statusRaw = optionalText(row.status);

  const startDateTime = combineDateAndTime(parsePcFactoryDate(row.startDate), row.startTime);
  const endDateTime = combineDateAndTime(parsePcFactoryDate(row.endDate), row.endTime);
  const durationFallback = resolveFallbackMinutes(row);

  // "Tempo Decorrido Real" (base principal dos KPIs). Pode não existir na planilha.
  const realDurationMinutes = resolveRealDurationMinutes(row);

  // Duração-base do registro ("Tempo Decorrido"). Se a planilha só trouxe o Tempo
  // Decorrido Real, usamos ele como base para não descartar a linha por falta de duração.
  let durationMinutes = computeDurationMinutes(startDateTime, endDateTime, durationFallback);
  if (durationMinutes <= 0 && realDurationMinutes !== null && realDurationMinutes > 0) {
    durationMinutes = realDurationMinutes;
  }
  const hasDuration = durationMinutes > 0;
  const hasDates = Boolean(startDateTime || endDateTime);

  // Regras de ignorar (TAREFA 3): só ignora por campo OBRIGATÓRIO ausente.
  if (!resourceName && !statusRaw && !hasDuration && !hasDates) return { ignore: "emptyRow" };
  if (!resourceName) return { ignore: "noResource" };
  if (!statusRaw) return { ignore: "noStatus" };
  if (!hasDuration && !hasDates) return { ignore: "noDuration" }; // sem duração E sem datas
  if (!hasDuration) return { ignore: "noDuration" }; // duração inválida/zero

  // Classificação derivada de statusRaw (fonte da verdade). Para status NÃO reconhecido
  // pela regra (OUTROS), aceita os valores pré-calculados da planilha como fallback (TAREFA 5).
  const ruleCategory = classifyPcFactoryStatus(statusRaw);
  const sheetCategory = coerceStatusCategory(row.statusCategory);
  const statusCategory = ruleCategory === PcFactoryStatusCategory.OUTROS && sheetCategory ? sheetCategory : ruleCategory;

  const kind = maintenanceKind(statusRaw);
  const isMaintenanceKpi = isMaintenanceStatus(statusRaw);
  const isUnknown = ruleCategory === PcFactoryStatusCategory.OUTROS;
  const excludePlannedTime = isExcludedFromPlannedTime(statusRaw) || (isUnknown && normalizeBool(row.excludePlannedTime) === true);
  const downtimeForAvailability =
    isDowntimeForAvailability(statusRaw) || (isUnknown && normalizeBool(row.isDowntimeForAvailability) === true);

  const resourceCode = optionalText(row.resourceCode);
  const orderNumber = optionalText(row.orderNumber);
  const operationCode = optionalText(row.operationCode);
  const sheetKey = optionalText(row.technicalKey);

  return {
    row: {
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
      realDurationMinutes,
      realDurationHours: realDurationMinutes === null ? null : Math.round((realDurationMinutes / 60) * 100) / 100,
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
      // PC-Factory exporta "0" quando a causa raiz não é preenchida → trata como ausente.
      rootCause: cleanRootCause(row.rootCause),
      dataQualityIssue: detectDataQualityIssue(statusCategory, startDateTime, endDateTime, durationMinutes),
      // TAREFA 7: usa a technicalKey da planilha quando presente; senão gera uma única por linha.
      technicalKey:
        sheetKey ??
        buildPcFactoryTechnicalKey({
          resourceName,
          resourceCode,
          startDateTime,
          statusRaw,
          durationMinutes,
          orderNumber: [orderNumber ?? operationCode ?? "", endDateTime ? endDateTime.toISOString() : "", String(line)].join("#")
        })
    }
  };
}

/** Converte um texto da planilha para um PcFactoryStatusCategory válido, ou null. */
function coerceStatusCategory(value: unknown): PcFactoryStatusCategory | null {
  const text = limparTexto(value).toUpperCase();
  return (Object.values(PcFactoryStatusCategory) as string[]).includes(text)
    ? (text as PcFactoryStatusCategory)
    : null;
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

/**
 * Resolve o "Tempo Decorrido Real" em minutos, quando a planilha o traz:
 * 1) realDurationMinutes explícito; 2) realDurationHours real (×60);
 * 3) "Tempo Decorrido Real[hr]" da aba bruta (fração de dia, regra <1.5 → ×24).
 * Retorna null quando a coluna real não existe — aí os cálculos caem em durationHours.
 */
function resolveRealDurationMinutes(row: PcFactoryExcelRow): number | null {
  const explicitMinutes = parsePlainNumber(row.realDurationMinutes);
  if (explicitMinutes !== null && explicitMinutes >= 0) return round(explicitMinutes);

  const explicitHours = parsePlainNumber(row.realDurationHours);
  if (explicitHours !== null && explicitHours >= 0) return round(explicitHours * 60);

  if (row.elapsedRealDayFraction !== undefined && row.elapsedRealDayFraction !== "") {
    const fromElapsed = parseAgGridElapsedToMinutes(row.elapsedRealDayFraction);
    if (fromElapsed !== null) return fromElapsed;
  }

  return null;
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
  if (!start && !end) return "Sem data de início/fim (importado pela duração)";
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

/** Causa raiz: o PC-Factory grava "0" quando não há causa — tratamos como ausente. */
function cleanRootCause(value: unknown): string | null {
  const text = optionalText(value);
  return text && text !== "0" ? text : null;
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
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
