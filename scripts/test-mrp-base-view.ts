/**
 * ANÁLISE MRP (FASE I) — paridade da aba BASE MRP com renderBase()/baseFiltrada().
 *
 *   npm run test:mrp-base-view
 *
 * Para cada base (embutida 4.280, real Controle_MRP 4.259, fixture 8):
 *   1. ORDEM: os registros são EMBARALHADOS e reordenados só com
 *      sourceSheet + sourceRow + MrpBaseVersion.sheets (orderMrpBaseMaterials) —
 *      tem de dar exatamente a ordem de materiais() do HTML. É esta checagem que
 *      decide se a coluna `position` seria necessária;
 *   2. resumo (total, Mecânica, Elétrica, sem mín/máx, em satélites/coroas)
 *      = baseSub do renderBase();
 *   3. 36 combinações de busca × área × filtro: ordem e as 6 colunas + selos de
 *      cada linha = tblBase do renderBase() (e baseFiltrada());
 *   4. paginação 200 → 600 → 1000 na mesma ordem do HTML.
 * Sem banco.
 */
import "./mrp/force-utc";
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { orderMrpBaseMaterials } from "../src/lib/mrp/analysis-engine";
import { parseMrpBase } from "../src/lib/mrp/base-parser";
import { MRP_BASE_FILTERS, filterMrpBase, mrpBaseHasNoParams, summarizeMrpBase, type MrpBaseViewFilters, type MrpBaseViewRow } from "../src/lib/mrp/base-view";
import { fmtMrp } from "../src/lib/mrp/format";
import { buildMrpMaterialsFromHtmlSeed } from "../src/lib/mrp/html-seed";
import { readMrpWorkbook } from "../src/lib/mrp/workbook";
import * as F from "./mrp/fixtures";
import { loadHtmlReference } from "./mrp/html-reference";
import { createHtmlRuntime, type HtmlRuntime } from "./mrp/html-runtime";
import { text, unesc } from "./mrp/html-cards";

type Any = any; // eslint-disable-line @typescript-eslint/no-explicit-any
let failures = 0;
let checks = 0;
function check(label: string, ok: boolean, detail = "") {
  checks++;
  if (!ok) failures++;
  console.log(`  ${ok ? "✓" : "✗"} ${label}${detail ? `  — ${detail}` : ""}`);
}

type Rec = MrpBaseViewRow & { sourceSheet: string | null; sourceRow: number | null };

function shuffle<T>(list: T[], seed: number): T[] {
  const out = [...list];
  let a = seed;
  for (let i = out.length - 1; i > 0; i--) {
    a = (a * 1103515245 + 12345) % 2147483648;
    const j = a % (i + 1);
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

type Row = { code: string; desc: string; tags: string[]; min: string; max: string; grupo: string; status: string };
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
        tags: Array.from(tds[1].matchAll(/<span class="bg[^"]*"[^>]*>([^<]*)<\/span>/g)).map((m) => unesc(m[1]).replace(/^\S+\s(?=Mec|Elé|Sat|Cor)/, "")),
        min: text(tds[2]),
        max: text(tds[3]),
        grupo: text(tds[4]),
        status: text(tds[5])
      };
    });
}

