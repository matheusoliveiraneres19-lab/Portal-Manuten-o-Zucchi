/**
 * ANÁLISE MRP — compras do Portal (adapter) × planilha de compras: REGRESSÃO.
 *
 * O motor não muda; só a origem das compras. Aqui cada conjunto de compras que
 * a planilha produzia é convertido para o formato do Portal (PurchaseRecord já
 * classificado pela regra v3.1), passa pelo adapter `buildMrpPortalPurchases`
 * e o resultado do motor é comparado com o da planilha:
 *   - analyzeMrp (todos os campos de todos os materiais);
 *   - KPIs de compras (purchaseKpis) e grupos da aba Em trânsito.
 * Mais os casos obrigatórios: recebida antiga + pendente nova, o inverso,
 * material fora da Base, zeros à esquerda, recebida sem data (erro), datas.
 *
 *   npm run test:mrp-portal-purchases ["<compras.xlsx>" "<estoque.xlsx>"]
 * Sem banco.
 */
import "./mrp/force-utc";
import { existsSync, readFileSync } from "node:fs";
import { analyzeMrp, purchaseKpis, type MrpEngineMaterial, type MrpEnginePurchase } from "../src/lib/mrp/analysis-engine";
import { buildMrpMaterialsFromHtmlSeed } from "../src/lib/mrp/html-seed";
import { buildMrpImportPlan, type MrpPlanFile } from "../src/lib/mrp/import-plan";
import { analyzeMrpWorkbook } from "../src/lib/mrp/file-detection";
import type { MrpFileKind } from "../src/lib/mrp/types";
import { readMrpWorkbook, type MrpWorkbook } from "../src/lib/mrp/workbook";
import { buildMrpPortalPurchases, portalBatchHasReceiptData, portalDateToMrp, type MrpPortalPurchaseSource } from "../src/lib/mrp/portal-purchases";
import { buildMrpTransitGroups } from "../src/lib/mrp/transit";
import * as F from "./mrp/fixtures";
import { loadHtmlReference } from "./mrp/html-reference";

let failures = 0;
let checks = 0;
function check(label: string, ok: boolean, detail?: unknown) {
  checks++;
  if (!ok) failures++;
  console.log(`${ok ? "✅" : "❌"} ${label}${!ok && detail !== undefined ? ` — ${JSON.stringify(detail).slice(0, 400)}` : ""}`);
}

const utc = (iso: string) => (iso ? new Date(`${iso}T00:00:00.000Z`) : null);

/** Linha da planilha → PurchaseRecord do Portal (o que a importação de Compras gravaria). */
function toPortal(p: MrpEnginePurchase, i: number, extra: Partial<MrpPortalPurchaseSource> = {}): MrpPortalPurchaseSource {
  return {
    technicalKey: `fx|${i}`,
    materialCode: p.code,
    itemDescription: p.text,
    quantity: p.quantity,
    pendingQuantity: null,
    requisitionNumber: p.requisitionNumber || null,
    purchaseOrderNumber: p.purchaseOrderNumber || null,
    supplierName: p.supplier || null,
    requisitionDate: utc(p.requisitionDate),
    expectedDeliveryDate: utc(p.expectedDeliveryDate),
    receiptDate: utc(p.receiptDate),
    v31Group: p.receiptDate ? "RECEBIDOS" : p.purchaseOrderNumber ? "NAO_ENTREGUES" : "PENDENTE_COMPRA",
    ...extra
  };
}

/** Arquivo do plano com a aba que a detecção do portal escolheria. */
function planFile(fileName: string, wb: MrpWorkbook, kind: MrpFileKind): MrpPlanFile {
  return { fileName, wb, kind, sheet: analyzeMrpWorkbook(fileName, wb)?.table.sheet ?? wb.SheetNames[0] };
}

const byCode =<T extends { code: string }>(list: T[]) => [...list].sort((a, b) => (a.code < b.code ? -1 : a.code > b.code ? 1 : 0));

