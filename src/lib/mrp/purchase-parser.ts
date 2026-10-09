/**
 * ANÁLISE MRP — leitura das COMPRAS REALIZADAS e índice da última compra,
 * porta 1:1 do `Analise_MRP_Compacto (1).html` (trecho de processar(),
 * cmpStatus, cmpOrdem e comprasIndex).
 *
 * Regras (todas do HTML):
 *   - só Material é obrigatório; os demais campos podem faltar;
 *   - toda linha com código entra — SEM deduplicação;
 *   - `seq` (= `c.i`) numera só as linhas aceitas: 0, 1, 2…;
 *   - datas em texto "YYYY-MM-DD" (parseData).
 */
import { detectCol, type MrpAliasField } from "./aliases";
import { parseData } from "./date-parser";
import { cleanCode, cleanText } from "./normalization";
import { parseNum } from "./number-parser";
import type { MrpSheetTable } from "./types";

/** Uma linha de `compras` do HTML. */
export type MrpPurchaseRecord = {
  /** c.i */
  seq: number;
  /** c.codigo */
  code: string;
  /** c.texto */
  text: string;
  /** c.qtd */
  quantity: number;
  /** c.dataReq */
  requisitionDate: string;
  /** c.requisicao */
  requisitionNumber: string;
  /** c.pedido */
  purchaseOrderNumber: string;
  /** c.recebimento */
  receiptDate: string;
  /** c.previsao */
  expectedDeliveryDate: string;
  /** c.fornecedor */
  supplier: string;
  sourceRow: number;
};

export type MrpPurchaseRowOutcome = {
  sourceRow: number;
  cells: unknown[];
  status: "VALID" | "IGNORED";
  code: string;
  seq?: number;
  reason?: "SEM_CODIGO";
};

export type MrpPurchaseParseResult = {
  ok: boolean;
  error?: string;
  rowsRead: number;
  rowsAccepted: number;
  emptyCodeRows: number;
  /** Campos opcionais reconhecidos (campo -> cabeçalho). */
  optionalColumns: Partial<Record<MrpAliasField, string>>;
  items: MrpPurchaseRecord[];
  rows: MrpPurchaseRowOutcome[];
};

export const MRP_PURCHASE_ERROR_COLUMNS = "Na planilha de compras não foi encontrada a coluna Material.";

const OPTIONAL_FIELDS = ["desc", "qtd", "data", "req", "ped", "rec", "prev", "forn"] as const;

export function parseMrpPurchases(table: Pick<MrpSheetTable, "headers" | "rows" | "rowNumbers">): MrpPurchaseParseResult {
  const C = table;
  const q = {
    cod: detectCol(C.headers, "cod"),
    txt: detectCol(C.headers, "desc"),
    qtd: detectCol(C.headers, "qtd"),
    data: detectCol(C.headers, "data"),
    req: detectCol(C.headers, "req"),
    ped: detectCol(C.headers, "ped"),
    rec: detectCol(C.headers, "rec"),
    prev: detectCol(C.headers, "prev"),
    forn: detectCol(C.headers, "forn")
  };
  const optionalColumns: Partial<Record<MrpAliasField, string>> = {};
  for (const field of OPTIONAL_FIELDS) {
    const i = detectCol(C.headers, field);
    if (i >= 0) optionalColumns[field] = String(C.headers[i] ?? "");
  }
  if (q.cod < 0) {
    return { ok: false, error: MRP_PURCHASE_ERROR_COLUMNS, rowsRead: C.rows.length, rowsAccepted: 0, emptyCodeRows: 0, optionalColumns, items: [], rows: [] };
  }

  const items: MrpPurchaseRecord[] = [];
  const rows: MrpPurchaseRowOutcome[] = [];
  let i = 0;
  let empty = 0;
  C.rows.forEach((r, k) => {
    const sourceRow = C.rowNumbers[k];
    const cod = cleanCode(r[q.cod]);
    if (!cod) {
      empty++;
      rows.push({ sourceRow, cells: r, status: "IGNORED", code: "", reason: "SEM_CODIGO" });
      return;
    }
    const seq = i++;
    items.push({
      seq,
      code: cod,
      text: q.txt >= 0 ? cleanText(r[q.txt]) : "",
      quantity: q.qtd >= 0 ? parseNum(r[q.qtd]) : 0,
      requisitionDate: q.data >= 0 ? parseData(r[q.data]) : "",
      requisitionNumber: q.req >= 0 ? cleanCode(r[q.req]) : "",
      purchaseOrderNumber: q.ped >= 0 ? cleanCode(r[q.ped]) : "",
      receiptDate: q.rec >= 0 ? parseData(r[q.rec]) : "",
      expectedDeliveryDate: q.prev >= 0 ? parseData(r[q.prev]) : "",
      supplier: q.forn >= 0 ? cleanText(r[q.forn]) : "",
      sourceRow
    });
    rows.push({ sourceRow, cells: r, status: "VALID", code: cod, seq });
  });

  return { ok: true, rowsRead: C.rows.length, rowsAccepted: items.length, emptyCodeRows: empty, optionalColumns, items, rows };
}

