import * as XLSX from "xlsx";
import { ImportStatus, ImportType, PurchaseRecordSource } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { limparTexto, normalizarNomeColuna } from "@/utils/importacao";
import {
  buildPurchaseTechnicalKey,
  classifyItemNature,
  classifyPurchaseType,
  computeProcessTimes,
  computeStatusFlags,
  detectBlockedReason,
  optionalText,
  parsePurchaseDate,
  parsePurchaseNumber,
  resolvePurchaseValue
} from "@/utils/purchases-normalizer";
import type {
  ParsedPurchaseRecord,
  PurchaseExcelRow,
  PurchaseImportError,
  PurchaseImportResult
} from "@/types/purchases";

const SHEET_NAME = "Data";

/** Mapa: cabeçalho normalizado (sem acento, com "_") -> chave da linha. */
const COLUMN_MAP: Record<string, keyof PurchaseExcelRow> = {
  pedido_de_compra: "purchaseOrderNumber",
  pedido_compra: "purchaseOrderNumber",
  pedido: "purchaseOrderNumber",
  data_da_requisicao: "requisitionDate",
  data_requisicao: "requisitionDate",
  requisicao: "requisitionNumber",
  nivel_requisicao: "requisitionLevel",
  fornecedor: "supplierCode",
  descricao_fornecedor: "supplierName",
  material: "materialCode",
  texto_breve_do_pedido: "itemDescription",
  texto_breve_pedido: "itemDescription",
  quantid: "quantity",
  quantidade: "quantity",
  qtd: "quantity",
  recebimto_concluido: "receiptCompletedFlag",
  recebimento_concluido: "receiptCompletedFlag",
  codigo_de_eliminacao: "deletionCode",
  cod_eliminacao: "deletionCode",
  unid_med: "unit",
  unidade: "unit",
  data_do_pedido: "purchaseOrderDate",
  data_pedido: "purchaseOrderDate",
  previsao_de_entrega: "expectedDeliveryDate",
  previsao_entrega: "expectedDeliveryDate",
  preco_brut: "grossPrice",
  preco_bruto: "grossPrice",
  preco_liq: "netPrice",
  preco_liquido: "netPrice",
  total_bruto: "grossTotal",
  total_brut: "grossTotal",
  total_liq: "netTotal",
  total_liquido: "netTotal",
  recebimento: "receiptNumber",
  data_recebimento: "receiptDate",
  migo: "migoNumber",
  data_migo: "migoDate",
  grupo_merc: "goodsGroupCode",
  descr_grupo_merc: "goodsGroupDescription",
  descricao_grupo_merc: "goodsGroupDescription",
  requisitante: "requester",
  miro: "miroNumber",
  data_miro: "miroDate",
  grupo_comp: "purchasingGroup"
};

type ImportOptions = {
  fileName?: string;
  importedBy?: string;
  importBatch?: string;
  /** Data de referência para cálculos de atraso (default: agora). Injetável em testes. */
  now?: Date;
};

/** Lê e mapeia as linhas da aba "Data" a partir de um arquivo ou buffer. */
export function readPurchaseRows(source: string | Buffer | ArrayBuffer, sheetName = SHEET_NAME): PurchaseExcelRow[] {
  const workbook =
    typeof source === "string"
      ? XLSX.readFile(source, { cellDates: true })
      : XLSX.read(source, { type: "buffer", cellDates: true });

  const worksheet = workbook.Sheets[sheetName] ?? workbook.Sheets[workbook.SheetNames[0]];
  if (!worksheet) {
    throw new Error(`A aba "${sheetName}" não foi encontrada na planilha.`);
  }

  const rawRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(worksheet, { defval: "", raw: true });
  return rawRows.map(mapRow);
}

function mapRow(row: Record<string, unknown>): PurchaseExcelRow {
  const mapped: PurchaseExcelRow = {};
  for (const key of Object.keys(row)) {
    const normalized = normalizarNomeColuna(key);
    const target = COLUMN_MAP[normalized] ?? COLUMN_MAP[normalized.replace(/_/g, "")];
    if (target && mapped[target] === undefined) {
      mapped[target] = row[key];
    }
  }
  return mapped;
}

/** Valida que ao menos uma coluna essencial foi reconhecida. */
function validateColumns(rows: PurchaseExcelRow[]): void {
  if (rows.length === 0) {
    return;
  }
  const sample = rows[0];
  const recognized = ["itemDescription", "materialCode", "requisitionNumber", "purchaseOrderNumber"].some(
    (field) => field in sample
  );
  if (!recognized) {
    throw new Error(
      'Colunas não reconhecidas. Verifique se a planilha tem "Texto Breve do Pedido", "Material", "Requisição" e "Pedido de Compra" na aba "Data".'
    );
  }
}