function scenario(label: string, rt: HtmlRuntime, records: Rec[], sheetOrder: string[]) {
  console.log(`\n${label}`);
  const html = (rt.fn.materiais() as Any[]).map((m) => m.codigo);

  // 1) Ordem reconstruída a partir dos dados persistidos (sem `position`).
  const rows = orderMrpBaseMaterials(shuffle(records, 7), sheetOrder);
  check(`ordem de materiais() reconstruída com sourceSheet/sourceRow/sheets (${rows.length} materiais embaralhados)`, rows.map((r) => r.code).join() === html.join());

  // 2) Resumo.
  rt.fn.setValue("bQ", "");
  rt.fn.setValue("bArea", "");
  rt.fn.setValue("bFiltro", "");
  const markup = rt.fn.renderBaseHtml(200);
  const sub = text(markup.sub);
  const m = /([\d.]+) materiais \(\S+ ([\d.]+) · \S+ ([\d.]+)\) · ([\d.]+) sem mín\/máx · ([\d.]+) em satélites\/coroas/.exec(sub);
  const s = summarizeMrpBase(rows);
  check(`resumo = renderBase(): ${fmtMrp(s.total)} · Mecânica ${fmtMrp(s.mechanical)} · Elétrica ${fmtMrp(s.electrical)} · ${fmtMrp(s.noParams)} sem mín/máx · ${fmtMrp(s.inFamilies)} em satélites/coroas`,
    !!m && m[1] === fmtMrp(s.total) && m[2] === fmtMrp(s.mechanical) && m[3] === fmtMrp(s.electrical) && m[4] === fmtMrp(s.noParams) && m[5] === fmtMrp(s.inFamilies), sub);

  // 3) Filtros × tabela.
  let diverg = 0;
  let combos = 0;
  for (const filter of MRP_BASE_FILTERS) {
    for (const area of ["", "Mecânica", "Elétrica"]) {
      for (const q of ["", "135", "breton", "1885-0125"]) {
        const f: MrpBaseViewFilters = { q, area, filter };
        rt.fn.setValue("bQ", q);
        rt.fn.setValue("bArea", area);
        rt.fn.setValue("bFiltro", filter === "all" ? "" : filter);
        const htmlRows = parseRows(rt.fn.renderBaseHtml(1_000_000).table);
        const htmlFiltered = (rt.fn.baseFiltrada() as Any[]).map((x) => x.codigo);
        const mine = filterMrpBase(rows, f);
        combos++;
        const problems: string[] = [];
        if (htmlRows.length !== mine.length || htmlFiltered.join() !== mine.map((x) => x.code).join()) problems.push(`linhas HTML ${htmlRows.length} x Portal ${mine.length}`);
        mine.forEach((x, i) => {
          const h = htmlRows[i];
          if (!h || problems.length > 2) return;
          const me: Row = {
            code: x.code,
            desc: x.description,
            tags: [x.area === "Mecânica" ? "Mec" : "Elé", ...(x.family ? [x.family] : []), ...(mrpBaseHasNoParams(x) ? ["sem mín/máx"] : [])],
            min: fmtMrp(x.min),
            max: fmtMrp(x.max),
            grupo: x.group,
            status: x.statusMrp
          };
          if (JSON.stringify(me) !== JSON.stringify(h)) problems.push(`#${i}: HTML ${JSON.stringify(h)} x Portal ${JSON.stringify(me)}`);
        });
        if (problems.length) {
          diverg++;
          console.log(`    ✗ filtro=${filter} area=${area} q="${q}": ${problems.join(" | ")}`);
        }
      }
    }
  }
  check(`tabela = renderBase()/baseFiltrada() em ${combos} combinações (ordem, 6 colunas, selos)`, diverg === 0, `${diverg} divergência(s)`);

  // 4) Paginação na ordem do HTML.
  if (rows.length > 1000) {
    const all = filterMrpBase(rows, { q: "", area: "", filter: "all" }).map((r) => r.code);
    check("200 / 600 / 1000 = primeiras linhas do HTML, sem duplicar", [200, 600, 1000].every((n) => all.slice(0, n).join() === html.slice(0, n).join()) && new Set(all.slice(0, 1000)).size === 1000);
  }
  return s;
}

function main() {
  const ref = loadHtmlReference();
  // Base embutida (SEED_HTML).
  const seed = buildMrpMaterialsFromHtmlSeed(ref.seedMan, ref.seedEle).materials;
  const rtSeed = createHtmlRuntime();
  rtSeed.fn.setBase(null);
  const s1 = scenario("Base inicial (SEED_HTML, 4.280)", rtSeed, seed, ["SEED_MAN", "SEED_ELE"]);
  check("SEED: total 4.280 · Mecânica 3.485 · Elétrica 795", s1.total === 4280 && s1.mechanical === 3485 && s1.electrical === 795);

  // Base real enviada.
  const realPath = join(homedir(), "OneDrive - granitozucchi.com.br", "Manutenção - Documentos Manutenção", "Restrito", "Manutenção", "MRP Sap novo", "Controle_MRP_SAP_novo_analisado.xlsx");
  if (existsSync(realPath)) {
    const data = readFileSync(realPath);
    const parsed = parseMrpBase(readMrpWorkbook(data), { defaultArea: "Mecânica" });
    const rt = createHtmlRuntime();
    rt.fn.importarBase(rt.readWorkbook(data), "Controle.xlsx");
    const s2 = scenario("Base real (Controle_MRP_SAP_novo_analisado.xlsx)", rt, parsed.materials, parsed.sheets.map((x) => x.name));
    check("real: total 4.259 · Mecânica 3.465 · Elétrica 794 · Gyan ignorada", s2.total === 4259 && s2.mechanical === 3465 && s2.electrical === 794 && parsed.ignoredSheets.join() === "MRP Automatico Gyan");
  } else console.log("\n(base real não encontrada — pulada)");

  // Base fixture (duplicados, aba sem área no nome, conjuntos).
  for (const defaultArea of ["Mecânica", "Elétrica"]) {
    const data = F.baseFixture().data;
    const parsed = parseMrpBase(readMrpWorkbook(data), { defaultArea });
    const rt = createHtmlRuntime();
    rt.setDefaultArea(defaultArea);
    rt.fn.importarBase(rt.readWorkbook(data), "fixture.xlsx");
    scenario(`Base fixture (área padrão ${defaultArea})`, rt, parsed.materials, parsed.sheets.map((x) => x.name));
  }

  console.log(`\n${checks} checagens · ${failures} falha(s)`);
  console.log("PARIDADE MB52 REAL: PENDENTE · PARIDADE COMPRAS REAL: PENDENTE");
  if (failures) process.exitCode = 1;
}

main();