/** Mesmo resultado final do motor com as compras da planilha e com as do adapter. */
function compareDataset(label: string, materials: MrpEngineMaterial[], stock: Map<string, number>, sheet: MrpEnginePurchase[]) {
  const { items, counts } = buildMrpPortalPurchases(sheet.map((p, i) => toPortal(p, i)));
  check(`${label}: ${sheet.length} linhas → ${items.length} no snapshot`, items.length === sheet.length && counts.lines === sheet.length);
  check(`${label}: seq 0..n-1`, items.every((it, i) => it.seq === i));

  const a = analyzeMrp(materials, stock, sheet);
  const b = analyzeMrp(materials, stock, items);
  const diverg = a.filter((r, i) => JSON.stringify(r) !== JSON.stringify(b[i]));
  check(`${label}: analyzeMrp idêntico (${a.length} materiais, ${diverg.length} divergências)`, a.length === b.length && diverg.length === 0, diverg.slice(0, 2).map((r) => [r, b[a.indexOf(r)]]));
  check(`${label}: KPIs de compras idênticos`, JSON.stringify(purchaseKpis(sheet)) === JSON.stringify(purchaseKpis(items)), [purchaseKpis(sheet), purchaseKpis(items)]);

  const lookup = new Map(a.map((r) => [r.code, r]));
  const strip = (g: ReturnType<typeof buildMrpTransitGroups>[number]) => ({ ...g, firstSeq: undefined });
  const ta = byCode(buildMrpTransitGroups(sheet, lookup)).map(strip);
  const tb = byCode(buildMrpTransitGroups(items, lookup)).map(strip);
  check(`${label}: Em trânsito — mesmos ${ta.length} grupos e mesma última compra`, JSON.stringify(ta) === JSON.stringify(tb));
}

function fixtureDatasets() {
  console.log("\n1. Fixtures das fases anteriores (planilha → Portal → motor)");
  for (const [label, files] of [
    ["base + estoque + compras", [F.baseFixture(), F.stockFixture(), F.purchaseFixture()]],
    ["base + estoque + compras CSV", [F.baseFixture(), F.stockFixture(), F.purchaseCsvFixture()]]
  ] as [string, F.FixtureFile[]][]) {
    const kinds = ["base", "est", "cmp"] as const;
    const plan = buildMrpImportPlan(
      files.map((f, i) => planFile(f.name, readMrpWorkbook(f.data), kinds[i])),
      { depositFilter: "1400" }
    );
    compareDataset(label, plan.base!.result.materials, new Map(plan.stock!.result.items.map((i) => [i.code, i.freeQty])), plan.purchases!.result.items);
  }
}

function fuzzDatasets() {
  console.log("\n2. Base embutida real (4.280) + compras sintéticas (sementes fixas)");
  const ref = loadHtmlReference();
  const materials = buildMrpMaterialsFromHtmlSeed(ref.seedMan, ref.seedEle).materials;
  for (const seed of [1, 42, 2026]) {
    const rng = mulberry32(seed);
    const stock = new Map<string, number>();
    const purchases: MrpEnginePurchase[] = [];
    // Datas e requisições únicas por linha: na planilha o desempate final era a
    // posição física (seq); no Portal não existe essa posição (ver seção 4).
    let n = 0;
    for (const m of materials) {
      if (rng() < 0.85) stock.set(m.code, [0, 1, 2, 5, 10, 12.5, 100][Math.floor(rng() * 7)]);
      const k = rng() < 0.3 ? 1 + Math.floor(rng() * 4) : 0;
      for (let j = 0; j < k; j++) purchases.push(randomPurchase(rng, m.code, n++));
    }
    for (let i = 0; i < 60; i++) purchases.push(randomPurchase(rng, `X${i}`, n++));
    compareDataset(`semente ${seed} (${purchases.length} compras)`, materials, stock, purchases);
  }
}