function emptyResult(totalRows: number): PurchaseImportResult {
  return {
    totalRows,
    importedRows: 0,
    ignoredRows: 0,
    createdRows: 0,
    updatedRows: 0,
    errorRows: 0,
    totalWithoutPurchaseOrder: 0,
    totalWithPurchaseOrder: 0,
    totalMigo: 0,
    totalMiro: 0,
    totalLateOpen: 0,
    totalLateReceived: 0,
    totalRegularizations: 0,
    totalNormalPurchases: 0,
    totalServices: 0,
    totalMaterials: 0,
    totalValue: 0,
    errors: []
  };
}

/** Importa registros de compra a partir de linhas já lidas/mapeadas. */
export async function importPurchaseRows(
  rows: PurchaseExcelRow[],
  options: ImportOptions = {}
): Promise<PurchaseImportResult> {
  validateColumns(rows);

  const result = emptyResult(rows.length);
  const importBatch = options.importBatch ?? `COMPRAS-${new Date().toISOString()}`;
  const now = options.now ?? new Date();
  // Evita colisão de chave técnica dentro do mesmo lote (linhas idênticas na planilha).
  const seenKeys = new Set<string>();

  for (let index = 0; index < rows.length; index += 1) {
    const line = index + 2; // +1 cabeçalho, +1 base 1

    try {
      const parsed = parseRow(rows[index], line, now);
      if (!parsed) {
        // Linha vazia — não conta como importada nem como erro.
        continue;
      }

      if (seenKeys.has(parsed.technicalKey)) {
        result.ignoredRows += 1;
        continue;
      }
      seenKeys.add(parsed.technicalKey);

      const existing = await prisma.purchaseRecord.findUnique({
        where: { technicalKey: parsed.technicalKey },
        select: { id: true }
      });

      const data = {
        ...parsed,
        source: PurchaseRecordSource.EXCEL,
        importBatch
      };

      if (existing) {
        await prisma.purchaseRecord.update({ where: { id: existing.id }, data });
        result.updatedRows += 1;
      } else {
        await prisma.purchaseRecord.create({ data });
        result.createdRows += 1;
      }

      accumulate(result, parsed);
      result.importedRows += 1;
    } catch (error) {
      result.errorRows += 1;
      result.errors.push(toImportError(error, line));
    }
  }

  result.totalValue = round(result.totalValue);
  await createImportHistory(result, options);
  return result;
}

/** Lê o arquivo Excel e importa. Atalho usado pelo script CLI e pela API. */
export async function importPurchasesFromExcel(
  source: string | Buffer | ArrayBuffer,
  options: ImportOptions = {}
): Promise<PurchaseImportResult> {
  const rows = readPurchaseRows(source);
  return importPurchaseRows(rows, options);
}

/** Soma os indicadores do resumo a partir de um registro não-ignorado. */
function accumulate(result: PurchaseImportResult, parsed: ParsedPurchaseRecord): void {
  if (parsed.ignored) {
    result.ignoredRows += 1;
    return;
  }

  if (parsed.hasPurchaseOrder) {
    result.totalWithPurchaseOrder += 1;
  } else {
    result.totalWithoutPurchaseOrder += 1;
  }
  if (parsed.hasMigo) {
    result.totalMigo += 1;
  }
  if (parsed.hasMiro) {
    result.totalMiro += 1;
  }
  if (parsed.isLateOpen) {
    result.totalLateOpen += 1;
  }
  if (parsed.isLateReceived) {
    result.totalLateReceived += 1;
  }
  if (parsed.purchaseType === "REGULARIZACAO") {
    result.totalRegularizations += 1;
  }
  if (parsed.purchaseType === "NORMAL") {
    result.totalNormalPurchases += 1;
  }
  if (parsed.itemNature === "SERVICO") {
    result.totalServices += 1;
  } else {
    result.totalMaterials += 1;
  }

  const value = resolvePurchaseValue(parsed.netTotal, parsed.grossTotal);
  if (value) {
    result.totalValue += value;
  }
}

