/**
 * ANÁLISE MRP (FASE D) — testes do MOTOR puro (sem banco).
 *
 *   npm run test:mrp-engine
 *
 * 1. Casos obrigatórios (status, sugerida, não encontrado, compras pendentes,
 *    última compra, sem movimentação, contar, obsDe, "Saíram do MRP").
 * 2. Paridade com o analisar()/obsDe()/contar() ORIGINAIS do HTML (sandbox):
 *    a) fixtures pelo fluxo completo de arquivos (processar);
 *    b) base embutida real (4.280 materiais) + estoque/compras das fixtures;
 *    c) fuzz: milhares de materiais/compras aleatórios (sementes fixas).
 * Roda em UTC (fuso do servidor). Bugs de data do HTML em America/Sao_Paulo são
 * KNOWN_LEGACY_DATE_BUG (FASE C) e não entram aqui.
 */
import "./mrp/force-utc";
import { buildMrpMaterialsFromHtmlSeed } from "../src/lib/mrp/html-seed";
import {
  analyzeMrp,
  countMrp,
  mrpIdleKind,
  mrpObservation,
  purchaseKpis,
  removedFromMrp,
  type MrpAnalysisResult,
  type MrpEngineMaterial,
  type MrpEnginePurchase
} from "../src/lib/mrp/analysis-engine";
import { buildMrpImportPlan } from "../src/lib/mrp/import-plan";
import { readMrpWorkbook } from "../src/lib/mrp/workbook";
import * as F from "./mrp/fixtures";
import { loadHtmlReference } from "./mrp/html-reference";
import { createHtmlRuntime } from "./mrp/html-runtime";

type Any = any; // eslint-disable-line @typescript-eslint/no-explicit-any

let failures = 0;
let checks = 0;
function check(label: string, ok: boolean, detail = "") {
  checks++;
  if (!ok) failures++;
  console.log(`  ${ok ? "✓" : "✗"} ${label}${detail ? `  — ${detail}` : ""}`);
}
const show = (v: unknown) => JSON.stringify(v, (_k, x) => (typeof x === "number" && Object.is(x, -0) ? "-0" : x));

/* -------------------------------------------------------------------------- */

const mat = (code: string, min: number, max: number, statusMrp = "Ok", extra: Partial<MrpEngineMaterial> = {}): MrpEngineMaterial => ({
  code, description: `Material ${code}`, group: "Y0001", unit: "PEC", area: "Mecânica", family: "", min, max, statusMrp, ...extra
});
let seq = 0;
const buy = (code: string, p: Partial<MrpEnginePurchase>): MrpEnginePurchase => ({
  seq: seq++, code, text: "", quantity: 0, requisitionDate: "", requisitionNumber: "", purchaseOrderNumber: "",
  receiptDate: "", expectedDeliveryDate: "", supplier: "", ...p
});
const one = (m: MrpEngineMaterial, free: number | null, purchases: MrpEnginePurchase[] = []) =>
  analyzeMrp([m], new Map(free === null ? [] : [[m.code, free]]), purchases)[0];

