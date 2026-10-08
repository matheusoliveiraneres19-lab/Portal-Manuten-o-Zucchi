/**
 * ANÁLISE MRP (FASE H) — paridade da aba ESTOQUE PARADO com o renderParado() do HTML.
 *
 *   npm run test:mrp-idle-stock
 *
 * Referência = o markup do PRÓPRIO renderParado() (sandbox): os 4 KPIs (com o
 * "X% da base") e cada linha (código, material + área/conjunto, saldo + UM,
 * grupo, situação) em 45 combinações de tipo × área × busca. Também os casos
 * obrigatórios da FASE H. Sem banco.
 */
import "./mrp/force-utc";
import { analyzeMrp, countMrp, type MrpEngineMaterial } from "../src/lib/mrp/analysis-engine";
import { fmtMrp } from "../src/lib/mrp/format";
import { buildMrpMaterialsFromHtmlSeed } from "../src/lib/mrp/html-seed";
import { MRP_IDLE_TYPES, filterMrpIdle, mrpIdleShareText, mrpIdleSituation, type MrpIdleFilters } from "../src/lib/mrp/idle";
import { buildMrpImportPlan } from "../src/lib/mrp/import-plan";
import { readMrpWorkbook } from "../src/lib/mrp/workbook";
import * as F from "./mrp/fixtures";
import { loadHtmlReference } from "./mrp/html-reference";
import { createHtmlRuntime, type HtmlRuntime } from "./mrp/html-runtime";
import { text, unesc } from "./mrp/html-cards";

let failures = 0;
let checks = 0;
function check(label: string, ok: boolean, detail = "") {
  checks++;
  if (!ok) failures++;
  console.log(`  ${ok ? "✓" : "✗"} ${label}${detail ? `  — ${detail}` : ""}`);
}

type Row = { code: string; desc: string; tags: string[]; saldo: string; grupo: string; badge: string };
function parseRows(table: string): Row[] {
  const body = table.split("<tbody>")[1] ?? "";
  return body
    .split("<tr")
    .slice(1)
    .map((tr) => {
      const tds = Array.from(tr.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)).map((m) => m[1]);
      return {
        code: text(tds[0]),
        desc: unesc(/<span class="d">([\s\S]*?)<\/span>/.exec(tds[1])![1]),
        tags: Array.from(tds[1].matchAll(/<span class="bg[^"]*"[^>]*>([^<]*)<\/span>/g)).map((m) => unesc(m[1]).replace(/^\S+\s/, "")),
        saldo: text(tds[2]),
        grupo: text(tds[3]),
        badge: text(tds[4])
      };
    });
}
function parseKpis(html: string) {
  return {
    vals: Array.from(html.matchAll(/<div class="val">([^<]*)<\/div>/g)).map((m) => m[1]),
    subs: Array.from(html.matchAll(/<div class="sub">([^<]*)<\/div>/g)).map((m) => m[1])
  };
}

type Item = ReturnType<typeof analyzeMrp>[number];

