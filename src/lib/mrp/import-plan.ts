/**
 * ANÁLISE MRP — prévia e plano de importação (puro, sem banco).
 *
 * `buildMrpFilePreview` responde "o que esta planilha é e o que ela traria",
 * para o tipo e a aba escolhidos (reatribuir/trocarAba sem reenviar o arquivo).
 *
 * `buildMrpImportPlan` reproduz a ordem e as mensagens de `processar()` do HTML:
 * 1) planilha do MRP (se enviada), 2) estoque, 3) compras. O primeiro erro
 * interrompe tudo — nada é persistido.
 */
import { parseMrpBase, type MrpBaseParseResult } from "./base-parser";
import { MRP_AREA_MEC } from "./classification";
import { analyzeMrpWorkbook, diagnoseMrpSlot, pontuar, readMrpSheetTable } from "./file-detection";
import { parseMrpPurchases, type MrpPurchaseParseResult } from "./purchase-parser";
import { parseMrpStock, type MrpStockParseResult } from "./stock-parser";
import type { MrpFileKind, MrpScores, MrpSheetTable, MrpSlotDiagnosis } from "./types";
import type { MrpWorkbook } from "./workbook";

export const MRP_DEFAULT_AREA = MRP_AREA_MEC;

export class MrpImportError extends Error {
  constructor(
    public readonly userMessage: string,
    public readonly kind?: MrpFileKind
  ) {
    super(userMessage);
    this.name = "MrpImportError";
  }
}

export type MrpPreviewOptions = {
  kind: MrpFileKind;
  /** Aba escolhida (padrão: a detectada). */
  sheet?: string;
  depositFilter: string;
  defaultArea?: string;
};

export type MrpFilePreview = {
  fileName: string;
  sheetNames: string[];
  detectedKind: MrpFileKind;
  detectedSheet: string;
  kind: MrpFileKind;
  sheet: string;
  /** Linha do cabeçalho na planilha (1-based). */
  headerRow: number;
  headers: string[];
  /** Linhas de dados (`linhas` do HTML). */
  dataRows: number;
  scores: MrpScores;
  /** Pontuação do arquivo na detecção (melhor aba). */
  detectedScores: MrpScores;
  diagnosis: MrpSlotDiagnosis;
  base?: {
    compatibleSheets: MrpBaseParseResult["sheets"];
    ignoredSheets: string[];
    skippedSheets: MrpBaseParseResult["skippedSheets"];
    estimatedMaterials: number;
    duplicateRows: number;
    emptyCodeRows: number;
    defaultArea: string;
    summary: string;
    error?: string;
  };
  stock?: {
    depositFilter: string;
    depositColumnFound: boolean;
    depositInfo: string;
    /** Linhas com código no depósito escolhido (antes da deduplicação). */
    rowsInDeposit: number;
    rowsAccepted: number;
    duplicateRows: number;
    otherDepositRows: number;
    emptyCodeRows: number;
    warnings: string[];
    error?: string;
  };
  purchases?: {
    rowsWithCode: number;
    emptyCodeRows: number;
    optionalColumns: MrpPurchaseParseResult["optionalColumns"];
    error?: string;
  };
};

function tableFor(wb: MrpWorkbook, sheet: string): MrpSheetTable {
  if (!wb.SheetNames.includes(sheet)) throw new MrpImportError(`Aba "${sheet}" não encontrada no arquivo.`);
  const table = readMrpSheetTable(wb, sheet);
  // Mesma mensagem do trocarAba() do HTML.
  if (!table) throw new MrpImportError("Aba sem dados suficientes.");
  return table;
}

