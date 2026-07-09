import * as XLSX from "xlsx";
import { ImportStatus, ImportType } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { normalizarNomeColuna } from "@/utils/importacao";
import { normalizeTechnicalObjectCode } from "@/utils/technical-object-normalizer";
import {
  extractFamilyCode,
  resolveRootTag,
  synthesizeRootDescription
} from "@/utils/functional-location-hierarchy";

/**
 * Importador da planilha "Local de Instalação.xlsx" (hierarquia de LOCAIS DE
 * INSTALAÇÃO do SAP PM) para o model FunctionalLocation.
 *
 * Aba principal: "Local de Instalação" (fallback: primeira aba com TAG+DESCRIÇÃO).
 * Colunas esperadas: TAG, DESCRIÇÃO, CENTRO CUSTO, DESCRIÇÃO CC.
 *
 * Para cada TAG calcula: parentTag (maior prefixo presente na planilha), rootTag
 * (equipamento principal, via padrão estrutural), rootDescription (descrição da
 * raiz quando presente, senão sintetizada), família, setor e isRootEquipment.
 *
 * Idempotente: upsert por `tag`. NÃO apaga registros existentes.
 */

export const FUNCTIONAL_LOCATION_SHEET = "Local de Instalação";

const COLUMN_MAP: Record<string, "tag" | "description" | "costCenter" | "costCenterDescription"> = {
  tag: "tag",
  local: "tag",
  localdeinstalacao: "tag",
  descricao: "description",
  descricaolocal: "description",
  centrocusto: "costCenter",
  cc: "costCenter",
  descricaocc: "costCenterDescription",
  descricaocentrocusto: "costCenterDescription"
};

type RawLocationRow = {
  tag: string;
  description: string;
  costCenter: string;
  costCenterDescription: string;
};

export type FunctionalLocationImportResult = {
  totalRows: number;
  createdRows: number;
  updatedRows: number;
  errorRows: number;
  errors: Array<{ linha: number; mensagem: string }>;
};

type ImportOptions = { fileName?: string; importedBy?: string };

export async function importFunctionalLocationsFromExcel(
  source: string | Buffer | ArrayBuffer,
  options: ImportOptions = {}
): Promise<FunctionalLocationImportResult> {
  const workbook =
    typeof source === "string"
      ? XLSX.readFile(source, { cellDates: false })
      : XLSX.read(source, { type: "buffer", cellDates: false });

  const worksheet = resolveWorksheet(workbook);
  const rawRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(worksheet, { defval: "", raw: true });

  // Passo 1: normaliza colunas e coleta TAGs válidos (dedup por TAG).
  const byTag = new Map<string, RawLocationRow>();
  for (const raw of rawRows) {
    const parsed = parseRow(raw);
    if (parsed.tag) {
      byTag.set(parsed.tag, parsed);
    }
  }

  const tags = Array.from(byTag.keys());
  const result: FunctionalLocationImportResult = {
    totalRows: tags.length,
    createdRows: 0,
    updatedRows: 0,
    errorRows: 0,
    errors: []
  };

  // Passo 2: resolve hierarquia e persiste (upsert por tag).
  let line = 1;
  for (const tag of tags) {
    line += 1;
    const row = byTag.get(tag)!;
    try {
      const rootTag = resolveRootTag(tag);
      const rootRow = byTag.get(rootTag);
      const rootDescription = rootRow?.description || synthesizeRootDescription(rootTag);
      const parentTag = findParentTag(tag, byTag);
      const family = extractFamilyCode(rootTag);
      const area = extractSector(tag);

      const data = {
        description: row.description || tag,
        costCenter: emptyToNull(row.costCenter),
        costCenterDescription: emptyToNull(row.costCenterDescription),
        parentTag: parentTag || null,
        rootTag: rootTag || null,
        rootDescription: rootDescription || null,
        area: area || null,
        equipmentFamily: family || null,
        isRootEquipment: rootTag === tag
      };

      const existing = await prisma.functionalLocation.findUnique({ where: { tag }, select: { id: true } });
      await prisma.functionalLocation.upsert({
        where: { tag },
        update: data,
        create: { tag, ...data }
      });

      if (existing) {
        result.updatedRows += 1;
      } else {
        result.createdRows += 1;
      }
    } catch (error) {
      result.errorRows += 1;
      result.errors.push({ linha: line, mensagem: error instanceof Error ? error.message : "Erro inesperado." });
    }
  }

  await createImportHistory(result, options);
  return result;
}

