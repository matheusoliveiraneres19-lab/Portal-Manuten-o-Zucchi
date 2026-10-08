/**
 * ANÁLISE MRP (FASE F) — paridade da aba ÁREAS & CONJUNTOS com o HTML.
 *
 *   npm run test:mrp-areas
 *
 * Referência = o HTML gerado pelo PRÓPRIO renderAreas()/cardHTML() (sandbox):
 * os números exibidos em cada cartão, as larguras da barra de composição, o
 * texto "X sem mín/máx" e o destino do clique (filtrarPor(area, fam)) são lidos
 * do markup e comparados com buildMrpAreasSummary(). Também compara os valores
 * crus com contar() sobre os mesmos recortes.
 *
 * Cenários: base embutida (4.280) com estoque/compras sintéticos (3 sementes),
 * a base fixture (8 materiais) e uma base SEM conjuntos. Sem banco.
 */
import "./mrp/force-utc";
import { analyzeMrp, type MrpAnalysisResult, type MrpEngineMaterial, type MrpEnginePurchase } from "../src/lib/mrp/analysis-engine";
import { buildMrpAreasSummary, type MrpAreasCard } from "../src/lib/mrp/areas";
import { fmtMrp } from "../src/lib/mrp/format";
import { buildMrpMaterialsFromHtmlSeed } from "../src/lib/mrp/html-seed";
import { parseMrpBase } from "../src/lib/mrp/base-parser";
import { readMrpWorkbook } from "../src/lib/mrp/workbook";
import * as F from "./mrp/fixtures";
import { loadHtmlReference } from "./mrp/html-reference";
import { createHtmlRuntime } from "./mrp/html-runtime";
import { parseCards, type HtmlCard } from "./mrp/html-cards";

type Any = any; // eslint-disable-line @typescript-eslint/no-explicit-any
let failures = 0;
let checks = 0;
function check(label: string, ok: boolean, detail = "") {
  checks++;
  if (!ok) failures++;
  console.log(`  ${ok ? "✓" : "✗"} ${label}${detail ? `  — ${detail}` : ""}`);
}

const toRows = (a: MrpAnalysisResult[]) => a.map((x) => ({ area: x.area, family: x.family, status: x.status, suggested: x.suggested, noParams: x.noParams }));

function compareCard(label: string, html: HtmlCard, card: MrpAreasCard, showNoParams: boolean): number {
  const s = card.summary;
  const bars = [s.bar.Comprar, s.bar.Verificar, s.bar.Comprado, s.bar.OK].filter((p) => p);
  const extra = showNoParams && s.noParams ? `${fmtMrp(s.noParams)} sem mín/máx` : "";
  const problems: string[] = [];
  if (html.title !== card.title) problems.push(`título ${html.title} x ${card.title}`);
  if (html.tot !== fmtMrp(s.total)) problems.push(`total ${html.tot} x ${fmtMrp(s.total)}`);
  if (html.extra !== extra) problems.push(`extra "${html.extra}" x "${extra}"`);
  for (const [k, v] of [["Comprar", s.Comprar], ["Verificar", s.Verificar], ["Comprado", s.Comprado], ["qtd", s.qtd]] as const) {
    if ((html as Any)[k] !== fmtMrp(v)) problems.push(`${k} ${(html as Any)[k]} x ${fmtMrp(v)}`);
  }
  if (html.bars.length !== bars.length || html.bars.some((b, i) => !Object.is(b, bars[i]))) problems.push(`barra ${html.bars.join(",")} x ${bars.join(",")}`);
  if (html.target.area !== card.target.area || html.target.family !== card.target.family) problems.push(`clique (${html.target.area},${html.target.family}) x (${card.target.area},${card.target.family})`);
  check(`${label}: ${card.title}`, problems.length === 0, problems.join("; "));
  return problems.length ? 1 : 0;
}

