/**
 * ANÁLISE MRP (FASE G) — paridade da aba EM TRÂNSITO com o renderTransito() do HTML.
 *
 *   npm run test:mrp-transit
 *
 * Referência = o markup gerado pelo PRÓPRIO renderTransito() (sandbox): os 5
 * KPIs e cada linha da tabela (código, descrição, área/"fora da base MRP",
 * "N compras", qtd, fornecedor, pedido/req., data, previsão, situação) em 48
 * combinações de status × "Só base MRP" × busca. Também os grupos (count,
 * última compra, status) contra comprasIndex() e os casos obrigatórios da FASE G.
 * Sem banco.
 */
import "./mrp/force-utc";
import {
  analyzeMrp,
  purchaseKpis,
  removedFromMrp,
  type MrpEngineMaterial,
  type MrpEnginePurchase
} from "../src/lib/mrp/analysis-engine";
import { dataBR } from "../src/lib/mrp/date-parser";
import { fmtMrp } from "../src/lib/mrp/format";
import { buildMrpMaterialsFromHtmlSeed } from "../src/lib/mrp/html-seed";
import { MRP_TRANSIT_SITUATION, MRP_TRANSIT_STATUS_FILTERS, buildMrpTransitGroups, filterMrpTransit, mrpTransitRef, type MrpTransitFilters } from "../src/lib/mrp/transit";
import { buildMrpImportPlan } from "../src/lib/mrp/import-plan";
import { readMrpWorkbook } from "../src/lib/mrp/workbook";
import * as F from "./mrp/fixtures";
import { loadHtmlReference } from "./mrp/html-reference";
import { createHtmlRuntime, type HtmlRuntime } from "./mrp/html-runtime";
import { parseKpis, parseRows } from "./mrp/html-cards";

type Any = any; // eslint-disable-line @typescript-eslint/no-explicit-any
let failures = 0;
let checks = 0;
function check(label: string, ok: boolean, detail = "") {
  checks++;
  if (!ok) failures++;
  if (!ok || !process.argv.includes("--quiet")) console.log(`  ${ok ? "✓" : "✗"} ${label}${detail ? `  — ${detail}` : ""}`);
}
const toHtmlPurchase = (p: MrpEnginePurchase) => ({ i: p.seq, codigo: p.code, texto: p.text, qtd: p.quantity, dataReq: p.requisitionDate, requisicao: p.requisitionNumber, pedido: p.purchaseOrderNumber, recebimento: p.receiptDate, previsao: p.expectedDeliveryDate, fornecedor: p.supplier });

