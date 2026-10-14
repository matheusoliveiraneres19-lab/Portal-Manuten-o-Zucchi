/**
 * Auditoria SOMENTE LEITURA das compras do Portal (PurchaseRecord) para a
 * integração com a Análise MRP. Não grava nada.
 *   npx tsx scripts/mrp/audit-portal-purchases.ts [--direct]
 */
import { connectWithRetry } from "./script-db";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  await connectWithRetry(prisma, { label: "auditoria compras" });
  const total = await prisma.purchaseRecord.count();
  const batches = await prisma.purchaseRecord.groupBy({ by: ["importBatch"], _count: true, _max: { updatedAt: true } });
  batches.sort((a, b) => String(b._max.updatedAt).localeCompare(String(a._max.updatedAt)));
  console.log("total", total);
  console.log("batches", batches.slice(0, 5).map((b) => [b.importBatch, b._count, b._max.updatedAt]));
  const latest = (await prisma.purchaseRecord.findFirst({ where: { importBatch: { not: null } }, orderBy: { updatedAt: "desc" }, select: { importBatch: true } }))?.importBatch;
  const inLatest = { importBatch: latest };
  const c = (w: object) => prisma.purchaseRecord.count({ where: { AND: [inLatest, w] } });
  console.log("latestBatch", latest, await c({}));
  console.log("withMaterial", await c({ NOT: { materialCode: null } }));
  console.log("received(receiptDate)", await c({ NOT: { receiptDate: null } }));
  console.log("receiptDate && !confirmed", await c({ NOT: { receiptDate: null }, isReceiptConfirmed: false }));
  console.log("confirmed && !receiptDate", await c({ receiptDate: null, isReceiptConfirmed: true }));
  console.log("receiptDate && pendingQty>0", await c({ NOT: { receiptDate: null }, pendingQuantity: { gt: 0 } }));
  console.log("!receiptDate && pendingQty null", await c({ receiptDate: null, pendingQuantity: null }));
  console.log("!receiptDate && pendingQty<quantity", await prisma.$queryRawUnsafe(`select count(*)::int n from "PurchaseRecord" where "importBatch"=$1 and "receiptDate" is null and "pendingQuantity" is not null and "pendingQuantity" < "quantity"`, latest));
  console.log("migo && !receiptDate", await c({ receiptDate: null, NOT: { migoDate: null } }));
  console.log("no PO no receipt", await c({ purchaseOrderNumber: null, receiptDate: null }));
  console.log("PO no receipt", await c({ NOT: { purchaseOrderNumber: null }, receiptDate: null }));
  console.log("no PO no req", await c({ purchaseOrderNumber: null, requisitionNumber: null }));
  console.log("service(v31)", await c({ goodsGroupDescription: { contains: "servi", mode: "insensitive" } }));
  console.log("Y04", await c({ purchasingGroup: { equals: "Y04", mode: "insensitive" } }));
  console.log("ignored", await c({ ignored: true }));
  console.log("not in latest batch", await prisma.purchaseRecord.count({ where: { NOT: inLatest } }));
  console.log("not in latest & open", await prisma.purchaseRecord.count({ where: { NOT: inLatest, receiptDate: null } }));
  const sample = await prisma.purchaseRecord.findMany({ where: { AND: [inLatest, { NOT: { receiptDate: null } }, { isReceiptConfirmed: false }] }, take: 3, select: { materialCode: true, quantity: true, pendingQuantity: true, receiptDate: true, migoDate: true, purchaseOrderNumber: true } });
  console.log("partial sample", sample);
  const codes = await prisma.purchaseRecord.findMany({ where: { AND: [inLatest, { NOT: { materialCode: null } }] }, select: { materialCode: true }, take: 10 });
  console.log("code sample", codes.map((x) => x.materialCode));
  const hist = await prisma.importHistory.findMany({ where: { type: "COMPRAS" }, orderBy: { createdAt: "desc" }, take: 3, select: { fileName: true, createdAt: true, status: true, totalRows: true } });
  console.log("history", hist);
}
main().finally(() => prisma.$disconnect());