function realFiles() {
  const [cmpPath, estPath] = process.argv.slice(2);
  const cmp = cmpPath ?? "C:/Users/matheus.neres/Downloads/compras 0810.xlsx";
  const est = estPath ?? "C:/Users/matheus.neres/Downloads/estoque 0810.xlsx";
  console.log("\n3. Arquivos reais da validação final (compras 0810 + estoque 0810, base embutida)");
  if (!existsSync(cmp) || !existsSync(est)) {
    console.log("   (arquivos não encontrados — seção pulada)");
    return;
  }
  const plan = buildMrpImportPlan(
    [
      planFile("estoque", readMrpWorkbook(readFileSync(est)), "est"),
      planFile("compras", readMrpWorkbook(readFileSync(cmp)), "cmp")
    ],
    { depositFilter: "1000" }
  );
  const ref = loadHtmlReference();
  const materials = buildMrpMaterialsFromHtmlSeed(ref.seedMan, ref.seedEle).materials;
  const sheet = plan.purchases!.result.items;
  compareDataset(`compras 0810 (${sheet.length} linhas)`, materials, new Map(plan.stock!.result.items.map((i) => [i.code, i.freeQty])), sheet);
  const k = purchaseKpis(sheet);
  console.log(`   pendentes ${k.pendentes} · recebidos ${k.recebidos} · Qtd. em trânsito ${k.qtdPendente}`);
}

