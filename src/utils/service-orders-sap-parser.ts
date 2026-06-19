import * as XLSX from "xlsx";
import { limparTexto, normalizarNomeColuna, splitLabelCode } from "@/utils/importacao";
import type { LinhaOrdemServicoNormalizada } from "@/types/importacao";

/**
 * Parser do EXPORT CRU do SAP (Fiori) na página de Ordens de Serviço.
 *
 * O arquivo real tem uma aba única "Exportação SAPUI5" com 8 colunas, quase
 * todas no formato "Rótulo (código)". Aqui mapeamos cada linha para a
 * LinhaOrdemServicoNormalizada que o importador idempotente já consome,
 * reaproveitando `splitLabelCode` para separar rótulo/código.
 */

export const SAP_UI5_SHEET = "Exportação SAPUI5";

type SapColumn =
  | "ordem"
  | "operacao"
  | "status"
  | "objetoTecnico"
  | "responsavel"
  | "grupoPlanejamento"
  | "dataInicio"
  | "trabalhoReal";

/**
 * Resolve o nome lógico de cada coluna a partir do cabeçalho normalizado
 * (sem acentos, com "_"). Tolera variações de espaço/acentuação do SAP.
 */
function resolveSapColumn(header: string): SapColumn | null {
  const key = normalizarNomeColuna(header);
  if (key === "ordem") return "ordem";
  if (key === "operacao") return "operacao";
  if (key === "status_da_ordem" || key === "status_ordem" || key === "status") return "status";
  if (key === "objeto_tecnico") return "objetoTecnico";
  if (key.startsWith("responsavel")) return "responsavel"; // "Responsável (ordem)"
  if (key.startsWith("grupo_de_planejamento") || key.startsWith("grupo_planejamento")) return "grupoPlanejamento";
  if (key.startsWith("data_base_do_inicio") || key.startsWith("data_base_inicio")) return "dataInicio";
  if (key === "trabalho_real" || key.startsWith("trabalho_real")) return "trabalhoReal";
  return null;
}

/** True quando os cabeçalhos batem com o layout cru do SAP (Ordem + Status + Operação). */
export function looksLikeRawSapLayout(headers: string[]): boolean {
  const resolved = new Set(headers.map(resolveSapColumn).filter(Boolean) as SapColumn[]);
  return resolved.has("ordem") && resolved.has("status") && resolved.has("operacao");
}

type RawRow = Record<string, unknown>;

/** Mapeia uma linha bruta (chaveada pelo cabeçalho original) para os campos lógicos. */
function indexRowByColumn(row: RawRow): Partial<Record<SapColumn, unknown>> {
  const mapped: Partial<Record<SapColumn, unknown>> = {};
  for (const header of Object.keys(row)) {
    const column = resolveSapColumn(header);
    if (column && mapped[column] === undefined) {
      mapped[column] = row[header];
    }
  }
  return mapped;
}

/**
 * Deriva a área de manutenção a partir do código do grupo de planejamento.
 * Devolve o código (ex.: "MEC", "ELE", "LUB") para o normalizador do serviço
 * mapear ao enum. Códigos sem enum equivalente (USI, CIV, 001) resultam em
 * `area = null` lá no serviço — a string do grupo é sempre preservada.
 */
function deriveAreaFromGroupCode(code: string | null, label: string): string | null {
  return code || label || null;
}

/** Converte uma linha do layout cru do SAP para LinhaOrdemServicoNormalizada. */
export function parseSapRow(row: RawRow): LinhaOrdemServicoNormalizada {
  const cols = indexRowByColumn(row);

  const ordem = splitLabelCode(cols.ordem);
  const operacao = splitLabelCode(cols.operacao);
  const objeto = splitLabelCode(cols.objetoTecnico);
  const responsavel = splitLabelCode(cols.responsavel);
  const grupo = splitLabelCode(cols.grupoPlanejamento);

  const statusRaw = limparTexto(cols.status);

  return {
    // "Ordem" -> título (rótulo) + osNumber (código)
    osNumber: ordem.code ?? ordem.label,
    title: ordem.label,
    // "Operação" -> operação (rótulo) + operationCode (código, parte da chave)
    operation: operacao.label,
    operationCode: operacao.code ?? operacao.label,
    description: operacao.label || null,
    // "Status da ordem" -> status do portal + statusSAP (auditoria)
    statusPortal: statusRaw,
    statusSAP: statusRaw,
    // "Objeto técnico" -> nome + código + valor original
    equipmentName: objeto.label || null,
    equipmentCode: objeto.code,
    technicalObject: objeto.raw || null,
    // "Responsável (ordem)" -> nome + matrícula
    responsibleName: responsavel.label || null,
    responsibleId: responsavel.code,
    // "Grupo de planejamento" -> nome + código + área derivada do código
    planningGroup: grupo.label || null,
    planningGroupCode: grupo.code,
    area: deriveAreaFromGroupCode(grupo.code, grupo.label),
    // "Data-base do início" e "Trabalho real"
    openedAt: cols.dataInicio ?? null,
    workedHours: cols.trabalhoReal ?? null,
    source: "EXCEL_SAP_FIORI"
  };
}

/** Lê e mapeia as linhas de uma worksheet no layout cru do SAP. */
export function parseSapWorksheet(worksheet: XLSX.WorkSheet): LinhaOrdemServicoNormalizada[] {
  const rows = XLSX.utils.sheet_to_json<RawRow>(worksheet, { defval: "", raw: true });
  return rows.map(parseSapRow);
}

type ReadResult = { rows: LinhaOrdemServicoNormalizada[]; sheetUsed: string };

/**
 * Leitor por buffer do export cru do SAP. Resolve a aba "Exportação SAPUI5"
 * (case-insensitive); na ausência, usa a primeira aba.
 */
export function readSapServiceOrders(source: string | Buffer | ArrayBuffer): ReadResult {
  const workbook =
    typeof source === "string"
      ? XLSX.readFile(source, { cellDates: true })
      : XLSX.read(source, { type: "buffer", cellDates: true });

  const sheetName =
    workbook.SheetNames.find((name) => name.trim().toLowerCase() === SAP_UI5_SHEET.toLowerCase()) ??
    workbook.SheetNames[0];

  const worksheet = sheetName ? workbook.Sheets[sheetName] : undefined;
  if (!worksheet) {
    throw new Error("Não foi possível localizar uma aba com dados no arquivo do SAP.");
  }

  return { rows: parseSapWorksheet(worksheet), sheetUsed: sheetName };
}
