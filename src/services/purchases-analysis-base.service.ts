/**
 * Compras — cláusulas SQL da REGRA OFICIAL v3.1 e leitura da base de análise do
 * retrato atual, SEM `react.cache`: este módulo também roda fora do Next (CLI
 * `import:purchases`, scripts), onde `cache()` não existe. `purchases.service`
 * reaproveita as mesmas cláusulas, então páginas e Análise MRP leem igual.
 */
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { classifyPurchaseV31HtmlRule, type PurchaseV31Group } from "@/utils/purchase-classification";
import { getTodayDate } from "@/utils/date";

/**
 * Tradução para SQL da `classifyPurchaseV31HtmlRule`. As cláusulas leem as
 * COLUNAS CRUAS gravadas na importação (`goodsGroupDescription`,
 * `purchasingGroup`, `purchaseOrderNumber`, `receiptDate`,
 * `expectedDeliveryDate`) — de propósito NÃO usam as flags derivadas
 * (`ignored`, `isService`, `purchaseType`), que carregam as exclusões da regra
 * gerencial e não existem no HTML.
 *
 * Consequência prática: nenhuma reimportação é necessária para a aba passar a
 * seguir a regra v3.1, e a regra não pode "envelhecer" junto com as flags.
 *
 * Toda negação é escrita com `OR [{campo: null}, {NOT ...}]` porque em SQL
 * `NOT (coluna ILIKE ...)` é NULL quando a coluna é NULL — e a linha sumiria da
 * base de análise em vez de entrar nela.
 */
export const V31_SERVICE: Prisma.PurchaseRecordWhereInput = {
  goodsGroupDescription: { contains: "servi", mode: "insensitive" }
};
export const V31_NOT_SERVICE: Prisma.PurchaseRecordWhereInput = {
  OR: [{ goodsGroupDescription: null }, { NOT: V31_SERVICE }]
};
export const V31_Y04: Prisma.PurchaseRecordWhereInput = {
  purchasingGroup: { equals: "Y04", mode: "insensitive" }
};
export const V31_NOT_Y04: Prisma.PurchaseRecordWhereInput = {
  OR: [{ purchasingGroup: null }, { NOT: V31_Y04 }]
};
/** Base de análise = não é serviço E não é Y04. */
export const V31_ANALYSIS_BASE: Prisma.PurchaseRecordWhereInput = { AND: [V31_NOT_SERVICE, V31_NOT_Y04] };

/** "Pedido de Compra"/"Data Recebimento" preenchidos — vazio vira NULL na importação. */
export const V31_HAS_ORDER: Prisma.PurchaseRecordWhereInput = { NOT: { purchaseOrderNumber: null } };
export const V31_NO_ORDER: Prisma.PurchaseRecordWhereInput = { purchaseOrderNumber: null };
export const V31_RECEIVED: Prisma.PurchaseRecordWhereInput = { NOT: { receiptDate: null } };
export const V31_NOT_RECEIVED: Prisma.PurchaseRecordWhereInput = { receiptDate: null };

/** Linha da base de análise v3.1 no retrato atual — consumida pela Análise MRP. */
export type PurchaseAnalysisBaseRecord = {
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
  /** RECEBIDOS | PENDENTE_COMPRA | EM_ATRASO | NAO_ENTREGUES (nunca SERVICOS/REGULARIZACAO). */
  v31Group: PurchaseV31Group;
};

export type PurchaseAnalysisBaseSnapshot = {
  /** Lote do retrato atual (null = nenhuma importação de compras). */
  importBatch: string | null;
  records: PurchaseAnalysisBaseRecord[];
};

/**
 * Compras do RETRATO ATUAL (última importação — o mesmo recorte de Compras
 * Pendentes e do "Retrato atual" de Compras Realizadas) dentro da BASE DE ANÁLISE
 * da regra oficial v3.1 (nem serviço, nem Y04), cada linha com o grupo v3.1
 * calculado pela MESMA `classifyPurchaseV31HtmlRule` das páginas.
 *
 * Duas consultas (lote + linhas), sem cache: o snapshot do MRP tem de ver o
 * banco no instante da execução. Sem filtros de usuário. Erros de banco
 * propagam — quem chama decide (o MRP não pode confundir falha com "0 compras").
 */
export async function getPurchaseAnalysisBaseSnapshot(today: Date = getTodayDate()): Promise<PurchaseAnalysisBaseSnapshot> {
  const importBatch = await getLatestPurchaseImportBatch();
  if (!importBatch) return { importBatch: null, records: [] };
  const rows = await prisma.purchaseRecord.findMany({
    where: { AND: [{ importBatch }, V31_ANALYSIS_BASE] },
    select: {
      technicalKey: true,
      materialCode: true,
      itemDescription: true,
      quantity: true,
      pendingQuantity: true,
      requisitionNumber: true,
      purchaseOrderNumber: true,
      supplierName: true,
      requisitionDate: true,
      expectedDeliveryDate: true,
      receiptDate: true,
      goodsGroupDescription: true,
      purchasingGroup: true
    }
  });
  const records: PurchaseAnalysisBaseRecord[] = [];
  for (const { goodsGroupDescription, purchasingGroup, ...row } of rows) {
    const v31 = classifyPurchaseV31HtmlRule(
      {
        goodsGroupDescription,
        purchasingGroup,
        purchaseOrderNumber: row.purchaseOrderNumber,
        receiptDate: row.receiptDate,
        expectedDeliveryDate: row.expectedDeliveryDate
      },
      today
    );
    // A cláusula SQL já restringe à base de análise; a checagem só blinda contra divergência.
    if (v31.inAnalysisBase) records.push({ ...row, v31Group: v31.group });
  }
  return { importBatch, records };
}

/** Lote do retrato atual das compras (o da linha gravada por último), sem cache. */
export async function getLatestPurchaseImportBatch(): Promise<string | null> {
  const latest = await prisma.purchaseRecord.findFirst({
    where: { importBatch: { not: null } },
    orderBy: { updatedAt: "desc" },
    select: { importBatch: true }
  });
  return latest?.importBatch ?? null;
}