function requiredCases() {
  console.log("\n4. Casos obrigatórios");
  const mat = (code: string): MrpEngineMaterial => ({ code, description: code, group: "", unit: "PEC", area: "Mecânica", family: "", min: 5, max: 10, statusMrp: "Comprar / Repor" });
  const src = (o: Partial<MrpPortalPurchaseSource> & { technicalKey: string; materialCode: string | null }): MrpPortalPurchaseSource => ({
    itemDescription: "item",
    quantity: 3,
    pendingQuantity: null,
    requisitionNumber: null,
    purchaseOrderNumber: null,
    supplierName: "Fornecedor",
    requisitionDate: null,
    expectedDeliveryDate: null,
    receiptDate: null,
    v31Group: "PENDENTE_COMPRA",
    ...o
  });

  // 54: recebida antiga + pendente mais recente → última = pendente → Comprado.
  {
    const { items } = buildMrpPortalPurchases([
      src({ technicalKey: "a", materialCode: "100", requisitionNumber: "1", purchaseOrderNumber: "45001", requisitionDate: utc("2026-01-10"), receiptDate: utc("2026-02-01"), v31Group: "RECEBIDOS", quantity: 9 }),
      src({ technicalKey: "b", materialCode: "100", requisitionNumber: "2", purchaseOrderNumber: "45002", requisitionDate: utc("2026-09-10"), expectedDeliveryDate: utc("2026-11-01"), v31Group: "NAO_ENTREGUES", quantity: 4 })
    ]);
    const [r] = analyzeMrp([mat("100")], new Map([["100", 0]]), items);
    check("54. recebida antiga + pendente nova → Comprado, suggested 0, última = pedido 45002", r.status === "Comprado" && r.suggested === 0 && r.suggestedOriginal === 10 && r.purchase?.order === "45002" && r.purchase.qty === 4, r);
  }
  // 55: pendente antiga + recebida mais recente → última = recebida → continua Comprar.
  {
    const { items } = buildMrpPortalPurchases([
      src({ technicalKey: "a", materialCode: "200", requisitionNumber: "1", requisitionDate: utc("2026-01-10"), v31Group: "PENDENTE_COMPRA" }),
      src({ technicalKey: "b", materialCode: "200", requisitionNumber: "2", purchaseOrderNumber: "45009", requisitionDate: utc("2026-09-10"), receiptDate: utc("2026-10-01"), v31Group: "RECEBIDOS" })
    ]);
    const [r] = analyzeMrp([mat("200")], new Map([["200", 0]]), items);
    const g = buildMrpTransitGroups(items, new Map([["200", r]]))[0];
    check("55. pendente antiga + recebida nova → Comprar (a pendência antiga não segura o material)", r.status === "Comprar" && r.suggested === 10 && g.status === "rec", { r, g });
  }
  // 56: pendente de código fora da Base → aparece em Em trânsito como fora da base.
  {
    const { items } = buildMrpPortalPurchases([src({ technicalKey: "a", materialCode: "999", requisitionNumber: "7", requisitionDate: utc("2026-09-01") })]);
    const analysis = analyzeMrp([mat("100")], new Map(), items);
    const g = buildMrpTransitGroups(items, new Map(analysis.map((r) => [r.code, r])))[0];
    check("56. pendente fora da Base → grupo pend em Em trânsito, sem item na análise", g.code === "999" && g.status === "pend" && !g.inBase, g);
  }
  // 34: recebida não retira o material da necessidade.
  {
    const { items } = buildMrpPortalPurchases([src({ technicalKey: "a", materialCode: "300", purchaseOrderNumber: "45010", requisitionDate: utc("2026-03-01"), receiptDate: utc("2026-03-20"), v31Group: "RECEBIDOS" })]);
    const [r] = analyzeMrp([mat("300")], new Map([["300", 0]]), items);
    check("34. só compra recebida → continua Comprar", r.status === "Comprar" && r.suggested === 10, r);
  }
  // Pedido atrasado (EM_ATRASO) também é em trânsito.
  {
    const { items, counts } = buildMrpPortalPurchases([src({ technicalKey: "a", materialCode: "400", purchaseOrderNumber: "45011", expectedDeliveryDate: utc("2026-01-01"), v31Group: "EM_ATRASO" })]);
    const [r] = analyzeMrp([mat("400")], new Map([["400", 0]]), items);
    check("pedido em atraso → Comprado + previsão na observação", r.status === "Comprado" && r.purchase?.forecast === "2026-01-01" && counts.openLate === 1, r);
  }
  // Zeros à esquerda e normalização (cleanCode/cleanText).
  {
    const { items, counts } = buildMrpPortalPurchases([
      src({ technicalKey: "a", materialCode: " 000123 ", itemDescription: "  Rolamento   6205 " }),
      src({ technicalKey: "b", materialCode: "123" }),
      src({ technicalKey: "c", materialCode: null })
    ]);
    check("zeros à esquerda mantidos (000123 ≠ 123), texto limpo, sem material ignorado", items.some((i) => i.code === "000123" && i.text === "Rolamento 6205") && items.some((i) => i.code === "123") && counts.withoutMaterial === 1 && counts.codes === 2);
  }
  // Recebida usa a data REAL; pendente nunca carrega data de recebimento.
  {
    const { items } = buildMrpPortalPurchases([
      src({ technicalKey: "a", materialCode: "1", receiptDate: utc("2026-05-07"), v31Group: "RECEBIDOS" }),
      src({ technicalKey: "b", materialCode: "2", receiptDate: null, v31Group: "NAO_ENTREGUES", purchaseOrderNumber: "45" })
    ]);
    check("datas: recebida = 2026-05-07; pendente = ''", items.find((i) => i.code === "1")!.receiptDate === "2026-05-07" && items.find((i) => i.code === "2")!.receiptDate === "");
    check("portalDateToMrp(null) = ''", portalDateToMrp(null) === "");
  }
  // Recebida sem data e grupo fora da base são erros (nunca inventa data, nunca aceita serviço/Y04).
  {
    let e1 = false, e2 = false;
    try { buildMrpPortalPurchases([src({ technicalKey: "a", materialCode: "1", v31Group: "RECEBIDOS" })]); } catch { e1 = true; }
    try { buildMrpPortalPurchases([src({ technicalKey: "a", materialCode: "1", v31Group: "SERVICOS" })]); } catch { e2 = true; }
    check("recebida sem Data Recebimento → erro (não inventa data)", e1);
    check("grupo SERVICOS/REGULARIZACAO → erro (fora da base v3.1)", e2);
  }
  // Recebimento parcial: regra v3.1 = recebida; só contado na auditoria.
  {
    const { counts } = buildMrpPortalPurchases([src({ technicalKey: "a", materialCode: "1", receiptDate: utc("2026-05-07"), v31Group: "RECEBIDOS", quantity: 3, pendingQuantity: 1 })]);
    check("recebimento parcial (Quant Pendente > 0) contado em receivedWithPendingQty", counts.received === 1 && counts.receivedWithPendingQty === 1);
  }
  // Zero compras é válido.
  {
    const { items, counts } = buildMrpPortalPurchases([]);
    check("zero compras → snapshot vazio válido", items.length === 0 && counts.lines === 0);
  }
  // Export sem colunas de recebimento (requisicoes_compra diário) não pode virar "tudo em trânsito".
  {
    const daily = [
      src({ technicalKey: "a", materialCode: "1", purchaseOrderNumber: "45001", v31Group: "NAO_ENTREGUES" }),
      src({ technicalKey: "b", materialCode: "2", v31Group: "PENDENTE_COMPRA" })
    ];
    check("lote com pedidos e sem Data Recebimento/Previsão/Quant Pendente → sem dados de recebimento", !portalBatchHasReceiptData(daily));
    check("lote com alguma Previsão ou Quant Pendente → tem colunas de recebimento",
      portalBatchHasReceiptData([...daily, src({ technicalKey: "c", materialCode: "3", purchaseOrderNumber: "45002", expectedDeliveryDate: utc("2026-11-01"), v31Group: "NAO_ENTREGUES" })]) &&
      portalBatchHasReceiptData([src({ technicalKey: "d", materialCode: "4", purchaseOrderNumber: "45003", pendingQuantity: 0, v31Group: "NAO_ENTREGUES" })]));
    check("lote só com requisições (ou vazio) → válido", portalBatchHasReceiptData([daily[1]]) && portalBatchHasReceiptData([]));
  }
  // Ordem determinística independente da ordem de leitura.
  {
    const list = [
      src({ technicalKey: "b", materialCode: "5", requisitionDate: utc("2026-02-01") }),
      src({ technicalKey: "a", materialCode: "5", requisitionDate: utc("2026-02-01") }),
      src({ technicalKey: "c", materialCode: "4", requisitionDate: utc("2026-01-01") })
    ];
    const x = buildMrpPortalPurchases(list).items.map((i) => i.code + i.seq);
    const y = buildMrpPortalPurchases([...list].reverse()).items.map((i) => i.code + i.seq);
    check("seq determinístico (data req → req → pedido → material → chave técnica)", JSON.stringify(x) === JSON.stringify(y) && x[0] === "40", { x, y });
  }
}

function randomPurchase(rng: () => number, code: string, n: number): MrpEnginePurchase {
  const day = () => `2026-${String(1 + Math.floor(rng() * 12)).padStart(2, "0")}-${String(1 + Math.floor(rng() * 28)).padStart(2, "0")}`;
  const received = rng() < 0.6;
  return {
    seq: n,
    code,
    text: `Item ${code}`,
    quantity: [0, 1, 2, 5, 12, 30, 0.5, 2.25][Math.floor(rng() * 8)],
    requisitionDate: rng() < 0.9 ? day() : "",
    requisitionNumber: String(1000000 + n),
    purchaseOrderNumber: rng() < 0.7 ? String(4500000000 + n) : "",
    receiptDate: received ? day() : "",
    expectedDeliveryDate: rng() < 0.5 ? day() : "",
    supplier: ["", "Fornecedor A", "Fornecedor B"][Math.floor(rng() * 3)]
  };
}

function mulberry32(a: number) {
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

fixtureDatasets();
fuzzDatasets();
realFiles();
requiredCases();
console.log(`\n${checks} checagens · ${failures} falha(s)`);
if (failures) process.exit(1);
