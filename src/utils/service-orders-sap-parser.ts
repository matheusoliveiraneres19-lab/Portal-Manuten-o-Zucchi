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
  | "grupoPlanejamentoCodigo"
  | "tipoAtividade"
  | "tipoManutencao"
  | "tipoOrdem"
  | "dataInicio"
  | "dataFim"
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
  // Código do grupo de planejamento em coluna PRÓPRIA (quando o export separa
  // rótulo e código). Verificado ANTES do rótulo para não ser absorvido por ele.
  if (isPlanningGroupCodeHeader(key)) return "grupoPlanejamentoCodigo";
  if (isPlanningGroupHeader(key)) return "grupoPlanejamento";
  // Tipo de atividade de manutenção/planejamento (TAREFA 1).
  if (isActivityTypeHeader(key)) return "tipoAtividade";
  // "Tipo de ordem" antes de "Tipo de manutenção": prefixos distintos, sem colisão.
  if (key === "tipo_de_ordem" || key === "tipo_ordem") return "tipoOrdem";
  if (key === "tipo_de_manutencao" || key === "tipo_manutencao" || key === "tipo_manut") return "tipoManutencao";
  if (key.startsWith("data_base_do_inicio") || key.startsWith("data_base_inicio")) return "dataInicio";
  // Data de conclusão/encerramento/fim real da OS -> closedAt. Tolerante às
  // variações do SAP/Fiori. Verificado ANTES de dataInicio já ter casado, e nunca
  // colide com a "data-base do início" (prefixos distintos).
  if (isClosureDateHeader(key)) return "dataFim";
  if (key === "trabalho_real" || key.startsWith("trabalho_real")) return "trabalhoReal";
  return null;
}

/**
 * Cabeçalhos do GRUPO DE PLANEJAMENTO (rótulo). Cobre as variações pedidas na
 * TAREFA 1: "Grupo de planejamento", "Grupo planej.", "Grupo Planej.",
 * "Grupo de planej." — todas normalizadas para "grupo_..." por
 * `normalizarNomeColuna` (sem acento, com "_").
 */
function isPlanningGroupHeader(key: string): boolean {
  return (
    key.startsWith("grupo_de_planejamento") ||
    key.startsWith("grupo_planejamento") ||
    key.startsWith("grupo_de_planej") ||
    key.startsWith("grupo_planej")
  );
}

/** Cabeçalhos do CÓDIGO do grupo de planejamento em coluna separada. */
function isPlanningGroupCodeHeader(key: string): boolean {
  const codeKeys = [
    "codigo_grupo_planejamento",
    "codigo_do_grupo_de_planejamento",
    "codigo_grupo_de_planejamento",
    "cod_grupo_planejamento",
    "grupo_planejamento_codigo",
    "planninggroupcode"
  ];
  return codeKeys.some((codeKey) => key === codeKey || key.startsWith(`${codeKey}_`));
}

/**
 * Cabeçalhos do TIPO DE ATIVIDADE de manutenção/planejamento (TAREFA 1):
 * "Tipo de atividade de manutenção", "Tipo atividade manutenção",
 * "Tipo de atividade", "Tipo Atividade", "Atividade de planejamento".
 */
function isActivityTypeHeader(key: string): boolean {
  return (
    key.startsWith("tipo_de_atividade") ||
    key.startsWith("tipo_atividade") ||
    key.startsWith("atividade_de_planejamento") ||
    key.startsWith("atividade_planejamento")
  );
}

/**
 * Cabeçalhos que representam a DATA DE FECHAMENTO/CONCLUSÃO da OS (alimentam
 * closedAt). Cobre os rótulos usuais do SAP PM/Fiori. Exige que seja uma coluna
 * de FIM/CONCLUSÃO — não confundir com "Data-base do início".
 */
function isClosureDateHeader(key: string): boolean {
  const closureKeys = [
    "data_de_conclusao",
    "data_conclusao",
    "conclusao",
    "data_de_encerramento",
    "data_encerramento",
    "encerramento",
    "data_de_fechamento",
    "data_fechamento",
    "fechamento",
    "fim_real",
    "data_fim_real",
    "data_fim",
    // SAP/Fiori: "Data-base do fim" (data-base de término da ordem). É a única data
    // de término no export; usada como closedAt SOMENTE p/ OS fechadas (no serviço).
    "data_base_do_fim",
    "data_base_fim",
    "data_de_referencia",
    "data_referencia",
    "data_conclusao_efetiva",
    "conclusao_efetiva",
    "closedat"
  ];
  return closureKeys.some((closureKey) => key === closureKey || key.startsWith(`${closureKey}_`));
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
  // "Tipo de atividade" também costuma vir como "Rótulo (código)" no Fiori —
  // preservamos o rótulo, que é o que a normalização reconhece.
  const atividade = splitLabelCode(cols.tipoAtividade);
  const manutencao = splitLabelCode(cols.tipoManutencao);
  const tipoOrdem = splitLabelCode(cols.tipoOrdem);
  // Código do grupo: coluna própria quando existir; senão o código embutido no rótulo.
  const grupoCodigo = limparTexto(cols.grupoPlanejamentoCodigo) || grupo.code;

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
    planningGroupCode: grupoCodigo,
    area: deriveAreaFromGroupCode(grupoCodigo, grupo.label),
    // "Tipo de atividade de manutenção" / "Tipo de manutenção" / "Tipo de ordem":
    // opcionais no export do SAP. Quando ausentes ficam null e a aba Equipamentos
    // Críticos deriva a classificação (ver utils/service-order-planning).
    planningActivityType: atividade.label || atividade.code || null,
    maintenanceType: manutencao.label || manutencao.code || null,
    orderType: tipoOrdem.code || tipoOrdem.label || null,
    // "Data-base do início" e "Trabalho real"
    openedAt: cols.dataInicio ?? null,
    // Data de conclusão/encerramento -> closedAt (quando a coluna existir no export).
    closedAt: cols.dataFim ?? null,
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