function testRules() {
  console.log("\n1. Status e quantidade sugerida");
  const cases: [string, number, number, number, string, number][] = [
    ["Caso 1", 10, 20, 0, "Comprar", 20],
    ["Caso 2", 10, 20, 5, "Verificar", 15],
    ["Caso 3", 10, 20, 10, "OK", 10],
    ["Caso 4 (OK com sugerida > 0)", 10, 20, 15, "OK", 5],
    ["Caso 5", 10, 20, 25, "OK", 0],
    ["Caso 6 (sem parâmetros)", 0, 0, 0, "OK", 0],
    ["Caso 7 (mín 0, máx 20, saldo 5)", 0, 20, 5, "OK", 15]
  ];
  for (const [label, min, max, free, status, sug] of cases) {
    const r = one(mat("1", min, max), free);
    check(`${label}: mín ${min} máx ${max} saldo ${free} → ${status}, sugerida ${sug}`, r.status === status && r.suggested === sug && r.statusOriginal === status && r.suggestedOriginal === sug, `${r.status}/${r.suggested}`);
  }
  check("Caso 6: noParams = true", one(mat("1", 0, 0), 0).noParams === true);
  check("sem máx: alvo = mín (mín 8, máx 0, saldo 3 → Verificar, sugerida 5)", (() => { const r = one(mat("1", 8, 0), 3); return r.status === "Verificar" && r.suggested === 5; })());
  check("saldo negativo → Comprar (sugerida = máx − saldo)", (() => { const r = one(mat("1", 10, 20), -4); return r.status === "Comprar" && r.suggested === 24; })());

  console.log("\n2. Material não encontrado no estoque");
  const nf = one(mat("9", 10, 20), null);
  check("free = 0, notFound = true, Comprar", nf.free === 0 && nf.notFound && nf.status === "Comprar" && nf.suggested === 20);
  check('obs: "Zerado (não consta no estoque enviado)"', mrpObservation(nf) === "Zerado (não consta no estoque enviado)");
  check('encontrado zerado: obs "Material zerado"', mrpObservation(one(mat("9", 10, 20), 0)) === "Material zerado");

  console.log("\n3. Compras pendentes e última compra");
  const c53 = one(mat("1", 10, 20), 0, [buy("1", { quantity: 12, requisitionNumber: "R1", requisitionDate: "2026-09-01" })]);
  check("compra pendente 12 sobre sugerida 20 → Comprado, sugerida 0, falta 8", c53.status === "Comprado" && c53.suggested === 0 && c53.missing === 8 && c53.statusOriginal === "Comprar" && c53.suggestedOriginal === 20);
  check("obs Comprado com requisição e faltante", mrpObservation(c53) === "requisição R1 · 12 PEC · faltam 8", mrpObservation(c53));
  const c54 = one(mat("1", 10, 20), 0, [buy("1", { quantity: 30, purchaseOrderNumber: "4500000001", expectedDeliveryDate: "2026-10-05" })]);
  check("compra 30 ≥ sugerida 20 → Comprado, falta 0", c54.status === "Comprado" && c54.missing === 0);
  check("obs Comprado com pedido e previsão", mrpObservation(c54) === "pedido 4500000001 · 30 PEC · previsão 05/10/2026", mrpObservation(c54));
  const c55 = one(mat("1", 10, 20), 15, [buy("1", { quantity: 10, purchaseOrderNumber: "45", supplier: "Forn" })]);
  check("OK com compra pendente: continua OK, sugerida 5, compra preenchida", c55.status === "OK" && c55.suggested === 5 && c55.purchase?.qty === 10 && c55.purchase.supplier === "Forn" && c55.missing === 0);
  const c56 = one(mat("1", 10, 20), 0, [buy("1", { quantity: 5, purchaseOrderNumber: "45", receiptDate: "2026-09-10" })]);
  check("última compra recebida: não altera (Comprar, sem compra)", c56.status === "Comprar" && c56.purchase === null);
  const c57 = one(mat("1", 10, 20), 5, [
    buy("1", { quantity: 5, purchaseOrderNumber: "40", requisitionDate: "2026-08-01" }),
    buy("1", { quantity: 5, purchaseOrderNumber: "41", requisitionDate: "2026-09-01", receiptDate: "2026-09-05" })
  ]);
  check("antiga pendente + última recebida → NÃO em trânsito", c57.status === "Verificar" && c57.purchase === null);
  const c58 = one(mat("1", 10, 20), 5, [
    buy("1", { quantity: 5, purchaseOrderNumber: "40", requisitionDate: "2026-08-01", receiptDate: "2026-08-10" }),
    buy("1", { quantity: 7, purchaseOrderNumber: "41", requisitionDate: "2026-09-01" })
  ]);
  check("antiga recebida + última pendente → Comprado (Verificar)", c58.status === "Comprado" && c58.purchase?.order === "41" && c58.missing === 8);
  const tie = one(mat("1", 10, 20), 0, [
    buy("1", { quantity: 1, purchaseOrderNumber: "4500000010", requisitionDate: "2026-09-02" }),
    buy("1", { quantity: 2, purchaseOrderNumber: "4500000002", requisitionDate: "2026-09-02", receiptDate: "2026-09-05" })
  ]);
  check("mesma data: desempate pelo pedido (texto) — vale o 4500000010", tie.status === "Comprado" && tie.purchase?.order === "4500000010");
  const sem = one(mat("1", 10, 20), 0, [buy("1", { quantity: 3 })]);
  check("última sem pedido/requisição (sem) → não altera", sem.status === "Comprar" && sem.purchase === null);
  const pkp = purchaseKpis([buy("A", { purchaseOrderNumber: "1", quantity: 4 }), buy("A", { quantity: 1 }), buy("B", { receiptDate: "2026-01-01" })]);
  check("KPIs de compras pela ÚLTIMA compra", pkp.linhas === 3 && pkp.materiais === 2 && pkp.recebidos === 1 && pkp.semPedido + pkp.pendentes === 1, show(pkp));

  console.log("\n4. Sem movimentação");
  const s1 = one(mat("1", 0, 0), 50);
  check("noParams, saldo 50 → noMovement, capital parado", s1.noMovement && mrpIdleKind(s1) === "CAPITAL_PARADO");
  const s2 = one(mat("1", 5, 10, "Sem saída no período"), 30);
  check('"Sem saída", saldo 30 → noMovement, capital parado', s2.noMovement && mrpIdleKind(s2) === "CAPITAL_PARADO");
  const s3 = one(mat("1", 5, 10, "Obsoleto"), 0);
  check('"Obsoleto", saldo 0 → noMovement, zerado', s3.noMovement && mrpIdleKind(s3) === "ZERADO");
  const termos = ["sem saída", "SEM MOVIMENTAÇÃO", "sem mov", "Sem consumo", "sem giro", "não movimentado", "obsoleto", "INATIVO"];
  check("os 8 termos (após norm) marcam noMovement", termos.every((t) => one(mat("1", 5, 10, t), 1).noMovement));
  check("status comum não marca", !one(mat("1", 5, 10, "Ok"), 1).noMovement);

  console.log("\n5. contar() e Saíram do MRP");
  const rows = analyzeMrp(
    [mat("A", 10, 20), mat("B", 10, 20), mat("C", 10, 20), mat("D", 10, 20), mat("E", 0, 0), mat("F", 5, 10, "obsoleto"), mat("G", 10, 20)],
    new Map([["A", 0], ["B", 5], ["C", 15], ["D", 25], ["E", 50], ["F", 0], ["G", 0]]),
    [buy("G", { quantity: 12, purchaseOrderNumber: "45" }), buy("C", { quantity: 3, purchaseOrderNumber: "46" })]
  );
  const c = countMrp(rows);
  const exp = { total: 7, Comprar: 2, Verificar: 1, Comprado: 1, OK: 3, qtd: 20 + 15 + 5 + 0 + 0 + 10 + 0, qtdTransito: 12, semMov: 2, parado: 1, qtdParada: 50 };
  check("contar exato (qtd inclui OK com sugerida > 0)", show(c) === show(exp), show(c));
  const rem = removedFromMrp(rows);
  check("Saíram do MRP = 1 material, qtd evitada 20 (suggestedOriginal)", rem.count === 1 && rem.avoidedQty === 20);
  check('obs Verificar: "Abaixo do mínimo (5 de 10)"', mrpObservation(rows[1]) === "Abaixo do mínimo (5 de 10)");
  check('obs sem parâmetros: "Sem mín/máx no MRP"', mrpObservation(rows[4]) === "Sem mín/máx no MRP");
  check("obs OK vazia", mrpObservation(rows[2]) === "");
}

