/**
 * ANÁLISE MRP — leitura do ESTOQUE, porta 1:1 do trecho de `processar()` do
 * `Analise_MRP_Compacto (1).html`.
 *
 * Regras (todas do HTML):
 *   - obrigatórias: Material e Utilização livre (aliases `cod`/`livre`);
 *   - depósito: filtro = cleanCode(valor digitado); compara sem zeros à esquerda
 *     e em maiúsculas (vale para o DEPÓSITO, nunca para o código do material);
 *     filtro vazio = todos os depósitos;
 *   - filtro preenchido e sem coluna Depósito: NÃO bloqueia — todas as linhas
 *     entram e o resultado avisa;
 *   - código repetido (depois do filtro): a 1ª ocorrência vence e as seguintes
 *     são DESCARTADAS (não somadas). O HTML chama isso de "linhas duplicadas
 *     consolidadas", mas o comportamento real é descartar;
 *   - nenhuma linha restante = erro (nada é importado).
 */
import { detectCol } from "./aliases";
import { cleanCode } from "./normalization";
import { parseNum } from "./number-parser";
import type { MrpSheetTable } from "./types";

export type MrpStockRecord = { code: string; freeQty: number; sourceRow: number };

export type MrpStockRowOutcome = {
  sourceRow: number;
  cells: unknown[];
  status: "VALID" | "IGNORED";
  code: string;
  reason?: "SEM_CODIGO" | "OUTRO_DEPOSITO" | "DUPLICADO";
};

export type MrpStockParseResult = {
  ok: boolean;
  error?: string;
  /** `depFiltro` = cleanCode(valor digitado). */
  depositFilter: string;
  /** `depInfo` do HTML. */
  depositInfo: string;
  depositColumnFound: boolean;
  /** Filtro preenchido mas sem coluna Depósito (aviso do HTML). */
  depositFilterNotApplied: boolean;
  /** Linhas de dados lidas (`E.rows.length`). */
  rowsRead: number;
  /** Códigos únicos aceitos (`infoEst.linhas`). */
  rowsAccepted: number;
  duplicateRows: number;
  otherDepositRows: number;
  emptyCodeRows: number;
  items: MrpStockRecord[];
  rows: MrpStockRowOutcome[];
  warnings: string[];
};

export const MRP_STOCK_ERROR_COLUMNS =
  "Na planilha de estoque não foram encontradas as colunas de Material e Utilização livre.";

export function mrpDepositNotFoundWarning(depositFilter: string): string {
  return (
    `A coluna Depósito não foi encontrada na planilha de estoque — o filtro de depósito ${depositFilter} não pôde ser aplicado ` +
    "e todos os registros foram considerados."
  );
}

/** Normalização do depósito do HTML: sem zeros à esquerda e em maiúsculas. */
export function normalizeMrpDeposit(value: unknown): string {
  return cleanCode(value).replace(/^0+/, "").toUpperCase();
}

export function parseMrpStock(table: Pick<MrpSheetTable, "headers" | "rows" | "rowNumbers">, depositInput: string): MrpStockParseResult {
  const E = table;
  const ci = detectCol(E.headers, "cod"),
    li = detectCol(E.headers, "livre"),
    di = detectCol(E.headers, "dep");
  const depFiltro = cleanCode(depositInput);
  const base = {
    depositFilter: depFiltro,
    depositColumnFound: di >= 0,
    rowsRead: E.rows.length
  };
  if (ci < 0 || li < 0) {
    return {
      ...base,
      ok: false,
      error: MRP_STOCK_ERROR_COLUMNS,
      depositInfo: "",
      depositFilterNotApplied: false,
      rowsAccepted: 0,
      duplicateRows: 0,
      otherDepositRows: 0,
      emptyCodeRows: 0,
      items: [],
      rows: [],
      warnings: []
    };
  }

  const alvoDep = depFiltro.replace(/^0+/, "").toUpperCase();
  const semColDep = !!alvoDep && di < 0;
  // Objeto simples, como o `st = {}` do HTML (mesmas chaves e mesma checagem).
  const st: Record<string, number> = {};
  const items: MrpStockRecord[] = [];
  const rows: MrpStockRowOutcome[] = [];
  let dup = 0,
    foraDep = 0,
    empty = 0;

  E.rows.forEach((r, k) => {
    const sourceRow = E.rowNumbers[k];
    const cod = cleanCode(r[ci]);
    if (!cod) {
      empty++;
      rows.push({ sourceRow, cells: r, status: "IGNORED", code: "", reason: "SEM_CODIGO" });
      return;
    }
    if (alvoDep && di >= 0) {
      const d = cleanCode(r[di]).replace(/^0+/, "").toUpperCase();
      if (d !== alvoDep) {
        foraDep++;
        rows.push({ sourceRow, cells: r, status: "IGNORED", code: cod, reason: "OUTRO_DEPOSITO" });
        return;
      }
    }
    if (st[cod] !== undefined) {
      dup++;
      rows.push({ sourceRow, cells: r, status: "IGNORED", code: cod, reason: "DUPLICADO" });
      return;
    }
    st[cod] = parseNum(r[li]);
    items.push({ code: cod, freeQty: st[cod], sourceRow });
    rows.push({ sourceRow, cells: r, status: "VALID", code: cod });
  });

  const accepted = Object.keys(st).length;
  const depInfo = alvoDep
    ? semColDep
      ? "coluna de depósito não encontrada — todos considerados"
      : "depósito " + depFiltro
    : "todos os depósitos";
  const result = {
    ...base,
    depositInfo: depInfo,
    depositFilterNotApplied: semColDep,
    rowsAccepted: accepted,
    duplicateRows: dup,
    otherDepositRows: foraDep,
    emptyCodeRows: empty,
    items,
    rows,
    warnings: semColDep ? [mrpDepositNotFoundWarning(depFiltro)] : []
  };
  if (!accepted) {
    return {
      ...result,
      ok: false,
      error:
        "Nenhuma linha de estoque restou" +
        (alvoDep ? " no depósito " + depFiltro : "") +
        ". Confira o código do depósito ou deixe o campo em branco."
    };
  }
  return { ...result, ok: true };
}
