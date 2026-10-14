/**
 * ANÁLISE MRP — compras do Portal no formato do motor (sem planilha de compras).
 *
 * Conversão PURA (sem banco) das linhas de `PurchaseRecord` já classificadas
 * pela regra oficial v3.1 de Compras (`getPurchaseAnalysisBaseSnapshot`) para o
 * mesmo `MrpPurchaseRecord` que o parser da planilha produzia. O motor, o
 * `cmpStatus()`, o `cmpOrdem()` e a "última compra" não mudam: só a origem.
 *
 * Mapeamento (coluna da antiga planilha → PurchaseRecord):
 *   Material              → materialCode (cleanCode: zeros à esquerda mantidos)
 *   Texto Breve do Pedido → itemDescription (cleanText)
 *   Quantid               → quantity (vazio = 0, como o parseNum da planilha)
 *   Data da Requisição    → requisitionDate
 *   Requisição            → requisitionNumber (cleanCode)
 *   Pedido de Compra      → purchaseOrderNumber (cleanCode)
 *   Data Recebimento      → receiptDate — SÓ no grupo RECEBIDOS (a data real gravada)
 *   Previsão de entrega   → expectedDeliveryDate
 *   Descrição Fornecedor  → supplierName (cleanText)
 *
 * Datas: o Portal grava a data do SAP à meia-noite UTC; a saída é o texto
 * "YYYY-MM-DD" da parseData() da planilha.
 *
 * Cada PurchaseRecord do lote é UM item (chave técnica única), então pendente e
 * recebido nunca coexistem para a mesma linha. Não há dedup por material.
 *
 * Ordem (`seq`, último desempate do cmpOrdem e 1ª aparição na aba Em trânsito):
 * a planilha tinha ordem física; o banco não. Usa-se uma ordem determinística:
 * data da requisição, requisição, pedido, material e chave técnica.
 */
import { cleanCode, cleanText } from "./normalization";
import type { MrpPurchaseRecord } from "./purchase-parser";

/** Grupos da regra v3.1 que chegam ao MRP (a base de análise). */
export type MrpPortalPurchaseGroup = "RECEBIDOS" | "PENDENTE_COMPRA" | "EM_ATRASO" | "NAO_ENTREGUES";

/** Campos de `PurchaseAnalysisBaseRecord` usados aqui. */
export type MrpPortalPurchaseSource = {
  technicalKey: string;
  materialCode: string | null;
  itemDescription: string;
  quantity: number | null;
  pendingQuantity: number | null;
  requisitionNumber: string | null;
  purchaseOrderNumber: string | null;
  supplierName: string | null;
  requisitionDate: Date | null;
  expectedDeliveryDate: Date | null;
  receiptDate: Date | null;
  v31Group: string;
};

export type MrpPortalPurchaseItem = Omit<MrpPurchaseRecord, "sourceRow">;

export type MrpPortalPurchaseCounts = {
  /** Linhas da base de análise v3.1 no retrato atual (com e sem material). */
  sourceLines: number;
  /** Linhas sem código de material (não entram no MRP, como na planilha). */
  withoutMaterial: number;
  /** Linhas no snapshot. */
  lines: number;
  /** Em aberto = sem Data Recebimento (Compras Pendentes + pedidos não entregues). */
  open: number;
  /** …das quais: requisição sem pedido (aba Compras Pendentes). */
  openWithoutOrder: number;
  /** …das quais: pedido emitido, previsão vencida. */
  openLate: number;
  /** …das quais: pedido emitido, previsão vazia ou futura. */
  openOnTime: number;
  /** Recebidas = Data Recebimento preenchida (grupo RECEBIDOS). */
  received: number;
  /** Recebidas com "Quant Pendente" > 0 (recebimento parcial no SAP) — só auditoria. */
  receivedWithPendingQty: number;
  /** Códigos de material distintos. */
  codes: number;
};

const OPEN_GROUPS = new Set<string>(["PENDENTE_COMPRA", "EM_ATRASO", "NAO_ENTREGUES"]);

/** Data do Portal (meia-noite UTC) → "YYYY-MM-DD" | "". */
export function portalDateToMrp(value: Date | null): string {
  if (!value || isNaN(value.getTime())) return "";
  return value.toISOString().slice(0, 10);
}

function compareText(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/** Converte o retrato v3.1 do Portal nas linhas de compra do MRP (`seq` 0, 1, 2…). */
export function buildMrpPortalPurchases(records: readonly MrpPortalPurchaseSource[]): {
  items: MrpPortalPurchaseItem[];
  counts: MrpPortalPurchaseCounts;
} {
  const counts: MrpPortalPurchaseCounts = {
    sourceLines: records.length,
    withoutMaterial: 0,
    lines: 0,
    open: 0,
    openWithoutOrder: 0,
    openLate: 0,
    openOnTime: 0,
    received: 0,
    receivedWithPendingQty: 0,
    codes: 0
  };

  const rows: { key: string[]; item: Omit<MrpPortalPurchaseItem, "seq"> }[] = [];
  for (const r of records) {
    if (r.v31Group !== "RECEBIDOS" && !OPEN_GROUPS.has(r.v31Group)) {
      throw new Error(`Compra fora da base de análise v3.1 (${r.v31Group}): ${r.technicalKey}`);
    }
    const code = cleanCode(r.materialCode);
    if (!code) {
      counts.withoutMaterial++;
      continue;
    }
    const received = r.v31Group === "RECEBIDOS";
    const receiptDate = received ? portalDateToMrp(r.receiptDate) : "";
    if (received && !receiptDate) throw new Error(`Compra recebida sem Data Recebimento: ${r.technicalKey}`);

    if (received) {
      counts.received++;
      if ((r.pendingQuantity ?? 0) > 0) counts.receivedWithPendingQty++;
    } else {
      counts.open++;
      if (r.v31Group === "PENDENTE_COMPRA") counts.openWithoutOrder++;
      else if (r.v31Group === "EM_ATRASO") counts.openLate++;
      else counts.openOnTime++;
    }

    const item = {
      code,
      text: cleanText(r.itemDescription),
      quantity: r.quantity ?? 0,
      requisitionDate: portalDateToMrp(r.requisitionDate),
      requisitionNumber: cleanCode(r.requisitionNumber),
      purchaseOrderNumber: cleanCode(r.purchaseOrderNumber),
      receiptDate,
      expectedDeliveryDate: portalDateToMrp(r.expectedDeliveryDate),
      supplier: cleanText(r.supplierName)
    };
    rows.push({ key: [item.requisitionDate, item.requisitionNumber, item.purchaseOrderNumber, code, r.technicalKey], item });
  }

  rows.sort((a, b) => {
    for (let i = 0; i < a.key.length; i++) {
      const c = compareText(a.key[i], b.key[i]);
      if (c) return c;
    }
    return 0;
  });
  const items = rows.map((r, seq) => ({ seq, ...r.item }));
  counts.lines = items.length;
  counts.codes = new Set(items.map((i) => i.code)).size;
  return { items, counts };
}

/**
 * O lote tem as colunas de recebimento? Mesmo critério de `measureColumnAvailability`
 * das páginas de Compras: a coluna existe se ALGUMA linha a preencheu. Lote sem
 * nenhum pedido (só requisições, ou vazio) não tem o que receber — é válido.
 */
export function portalBatchHasReceiptData(records: readonly MrpPortalPurchaseSource[]): boolean {
  if (!records.some((r) => r.purchaseOrderNumber)) return true;
  return records.some((r) => r.receiptDate || r.expectedDeliveryDate || r.pendingQuantity !== null);
}
