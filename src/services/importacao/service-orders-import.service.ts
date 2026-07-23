import * as XLSX from "xlsx";
import {
  DataSource,
  EquipmentStatus,
  ImportStatus,
  ImportType,
  MaintenanceArea,
  MaintenanceType,
  Priority,
  ServiceOrderStatus
} from "@prisma/client";
import { prisma } from "@/lib/prisma";
import type {
  ErroImportacao,
  LinhaOrdemServicoNormalizada,
  ResultadoImportacaoOrdensServico
} from "@/types/importacao";
import {
  converterDataExcel,
  converterHorasParaDecimal,
  limparTexto,
  padronizarStatusOS,
  padronizarTipoManutencao
} from "@/utils/importacao";
import {
  NORMALIZED_SERVICE_ORDER_SHEET,
  looksLikeNormalizedLayout,
  readNormalizedWorksheet
} from "@/utils/excel-normalizer";
import {
  SAP_UI5_SHEET,
  looksLikeRawSapLayout,
  parseSapWorksheet
} from "@/utils/service-orders-sap-parser";

type ImportServiceOrdersOptions = {
  fileName?: string;
  importedBy?: string;
};

type NormalizedServiceOrder = {
  osNumber: string;
  title: string;
  description: string | null;
  status: ServiceOrderStatus;
  statusSapRaw: string | null;
  type: MaintenanceType | null;
  area: MaintenanceArea | null;
  priority: Priority | null;
  responsibleName: string;
  responsibleId: string | null;
  equipmentCode: string | null;
  equipmentName: string | null;
  technicalObjectRaw: string | null;
  planningGroup: string | null;
  planningGroupCode: string | null;
  openedAt: Date | null;
  closedAt: Date | null;
  workedHours: number | null;
  operation: string | null;
  operationCode: string;
  importBatch: string | null;
  dataQualityIssue: string | null;
};

export async function importServiceOrdersFromNormalizedRows(
  rows: LinhaOrdemServicoNormalizada[],
  options: ImportServiceOrdersOptions = {}
): Promise<ResultadoImportacaoOrdensServico> {
  const result: ResultadoImportacaoOrdensServico = {
    totalRows: rows.length,
    createdRows: 0,
    updatedRows: 0,
    errorRows: 0,
    errors: []
  };

  for (let index = 0; index < rows.length; index += 1) {
    const line = index + 2;

    try {
      const normalized = normalizeServiceOrderRow(rows[index], line);
      const equipmentId = await upsertEquipment(normalized);
      const orderKey = {
        osNumber: normalized.osNumber,
        operationCode: normalized.operationCode
      };
      const existingOrder = await prisma.serviceOrder.findUnique({
        where: { osNumber_operationCode: orderKey },
        select: { id: true }
      });

      await prisma.serviceOrder.upsert({
        where: { osNumber_operationCode: orderKey },
        update: {
          title: normalized.title,
          description: normalized.description,
          status: normalized.status,
          statusSapRaw: normalized.statusSapRaw,
          type: normalized.type,
          area: normalized.area,
          priority: normalized.priority,
          responsible: normalized.responsibleName,
          responsibleName: normalized.responsibleName,
          responsibleId: normalized.responsibleId,
          equipmentId,
          equipmentCode: normalized.equipmentCode,
          equipmentName: normalized.equipmentName,
          technicalObjectRaw: normalized.technicalObjectRaw,
          planningGroup: normalized.planningGroup,
          planningGroupCode: normalized.planningGroupCode,
          openedAt: normalized.openedAt,
          closedAt: normalized.closedAt,
          workedHours: normalized.workedHours,
          operation: normalized.operation,
          operationCode: normalized.operationCode,
          source: DataSource.EXCEL,
          importBatch: normalized.importBatch,
          dataQualityIssue: normalized.dataQualityIssue
        },
        create: {
          osNumber: normalized.osNumber,
          title: normalized.title,
          description: normalized.description,
          status: normalized.status,
          statusSapRaw: normalized.statusSapRaw,
          type: normalized.type,
          area: normalized.area,
          priority: normalized.priority,
          responsible: normalized.responsibleName,
          responsibleName: normalized.responsibleName,
          responsibleId: normalized.responsibleId,
          equipmentId,
          equipmentCode: normalized.equipmentCode,
          equipmentName: normalized.equipmentName,
          technicalObjectRaw: normalized.technicalObjectRaw,
          planningGroup: normalized.planningGroup,
          planningGroupCode: normalized.planningGroupCode,
          openedAt: normalized.openedAt,
          closedAt: normalized.closedAt,
          workedHours: normalized.workedHours,
          operation: normalized.operation,
          operationCode: normalized.operationCode,
          source: DataSource.EXCEL,
          importBatch: normalized.importBatch,
          dataQualityIssue: normalized.dataQualityIssue
        }
      });

      if (existingOrder) {
        result.updatedRows += 1;
      } else {
        result.createdRows += 1;
      }
    } catch (error) {
      result.errorRows += 1;
      result.errors.push(toImportError(error, line));
    }
  }

  await createImportHistory(result, options);

  return result;
}

