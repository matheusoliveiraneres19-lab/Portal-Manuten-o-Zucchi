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
  getPurchaseRecordReferenceDate,
  optionalText,
  parsePurchaseDate,
  parsePurchaseNumber,
  resolvePurchaseValue
} from "@/utils/purchases-normalizer";
import { classifyPurchaseRecord } from "@/utils/purchase-classification";
import type {
  ParsedPurchaseRecord,
  PurchaseExcelRow,
  PurchaseImportError,
  PurchaseImportPeriod,
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
  quant_pendente: "pendingQuantity",
  quantidade_pendente: "pendingQuantity",
  qtd_pendente: "pendingQuantity",
  recebimto_concluido: "receiptCompletedFlag",
  recebimento_concluido: "receiptCompletedFlag",
  codigo_de_eliminacao: "deletionCode",
  cod_eliminacao: "deletionCode",
  unid_med: "unit",
  unidade: "unit",
  data_do_pedido: "purchaseOrderDate",
  data_pedido: "purchaseOrderDate",
  dt_pedido: "purchaseOrderDate",
  dt_requisicao: "requisitionDate",
  previsao_de_entrega: "expectedDeliveryDate",
  previsao_entrega: "expectedDeliveryDate",
  previsao: "expectedDeliveryDate",
  dt_entrega: "expectedDeliveryDate",
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
  data_de_recebimento: "receiptDate",
  dt_recebimento: "receiptDate",
  migo: "migoNumber",
  data_migo: "migoDate",
  grupo_merc: "goodsGroupCode",
  descr_grupo_merc: "goodsGroupDescription",
  descricao_grupo_merc: "goodsGroupDescription",
  requisitante: "requester",
  miro: "miroNumber",
  data_miro: "miroDate",
  grupo_comp: "purchasingGroup",
  grupo_de_compras: "purchasingGroup",
  grupo_compras: "purchasingGroup"
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

  // Casa "Data" de forma tolerante (espaços/acentos/maiúsculas); senão, usa a 1ª aba.
  const target = normalizarNomeColuna(sheetName);
  const matchedName =
    workbook.SheetNames.find((name) => name === sheetName) ??
    workbook.SheetNames.find((name) => normalizarNomeColuna(name) === target) ??
    workbook.SheetNames[0];
  const worksheet = matchedName ? workbook.Sheets[matchedName] : undefined;
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
    totalBlocked: 0,
    totalReceived: 0,
    totalReceivedLate: 0,
    totalPendingPurchase: 0,
    totalNotDelivered: 0,
    suppliersDetected: 0,
    errors: []
  };
}

const DB_IN_CHUNK = 1000; // chunk para consultas "IN" (limite de parâmetros)
const CREATE_CHUNK = 500; // chunk para createMany (limite de parâmetros do Postgres)
const UPDATE_CONCURRENCY = 20; // updates paralelos por lote

/**
 * Importa registros de compra em LOTE — sem consulta 1-por-linha.
 *  1) parse + dedupe em memória; 2) descobre chaves existentes numa consulta;
 *  3) createMany dos novos + updates dos existentes em chunks paralelos.
 * Isso evita o timeout da função serverless (Vercel) em planilhas grandes
 * (antes eram ~2 queries por linha, o que estourava o limite e importava parcial).
 */
export async function importPurchaseRows(
  rows: PurchaseExcelRow[],
  options: ImportOptions = {}
): Promise<PurchaseImportResult> {
  validateColumns(rows);

  const result = emptyResult(rows.length);
  const importBatch = options.importBatch ?? `COMPRAS-${new Date().toISOString()}`;
  const now = options.now ?? new Date();

  // 1) Parse + dedupe por technicalKey (em memória; não toca o banco).
  const parsedByKey = new Map<string, ParsedPurchaseRecord>();
  for (let index = 0; index < rows.length; index += 1) {
    const line = index + 2; // +1 cabeçalho, +1 base 1
    try {
      const parsed = parseRow(rows[index], line, now);
      if (!parsed) {
        continue; // linha vazia — não conta como importada nem erro
      }
      if (parsedByKey.has(parsed.technicalKey)) {
        result.ignoredRows += 1; // duplicada na própria planilha
        continue;
      }
      parsedByKey.set(parsed.technicalKey, parsed);
    } catch (error) {
      result.errorRows += 1;
      result.errors.push(toImportError(error, line));
    }
  }

  const parsedList = Array.from(parsedByKey.values());

  // 2) Quais chaves já existem (consulta em lote, sem 1-por-linha).
  const existingKeys = await loadExistingKeys(parsedList.map((parsed) => parsed.technicalKey));
  const toCreate = parsedList.filter((parsed) => !existingKeys.has(parsed.technicalKey));
  const toUpdate = parsedList.filter((parsed) => existingKeys.has(parsed.technicalKey));

  // 3) Grava em lote.
  result.createdRows = await createInChunks(toCreate, importBatch);
  result.updatedRows = await updateInChunks(toUpdate, importBatch);
  result.importedRows = result.createdRows + result.updatedRows;

  // 4) Indicadores do resumo (todas as linhas válidas; bloqueados só como ignorados).
  for (const parsed of parsedList) {
    accumulate(result, parsed);
  }
  result.totalValue = round(result.totalValue);
  result.suppliersDetected = new Set(
    parsedList.map((parsed) => parsed.supplierName).filter((name): name is string => Boolean(name))
  ).size;

  // 5) Qualidade dos dados: período detectado e avisos.
  result.periodDetected = detectPeriod(parsedList);
  result.warnings = buildWarnings(parsedList);
  result.missingColumns = [];

  await createImportHistory(result, options);
  return result;
}

function toRecordData(parsed: ParsedPurchaseRecord, importBatch: string) {
  return { ...parsed, source: PurchaseRecordSource.EXCEL, importBatch };
}

