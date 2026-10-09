/**
 * ANÁLISE MRP — identificação das planilhas, porta 1:1 do
 * `Analise_MRP_Compacto (1).html`: scoreHeader, findHeaderRow, pontuar,
 * analisarArquivo, colunasOk e a lógica de slots de receberArquivos,
 * reatribuir, trocarAba e atualizarSlots.
 *
 * Acréscimo do Portal (não muda o resultado): confidence/warnings. Um arquivo
 * sem nenhuma coluna reconhecida continua classificado como "base" (regra do
 * HTML: 0 >= 0), mas sai com confidence LOW e aviso, para o usuário corrigir.
 */
import { MRP_ALIASES, detectCol, type MrpAliasField } from "./aliases";
import { evaluateMrpLockFlags, type MrpLockState } from "./lock";
import { cleanText, norm } from "./normalization";
import { sheetToRows, type MrpWorkbook } from "./workbook";
import {
  MRP_FILE_KINDS,
  type MrpFileDetection,
  type MrpFileKind,
  type MrpRow,
  type MrpScores,
  type MrpSheetCandidate,
  type MrpSheetTable,
  type MrpSlotDiagnosis,
  type MrpSlots
} from "./types";

/** Campos que o scoreHeader conta (min/max NÃO entram, como no HTML). */
const HEADER_SCORE_FIELDS = ["cod", "desc", "livre", "qtd", "data", "req", "ped", "rec", "prev", "forn"] as const;

/** Linhas analisadas na busca do cabeçalho. */
export const MRP_HEADER_SCAN_ROWS = 12;

/** `scoreHeader()` — quantos campos conhecidos a linha reconhece. */
export function scoreHeader(cells: readonly unknown[] | null | undefined): number {
  const H = (cells || []).map(norm).filter(Boolean);
  if (H.length < 2) return 0;
  let s = 0;
  for (const f of HEADER_SCORE_FIELDS) {
    const aliases: readonly string[] = MRP_ALIASES[f];
    if (H.some((h) => aliases.some((a) => h === a || h.includes(a)))) s++;
  }
  return s;
}

/** `findHeaderRow()` — 1ª linha de maior score entre as 12 primeiras. */
export function findHeaderRow(aoa: readonly MrpRow[]): number {
  let best = 0,
    bs = -1;
  for (let i = 0; i < Math.min(aoa.length, MRP_HEADER_SCAN_ROWS); i++) {
    const s = scoreHeader(aoa[i]);
    if (s > bs) {
      bs = s;
      best = i;
    }
  }
  return best;
}

/** `pontuar()` — pontuação de Estoque / Compras / Base MRP pelos cabeçalhos. */
export function pontuar(headers: readonly unknown[]): MrpScores {
  const H = headers.map(norm),
    has = (k: string) => H.some((h) => h.includes(k));
  let est = 0,
    cmp = 0,
    base = 0;
  if (has("estoqueminimo") || has("minimo")) base += 4;
  if (has("estoquemaximo") || has("maximo")) base += 4;
  if (has("statusmrp")) base += 1;
  if (has("utilizacaolivre") || has("estoquelivre") || has("saldolivre")) est += 4;
  else if (has("livre")) est += 3;
  if (has("material") || has("codigo")) {
    est += 1;
    cmp += 1;
  }
  if (has("pedidodecompra") || has("pedido")) cmp += 3;
  if (has("requisicao")) cmp += 3;
  if (has("recebimento")) cmp += 3;
  if (has("previsao")) cmp += 1;
  if (has("fornecedor")) cmp += 2;
  if (base > 0 && (has("material") || has("codigo"))) base += 1;
  return { est, cmp, base };
}

/** Tipo pelos scores: base >= maior ? base : (cmp > est ? cmp : est). */
export function kindFromScores(p: MrpScores): { kind: MrpFileKind; score: number } {
  const score = Math.max(p.est, p.cmp, p.base);
  const kind: MrpFileKind = p.base >= score ? "base" : p.cmp > p.est ? "cmp" : "est";
  return { kind, score };
}

/** Lê uma aba: cabeçalho por findHeaderRow e linhas de dados. null se < 2 linhas. */
export function readMrpSheetTable(wb: MrpWorkbook, sheet: string): MrpSheetTable | null {
  const { rows: aoa, rowNumbers } = sheetToRows(wb, sheet);
  if (aoa.length < 2) return null;
  const hr = findHeaderRow(aoa);
  return {
    sheet,
    headerRowIndex: hr,
    headerSheetRow: rowNumbers[hr],
    headers: aoa[hr].map(cleanText),
    rows: aoa.slice(hr + 1),
    rowNumbers: rowNumbers.slice(hr + 1),
    dataRows: aoa.length - hr - 1
  };
}

/**
 * `analisarArquivo()` — melhor aba (maior score; empate = primeira) e tipo.
 * null quando nenhuma aba tem 2+ linhas ("Não foi possível ler").
 */