function scenario(label: string, rt: HtmlRuntime, items: Item[]) {
  console.log(`\n${label}`);
  const c = countMrp(items);
  rt.fn.setValue("pQ", "");
  rt.fn.setValue("pTipo", "com");
  rt.fn.setValue("pArea", "");
  const k = parseKpis(rt.fn.renderParadoHtml(200).kpis);
  const htmlShare = k.subs[0];
  const mine = [fmtMrp(c.semMov), fmtMrp(c.parado), fmtMrp(c.qtdParada), fmtMrp(c.semMov - c.parado)];
  check(`4 KPIs = renderParado(): ${mine.join(" · ")}`, k.vals.join("|") === mine.join("|"), k.vals.join("|"));
  check(`percentual da base: HTML "${htmlShare}" = Portal "${mrpIdleShareText(c.semMov, c.total)}" (mesmo valor, vírgula pt-BR)`, htmlShare.replace(".", ",") === mrpIdleShareText(c.semMov, c.total));
  check("subtítulos dos demais KPIs", k.subs.slice(1).join("|") === "capital parado|soma do saldo|candidatos a inativação");

  let diverg = 0;
  let combos = 0;
  for (const type of MRP_IDLE_TYPES) {
    for (const area of ["", "Mecânica", "Elétrica"]) {
      for (const q of ["", "135", "motor", "1885-0125", "BRETON"]) {
        const f: MrpIdleFilters = { q, type, area };
        rt.fn.setValue("pQ", q);
        rt.fn.setValue("pTipo", type === "all" ? "" : type);
        rt.fn.setValue("pArea", area);
        const html = parseRows(rt.fn.renderParadoHtml(1_000_000).table);
        const rows = filterMrpIdle(items, f);
        combos++;
        const problems: string[] = [];
        if (html.length !== rows.length) problems.push(`linhas HTML ${html.length} x Portal ${rows.length}`);
        rows.forEach((a, i) => {
          const h = html[i];
          if (!h || problems.length > 2) return;
          const mineRow: Row = {
            code: a.code,
            desc: a.description,
            tags: [a.area === "Mecânica" ? "Mec" : "Elé", ...(a.family ? [a.family] : [])],
            saldo: `${fmtMrp(a.free)}${a.unit ? ` ${a.unit}` : ""}`,
            grupo: a.group,
            badge: mrpIdleSituation(a.free)
          };
          if (JSON.stringify(mineRow) !== JSON.stringify(h)) problems.push(`#${i}: HTML ${JSON.stringify(h)} x Portal ${JSON.stringify(mineRow)}`);
        });
        if (problems.length) {
          diverg++;
          console.log(`    ✗ type=${type} area=${area} q="${q}": ${problems.join(" | ")}`);
        }
      }
    }
  }
  check(`tabela = renderParado() em ${combos} combinações (ordem e as 5 colunas)`, diverg === 0, `${diverg} divergência(s)`);
  return c;
}