function resolveWorksheet(workbook: XLSX.WorkBook): XLSX.WorkSheet {
  const target = workbook.SheetNames.find(
    (name) => normalizarNomeColuna(name).replace(/_/g, "") === "localdeinstalacao"
  );
  if (target) {
    return workbook.Sheets[target];
  }
  // Fallback: primeira aba que tenha colunas TAG + DESCRIÇÃO.
  for (const name of workbook.SheetNames) {
    const sheet = workbook.Sheets[name];
    const headers = readHeaders(sheet);
    const keys = new Set(headers.map((h) => normalizarNomeColuna(h).replace(/_/g, "")));
    if (keys.has("tag") && Array.from(keys).some((k) => k.startsWith("descricao"))) {
      return sheet;
    }
  }
  throw new Error(
    `Aba de locais de instalação não encontrada. Esperado "${FUNCTIONAL_LOCATION_SHEET}" (colunas TAG e DESCRIÇÃO).`
  );
}

function readHeaders(worksheet: XLSX.WorkSheet): string[] {
  const matrix = XLSX.utils.sheet_to_json<unknown[]>(worksheet, { header: 1, defval: "", raw: true });
  const first = matrix[0];
  return Array.isArray(first) ? first.map((cell) => String(cell ?? "")) : [];
}

function parseRow(raw: Record<string, unknown>): RawLocationRow {
  const row: RawLocationRow = { tag: "", description: "", costCenter: "", costCenterDescription: "" };
  for (const key of Object.keys(raw)) {
    const normalizedKey = normalizarNomeColuna(key).replace(/_/g, "");
    const target = COLUMN_MAP[normalizedKey];
    if (!target) {
      continue;
    }
    const value = String(raw[key] ?? "").trim();
    if (target === "tag") {
      row.tag = normalizeTechnicalObjectCode(value);
    } else if (!row[target]) {
      row[target] = value;
    }
  }
  return row;
}

/** parentTag = maior TAG (alinhado por segmento) que é prefixo estrito do TAG. */
function findParentTag(tag: string, all: Map<string, unknown>): string {
  const segments = tag.split("-");
  for (let cut = segments.length - 1; cut >= 1; cut -= 1) {
    const candidate = segments.slice(0, cut).join("-");
    if (all.has(candidate)) {
      return candidate;
    }
  }
  return "";
}

/** Setor/galpão = 2º–3º segmentos do TAG (ex.: ZC-SR-G07-... -> "SR-G07"). */
function extractSector(tag: string): string {
  const segments = tag.split("-");
  if (segments.length < 2) {
    return "";
  }
  return segments.slice(1, Math.min(3, segments.length)).join("-");
}

function emptyToNull(value: string): string | null {
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

async function createImportHistory(result: FunctionalLocationImportResult, options: ImportOptions) {
  const status =
    result.errorRows === 0
      ? ImportStatus.SUCESSO
      : result.createdRows + result.updatedRows > 0
        ? ImportStatus.PARCIAL
        : ImportStatus.ERRO;

  try {
    await prisma.importHistory.create({
      data: {
        type: ImportType.EQUIPAMENTOS,
        fileName: options.fileName ?? "Local de Instalação.xlsx",
        importedBy: options.importedBy ?? "importacao-local",
        totalRows: result.totalRows,
        createdRows: result.createdRows,
        updatedRows: result.updatedRows,
        errorRows: result.errorRows,
        status,
        errorMessage: result.errors.length
          ? result.errors
              .slice(0, 10)
              .map((error) => `Linha ${error.linha}: ${error.mensagem}`)
              .join(" | ")
          : null
      }
    });
  } catch (error) {
    console.warn("Não foi possível registrar o histórico de importação de locais.", error);
  }
}