/* -------------------------------------------------------------------------- */
/*  Paridade                                                                   */
/* -------------------------------------------------------------------------- */

export function fromHtml(a: Any): MrpAnalysisResult {
  return {
    code: a.codigo, description: a.descricao, group: a.grupo, unit: a.um, area: a.area, family: a.familia,
    min: a.min, max: a.max, free: a.livre, notFound: a.naoEnc, noParams: a.semParam, noMovement: a.semMov,
    status: a.status, suggested: a.sugerida, missing: a.falta,
    purchase: a.compra ? { qty: a.compra.qtd, order: a.compra.pedido, requisition: a.compra.requisicao, forecast: a.compra.previsao, supplier: a.compra.fornecedor, date: a.compra.data } : null,
    statusOriginal: a.statusOrig, suggestedOriginal: a.sugeridaOrig
  };
}
const toHtmlPurchase = (p: MrpEnginePurchase) => ({
  i: p.seq, codigo: p.code, texto: p.text, qtd: p.quantity, dataReq: p.requisitionDate, requisicao: p.requisitionNumber,
  pedido: p.purchaseOrderNumber, recebimento: p.receiptDate, previsao: p.expectedDeliveryDate, fornecedor: p.supplier
});
const toHtmlMaterial = (m: MrpEngineMaterial) => ({
  codigo: m.code, descricao: m.description, grupo: m.group, min: m.min, max: m.max, um: m.unit, statusMrp: m.statusMrp, familia: m.family, area: m.area
});

