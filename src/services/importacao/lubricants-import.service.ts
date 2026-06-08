import * as XLSX from "xlsx";
import { DataSource, ImportStatus, ImportType, type LubricantMovementCategory } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { limparTexto, normalizarNomeColuna } from "@/utils/importacao";
import {
  buildLubricantMovementTechnicalKey,
  classifyLubricantMovement,
  normalizeMaterialCode,
  normalizeMaterialDescription,
  parseBrazilianNumber,
  parseExcelDate,
  parseExcelTime
} from "@/utils/lubricants-normalizer";
import type { LubricantExcelRow, LubricantImportError, LubricantImportResult } from "@/types/lubricants";

const SHEET_NAME = "Data";

/** Mapa: cabeçalho normalizado (sem acento, com "_") -> chave da linha. */
const COLUMN_MAP: Record<string, keyof LubricantExcelRow> = {
  material: "material",
  texto_breve_material: "materialDescription",
  centro: "center",
  nome_1: "companyName",
  deposito: "storageLocation",
  tipo_de_movimento: "movementTypeCode",
  txt_tipo_movimento: "movementTypeText",
  hora_do_registro: "registerTime",
  data_de_lancamento: "postingDate",
  qtd_um_registro: "quantity",
  um_registro: "unit"
};

type ImportOptions = {
  fileName?: string;
  importedBy?: string;
  importBatch?: string;
};