function main() {
  const ref = loadHtmlReference();
  const seed = buildMrpMaterialsFromHtmlSeed(ref.seedMan, ref.seedEle).materials;

  // 1) Base embutida + estoque sintético com saldos negativos, zeros e empates.
  let a = 23;
  const rng = () => {
    a = (a * 1103515245 + 12345) % 2147483648;
    return a / 2147483648;
  };
  const pick = <T,>(l: readonly T[]) => l[Math.floor(rng() * l.length)];
  const stock = new Map<string, number>();
  for (const m of seed) if (rng() < 0.85) stock.set(m.code, pick([0, 0, -2, -0.5, 1, 1, 2, 5, 10, 10, 12.5, 100, 0.1, 1303]));
  const rt1 = createHtmlRuntime();
  rt1.fn.setBase(null);
  const stockObj: Record<string, number> = {};
  for (const [k, v] of Array.from(stock.entries())) stockObj[k] = v;
  rt1.fn.analisarCom(stockObj, []);
  const items1 = analyzeMrp(seed, stock, []);
  const c1 = scenario("Base embutida (4.280) + estoque sintético (negativos, zeros, empates)", rt1, items1);
  console.log(`    Sem movimentação ${fmtMrp(c1.semMov)} (${mrpIdleShareText(c1.semMov, c1.total)}) · Com saldo ${fmtMrp(c1.parado)} · Qtd. parada ${fmtMrp(c1.qtdParada)} · Zerados ${fmtMrp(c1.semMov - c1.parado)}`);
  const allIdle = filterMrpIdle(items1, { q: "", type: "all", area: "" });
  check(`paginação: ${allIdle.length} itens → 200 / 600 / 1000 prefixos sem duplicar`, allIdle.length > 1000 && new Set(allIdle.slice(0, 1000).map((x) => x.code)).size === 1000);

  // 2) Fixtures pelo fluxo de arquivos (processar), base embutida.
  for (const [label, files, dep] of [
    ["Fixtures: estoque 1400 + compras", [F.stockFixture(), F.purchaseFixture()], "1400"],
    ["Fixtures: todos os depósitos + compras", [F.stockFixture(), F.purchaseFixture()], ""]
  ] as [string, F.FixtureFile[], string][]) {
    const rt = createHtmlRuntime();
    rt.setDeposit(dep);
    rt.receber(files);
    rt.processar();
    const plan = buildMrpImportPlan(
      [{ fileName: "e", wb: readMrpWorkbook(files[0].data), kind: "est", sheet: rt.arquivos().est.aba }, { fileName: "c", wb: readMrpWorkbook(files[1].data), kind: "cmp", sheet: rt.arquivos().cmp.aba }],
      { depositFilter: dep }
    );
    scenario(label, rt, analyzeMrp(seed, new Map(plan.stock!.result.items.map((i) => [i.code, i.freeQty])), plan.purchases!.result.items));
  }

  // 3) Casos obrigatórios.
  console.log("\nCasos obrigatórios");
  const mat = (code: string, min: number, max: number, statusMrp = "Ok", extra: Partial<MrpEngineMaterial> = {}): MrpEngineMaterial => ({
    code, description: `Material ${code}`, group: "Y01", unit: "UN", area: "Mecânica", family: "", min, max, statusMrp, ...extra
  });
  const mats = [
    mat("Z0", 0, 0), mat("ZN", 5, 10, "Obsoleto"), mat("CP", 0, 0), mat("N", 5, 10, "Ok"),
    mat("O100", 0, 0, "Ok", { area: "Elétrica" }), mat("O50a", 0, 0), mat("O50b", 0, 0)
  ];
  const st = new Map([["Z0", 0], ["ZN", -2], ["CP", 50], ["N", 100], ["O100", 100], ["O50a", 50], ["O50b", 50]]);
  const items = analyzeMrp(mats, st, []);
  const zer = filterMrpIdle(items, { q: "", type: "sem", area: "" }).map((x) => x.code);
  check("Zerados inclui saldo 0 e saldo −2 (noMovement)", zer.includes("Z0") && zer.includes("ZN"), zer.join(","));
  check("saldo 50 sem movimentação → Capital parado", mrpIdleSituation(items.find((x) => x.code === "CP")!.free) === "Capital parado" && filterMrpIdle(items, { q: "", type: "com", area: "" }).some((x) => x.code === "CP"));
  check("material normal (noMovement=false, saldo 100) não aparece em nenhum filtro", MRP_IDLE_TYPES.every((t) => !filterMrpIdle(items, { q: "", type: t, area: "" }).some((x) => x.code === "N")));
  const order = filterMrpIdle(items, { q: "", type: "all", area: "" }).map((x) => `${x.code}:${x.free}`);
  check("ordem Todos: 100, 50, 50 (empate por position), 0, −2", order.join(",") === "O100:100,CP:50,O50a:50,O50b:50,Z0:0,ZN:-2", order.join(","));
  check("área Elétrica / Mecânica", filterMrpIdle(items, { q: "", type: "all", area: "Elétrica" }).map((x) => x.code).join() === "O100" && !filterMrpIdle(items, { q: "", type: "all", area: "Mecânica" }).some((x) => x.code === "O100"));
  check("busca por código e por descrição (norm)", filterMrpIdle(items, { q: "o50", type: "all", area: "" }).length === 2 && filterMrpIdle(items, { q: "MATERIAL  Z0", type: "all", area: "" }).map((x) => x.code).join() === "Z0");
  check('percentual: 428 de 4.280 → "10,0% da base"', mrpIdleShareText(428, 4280) === "10,0% da base");
  check('percentual com total 0 usa max(1, total) → "0,0% da base"', mrpIdleShareText(0, 0) === "0,0% da base");

  console.log(`\n${checks} checagens · ${failures} falha(s)`);
  console.log("PARIDADE MB52 REAL: PENDENTE · PARIDADE COMPRAS REAL: PENDENTE");
  if (failures) process.exitCode = 1;
}

main();