function parseRow(row: PurchaseExcelRow, line: number, now: Date): ParsedPurchaseRecord | null {
  const itemDescription = limparTexto(row.itemDescription);
  const materialCode = optionalText(row.materialCode);
  const requisitionNumber = optionalText(row.requisitionNumber);
  const purchaseOrderNumber = optionalText(row.purchaseOrderNumber);

  // Linha completamente vazia: ignora silenciosamente.
  if (!itemDescription && !materialCode && !requisitionNumber && !purchaseOrderNumber) {
    return null;
  }

  const description = itemDescription || materialCode || `Requisição ${requisitionNumber ?? "?"}`;

  const requisitionDate = parsePurchaseDate(row.requisitionDate);
  const purchaseOrderDate = parsePurchaseDate(row.purchaseOrderDate);
  const expectedDeliveryDate = parsePurchaseDate(row.expectedDeliveryDate);
  const receiptDate = parsePurchaseDate(row.receiptDate);
  const migoDate = parsePurchaseDate(row.migoDate);
  const miroDate = parsePurchaseDate(row.miroDate);

  const netTotal = parsePurchaseNumber(row.netTotal);
  const grossTotal = parsePurchaseNumber(row.grossTotal);
  const quantity = parsePurchaseNumber(row.quantity);

  const supplierName = optionalText(row.supplierName);
  const goodsGroupDescription = optionalText(row.goodsGroupDescription);
  const deletionCode = optionalText(row.deletionCode);

  const flags = computeStatusFlags(
    {
      purchaseOrderNumber,
      migoNumber: row.migoNumber,
      migoDate,
      miroNumber: row.miroNumber,
      miroDate,
      receiptFlag: row.receiptCompletedFlag,
      receiptDate,
      expectedDeliveryDate
    },
    now
  );

  const times = computeProcessTimes({ requisitionDate, purchaseOrderDate, receiptDate, migoDate, miroDate });

  const blockedReason = detectBlockedReason({
    itemDescription: description,
    materialCode,
    supplierName,
    goodsGroupDescription,
    deletionCode
  });

  const technicalKey = buildPurchaseTechnicalKey({
    requisitionNumber,
    purchaseOrderNumber,
    materialCode,
    itemDescription: description,
    quantity,
    netTotal
  });

  return {
    purchaseOrderNumber,
    requisitionNumber,
    requisitionLevel: optionalText(row.requisitionLevel),
    supplierCode: optionalText(row.supplierCode),
    supplierName,
    materialCode,
    itemDescription: description,
    quantity,
    unit: optionalText(row.unit),
    requisitionDate,
    purchaseOrderDate,
    expectedDeliveryDate,
    receiptDate,
    migoDate,
    miroDate,
    receiptNumber: optionalText(row.receiptNumber),
    migoNumber: optionalText(row.migoNumber),
    miroNumber: optionalText(row.miroNumber),
    grossPrice: parsePurchaseNumber(row.grossPrice),
    netPrice: parsePurchaseNumber(row.netPrice),
    grossTotal,
    netTotal,
    goodsGroupCode: optionalText(row.goodsGroupCode),
    goodsGroupDescription,
    requester: optionalText(row.requester),
    purchasingGroup: optionalText(row.purchasingGroup),
    deletionCode,
    purchaseType: classifyPurchaseType(row.purchasingGroup),
    itemNature: classifyItemNature(goodsGroupDescription, description),
    hasPurchaseOrder: flags.hasPurchaseOrder,
    hasMigo: flags.hasMigo,
    hasMiro: flags.hasMiro,
    isReceiptCompleted: flags.isReceiptCompleted,
    isLateOpen: flags.isLateOpen,
    isLateReceived: flags.isLateReceived,
    delayDays: flags.delayDays,
    requisitionToOrderDays: times.requisitionToOrderDays,
    orderToReceiptDays: times.orderToReceiptDays,
    migoToMiroDays: times.migoToMiroDays,
    totalProcessDays: times.totalProcessDays,
    ignored: blockedReason !== null,
    ignoredReason: blockedReason,
    technicalKey
  };
}

async function createImportHistory(result: PurchaseImportResult, options: ImportOptions): Promise<void> {
  const status =
    result.errorRows === 0
      ? ImportStatus.SUCESSO
      : result.importedRows > 0
        ? ImportStatus.PARCIAL
        : ImportStatus.ERRO;

  await prisma.importHistory.create({
    data: {
      type: ImportType.COMPRAS,
      fileName: options.fileName ?? "BASE DE DADOS PORTAL COMPRAS.xlsx",
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

function toImportError(error: unknown, line: number): PurchaseImportError {
  if (error && typeof error === "object" && "linha" in error && "mensagem" in error) {
    return error as PurchaseImportError;
  }
  return { linha: line, mensagem: error instanceof Error ? error.message : "Erro inesperado ao importar a linha." };
}

function summarizeErrors(errors: PurchaseImportError[]): string {
  return errors
    .slice(0, 10)
    .map((error) => `Linha ${error.linha}: ${error.mensagem}`)
    .join(" | ");
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}