function runScenario(label: string, rt: HtmlRuntime, materials: MrpEngineMaterial[], stock: Map<string, number>, purchases: MrpEnginePurchase[], prepared = false) {
  console.log(`\n${label}`);
  if (!prepared) {
    rt.fn.setBase(materials.map((m) => ({ codigo: m.code, descricao: m.description, grupo: m.group, min: m.min, max: m.max, um: m.unit, statusMrp: m.statusMrp, familia: m.family, area: m.area })));
    const stockObj: Record<string, number> = {};
    for (const [k, v] of Array.from(stock.entries())) stockObj[k] = v;
    rt.fn.analisarCom(stockObj, purchases.map(toHtmlPurchase));
  }
  const analysis = analyzeMrp(materials, stock, purchases);
  const groups = buildMrpTransitGroups(purchases, new Map(analysis.map((a) => [a.code, { description: a.description, area: a.area }])));

  // Grupos x comprasIndex() do HTML.
  const htmlIdx = rt.fn.comprasIndex(purchases.map(toHtmlPurchase)) as Map<string, Any>;
  const htmlGroups = Array.from(htmlIdx.values());
  check(`grupos: ${groups.length} códigos, mesma ordem de 1ª aparição, count, última compra e status`,
    htmlGroups.length === groups.length && htmlGroups.every((g, i) => g.codigo === groups[i].code && g.n === groups[i].count && g.status === groups[i].status && g.ultima.i === purchases.find((p) => p === purchases[g.ultima.i])?.seq && Object.is(g.ultima.qtd, groups[i].quantity) && g.ultima.dataReq === groups[i].requisitionDate));

  // KPIs: os 4 de compras (todos os códigos) + Saíram do MRP (itens Comprado).
  const pk = purchaseKpis(purchases);
  const rem = removedFromMrp(analysis);
  rt.fn.setValue("tQ", "");
  rt.fn.setValue("tStatus", "pend");
  rt.fn.setChecked("tSoMrp", false);
  const k = parseKpis(rt.fn.renderTransitoHtml(200).kpis);
  const expected = [fmtMrp(pk.linhas), fmtMrp(pk.pendentes), fmtMrp(pk.qtdPendente), fmtMrp(pk.recebidos), fmtMrp(rem.count)];
  check(`5 KPIs = renderTransito(): ${expected.join(" · ")} · ${fmtMrp(rem.avoidedQty)} evitada`, k.vals.join("|") === expected.join("|") && k.lastSub === `${fmtMrp(rem.avoidedQty)} de qtd. evitada`, `HTML ${k.vals.join("|")} · ${k.lastSub}`);
  const rawPendQty = htmlGroups.filter((g) => g.status === "pend").reduce((s: number, g: Any) => s + (g.ultima.qtd || 0), 0);
  check("Qtd. em trânsito crua = soma da ÚLTIMA compra dos pendentes (HTML)", Object.is(rawPendQty, pk.qtdPendente));

  // Tabela: 48 combinações.
  const queries = ["", "135", "motor", "fornecedor a", "1885-0125", "SATÉLITE"];
  let diverg = 0;
  let combos = 0;
  for (const status of MRP_TRANSIT_STATUS_FILTERS) {
    for (const onlyMrp of [false, true]) {
      for (const q of queries) {
        const f: MrpTransitFilters = { q, status, onlyMrp };
        rt.fn.setValue("tQ", q);
        rt.fn.setValue("tStatus", status === "all" ? "" : status);
        rt.fn.setChecked("tSoMrp", onlyMrp);
        const htmlRows = parseRows(rt.fn.renderTransitoHtml(1_000_000).table);
        const rows = filterMrpTransit(groups, f);
        combos++;
        const problems: string[] = [];
        if (htmlRows.length !== rows.length) problems.push(`linhas HTML ${htmlRows.length} x Portal ${rows.length}`);
        rows.forEach((g, i) => {
          const h = htmlRows[i];
          if (!h) return;
          const tags = [g.inBase ? (g.area === "Mecânica" ? "Mec" : "Elé") : "fora da base MRP", ...(g.count > 1 ? [`${g.count} compras`] : [])];
          const mine = { code: g.code, desc: g.description, tags, qtd: fmtMrp(g.quantity), forn: g.supplier, ref: mrpTransitRef(g) || "—", date: dataBR(g.requisitionDate), prev: dataBR(g.expectedDeliveryDate), badge: MRP_TRANSIT_SITUATION[g.status] };
          if (JSON.stringify(mine) !== JSON.stringify(h) && problems.length < 3) problems.push(`#${i}: HTML ${JSON.stringify(h)} x Portal ${JSON.stringify(mine)}`);
        });
        if (problems.length) {
          diverg++;
          console.log(`    ✗ status=${status} onlyMrp=${onlyMrp} q="${q}": ${problems.join(" | ")}`);
        }
      }
    }
  }
  check(`tabela = renderTransito() em ${combos} combinações (ordem e conteúdo de cada linha)`, diverg === 0, `${diverg} divergência(s)`);
  return { groups, analysis, pk, rem };
}