function scenario(label: string, materials: MrpEngineMaterial[], stock: Map<string, number>, purchases: MrpEnginePurchase[]) {
  console.log(`\n${label}`);
  const portal = analyzeMrp(materials, stock, purchases);
  const rt = createHtmlRuntime();
  rt.fn.setBase(materials.map((m) => ({ codigo: m.code, descricao: m.description, grupo: m.group, min: m.min, max: m.max, um: m.unit, statusMrp: m.statusMrp, familia: m.family, area: m.area })));
  const stockObj: Record<string, number> = {};
  for (const [k, v] of Array.from(stock.entries())) stockObj[k] = v;
  const html = rt.fn.analisarCom(stockObj, purchases.map((p) => ({ i: p.seq, codigo: p.code, texto: p.text, qtd: p.quantity, dataReq: p.requisitionDate, requisicao: p.requisitionNumber, pedido: p.purchaseOrderNumber, recebimento: p.receiptDate, previsao: p.expectedDeliveryDate, fornecedor: p.supplier }))) as Any[];
  const markup = rt.fn.renderAreasHtml();
  const htmlAreas = parseCards(markup.area);
  const htmlFams = parseCards(markup.fam);
  const summary = buildMrpAreasSummary(toRows(portal));

  let diverg = 0;
  check("3 cartões de área (Mecânica, Elétrica, Total)", htmlAreas.length === 3 && summary.areas.length === 3);
  summary.areas.forEach((card, i) => (diverg += compareCard("área", htmlAreas[i], card, false)));
  const famCards = [...summary.families, summary.allFamilies];
  check(`conjuntos presentes e ordem (${summary.families.map((f) => f.title).join(", ") || "nenhum"})`, htmlFams.length === famCards.length && htmlFams.every((c, i) => c.title === famCards[i].title));
  summary.families.forEach((card, i) => (diverg += compareCard("conjunto", htmlFams[i], card, true)));
  diverg += compareCard("conjunto", htmlFams[htmlFams.length - 1], summary.allFamilies, false);

  // Valores crus = contar() do HTML sobre os mesmos recortes (inclui qtd em double).
  const contar = (rows: Any[]) => ({ ...rt.fn.contar(rows) });
  const raw = (rows: Any[], card: MrpAreasCard) => {
    const c = contar(rows);
    return ["total", "Comprar", "Verificar", "Comprado", "OK", "qtd"].every((k) => Object.is(c[k] ?? 0, (card.summary as Any)[k]));
  };
  check("valores crus = contar() do HTML (Mecânica, Elétrica, Total)",
    raw(html.filter((a) => a.area === "Mecânica"), summary.areas[0]) && raw(html.filter((a) => a.area === "Elétrica"), summary.areas[1]) && raw(html, summary.areas[2]));
  check("valores crus = contar() do HTML (cada conjunto e Todos os conjuntos)",
    summary.families.every((c) => raw(html.filter((a) => a.familia === c.title), c)) && raw(html.filter((a) => a.familia), summary.allFamilies));
  const [mec, ele, tot] = summary.areas.map((c) => c.summary);
  check("Mecânica + Elétrica = Total (todas as métricas)", (["total", "Comprar", "Verificar", "Comprado", "OK"] as const).every((k) => mec[k] + ele[k] === tot[k]));
  check("Todos os conjuntos = itens com conjunto (≠ total quando há itens sem conjunto)",
    summary.allFamilies.summary.total === portal.filter((a) => a.family).length &&
      (portal.some((a) => !a.family) ? summary.allFamilies.summary.total !== tot.total : true));
  check("Todos os conjuntos: clique abre a lista GERAL (legacy parity behavior)", summary.allFamilies.target.area === "" && summary.allFamilies.target.family === "");
  check("conjunto: clique limpa a área (filtrarPor('', fam))", summary.families.every((c) => c.target.area === "" && c.target.family === c.title));
  console.log(`  divergências neste cenário: ${diverg}`);
  return diverg;
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

function synthetic(materials: MrpEngineMaterial[], seed: number) {
  const rng = mulberry32(seed);
  const pick = <T,>(l: readonly T[]) => l[Math.floor(rng() * l.length)];
  const stock = new Map<string, number>();
  const purchases: MrpEnginePurchase[] = [];
  let seq = 0;
  for (const m of materials) {
    if (rng() < 0.85) stock.set(m.code, pick([0, 0, 1, 2, 3, 5, 10, 12.5, 100, 0.1, 0.2, 1303, -1]));
    if (rng() < 0.3)
      purchases.push({
        seq: seq++, code: m.code, text: "", quantity: pick([1, 2, 5, 12, 0.5]), requisitionDate: "2026-09-01", receiptDate: rng() < 0.4 ? "2026-09-20" : "",
        expectedDeliveryDate: "", purchaseOrderNumber: rng() < 0.6 ? "4500000001" : "", requisitionNumber: "", supplier: ""
      });
  }
  return { stock, purchases };
}

function main() {
  const ref = loadHtmlReference();
  const seed = buildMrpMaterialsFromHtmlSeed(ref.seedMan, ref.seedEle).materials;
  let total = 0;
  for (const s of [3, 42, 777]) {
    const { stock, purchases } = synthetic(seed, s);
    total += scenario(`Base embutida (4.280) · semente ${s}`, seed, stock, purchases);
  }
  const fixtureBase = parseMrpBase(readMrpWorkbook(F.baseFixture().data), { defaultArea: "Mecânica" }).materials;
  const fx = synthetic(fixtureBase, 5);
  total += scenario("Base fixture (8 materiais, com conjuntos)", fixtureBase, fx.stock, fx.purchases);
  const noFam = seed.slice(0, 600).map((m) => ({ ...m, family: "" }));
  const nf = synthetic(noFam, 9);
  total += scenario("Base SEM conjuntos (600 materiais)", noFam, nf.stock, nf.purchases);
  check("sem conjuntos: nenhum cartão de conjunto, só 'Todos os conjuntos' com 0", buildMrpAreasSummary(toRows(analyzeMrp(noFam, nf.stock, nf.purchases))).families.length === 0);

  console.log(`\nDivergências totais: ${total}`);
  console.log(`${checks} checagens · ${failures} falha(s)`);
  console.log("PARIDADE MB52 REAL: PENDENTE · PARIDADE COMPRAS REAL: PENDENTE");
  if (failures) process.exitCode = 1;
}

main();
