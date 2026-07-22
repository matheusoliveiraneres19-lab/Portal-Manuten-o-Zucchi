import * as XLSX from "xlsx";
import ExcelJS from "exceljs";
import { ImportStatus, ImportType, PcFactorySource, PcFactoryStatusCategory, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { converterNumeroBrasileiro, limparTexto, normalizarNomeColuna } from "@/utils/importacao";
import {
  buildPcFactoryTechnicalKey,
  classifyManagementGroup,
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
  normalizeExcelColorToHex,
  normalizePcFactoryStatusKey,
  normalizeProductionLine,
  normalizeResourceName,
  parseAgGridElapsedToMinutes,
  parseDurationToMinutes,
  parsePcFactoryDate,
  resolvePcFactoryStatusColor
} from "@/utils/pc-factory-normalizer";
import type {
  PcFactoryExcelRow,
  PcFactoryImportError,
  PcFactoryImportResult,
  PcFactoryLayoutType,
  PcFactoryStatusColorInfo
} from "@/types/pc-factory";

/** Cor de um status lida da planilha (coluna explícita ou preenchimento de célula). */
type SheetStatusColor = { hex: string; source: "excel-column" | "excel-cell-fill" };

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
  // Código do status (G0015.RCODSTATUS) — fonte do grupo gerencial da Tabela Gerencial
  g0015_rcodstatus: "statusCode",
  g0015rcodstatus: "statusCode",
  rcodstatus: "statusCode",
  cod_status_recurso: "statusCode",
  cod_status_de_recurso: "statusCode",
  cod_status: "statusCode",
  codigo_status_recurso: "statusCode",
  codigo_status: "statusCode",
  statuscode: "statusCode",
  // Status (Nome Status Recurso / Nome Status de Recurso — variação do export G0009)
  nome_status_recurso: "status",
  nome_do_status_recurso: "status",
  nome_status_de_recurso: "status",
  status_recurso: "status",
  status_do_recurso: "status",
  status_de_recurso: "status",
  status: "status",
  situacao: "status",
  estado: "status",
  statusraw: "status",
  // Detalhes do status
  detalhes_status_recurso: "statusDetails", // ag-grid: "Detalhes Status Recurso"
  detalhes_do_status_recurso: "statusDetails",
  nome_detalhe: "statusDetails", // ag-grid diário: "Nome Detalhe"
  detalhe: "statusDetails", // ag-grid diário: "Detalhe"
  statusdetails: "statusDetails",
  // Classificação textual do status (ag-grid diário: "Classificação Status"). Só entra como
  // fallback p/ statusCategory quando o texto casa exatamente com um enum; senão é ignorada
  // (a fonte da verdade é a regra sobre statusRaw). Ver coerceStatusCategory.
  classificacao_status: "statusCategory",
  classificacao_do_status: "statusCategory",
  // Ocorrência — nº de eventos agregados por linha (layout de resumo diário)
  ocorrencia: "occurrence",
  ocorrencias: "occurrence",
  eventos: "occurrence",
  qtd_ocorrencias: "occurrence",
  occurrence: "occurrence",
  eventcount: "occurrence",
  // Cor explícita do status (se a planilha trouxer uma coluna de cor)
  cor: "statusColor",
  color: "statusColor",
  cor_status: "statusColor",
  cor_do_status: "statusColor",
  status_color: "statusColor",
  statuscolor: "statusColor",
  statuscolorhex: "statusColor",
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
  // (R)Data de Produção — data do dia agregado (layout de resumo diário). Vira start 00:00:00
  // e end 23:59:59 no parseRow. Nomes: "(R)Data de Produção" → r_data_de_producao.
  r_data_de_producao: "productionDate",
  rdata_de_producao: "productionDate",
  data_de_producao: "productionDate",
  data_producao: "productionDate",
  data_producao_r: "productionDate",
  competencia: "productionDate",
  productiondate: "productionDate",
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
  /**
   * Quando true, SUBSTITUI toda a base de PcFactoryRecord: apaga todos os registros
   * antes de gravar os novos. Trava de segurança: só apaga se a planilha produzir
   * pelo menos uma linha válida (um arquivo inválido não zera a base existente).
   */
  replaceAll?: boolean;
};

type ReadResult = { rows: PcFactoryExcelRow[]; sheetUsed: string | null; layoutType: PcFactoryLayoutType };