/**
 * Lê um arquivo Excel (buffer) detectando o layout e repassa as linhas para o
 * importador idempotente. Espelha `importPcFactoryFromExcel`.
 *
 * Layouts suportados:
 *  - EXPORT CRU do SAP: aba "Exportação SAPUI5" (ou colunas "Ordem" + "Status
 *    da ordem" + "Operação") -> parser que separa "Rótulo (código)".
 *  - Planilha já normalizada: aba "Ordens_Normalizadas" (ou colunas
 *    osNumber + operationCode) -> excel-normalizer.
 */
export async function importServiceOrdersFromExcel(
  source: string | Buffer | ArrayBuffer,
  options: ImportServiceOrdersOptions = {}
): Promise<ResultadoImportacaoOrdensServico> {
  const workbook =
    typeof source === "string"
      ? XLSX.readFile(source, { cellDates: true })
      : XLSX.read(source, { type: "buffer", cellDates: true });

  const { rows } = resolveServiceOrderRows(workbook);
  return importServiceOrdersFromNormalizedRows(rows, options);
}

/** Resolve a aba/layout e devolve as linhas já no formato normalizado. */
function resolveServiceOrderRows(workbook: XLSX.WorkBook): {
  rows: LinhaOrdemServicoNormalizada[];
  sheetUsed: string;
} {
  const findSheet = (name: string) =>
    workbook.SheetNames.find((sheet) => sheet.trim().toLowerCase() === name.trim().toLowerCase());

  // 1) Aba explícita do export cru do SAP.
  const sapSheet = findSheet(SAP_UI5_SHEET);
  if (sapSheet) {
    return { rows: parseSapWorksheet(workbook.Sheets[sapSheet]), sheetUsed: sapSheet };
  }

  // 2) Aba explícita da planilha já normalizada.
  const normalizedSheet = findSheet(NORMALIZED_SERVICE_ORDER_SHEET);
  if (normalizedSheet) {
    return { rows: readNormalizedWorksheet(workbook.Sheets[normalizedSheet]), sheetUsed: normalizedSheet };
  }

  // 3) Primeira aba: decide pelo cabeçalho.
  const firstSheetName = workbook.SheetNames[0];
  const firstSheet = firstSheetName ? workbook.Sheets[firstSheetName] : undefined;
  if (!firstSheet) {
    throw new Error("A planilha não contém abas com dados.");
  }

  const headers = readSheetHeaders(firstSheet);
  if (looksLikeRawSapLayout(headers)) {
    return { rows: parseSapWorksheet(firstSheet), sheetUsed: firstSheetName };
  }
  if (looksLikeNormalizedLayout(headers)) {
    return { rows: readNormalizedWorksheet(firstSheet), sheetUsed: firstSheetName };
  }

  throw new Error(
    `Layout não reconhecido. Esperado o export cru do SAP (aba "${SAP_UI5_SHEET}") ou a planilha normalizada (aba "${NORMALIZED_SERVICE_ORDER_SHEET}").`
  );
}

/** Lê apenas a linha de cabeçalho da worksheet (primeira linha). */
function readSheetHeaders(worksheet: XLSX.WorkSheet): string[] {
  const matrix = XLSX.utils.sheet_to_json<unknown[]>(worksheet, { header: 1, defval: "", raw: true });
  const first = matrix[0];
  return Array.isArray(first) ? first.map((cell) => String(cell ?? "")) : [];
}