export const FIELDS: (keyof MrpAnalysisResult)[] = [
  "code", "description", "group", "unit", "area", "family", "min", "max", "free", "notFound", "noParams", "noMovement",
  "statusOriginal", "status", "suggestedOriginal", "suggested", "missing"
];

/** Compara item a item (Object.is), a compra campo a campo, obsDe e contar. */
export function compare(label: string, html: Any[], portal: MrpAnalysisResult[], rt: ReturnType<typeof createHtmlRuntime>) {
  let diverg = 0;
  const samples: string[] = [];
  const n = Math.max(html.length, portal.length);
  for (let i = 0; i < n; i++) {
    const h = html[i] ? fromHtml(html[i]) : null;
    const p = portal[i];
    const bad: string[] = [];
    if (!h || !p) bad.push("ausente");
    else {
      for (const f of FIELDS) if (!Object.is(h[f], p[f])) bad.push(`${f}: HTML=${show(h[f])} Portal=${show(p[f])}`);
      if (show(h.purchase) !== show(p.purchase)) bad.push(`purchase: HTML=${show(h.purchase)} Portal=${show(p.purchase)}`);
      if (rt.fn.obsDe(html[i]) !== mrpObservation(p)) bad.push(`obs: HTML="${rt.fn.obsDe(html[i])}" Portal="${mrpObservation(p)}"`);
    }
    if (bad.length) {
      diverg++;
      if (samples.length < 5) samples.push(`#${i} ${p?.code ?? h?.code}: ${bad.join("; ")}`);
    }
  }
  check(`${label}: ${portal.length} materiais, ${diverg} divergência(s)`, diverg === 0 && html.length === portal.length, samples.join("\n      "));
  const ch = { ...rt.fn.contar(html) };
  const cp = countMrp(portal);
  const keys = Object.keys(cp) as (keyof typeof cp)[];
  check(`${label}: contar() idêntico`, keys.every((k) => Object.is(ch[k] ?? 0, cp[k])), `HTML=${show(ch)} Portal=${show(cp)}`);
  const retirados = html.filter((a: Any) => a.status === "Comprado");
  const rem = removedFromMrp(portal);
  check(`${label}: Saíram do MRP (${rem.count}) e qtd evitada`, retirados.length === rem.count && Object.is(retirados.reduce((s: number, a: Any) => s + a.sugeridaOrig, 0), rem.avoidedQty));
  return diverg;
}

function testParityFiles() {
  console.log("\n6. Paridade — fixtures pelo fluxo completo de arquivos (processar)");
  for (const [label, files, deposit] of [
    ["base + estoque 1400 + compras", [F.baseFixture(), F.stockFixture(), F.purchaseFixture()], "1400"],
    ["base + todos os depósitos + compras CSV", [F.baseFixture(), F.stockFixture(), F.purchaseCsvFixture()], ""],
    ["base embutida + estoque sem depósito + compras", [F.stockNoDepositFixture(), F.purchaseFixture()], "1400"]
  ] as [string, F.FixtureFile[], string][]) {
    const rt = createHtmlRuntime();
    rt.setDeposit(deposit);
    rt.receber(files);
    const st = rt.processar();
    const find = (k: string) => files.find((f) => F && readMrpWorkbook(f.data) && rt.arquivos()[k]?.nome === f.name);
    const plan = buildMrpImportPlan(
      (["base", "est", "cmp"] as const).filter((k) => rt.arquivos()[k]).map((k) => ({ fileName: find(k)!.name, wb: readMrpWorkbook(find(k)!.data), kind: k, sheet: rt.arquivos()[k].aba })),
      { depositFilter: deposit }
    );
    const materials: MrpEngineMaterial[] = plan.base
      ? plan.base.result.materials
      : (() => { const ref = loadHtmlReference(); return buildMrpMaterialsFromHtmlSeed(ref.seedMan, ref.seedEle).materials; })();
    const portal = analyzeMrp(materials, new Map(plan.stock!.result.items.map((i) => [i.code, i.freeQty])), plan.purchases!.result.items);
    compare(label, st.analysis, portal, rt);
  }
}