/** Lê e mapeia as linhas da planilha a partir de um arquivo ou buffer. */
export function readPcFactoryRows(source: string | Buffer | ArrayBuffer, sheetName?: string): PcFactoryExcelRow[] {
  return readPcFactorySheet(source, sheetName).rows;
}

/**
 * Detecta o layout da planilha a partir dos cabeçalhos crus (TAREFA 7). O ponto crítico é
 * distinguir o "Tempo Decorrido[hr]" do resumo diário (HORAS DECIMAIS, usar direto) do
 * "Tempo Decorrido [hr]" do transacional (FRAÇÃO DE DIA, ×24) — ambos normalizam igual.
 */
function detectLayout(headers: string[], sheetUsed: string | null): PcFactoryLayoutType {
  if (sheetUsed && sheetUsed.trim().toLowerCase() === "import_pc_factory") return "PC_FACTORY_IMPORT";

  const normalized = new Set<string>();
  for (const header of headers) {
    const norm = normalizarNomeColuna(String(header ?? ""));
    if (norm) {
      normalized.add(norm);
      normalized.add(norm.replace(/_/g, ""));
    }
  }
  const has = (...keys: string[]) => keys.some((k) => normalized.has(k) || normalized.has(k.replace(/_/g, "")));

  const hasResource = has("recurso", "apelido_recurso", "nome_recurso", "resourcename");
  const hasElapsedHr = has("tempo_decorrido_hr");
  const hasOccurrence = has("ocorrencia", "ocorrencias", "occurrence");
  const hasStartEnd = has("inicio", "termino", "data_inicio", "data_fim", "startdatetime", "enddatetime");

  // Resumo diário: tem Ocorrência + Tempo Decorrido[hr] + Recurso e NÃO tem Início/Término.
  if (hasResource && hasElapsedHr && hasOccurrence && !hasStartEnd) return "PC_FACTORY_AG_GRID_DAILY_SUMMARY";
  if (hasResource || hasElapsedHr) return "PC_FACTORY_AG_GRID";
  return "UNKNOWN";
}

