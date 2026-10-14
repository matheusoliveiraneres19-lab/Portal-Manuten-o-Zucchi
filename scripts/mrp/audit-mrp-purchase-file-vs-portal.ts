/**
 * Auditoria SOMENTE LEITURA: cruza a planilha de compras usada no MRP
 * (ex.: "compras 0810.xlsx") com o PurchaseRecord do Portal, para descobrir
 * qual recorte do Portal equivale ao arquivo. Não grava nada.
 *   npx tsx scripts/mrp/audit-mrp-purchase-file-vs-portal.ts "<arquivo.xlsx>" [--direct]
 */
import { connectWithRetry } from "./script-db";
import { readFileSync } from "node:fs";
import * as XLSX from "xlsx";
import { prisma } from "../../src/lib/prisma";
import { parseMrpPurchases } from "../../src/lib/mrp/purchase-parser";
import { cleanCode } from "../../src/lib/mrp/normalization";

async function main() {
  const file = process.argv.find((a, i) => i > 1 && !a.startsWith("--"))!;
  const wb = XLSX.read(readFileSync(file), { type: "buffer", cellDates: false });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const aoa = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: "", raw: true });
  const headers = (aoa[0] as unknown[]).map(String);
  const rows = aoa.slice(1) as unknown[][];
  const parsed = parseMrpPurchases({ headers, rows, rowNumbers: rows.map((_, i) => i + 2) });
  console.log("headers", headers);
  console.log("file rows", parsed.rowsAccepted);

  await connectWithRetry(prisma, { label: "cruzamento" });
  const recs = await prisma.purchaseRecord.findMany({
    select: { id: true, materialCode: true, requisitionNumber: true, purchaseOrderNumber: true, quantity: true, receiptDate: true, ignored: true, ignoredReason: true, isService: true, purchaseType: true, goodsGroupDescription: true, purchasingGroup: true, importBatch: true, isReceiptConfirmed: true, pendingQuantity: true }
  });
  const key = (code: string, req: string, ped: string) => `${code}|${req}|${ped}`;
  const byKey = new Map<string, typeof recs>();
  for (const r of recs) {
    const k = key(cleanCode(r.materialCode ?? ""), cleanCode(r.requisitionNumber ?? ""), cleanCode(r.purchaseOrderNumber ?? ""));
    (byKey.get(k) ?? byKey.set(k, []).get(k)!).push(r);
  }
  const stats: Record<string, number> = {};
  const inc = (k: string) => (stats[k] = (stats[k] ?? 0) + 1);
  for (const it of parsed.items) {
    const m = byKey.get(key(it.code, it.requisitionNumber, it.purchaseOrderNumber));
    if (!m) { inc("noMatch"); if (it.receiptDate) inc("noMatch.rec"); else inc("noMatch.pend"); continue; }
    inc("match");
    const r = m[0];
    if (r.ignored) inc(`ignored:${r.ignoredReason ?? "?"}`.slice(0, 60));
    if (/servi/i.test(r.goodsGroupDescription ?? "")) inc("v31.service");
    if ((r.purchasingGroup ?? "").toUpperCase() === "Y04") inc("Y04");
    if (!!it.receiptDate !== !!r.receiptDate) inc("receiptMismatch");
    if (it.receiptDate && !r.isReceiptConfirmed) inc("fileRec.portalNotConfirmed");
  }
  console.log(stats);
}
main().finally(() => prisma.$disconnect());