function testParitySeed() {
  console.log("\n7. Paridade — base embutida real (4.280) + estoque/compras das fixtures");
  const ref = loadHtmlReference();
  const seedMaterials = buildMrpMaterialsFromHtmlSeed(ref.seedMan, ref.seedEle).materials;
  // Estoque e compras "reais em formato": usa códigos da própria base.
  const rng = mulberry32(42);
  const stock = new Map<string, number>();
  const purchases: MrpEnginePurchase[] = [];
  seq = 0;
  for (const m of seedMaterials) {
    if (rng() < 0.85) stock.set(m.code, pick(rng, [0, 0, 1, 2, 3, 5, 10, 12.5, 100, 0.1, 0.2, 1303, -1]));
    if (rng() < 0.3) purchases.push(...randomPurchases(rng, m.code));
  }
  const rt = createHtmlRuntime();
  rt.fn.setBase(null);
  const html = rt.fn.analisarCom(Object.fromEntries(stock), purchases.map(toHtmlPurchase));
  compare("base embutida", html, analyzeMrp(seedMaterials, stock, purchases), rt);
}

function testParityFuzz() {
  console.log("\n8. Paridade — fuzz (sementes fixas)");
  for (const seed of [1, 7, 2026, 31337]) {
    const rng = mulberry32(seed);
    seq = 0;
    const materials: MrpEngineMaterial[] = [];
    const stock = new Map<string, number>();
    const purchases: MrpEnginePurchase[] = [];
    for (let i = 0; i < 2500; i++) {
      const code = String(10000 + i);
      const min = pick(rng, [0, 0, 1, 2, 5, 10, 0.5, 3.3, 100]);
      const max = pick(rng, [0, 0, min, min * 2, 20, 7.7, 0.1 + 0.2]);
      materials.push(mat(code, min, max, pick(rng, ["Ok", "Sem saída no período", "Comprar / Repor", "", "obsoleto", "Acima do máximo"]), {
        unit: pick(rng, ["PEC", "", "KG"]), area: pick(rng, ["Mecânica", "Elétrica"])
      }));
      if (rng() < 0.8) stock.set(code, pick(rng, [0, -0, 0.1, 0.2, 1, 2.5, 4.99, 9.999, 10, 15, 25, -3, 1e-9]));
      if (rng() < 0.5) purchases.push(...randomPurchases(rng, code));
    }
    // compras de materiais fora da base (não podem afetar nada)
    for (let i = 0; i < 50; i++) purchases.push(...randomPurchases(rng, `X${i}`));
    const rt = createHtmlRuntime();
    rt.fn.setBase(materials.map(toHtmlMaterial));
    const stockObj: Record<string, number> = {};
    for (const [k, v] of Array.from(stock.entries())) stockObj[k] = v;
    const html = rt.fn.analisarCom(stockObj, purchases.map(toHtmlPurchase));
    compare(`semente ${seed} (${purchases.length} compras)`, html, analyzeMrp(materials, stock, purchases), rt);
  }
}

function randomPurchases(rng: () => number, code: string): MrpEnginePurchase[] {
  const n = 1 + Math.floor(rng() * 4);
  const out: MrpEnginePurchase[] = [];
  for (let k = 0; k < n; k++) {
    const day = () => `2026-${String(1 + Math.floor(rng() * 12)).padStart(2, "0")}-${String(1 + Math.floor(rng() * 28)).padStart(2, "0")}`;
    out.push(buy(code, {
      quantity: pick(rng, [0, 1, 2, 5, 12, 30, 0.5, 2.25]),
      requisitionDate: rng() < 0.7 ? day() : "",
      receiptDate: rng() < 0.4 ? day() : "",
      expectedDeliveryDate: rng() < 0.3 ? day() : "",
      purchaseOrderNumber: rng() < 0.5 ? String(4500000000 + Math.floor(rng() * 50)) : "",
      requisitionNumber: rng() < 0.6 ? String(1000000 + Math.floor(rng() * 50)) : "",
      supplier: pick(rng, ["", "Fornecedor A", "Fornecedor B"])
    }));
  }
  return out;
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
const pick = <T,>(rng: () => number, list: readonly T[]): T => list[Math.floor(rng() * list.length)];

function main() {
  testRules();
  testParityFiles();
  testParitySeed();
  testParityFuzz();
  console.log(`\n${checks} checagens · ${failures} falha(s)`);
  console.log("PARIDADE COM MB52 REAL: PENDENTE · PARIDADE COM COMPRAS REAIS: PENDENTE");
  if (failures) process.exitCode = 1;
}

/** Contagem de checagens deste módulo (usada pelo comparador oficial scripts/validate-mrp-parity.ts). */
export const tally = () => ({ checks, failures });

// Só executa quando chamado direto (npm run test:mrp-*); importável pelo comparador oficial.
if (require.main === module) main();