/** Lê a planilha resolvendo a aba preferida e devolve as linhas, o nome da aba e o layout. */
export function readPcFactorySheet(source: string | Buffer | ArrayBuffer, sheetName?: string): ReadResult {
  // cellDates:false de propósito: algumas planilhas (ex.: export G0009) formatam colunas
  // de DURAÇÃO como tempo, e com cellDates:true o xlsx as devolve como Date deslocada por
  // fuso — quebrando o parse de duração. Lendo como número, a duração vem limpa e as
  // colunas de data viram serial Excel, convertidas em UTC por converterDataExcel/parsePcFactoryDate.
  const workbook =
    typeof source === "string"
      ? XLSX.readFile(source, { cellDates: false })
      : XLSX.read(source, { type: "buffer", cellDates: false });

  const resolvedName = resolveSheetName(workbook.SheetNames, sheetName);
  const worksheet = resolvedName ? workbook.Sheets[resolvedName] : undefined;

  if (!worksheet) {
    throw new Error("Não foi possível localizar uma aba com dados na planilha do PC-Factory.");
  }

  const rawRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(worksheet, { defval: "", raw: true });
  const headers = rawRows.length ? Object.keys(rawRows[0]) : [];
  const layoutType = detectLayout(headers, resolvedName);
  return { rows: rawRows.map(mapRow), sheetUsed: resolvedName, layoutType };
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

/** Resolve o nº da coluna de um cabeçalho do PC-Factory usando o COLUMN_MAP flexível. */
function headerTarget(value: unknown): keyof PcFactoryExcelRow | undefined {
  const normalized = normalizarNomeColuna(String(value ?? ""));
  return COLUMN_MAP[normalized] ?? COLUMN_MAP[normalized.replace(/_/g, "")];
}

/**
 * Lê as cores por status REAL direto do arquivo Excel com `exceljs` (o `xlsx` community
 * não expõe estilos/preenchimento). Para cada statusKey tenta, em ordem:
 *   1) coluna explícita de cor (Cor/Color/Status Color…);
 *   2) preenchimento (fill) da célula "Nome Status Recurso".
 * Best-effort: qualquer falha (planilha sem estilos, formato inesperado) devolve mapa
 * vazio e a importação segue com o fallback de cores. NUNCA lança.
 */
async function extractStatusColorsFromExcel(
  source: string | Buffer | ArrayBuffer,
  sheetUsed: string | null
): Promise<Map<string, SheetStatusColor>> {
  const colors = new Map<string, SheetStatusColor>();
  try {
    const workbook = new ExcelJS.Workbook();
    if (typeof source === "string") {
      await workbook.xlsx.readFile(source);
    } else {
      const buffer = Buffer.isBuffer(source) ? source : Buffer.from(source as ArrayBuffer);
      await workbook.xlsx.load(buffer as unknown as Parameters<typeof workbook.xlsx.load>[0]);
    }

    const worksheet =
      (sheetUsed
        ? workbook.worksheets.find((ws) => ws.name.trim().toLowerCase() === sheetUsed.trim().toLowerCase())
        : undefined) ?? workbook.worksheets[0];
    if (!worksheet) return colors;

    // Mapeia os cabeçalhos (linha 1) → coluna de status e (opcional) coluna de cor.
    let statusCol = 0;
    let colorCol = 0;
    worksheet.getRow(1).eachCell((cell, colNumber) => {
      const target = headerTarget(cell.value);
      if (target === "status" && !statusCol) statusCol = colNumber;
      if (target === "statusColor" && !colorCol) colorCol = colNumber;
    });
    if (!statusCol) return colors;

    worksheet.eachRow((row, rowNumber) => {
      if (rowNumber === 1) return;
      const statusRaw = String(row.getCell(statusCol).value ?? "").trim();
      if (!statusRaw) return;
      const statusKey = normalizePcFactoryStatusKey(statusRaw);
      if (!statusKey || colors.has(statusKey)) return; // 1ª cor encontrada por status vence

      if (colorCol) {
        const fromColumn = normalizeExcelColorToHex(row.getCell(colorCol).value);
        if (fromColumn) {
          colors.set(statusKey, { hex: fromColumn, source: "excel-column" });
          return;
        }
      }
      const fill = row.getCell(statusCol).fill;
      const fgColor = fill && fill.type === "pattern" ? fill.fgColor : undefined;
      const fromFill = normalizeExcelColorToHex(fgColor);
      if (fromFill) colors.set(statusKey, { hex: fromFill, source: "excel-cell-fill" });
    });
  } catch {
    /* planilha sem estilos / formato inesperado → fallback de cores */
  }
  return colors;
}

/** Importa os registros a partir de linhas já lidas/mapeadas (com upsert e auditoria). */
export async function importPcFactoryRecords(
  rows: PcFactoryExcelRow[],
  options: ImportOptions = {},
  sheetUsed: string | null = null,
  statusColorMap: Map<string, SheetStatusColor> = new Map(),
  layoutType: PcFactoryLayoutType = "UNKNOWN"
): Promise<PcFactoryImportResult> {
  // No resumo diário, "Tempo Decorrido[hr]" já vem em HORAS DECIMAIS (usar direto, sem ×24).
  const decimalHours = layoutType === "PC_FACTORY_AG_GRID_DAILY_SUMMARY";
  const result: PcFactoryImportResult = {
    totalRows: rows.length,
    importedRows: 0,
    createdRows: 0,
    updatedRows: 0,
    replacedRows: 0,
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
    layoutType,
    totalOccurrences: 0,
    periodDetected: { start: null, end: null },
    resourcesDetected: 0,
    groupsDetected: [],
    statusDetected: [],
    statusColorsTotal: 0,
    statusColorsFromSheet: 0,
    statusColorsFallback: 0,
    statusColors: [],
    errors: []
  };

  const importBatch = options.importBatch ?? `PC-FACTORY-${new Date().toISOString()}`;
  const seenKeys = new Set<string>();
  const resources = new Set<string>();
  const groups = new Set<string>();
  const statuses = new Set<string>();
  // Acumula uma entrada por status real (statusKey) para o resumo de cores da importação.
  const statusColorAudit = new Map<string, PcFactoryStatusColorInfo>();
  let minDate: Date | null = null;
  let maxDate: Date | null = null;

  // Acumula os registros válidos em memória; a gravação acontece em massa depois do loop.
  const toPersist: Prisma.PcFactoryRecordCreateManyInput[] = [];

  for (let index = 0; index < rows.length; index += 1) {
    const line = index + 2; // +1 cabeçalho, +1 base 1

    try {
      const outcome = parseRow(rows[index], line, decimalHours);
      if ("ignore" in outcome) {
        result.ignoredRows += 1;
        result.ignoredReasons[outcome.ignore] += 1;
        continue;
      }
      const parsed = outcome.row;
      // Soma de eventos pela coluna "Ocorrência" (auditoria; não persistida por linha).
      result.totalOccurrences += parsed.occurrence;

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

      // Cor do status: 1) coluna explícita na linha; 2) preenchimento de célula (mapa do exceljs).
      // Só persiste cor REALMENTE vinda da planilha (statusColorHex); o fallback é aplicado na UI.
      const sheetColor: SheetStatusColor | undefined = parsed.statusColorFromColumn
        ? { hex: parsed.statusColorFromColumn, source: "excel-column" }
        : parsed.statusKey
          ? statusColorMap.get(parsed.statusKey)
          : undefined;
      const statusColorHex = sheetColor?.hex ?? null;

      if (parsed.statusKey && !statusColorAudit.has(parsed.statusKey)) {
        const fallback = resolvePcFactoryStatusColor(parsed.statusKey, null); // só fallback/neutro
        statusColorAudit.set(parsed.statusKey, {
          statusRaw: parsed.statusRaw ?? parsed.statusKey,
          statusKey: parsed.statusKey,
          colorHex: sheetColor ? sheetColor.hex : fallback.hex,
          source: sheetColor ? sheetColor.source : fallback.source === "fallback" ? "fallback" : "neutro"
        });
      }

      toPersist.push({
        resourceCode: parsed.resourceCode,
        resourceName: parsed.resourceName,
        productionLine: parsed.productionLine,
        groupPortal: parsed.groupPortal,
        sector: parsed.sector,
        statusCode: parsed.statusCode,
        statusRaw: parsed.statusRaw,
        statusKey: parsed.statusKey,
        statusColorHex,
        statusDetails: parsed.statusDetails,
        statusCategory: parsed.statusCategory,
        managementGroup: parsed.managementGroup,
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

  // Substituição total (opcional): apaga TODA a base antes de gravar — mas só quando há
  // linhas válidas, para um arquivo inválido nunca zerar os dados existentes.
  if (options.replaceAll && toPersist.length > 0) {
    const removed = await prisma.pcFactoryRecord.deleteMany({});
    result.replacedRows = removed.count;
  }

  // Gravação em massa (substitui o antigo N+1: 2 round-trips por linha contra o banco remoto).
  await persistRecords(toPersist, result);

  result.resourcesDetected = resources.size;
  result.groupsDetected = Array.from(groups).sort();
  result.statusDetected = Array.from(statuses).sort();
  const statusColors = Array.from(statusColorAudit.values()).sort((a, b) =>
    a.statusRaw.localeCompare(b.statusRaw, "pt-BR")
  );
  result.statusColors = statusColors;
  result.statusColorsTotal = statusColors.length;
  result.statusColorsFromSheet = statusColors.filter(
    (c) => c.source === "excel-column" || c.source === "excel-cell-fill"
  ).length;
  result.statusColorsFallback = statusColors.filter((c) => c.source === "fallback" || c.source === "neutro").length;
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
  const { rows, sheetUsed, layoutType } = readPcFactorySheet(source, options.sheetName);
  // Lê as cores por status direto do arquivo (exceljs) — best-effort, não bloqueia o import.
  const statusColorMap = await extractStatusColorsFromExcel(source, sheetUsed);
  return importPcFactoryRecords(rows, options, sheetUsed, statusColorMap, layoutType);
}

type ParsedRow = {
  resourceCode: string | null;
  resourceName: string;
  productionLine: string | null;
  groupPortal: string | null;
  sector: string | null;
  statusCode: string | null;
  statusRaw: string | null;
  statusKey: string | null;
  /** Cor lida de uma coluna explícita de cor na própria linha (#RRGGBB), se houver. */
  statusColorFromColumn: string | null;
  statusDetails: string | null;
  statusCategory: PcFactoryStatusCategory;
  managementGroup: string;
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
  /** "Ocorrência": nº de eventos agregados na linha (≥1). Auditoria; não é persistido. */
  occurrence: number;
  technicalKey: string;
};

type IgnoreReason = "noResource" | "noStatus" | "noDuration" | "emptyRow";
type ParseOutcome = { row: ParsedRow } | { ignore: IgnoreReason };

function parseRow(row: PcFactoryExcelRow, line: number, decimalHours: boolean): ParseOutcome {
  const resourceName = normalizeResourceName(row.resourceName) || normalizeResourceName(row.resourceCode);
  const statusRaw = optionalText(row.status);

  let startDateTime = combineDateAndTime(parsePcFactoryDate(row.startDate), row.startTime);
  let endDateTime = combineDateAndTime(parsePcFactoryDate(row.endDate), row.endTime);
  // Layout de resumo diário: "(R)Data de Produção" → dia começa 00:00:00 e termina 23:59:59.
  const productionDate = parsePcFactoryDate(row.productionDate);
  if (!startDateTime && productionDate) {
    const y = productionDate.getUTCFullYear();
    const m = productionDate.getUTCMonth();
    const d = productionDate.getUTCDate();
    startDateTime = new Date(Date.UTC(y, m, d, 0, 0, 0));
    if (!endDateTime) endDateTime = new Date(Date.UTC(y, m, d, 23, 59, 59));
  }
  const durationFallback = resolveFallbackMinutes(row, decimalHours);

  // "Tempo Decorrido Real" (auditoria). Pode não existir na planilha.
  const realDurationMinutes = resolveRealDurationMinutes(row, decimalHours);

  // "Ocorrência": nº de eventos agregados (resumo diário). Vazio/inválido → 1.
  const occurrenceParsed = parsePlainNumber(row.occurrence);
  const occurrence = occurrenceParsed !== null && occurrenceParsed > 0 ? Math.round(occurrenceParsed) : 1;

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

  const statusCode = optionalText(row.statusCode);
  // Grupo da Tabela Gerencial — derivado do CÓDIGO (fonte oficial), com fallback no nome.
  const managementGroup = classifyManagementGroup(statusCode, statusRaw);

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
      statusCode,
      statusRaw,
      statusKey: statusRaw ? normalizePcFactoryStatusKey(statusRaw) : null,
      statusColorFromColumn: normalizeExcelColorToHex(row.statusColor),
      statusDetails: optionalText(row.statusDetails),
      statusCategory,
      managementGroup,
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
      occurrence,
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
function resolveFallbackMinutes(row: PcFactoryExcelRow, decimalHours: boolean): number | null {
  const explicitMinutes = parsePlainNumber(row.durationMinutes);
  if (explicitMinutes !== null && explicitMinutes >= 0) return round(explicitMinutes);

  const explicitHours = parsePlainNumber(row.durationHours);
  if (explicitHours !== null && explicitHours >= 0) return round(explicitHours * 60);

  if (row.elapsedDayFraction !== undefined && row.elapsedDayFraction !== "") {
    // Resumo diário: "Tempo Decorrido[hr]" já é HORAS DECIMAIS → ×60 direto (sem heurística ×24).
    if (decimalHours) {
      const hours = parsePlainNumber(row.elapsedDayFraction);
      if (hours !== null && hours >= 0) return round(hours * 60);
    } else {
      const fromElapsed = parseAgGridElapsedToMinutes(row.elapsedDayFraction);
      if (fromElapsed !== null) return fromElapsed;
    }
  }

  return parseDurationToMinutes(row.duration);
}

/**
 * Resolve o "Tempo Decorrido Real" em minutos, quando a planilha o traz:
 * 1) realDurationMinutes explícito; 2) realDurationHours real (×60);
 * 3) "Tempo Decorrido Real[hr]" da aba bruta (fração de dia, regra <1.5 → ×24).
 * Retorna null quando a coluna real não existe — aí os cálculos caem em durationHours.
 */
function resolveRealDurationMinutes(row: PcFactoryExcelRow, decimalHours: boolean): number | null {
  const explicitMinutes = parsePlainNumber(row.realDurationMinutes);
  if (explicitMinutes !== null && explicitMinutes >= 0) return round(explicitMinutes);

  const explicitHours = parsePlainNumber(row.realDurationHours);
  if (explicitHours !== null && explicitHours >= 0) return round(explicitHours * 60);

  if (row.elapsedRealDayFraction !== undefined && row.elapsedRealDayFraction !== "") {
    // Resumo diário: "Tempo Decorrido Real" já é HORAS DECIMAIS → ×60 direto (sem ×24).
    if (decimalHours) {
      const hours = parsePlainNumber(row.elapsedRealDayFraction);
      if (hours !== null && hours >= 0) return round(hours * 60);
    } else {
      const fromElapsed = parseAgGridElapsedToMinutes(row.elapsedRealDayFraction);
      if (fromElapsed !== null) return fromElapsed;
    }
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