/* -------------------------------------------------------------------------- */
/*  Última compra (usado pelo motor na FASE D)                                 */
/* -------------------------------------------------------------------------- */

export type MrpPurchaseStatus = "rec" | "pend" | "sem";

type PurchaseKeyFields = Pick<
  MrpPurchaseRecord,
  "seq" | "requisitionDate" | "receiptDate" | "expectedDeliveryDate" | "purchaseOrderNumber" | "requisitionNumber"
>;

/** `cmpStatus()` — recebido / pendente (em trânsito) / sem pedido-requisição. */
export function getMrpPurchaseStatus(c: Pick<MrpPurchaseRecord, "receiptDate" | "purchaseOrderNumber" | "requisitionNumber">): MrpPurchaseStatus {
  if (c.receiptDate) return "rec";
  return c.purchaseOrderNumber || c.requisitionNumber ? "pend" : "sem";
}

/**
 * `cmpOrdem()` — chave de ordenação, comparada como TEXTO:
 *   (dataReq || recebimento || previsao || "0000-00-00") | pedido(12) | requisição(12) | seq(7)
 */
export function mrpPurchaseOrderKey(c: PurchaseKeyFields): string {
  const d = c.requisitionDate || c.receiptDate || c.expectedDeliveryDate || "0000-00-00";
  return (
    d +
    "|" +
    String(c.purchaseOrderNumber || "").padStart(12, "0") +
    "|" +
    String(c.requisitionNumber || "").padStart(12, "0") +
    "|" +
    String(c.seq).padStart(7, "0")
  );
}

export type MrpPurchaseGroup<T extends PurchaseKeyFields & { code: string }> = {
  code: string;
  /** Itens em ordem crescente de cmpOrdem. */
  items: T[];
  /** `g.ultima` — o de MAIOR chave. */
  last: T;
  status: MrpPurchaseStatus;
  /** `g.n` */
  count: number;
};

/** `comprasIndex()` — agrupa por material e define a última compra de cada um. */
export function buildMrpPurchaseIndex<T extends PurchaseKeyFields & { code: string; receiptDate: string }>(
  purchases: readonly T[]
): Map<string, MrpPurchaseGroup<T>> {
  const m = new Map<string, { code: string; items: T[] }>();
  for (const c of purchases) {
    if (!c.code) continue;
    let g = m.get(c.code);
    if (!g) {
      g = { code: c.code, items: [] };
      m.set(c.code, g);
    }
    g.items.push(c);
  }
  const out = new Map<string, MrpPurchaseGroup<T>>();
  for (const [code, g] of Array.from(m.entries())) {
    g.items.sort((a, b) => {
      const ka = mrpPurchaseOrderKey(a),
        kb = mrpPurchaseOrderKey(b);
      return ka < kb ? -1 : ka > kb ? 1 : 0;
    });
    const last = g.items[g.items.length - 1];
    out.set(code, { code, items: g.items, last, status: getMrpPurchaseStatus(last), count: g.items.length });
  }
  return out;
}
