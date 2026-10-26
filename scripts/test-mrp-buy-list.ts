/**
 * ANÁLISE MRP (FASE E) — paridade da lista COMPRAR com o filtrarCompra() do HTML.
 *
 *   npm run test:mrp-buy-list
 *
 * Mesma análise nos dois lados (base embutida real de 4.280 materiais + estoque
 * e compras sintéticos com sementes fixas). Para centenas de combinações de
 * status × ordenação × área × conjunto × busca, compara a ORDEM dos códigos, a
 * soma da sugerida do filtro e o rótulo da situação (bgStatus).
 * Sem banco.
 */
import "./mrp/force-utc";
import { analyzeMrp, type MrpEnginePurchase } from "../src/lib/mrp/analysis-engine";
import {
  MRP_BUY_INITIAL_LIMIT,
  MRP_BUY_LIMIT_STEP,
  MRP_BUY_SORTS,
  MRP_BUY_STATUS_FILTERS,
  filterMrpBuyList,
  mrpSituation,
  parseMrpBuyLimit,
  presentMrpFamilies,
  sumSuggested,
  type MrpBuyFilters
} from "../src/lib/mrp/buy-list";
import { buildMrpMaterialsFromHtmlSeed } from "../src/lib/mrp/html-seed";
import { loadHtmlReference } from "./mrp/html-reference";
import { createHtmlRuntime } from "./mrp/html-runtime";

type Any = any; // eslint-disable-line @typescript-eslint/no-explicit-any
let failures = 0;
let checks = 0;
function check(label: string, ok: boolean, detail = "") {
  checks++;
  if (!ok) failures++;
  if (!ok || process.argv.includes("--verbose")) console.log(`  ${ok ? "✓" : "✗"} ${label}${detail ? `  — ${detail}` : ""}`);
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

function main() {
  const ref = loadHtmlReference();
  const materials = buildMrpMaterialsFromHtmlSeed(ref.seedMan, ref.seedEle).materials;
  const rng = mulberry32(99);
  const pick = <T,>(l: readonly T[]) => l[Math.floor(rng() * l.length)];
  const stock = new Map<string, number>();
  const purchases: MrpEnginePurchase[] = [];
  let seq = 0;
  for (const m of materials) {
    if (rng() < 0.85) stock.set(m.code, pick([0, 0, 1, 2, 3, 5, 10, 12.5, 100, 0.1, 0.2, 1303, -1]));
    if (rng() < 0.3) {
      for (let k = 0; k < 1 + Math.floor(rng() * 3); k++) {
        purchases.push({
          seq: seq++, code: m.code, text: "", quantity: pick([1, 2, 5, 12, 30, 0.5]),
          requisitionDate: rng() < 0.7 ? `2026-0${1 + Math.floor(rng() * 9)}-1${Math.floor(rng() * 9)}` : "",
          receiptDate: rng() < 0.4 ? "2026-09-20" : "", expectedDeliveryDate: rng() < 0.3 ? "2026-10-01" : "",
          purchaseOrderNumber: rng() < 0.5 ? String(4500000000 + Math.floor(rng() * 50)) : "",
          requisitionNumber: rng() < 0.6 ? String(1000000 + Math.floor(rng() * 50)) : "", supplier: ""
        });
      }
    }
  }

  const portal = analyzeMrp(materials, stock, purchases);
  const rt = createHtmlRuntime();
  rt.fn.setBase(null);
  const stockObj: Record<string, number> = {};
  for (const [k, v] of Array.from(stock.entries())) stockObj[k] = v;
  const html = rt.fn.analisarCom(
    stockObj,
    purchases.map((p) => ({ i: p.seq, codigo: p.code, texto: p.text, qtd: p.quantity, dataReq: p.requisitionDate, requisicao: p.requisitionNumber, pedido: p.purchaseOrderNumber, recebimento: p.receiptDate, previsao: p.expectedDeliveryDate, fornecedor: p.supplier }))
  ) as Any[];
  console.log(`Análise: ${portal.length} materiais (HTML ${html.length})`);

  // Rótulo da situação = texto do bgStatus() do HTML.
  const strip = (s: string) => s.replace(/<[^>]+>/g, "");
  check("situação (bgStatus) idêntica em todos os materiais", html.every((a, i) => strip(rt.fn.bgStatus(a)) === mrpSituation(portal[i]).label));

  const families = presentMrpFamilies(portal);
  console.log(`Conjuntos presentes: ${families.join(", ")}`);
  const variants: Partial<MrpBuyFilters>[] = [
    {},
    { area: "Mecânica" },
    { area: "Elétrica" },
    ...families.map((family) => ({ family })),
    { q: "1885-0125" },
    { q: "breton" },
    { q: "SATÉLITE" },
    { q: "135" },
    { q: "  motor  " },
    { q: "---" },
    { area: "Mecânica", family: families[0] ?? "", q: "pino" }
  ];

  let combos = 0;
  let diverg = 0;
  for (const status of MRP_BUY_STATUS_FILTERS) {
    for (const sort of MRP_BUY_SORTS) {
      for (const v of variants) {
        const f: MrpBuyFilters = { q: "", area: "", family: "", ...v, status, sort };
        rt.fn.setValue("fQ", f.q);
        rt.fn.setValue("fStatus", status === "all" ? "" : status);
        rt.fn.setValue("fArea", f.area);
        rt.fn.setValue("fFam", f.family);
        rt.fn.setValue("fSort", sort);
        const h = rt.fn.filtrarCompra() as Any[];
        const p = filterMrpBuyList(portal, f);
        const hc = h.map((a) => a.codigo).join("|");
        const pc = p.map((a) => a.code).join("|");
        const hSum = h.reduce((s: number, a: Any) => s + a.sugerida, 0);
        combos++;
        const ok = hc === pc && Object.is(hSum, sumSuggested(p));
        if (!ok) diverg++;
        check(`status=${status} sort=${sort} ${JSON.stringify(v)} → ${p.length} linhas`, ok, ok ? "" : `HTML ${h.length} x Portal ${p.length}`);
      }
    }
  }
  console.log(`\nCombinações comparadas: ${combos} · divergências: ${diverg}`);
  check(`ordem + soma do filtro idênticas ao HTML em ${combos} combinações`, diverg === 0);

  // Paginação: 200, 600, 1000… sem duplicar linhas.
  const all = filterMrpBuyList(portal, { q: "", status: "all", area: "", family: "", sort: "need" });
  const pages = [MRP_BUY_INITIAL_LIMIT, MRP_BUY_INITIAL_LIMIT + MRP_BUY_LIMIT_STEP, MRP_BUY_INITIAL_LIMIT + 2 * MRP_BUY_LIMIT_STEP];
  check("limites 200 → 600 → 1000", pages.join(",") === "200,600,1000" && parseMrpBuyLimit("600") === 600 && parseMrpBuyLimit("650") === 1000 && parseMrpBuyLimit("x") === 200);
  const slices = pages.map((n) => all.slice(0, n).map((a) => a.code));
  check("cada página é prefixo da seguinte e não repete códigos", slices.every((s, i) => i === 0 || slices[i - 1].every((c, k) => s[k] === c)) && new Set(slices[2]).size === slices[2].length);

  console.log(`\n${checks} checagens · ${failures} falha(s)`);
  if (failures) process.exitCode = 1;
}

main();