export function buildMrpFilePreview(fileName: string, wb: MrpWorkbook, options: MrpPreviewOptions): MrpFilePreview {
  const detection = analyzeMrpWorkbook(fileName, wb);
  if (!detection) throw new MrpImportError(`Não foi possível ler ${fileName}`);
  const sheet = options.sheet ?? detection.table.sheet;
  const table = sheet === detection.table.sheet ? detection.table : tableFor(wb, sheet);
  const scores = pontuar(table.headers);
  const defaultArea = options.defaultArea || MRP_DEFAULT_AREA;

  const preview: MrpFilePreview = {
    fileName,
    sheetNames: detection.sheetNames,
    detectedKind: detection.kind,
    detectedSheet: detection.table.sheet,
    kind: options.kind,
    sheet,
    headerRow: table.headerSheetRow,
    headers: table.headers,
    dataRows: table.dataRows,
    scores,
    detectedScores: detection.scores,
    diagnosis: diagnoseMrpSlot(options.kind, table.headers, scores)
  };

  if (options.kind === "base") {
    const base = parseMrpBase(wb, { defaultArea });
    preview.base = {
      compatibleSheets: base.sheets,
      ignoredSheets: base.ignoredSheets,
      skippedSheets: base.skippedSheets,
      estimatedMaterials: base.materials.length,
      duplicateRows: base.duplicateRows,
      emptyCodeRows: base.emptyCodeRows,
      defaultArea,
      summary: base.summary,
      error: base.error
    };
  } else if (options.kind === "est") {
    const stock = parseMrpStock(table, options.depositFilter);
    preview.stock = {
      depositFilter: stock.depositFilter,
      depositColumnFound: stock.depositColumnFound,
      depositInfo: stock.depositInfo,
      rowsInDeposit: stock.rowsAccepted + stock.duplicateRows,
      rowsAccepted: stock.rowsAccepted,
      duplicateRows: stock.duplicateRows,
      otherDepositRows: stock.otherDepositRows,
      emptyCodeRows: stock.emptyCodeRows,
      warnings: stock.warnings,
      error: stock.error
    };
  } else {
    const purchases = parseMrpPurchases(table);
    preview.purchases = {
      rowsWithCode: purchases.rowsAccepted,
      emptyCodeRows: purchases.emptyCodeRows,
      optionalColumns: purchases.optionalColumns,
      error: purchases.error
    };
  }
  return preview;
}

/* -------------------------------------------------------------------------- */
/*  Plano (processar)                                                          */
/* -------------------------------------------------------------------------- */

export type MrpPlanFile = { fileName: string; wb: MrpWorkbook; kind: MrpFileKind; sheet: string };

export type MrpImportPlan = {
  depositFilter: string;
  defaultArea: string;
  base?: { file: MrpPlanFile; result: MrpBaseParseResult };
  stock?: { file: MrpPlanFile; table: MrpSheetTable; result: MrpStockParseResult };
  purchases?: { file: MrpPlanFile; table: MrpSheetTable; result: MrpPurchaseParseResult };
  warnings: string[];
};

/**
 * Monta o plano a partir dos arquivos nos slots. Aceita:
 *   - estoque + compras (+ planilha do MRP opcional) — o "Atualizar tudo";
 *   - só a planilha do MRP — reimportação da base (envio pela aba Base MRP).
 * Lança MrpImportError com a mensagem do HTML no primeiro problema.
 */
export function buildMrpImportPlan(
  files: readonly MrpPlanFile[],
  options: { depositFilter: string; defaultArea?: string }
): MrpImportPlan {
  const byKind = new Map<MrpFileKind, MrpPlanFile>();
  for (const f of files) {
    if (byKind.has(f.kind)) throw new MrpImportError(`Mais de uma planilha marcada como "${f.kind}".`, f.kind);
    byKind.set(f.kind, f);
  }
  const baseFile = byKind.get("base"),
    stockFile = byKind.get("est"),
    purchaseFile = byKind.get("cmp");
  const baseOnly = !!baseFile && !stockFile && !purchaseFile;
  if (!baseOnly && (!stockFile || !purchaseFile)) {
    throw new MrpImportError("Anexe as planilhas de estoque e de compras.");
  }

  const defaultArea = options.defaultArea || MRP_DEFAULT_AREA;
  const plan: MrpImportPlan = { depositFilter: options.depositFilter, defaultArea, warnings: [] };

  // 1) base do MRP (quando enviada)
  if (baseFile) {
    const result = parseMrpBase(baseFile.wb, { defaultArea });
    if (!result.ok) throw new MrpImportError(result.error!, "base");
    plan.base = { file: baseFile, result };
  }
  if (baseOnly) return plan;

  // 2) estoque
  const stockTable = tableFor(stockFile!.wb, stockFile!.sheet);
  const stock = parseMrpStock(stockTable, options.depositFilter);
  if (!stock.ok) throw new MrpImportError(stock.error!, "est");
  plan.stock = { file: stockFile!, table: stockTable, result: stock };
  plan.warnings.push(...stock.warnings);

  // 3) compras
  const purchaseTable = tableFor(purchaseFile!.wb, purchaseFile!.sheet);
  const purchases = parseMrpPurchases(purchaseTable);
  if (!purchases.ok) throw new MrpImportError(purchases.error!, "cmp");
  plan.purchases = { file: purchaseFile!, table: purchaseTable, result: purchases };

  return plan;
}