function main() {
  const ref = loadHtmlReference();
  const seed = buildMrpMaterialsFromHtmlSeed(ref.seedMan, ref.seedEle).materials;

  // 1) Base embutida + compras sintéticas, com códigos FORA da base, várias
  //    compras por código, datas vazias e datas empatadas.
  let a = 11;
  const rng = () => {
    a = (a * 1103515245 + 12345) % 2147483648;
    return a / 2147483648;
  };
  const pick = <T,>(l: readonly T[]) => l[Math.floor(rng() * l.length)];
  const stock = new Map<string, number>();
  for (const m of seed) if (rng() < 0.85) stock.set(m.code, pick([0, 0, 1, 2, 5, 10, 25, 0.5]));
  const codes = [...seed.filter(() => rng() < 0.25).map((m) => m.code), "X-001", "X-002", "000013515", "99999"];
  const purchases: MrpEnginePurchase[] = [];
  for (let n = 0; n < 2600; n++) {
    const code = pick(codes);
    purchases.push({
      seq: purchases.length, code, text: pick(["Motor Breton 1885-0125", "Rolamento", "Peça avulsa", "Satélite simec", ""]), quantity: pick([1, 2, 5, 12, 20, 100, 0.5, 2.25]),
      requisitionDate: pick(["", "2026-09-01", "2026-09-01", "2026-08-15", "2026-10-02", "2025-12-31"]), receiptDate: rng() < 0.4 ? "2026-09-20" : "",
      expectedDeliveryDate: rng() < 0.3 ? "2026-10-05" : "", purchaseOrderNumber: rng() < 0.5 ? String(4500000000 + Math.floor(rng() * 30)) : "",
      requisitionNumber: rng() < 0.6 ? String(1000000 + Math.floor(rng() * 30)) : "", supplier: pick(["Fornecedor A", "Fornecedor B Ltda", "", "Indústria Ação"])
    });
  }
  const r1 = runScenario("Base embutida (4.280) + 2.600 compras sintéticas (inclui códigos fora da base)", createHtmlRuntime(), seed, stock, purchases);
  const outside = r1.groups.filter((g) => !g.inBase);
  check(`materiais fora da base aparecem com o selo (${outside.length}: ${outside.map((g) => g.code).join(", ")})`, outside.length >= 3 && filterMrpTransit(r1.groups, { q: "", status: "all", onlyMrp: false }).some((g) => !g.inBase));
  check("com 'Só materiais da base MRP' eles somem", filterMrpTransit(r1.groups, { q: "", status: "all", onlyMrp: true }).every((g) => g.inBase));

  // 2) Fixtures pelo fluxo completo de arquivos (processar) — base embutida.
  for (const [label, files] of [
    ["Fixtures: estoque + compras (xlsx)", [F.stockFixture(), F.purchaseFixture()]],
    ["Fixtures: estoque + compras (CSV)", [F.stockFixture(), F.purchaseCsvFixture()]]
  ] as [string, F.FixtureFile[]][]) {
    const rt = createHtmlRuntime();
    rt.setDeposit("1400");
    rt.receber(files);
    rt.processar();
    const plan = buildMrpImportPlan(
      [{ fileName: files[0].name, wb: readMrpWorkbook(files[0].data), kind: "est", sheet: rt.arquivos().est.aba }, { fileName: files[1].name, wb: readMrpWorkbook(files[1].data), kind: "cmp", sheet: rt.arquivos().cmp.aba }],
      { depositFilter: "1400" }
    );
    runScenario(label, rt, seed, new Map(plan.stock!.result.items.map((i) => [i.code, i.freeQty])), plan.purchases!.result.items, true);
  }

  // 3) Casos obrigatórios da FASE G.
  console.log("\nCasos obrigatórios");
  const mat = (code: string, min: number, max: number): MrpEngineMaterial => ({ code, description: `Mat ${code}`, group: "", unit: "PEC", area: "Mecânica", family: "", min, max, statusMrp: "Ok" });
  let s = 0;
  const buy = (code: string, p: Partial<MrpEnginePurchase>): MrpEnginePurchase => ({ seq: s++, code, text: `Compra ${code}`, quantity: 0, requisitionDate: "", requisitionNumber: "", purchaseOrderNumber: "", receiptDate: "", expectedDeliveryDate: "", supplier: "", ...p });
  const mats = [mat("A", 10, 20), mat("B", 10, 30), mat("C", 5, 10), mat("M", 10, 20), mat("Q", 10, 20)];
  const st = new Map([["A", 0], ["B", 10], ["C", 0], ["M", 0], ["Q", 0]]);
  const list = [
    buy("FORA", { purchaseOrderNumber: "45", quantity: 7, requisitionDate: "2026-09-01" }),
    buy("M", { purchaseOrderNumber: "1", quantity: 5, requisitionDate: "2026-08-01", receiptDate: "2026-08-05" }),
    buy("M", { purchaseOrderNumber: "2", quantity: 5, requisitionDate: "2026-08-10" }),
    buy("M", { purchaseOrderNumber: "3", quantity: 5, requisitionDate: "2026-09-10", receiptDate: "2026-09-12" }),
    buy("Q", { purchaseOrderNumber: "10", quantity: 100, requisitionDate: "2026-07-01" }),
    buy("Q", { purchaseOrderNumber: "11", quantity: 20, requisitionDate: "2026-09-01" }),
    buy("A", { purchaseOrderNumber: "20", quantity: 1, requisitionDate: "2026-09-02" }),
    buy("B", { purchaseOrderNumber: "21", quantity: 1, requisitionDate: "2026-09-02" }),
    buy("C", { purchaseOrderNumber: "22", quantity: 1, requisitionDate: "2026-09-02" })
  ];
  const an = analyzeMrp(mats, st, list);
  const g = buildMrpTransitGroups(list, new Map(an.map((x) => [x.code, { description: x.description, area: x.area }])));
  const byCode = new Map(g.map((x) => [x.code, x]));
  check("fora da base: aparece sem o filtro, some com 'Só base MRP'", !byCode.get("FORA")!.inBase && filterMrpTransit(g, { q: "", status: "all", onlyMrp: false }).some((x) => x.code === "FORA") && !filterMrpTransit(g, { q: "", status: "all", onlyMrp: true }).some((x) => x.code === "FORA"));
  check("3 compras (recebida, pendente, recebida mais recente) → Recebido, count 3", byCode.get("M")!.status === "rec" && byCode.get("M")!.count === 3);
  const pk = purchaseKpis(list);
  check("Qtd. em trânsito usa só a última compra (Q: 20, não 120)", byCode.get("Q")!.quantity === 20 && pk.qtdPendente === 7 + 20 + 1 + 1 + 1, String(pk.qtdPendente));
  const rem = removedFromMrp(an);
  const bought = an.filter((x) => x.status === "Comprado").map((x) => `${x.code}:${x.suggestedOriginal}`);
  check(`Saíram do MRP = 3 (A, C, Q) com qtd. evitada = soma de suggestedOriginal (${bought.join(", ")})`, rem.count === 3 && rem.avoidedQty === 20 + 10 + 20, `${rem.count} / ${rem.avoidedQty}`);
  const b = an.find((x) => x.code === "B")!;
  check("B (saldo 10 = mín 10) é OK: compra pendente preenchida, mas NÃO sai do MRP", b.status === "OK" && b.purchase?.order === "21" && b.suggested === 20);
  const three = removedFromMrp([{ status: "Comprado", suggestedOriginal: 10 }, { status: "Comprado", suggestedOriginal: 20 }, { status: "Comprado", suggestedOriginal: 5 }, { status: "OK", suggestedOriginal: 99 }]);
  check("3 Comprados com 10, 20 e 5 → Saíram do MRP 3, qtd. evitada 35", three.count === 3 && three.avoidedQty === 35);
  check("universos diferentes: compra pendente FORA da base conta em Em trânsito, não em Saíram do MRP", pk.pendentes === 5 && !an.some((x) => x.code === "FORA") && rem.count === 3, `pendentes=${pk.pendentes}`);
  const order = filterMrpTransit(g, { q: "", status: "all", onlyMrp: false }).map((x) => x.code);
  check("ordem: data da requisição DESC, empates (2026-09-02) na ordem de 1ª aparição (A, B, C)", order.join(",") === "M,A,B,C,FORA,Q", order.join(","));

  console.log(`\n${checks} checagens · ${failures} falha(s)`);
  console.log("PARIDADE MB52 REAL: PENDENTE · PARIDADE COMPRAS REAL: PENDENTE");
  if (failures) process.exitCode = 1;
}

main();