/** Conjunto de technicalKeys já existentes (consultas "IN" em chunks). */
async function loadExistingKeys(keys: string[]): Promise<Set<string>> {
  const existing = new Set<string>();
  for (let i = 0; i < keys.length; i += DB_IN_CHUNK) {
    const chunk = keys.slice(i, i + DB_IN_CHUNK);
    const found = await prisma.purchaseRecord.findMany({
      where: { technicalKey: { in: chunk } },
      select: { technicalKey: true }
    });
    for (const row of found) {
      existing.add(row.technicalKey);
    }
  }
  return existing;
}

/** Insere novos registros em lote (createMany), respeitando o limite de parâmetros. */
async function createInChunks(toCreate: ParsedPurchaseRecord[], importBatch: string): Promise<number> {
  let created = 0;
  for (let i = 0; i < toCreate.length; i += CREATE_CHUNK) {
    const chunk = toCreate.slice(i, i + CREATE_CHUNK).map((parsed) => toRecordData(parsed, importBatch));
    const res = await prisma.purchaseRecord.createMany({ data: chunk, skipDuplicates: true });
    created += res.count;
  }
  return created;
}

/** Atualiza registros existentes (por technicalKey) em chunks paralelos. */
async function updateInChunks(toUpdate: ParsedPurchaseRecord[], importBatch: string): Promise<number> {
  let updated = 0;
  for (let i = 0; i < toUpdate.length; i += UPDATE_CONCURRENCY) {
    const chunk = toUpdate.slice(i, i + UPDATE_CONCURRENCY);
    await Promise.all(
      chunk.map((parsed) =>
        prisma.purchaseRecord.update({
          where: { technicalKey: parsed.technicalKey },
          data: toRecordData(parsed, importBatch)
        })
      )
    );
    updated += chunk.length;
  }
  return updated;
}

/** Período detectado na planilha: menor/maior data de referência + meses distintos. */
function detectPeriod(parsedList: ParsedPurchaseRecord[]): PurchaseImportPeriod {
  const dates = parsedList
    .map((parsed) => getPurchaseRecordReferenceDate(parsed))
    .filter((date): date is Date => date !== null)
    .sort((a, b) => a.getTime() - b.getTime());

  if (!dates.length) {
    return { start: null, end: null, months: [] };
  }

  const months = Array.from(
    new Set(dates.map((date) => `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`))
  ).sort();

  return {
    start: dates[0].toISOString().slice(0, 10),
    end: dates[dates.length - 1].toISOString().slice(0, 10),
    months
  };
}

/** Avisos de qualidade da importação. */
function buildWarnings(parsedList: ParsedPurchaseRecord[]): string[] {
  const warnings: string[] = [];
  const semPedidoComReferencia = parsedList.filter(
    (parsed) => !parsed.purchaseOrderDate && (parsed.requisitionDate || parsed.expectedDeliveryDate)
  ).length;
  if (semPedidoComReferencia > 0) {
    warnings.push(
      `${semPedidoComReferencia} registro(s) sem Data do Pedido foram posicionados pela Data da Requisição/Previsão nos gráficos mensais.`
    );
  }
  const semData = parsedList.filter((parsed) => getPurchaseRecordReferenceDate(parsed) === null).length;
  if (semData > 0) {
    warnings.push(`${semData} registro(s) sem nenhuma data entram nos totais, mas não aparecem nos gráficos mensais.`);
  }
  return warnings;
}

/** Lê o arquivo Excel e importa. Atalho usado pelo script CLI e pela API. */
export async function importPurchasesFromExcel(
  source: string | Buffer | ArrayBuffer,
  options: ImportOptions = {}
): Promise<PurchaseImportResult> {
  const rows = readPurchaseRows(source);
  return importPurchaseRows(rows, options);
}

/** Soma os indicadores do resumo (REGRA 16) a partir de um registro parseado. */
function accumulate(result: PurchaseImportResult, parsed: ParsedPurchaseRecord): void {
  // Bloqueados contam só como auditoria; fora dos demais indicadores.
  if (parsed.isBlocked) {
    result.ignoredRows += 1;
    result.totalBlocked += 1;
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
  if (parsed.purchaseType === "REGULARIZACAO") {
    result.totalRegularizations += 1;
  }
  if (parsed.purchaseType === "NORMAL") {
    result.totalNormalPurchases += 1;
  }
  if (parsed.isService) {
    result.totalServices += 1;
  } else {
    result.totalMaterials += 1;
  }

  // Contagens canônicas por status operacional.
  switch (parsed.operationalStatus) {
    case "RECEBIDO":
      result.totalReceived += 1;
      break;
    case "RECEBIDO_COM_ATRASO":
      result.totalReceived += 1;
      result.totalReceivedLate += 1;
      break;
    case "EM_ATRASO":
      result.totalLateOpen += 1;
      break;
    case "PENDENTE_COMPRA":
      result.totalPendingPurchase += 1;
      break;
    case "NAO_ENTREGUE":
      result.totalNotDelivered += 1;
      break;
    default:
      break;
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
  const pendingQuantity = parsePurchaseNumber(row.pendingQuantity);

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

  // REGRA CENTRAL: status canônico (mesma função usada por services e UI).
  const classification = classifyPurchaseRecord(
    {
      purchasingGroup: row.purchasingGroup,
      goodsGroupDescription,
      itemDescription: description,
      materialCode,
      supplierName,
      deletionCode,
      purchaseOrderNumber,
      receiptDate,
      expectedDeliveryDate
    },
    now
  );

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
    pendingQuantity,
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
    operationalStatus: classification.operationalStatus,
    isService: classification.isService,
    isBlocked: classification.isBlocked,
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