function normalizeServiceOrderRow(row: LinhaOrdemServicoNormalizada, line: number): NormalizedServiceOrder {
  const osNumber = limparTexto(row.osNumber);
  if (!osNumber) {
    throw createRowError(line, "osNumber", row.osNumber, "osNumber é obrigatório.");
  }

  const status = padronizarStatusOS(row.statusPortal);
  if (!status) {
    throw createRowError(line, "statusPortal", row.statusPortal, "statusPortal inválido ou vazio.");
  }

  const operationCode = limparTexto(row.operationCode);
  if (!operationCode) {
    throw createRowError(
      line,
      "operationCode",
      row.operationCode,
      "operationCode é obrigatório (compõe a chave única osNumber + operationCode)."
    );
  }

  const openedAt = converterDataExcel(row.openedAt);
  // Data de fechamento: só faz sentido para OS FECHADAS. A coluna de término
  // ("Data-base do fim") existe também em OS abertas (é planejada), então só
  // gravamos closedAt quando o status é fechado — evita marcar OS aberta como
  // fechada. Fica null quando ausente; nunca inventamos data.
  const closedAt = status === ServiceOrderStatus.FECHADA ? converterDataExcel(row.closedAt) : null;
  const workedHours = converterHorasParaDecimal(row.workedHours);
  const responsibleName = limparTexto(row.responsibleName) || "SEM RESPONSÁVEL";
  const title = limparTexto(row.title) || osNumber;

  return {
    osNumber,
    title,
    description: optionalText(row.description),
    status,
    statusSapRaw: optionalText(row.statusSAP),
    type: normalizeMaintenanceType(row.type),
    area: normalizeMaintenanceArea(row.area),
    priority: normalizePriority(row.priority),
    responsibleName,
    responsibleId: optionalText(row.responsibleId),
    equipmentCode: optionalText(row.equipmentCode),
    equipmentName: optionalText(row.equipmentName),
    technicalObjectRaw: optionalText(row.technicalObject),
    planningGroup: optionalText(row.planningGroup),
    planningGroupCode: optionalText(row.planningGroupCode),
    openedAt,
    closedAt,
    workedHours,
    operation: optionalText(row.operation),
    operationCode,
    importBatch: optionalText(row.importBatch),
    dataQualityIssue: optionalText(row.dataQualityIssue)
  };
}

async function upsertEquipment(order: NormalizedServiceOrder) {
  if (!order.equipmentCode) {
    return null;
  }

  const equipment = await prisma.equipment.upsert({
    where: { code: order.equipmentCode },
    update: {
      name: order.equipmentName ?? order.equipmentCode
    },
    create: {
      code: order.equipmentCode,
      name: order.equipmentName ?? order.equipmentCode,
      status: EquipmentStatus.OPERANDO
    },
    select: { id: true }
  });

  return equipment.id;
}

async function createImportHistory(result: ResultadoImportacaoOrdensServico, options: ImportServiceOrdersOptions) {
  const status =
    result.errorRows === 0
      ? ImportStatus.SUCESSO
      : result.createdRows + result.updatedRows > 0
        ? ImportStatus.PARCIAL
        : ImportStatus.ERRO;

  await prisma.importHistory.create({
    data: {
      type: ImportType.ORDENS_SERVICO,
      fileName: options.fileName ?? "Ordens_Normalizadas.xlsx",
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

function normalizeMaintenanceType(value: unknown) {
  return padronizarTipoManutencao(value);
}

function normalizeMaintenanceArea(value: unknown): MaintenanceArea | null {
  const normalized = normalizeEnumText(value);
  const map: Record<string, MaintenanceArea> = {
    mecanica: MaintenanceArea.MECANICA,
    manut_mecanica: MaintenanceArea.MECANICA,
    mec: MaintenanceArea.MECANICA,
    eletrica: MaintenanceArea.ELETRICA,
    manut_eletrica: MaintenanceArea.ELETRICA,
    ele: MaintenanceArea.ELETRICA,
    lubrificacao: MaintenanceArea.LUBRIFICACAO,
    lub: MaintenanceArea.LUBRIFICACAO,
    pcm: MaintenanceArea.PCM,
    operacional: MaintenanceArea.OPERACIONAL,
    operacao: MaintenanceArea.OPERACIONAL
  };

  return map[normalized] ?? null;
}

function normalizePriority(value: unknown): Priority | null {
  const normalized = normalizeEnumText(value);
  const map: Record<string, Priority> = {
    baixa: Priority.BAIXA,
    media: Priority.MEDIA,
    medio: Priority.MEDIA,
    alta: Priority.ALTA,
    critica: Priority.CRITICA,
    critico: Priority.CRITICA
  };

  return map[normalized] ?? null;
}

function optionalText(value: unknown) {
  const text = limparTexto(value);
  return text || null;
}

function normalizeEnumText(value: unknown) {
  return limparTexto(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .toLowerCase();
}

function createRowError(line: number, field: string, value: unknown, message: string) {
  return {
    linha: line,
    campo: field,
    valor: value,
    mensagem: message
  } satisfies ErroImportacao;
}

function toImportError(error: unknown, line: number): ErroImportacao {
  if (isImportError(error)) {
    return error;
  }

  return {
    linha: line,
    mensagem: error instanceof Error ? error.message : "Erro inesperado ao importar linha."
  };
}

function isImportError(error: unknown): error is ErroImportacao {
  return Boolean(error && typeof error === "object" && "linha" in error && "mensagem" in error);
}

function summarizeErrors(errors: ErroImportacao[]) {
  return errors
    .slice(0, 10)
    .map((error) => `Linha ${error.linha}: ${error.mensagem}`)
    .join(" | ");
}