export function analyzeMrpWorkbook(fileName: string, wb: MrpWorkbook): MrpFileDetection | null {
  const candidates: MrpSheetCandidate[] = [];
  let best: { table: MrpSheetTable; scores: MrpScores; score: number; kind: MrpFileKind } | null = null;
  for (const name of wb.SheetNames) {
    const table = readMrpSheetTable(wb, name);
    if (!table) continue;
    const scores = pontuar(table.headers);
    const { kind, score } = kindFromScores(scores);
    candidates.push({ sheet: name, headerRowIndex: table.headerRowIndex, dataRows: table.dataRows, scores, score, kind });
    if (!best || score > best.score) best = { table, scores, score, kind };
  }
  if (!best) return null;
  return {
    fileName,
    sheetNames: [...wb.SheetNames],
    kind: best.kind,
    table: best.table,
    scores: best.scores,
    score: best.score,
    candidates
  };
}

/** Campos obrigatórios por tipo (`colunasOk`). */
export const MRP_REQUIRED_FIELDS: Record<MrpFileKind, MrpAliasField[]> = {
  est: ["cod", "livre"],
  cmp: ["cod"],
  base: ["cod", "min", "max"]
};

/** `colunasOk(kind, a)` */
export function mrpColumnsOk(kind: MrpFileKind, headers: readonly unknown[]): boolean {
  return MRP_REQUIRED_FIELDS[kind].every((f) => detectCol(headers, f) >= 0);
}

export const MRP_WARNING_NO_COLUMNS = "Nenhuma coluna reconhecida com segurança.";
export const MRP_WARNING_MISSING_REQUIRED = "colunas obrigatórias não encontradas — troque a aba ou o tipo";

/** Diagnóstico de uma planilha num slot (tipo + aba). */
export function diagnoseMrpSlot(kind: MrpFileKind, headers: readonly unknown[], scores: MrpScores): MrpSlotDiagnosis {
  const missingRequired = MRP_REQUIRED_FIELDS[kind].filter((f) => detectCol(headers, f) < 0);
  const recognizedColumns: Partial<Record<MrpAliasField, string>> = {};
  for (const field of Object.keys(MRP_ALIASES) as MrpAliasField[]) {
    const i = detectCol(headers, field);
    if (i >= 0) recognizedColumns[field] = String(headers[i] ?? "");
  }
  const warnings: string[] = [];
  const noColumns = Math.max(scores.est, scores.cmp, scores.base) === 0;
  if (noColumns) warnings.push(MRP_WARNING_NO_COLUMNS);
  if (missingRequired.length) warnings.push(MRP_WARNING_MISSING_REQUIRED);
  return {
    requiredColumnsOk: missingRequired.length === 0,
    missingRequired,
    recognizedColumns,
    confidence: noColumns ? "LOW" : missingRequired.length ? "MEDIUM" : "HIGH",
    warnings
  };
}

/* -------------------------------------------------------------------------- */
/*  Slots (receberArquivos / reatribuir / atualizarSlots)                      */
/* -------------------------------------------------------------------------- */

export function emptyMrpSlots<T>(): MrpSlots<T> {
  return { base: null, est: null, cmp: null };
}

/**
 * Encaixe de receberArquivos(): cada arquivo vai para o slot do tipo
 * detectado; se ocupado, para o 1º slot vazio na ordem base → est → cmp; se não
 * houver vazio, SUBSTITUI o do tipo detectado. Processa na ordem da lista (no
 * HTML a ordem é a de término da leitura de cada arquivo).
 */
export function assignMrpSlots<T extends { kind: MrpFileKind }>(slots: MrpSlots<T>, files: readonly T[]): MrpSlots<T> {
  const out: MrpSlots<T> = { ...slots };
  for (const file of files) {
    let slot = file.kind;
    if (out[slot]) slot = MRP_FILE_KINDS.find((k) => !out[k]) || file.kind;
    out[slot] = file;
  }
  return out;
}

/** `reatribuir()` — move o arquivo do slot `from` para `to`, trocando com o que estiver lá. */
export function reassignMrpSlot<T>(slots: MrpSlots<T>, from: MrpFileKind, to: MrpFileKind): MrpSlots<T> {
  if (from === to) return { ...slots };
  const out: MrpSlots<T> = { ...slots };
  const tmp = out[to];
  out[to] = out[from];
  out[from] = tmp || null;
  return out;
}

export type { MrpLockState } from "./lock";

/**
 * Trava do "Atualizar tudo" (`atualizarSlots()`) a partir dos cabeçalhos de cada
 * slot. A regra mora em ./lock (sem SheetJS, usável também no navegador).
 */
export function evaluateMrpLock(
  slots: MrpSlots<{ headers: readonly unknown[] }>,
  hasActiveBase: boolean
): MrpLockState {
  const flag = (kind: MrpFileKind) => (slots[kind] ? { requiredColumnsOk: mrpColumnsOk(kind, slots[kind]!.headers) } : null);
  return evaluateMrpLockFlags({ base: flag("base"), est: flag("est"), cmp: flag("cmp") }, hasActiveBase);
}