/** Lê e mapeia as linhas da aba "Data" a partir de um arquivo ou buffer. */
export function readLubricantRows(source: string | Buffer | ArrayBuffer, sheetName = SHEET_NAME): LubricantExcelRow[] {
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

function mapRow(row: Record<string, unknown>): LubricantExcelRow {
  const mapped: LubricantExcelRow = {};
  for (const key of Object.keys(row)) {
    const normalized = normalizarNomeColuna(key);
    const target = COLUMN_MAP[normalized] ?? COLUMN_MAP[normalized.replace(/_/g, "")];
    if (target) {
      mapped[target] = row[key];
    }
  }
  return mapped;
}

/** Valida que as colunas obrigatórias existem em ao menos uma linha mapeada. */
function validateColumns(rows: LubricantExcelRow[]): void {
  if (rows.length === 0) {
    return;
  }
  const sample = rows[0];
  const required: Array<keyof LubricantExcelRow> = ["material", "quantity", "postingDate"];
  const missing = required.filter((field) => !(field in sample));
  if (missing.length === required.length) {
    throw new Error(
      'Colunas obrigatórias não encontradas. Verifique se a planilha tem "Material", "Qtd. UM registro" e "Data de lançamento" na aba "Data".'
    );
  }
}

/** Importa as movimentações a partir de linhas já lidas/mapeadas. */
export async function importLubricantMovements(
  rows: LubricantExcelRow[],
  options: ImportOptions = {}
): Promise<LubricantImportResult> {
  validateColumns(rows);

  const result: LubricantImportResult = {
    totalRows: rows.length,
    importedRows: 0,
    createdLubricants: 0,
    createdMovements: 0,
    ignoredRows: 0,
    errorRows: 0,
    errors: []
  };

  const importBatch = options.importBatch ?? `LUBRIFICACAO-${new Date().toISOString()}`;
  // Cache local de lubrificantes já resolvidos no lote (evita upsert repetido).
  const lubricantIdByCode = new Map<string, string>();

  for (let index = 0; index < rows.length; index += 1) {
    const line = index + 2; // +1 cabeçalho, +1 base 1

    try {
      const parsed = parseRow(rows[index], line);

      let lubricantId = lubricantIdByCode.get(parsed.materialCode);
      if (!lubricantId) {
        const existing = await prisma.lubricant.findUnique({
          where: { code: parsed.materialCode },
          select: { id: true }
        });

        if (existing) {
          lubricantId = existing.id;
          // Mantém a descrição/unidade atualizadas com o dado mais recente.
          await prisma.lubricant.update({
            where: { id: existing.id },
            data: { name: parsed.materialDescription, unit: parsed.unit }
          });
        } else {
          const created = await prisma.lubricant.create({
            data: {
              code: parsed.materialCode,
              name: parsed.materialDescription,
              unit: parsed.unit
            },
            select: { id: true }
          });
          lubricantId = created.id;
          result.createdLubricants += 1;
        }
        lubricantIdByCode.set(parsed.materialCode, lubricantId);
      }

      // Deduplicação por chave técnica.
      const duplicate = await prisma.lubricantMovement.findUnique({
        where: { technicalKey: parsed.technicalKey },
        select: { id: true }
      });

      if (duplicate) {
        result.ignoredRows += 1;
        continue;
      }

      await prisma.lubricantMovement.create({
        data: {
          lubricantId,
          materialCode: parsed.materialCode,
          materialDescription: parsed.materialDescription,
          center: parsed.center,
          companyName: parsed.companyName,
          storageLocation: parsed.storageLocation,
          movementTypeCode: parsed.movementTypeCode,
          movementTypeText: parsed.movementTypeText,
          movementCategory: parsed.movementCategory,
          movementDate: parsed.movementDate,
          movementTime: parsed.movementTime,
          quantity: parsed.quantity,
          absoluteQuantity: parsed.absoluteQuantity,
          unit: parsed.unit,
          source: DataSource.EXCEL,
          importBatch,
          technicalKey: parsed.technicalKey
        }
      });

      result.createdMovements += 1;
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
export async function importLubricantsFromExcel(
  source: string | Buffer | ArrayBuffer,
  options: ImportOptions = {}
): Promise<LubricantImportResult> {
  const rows = readLubricantRows(source);
  return importLubricantMovements(rows, options);
}

type ParsedRow = {
  materialCode: string;
  materialDescription: string;
  center: string | null;
  companyName: string | null;
  storageLocation: string | null;
  movementTypeCode: string | null;
  movementTypeText: string | null;
  movementCategory: LubricantMovementCategory;
  movementDate: Date;
  movementTime: string | null;
  quantity: number;
  absoluteQuantity: number;
  unit: string;
  technicalKey: string;
};

function parseRow(row: LubricantExcelRow, line: number): ParsedRow {
  const materialCode = normalizeMaterialCode(row.material);
  if (!materialCode) {
    throw rowError(line, "Material", row.material, "Código do material (Material) é obrigatório.");
  }

  const quantity = parseBrazilianNumber(row.quantity);
  if (quantity === null) {
    throw rowError(line, "Qtd. UM registro", row.quantity, "Quantidade inválida ou vazia.");
  }

  const movementDate = parseExcelDate(row.postingDate);
  if (!movementDate) {
    throw rowError(line, "Data de lançamento", row.postingDate, "Data de lançamento inválida ou vazia.");
  }

  const materialDescription = normalizeMaterialDescription(row.materialDescription) || materialCode;
  const movementTypeCode = optionalText(row.movementTypeCode);
  const movementTime = parseExcelTime(row.registerTime);
  const storageLocation = optionalText(row.storageLocation);

  return {
    materialCode,
    materialDescription,
    center: optionalText(row.center),
    companyName: optionalText(row.companyName),
    storageLocation,
    movementTypeCode,
    movementTypeText: optionalText(row.movementTypeText),
    movementCategory: classifyLubricantMovement(quantity, movementTypeCode),
    movementDate,
    movementTime,
    quantity,
    absoluteQuantity: Math.abs(quantity),
    unit: optionalText(row.unit) ?? "UN",
    technicalKey: buildLubricantMovementTechnicalKey({
      materialCode,
      movementDate,
      movementTime,
      movementTypeCode,
      quantity,
      storageLocation
    })
  };
}

async function createImportHistory(result: LubricantImportResult, options: ImportOptions): Promise<void> {
  const status =
    result.errorRows === 0
      ? ImportStatus.SUCESSO
      : result.createdMovements > 0
        ? ImportStatus.PARCIAL
        : ImportStatus.ERRO;

  await prisma.importHistory.create({
    data: {
      type: ImportType.LUBRIFICANTES,
      fileName: options.fileName ?? "BASE DE DADOS LUBRIFICACAO.xlsx",
      importedBy: options.importedBy ?? "importacao-local",
      totalRows: result.totalRows,
      createdRows: result.createdMovements,
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

function rowError(line: number, campo: string, valor: unknown, mensagem: string): LubricantImportError {
  return { linha: line, campo, valor, mensagem };
}

function toImportError(error: unknown, line: number): LubricantImportError {
  if (error && typeof error === "object" && "linha" in error && "mensagem" in error) {
    return error as LubricantImportError;
  }
  return { linha: line, mensagem: error instanceof Error ? error.message : "Erro inesperado ao importar a linha." };
}

function summarizeErrors(errors: LubricantImportError[]): string {
  return errors
    .slice(0, 10)
    .map((error) => `Linha ${error.linha}: ${error.mensagem}`)
    .join(" | ");
}
