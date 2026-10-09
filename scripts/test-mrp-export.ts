/**
 * ANÁLISE MRP (FASE J) — paridade das 6 exportações Excel com o HTML.
 *
 *   npm run test:mrp-export
 *
 * Referência = o workbook montado pelas PRÓPRIAS funções do HTML (sandbox):
 * exportCompra(false|true), exportConjuntos(), exportParado(), exportTransito()
 * e exportBase(), capturado no XLSX.writeFile. Para cada exportação compara:
 * nome do arquivo, abas (nomes e ordem), cabeçalho, linhas (ordem e valor de
 * cada célula) e `!cols` (wch). Nos maiores recortes também grava o .xlsx do
 * Portal, relê e compara célula a célula (tipo + valor) com o .xlsx do HTML.
 *
 * Bases de dados:
 *   1. base embutida 4.280 + estoque/compras sintéticos (fora da base, várias
 *      compras por código, datas vazias/empatadas);
 *   2. fixtures pelo fluxo de arquivos do HTML (processar);
 *   3. arquivos REAIS (Controle_MRP + estoque 0810 + compras 0810), se presentes.
 * Sem banco.
 */
import "./mrp/force-utc";
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import * as XLSX from "xlsx";
import { analyzeMrp, mrpObservation, orderMrpBaseMaterials, type MrpEngineMaterial, type MrpEnginePurchase } from "../src/lib/mrp/analysis-engine";
import { MRP_BUY_SORTS, MRP_BUY_STATUS_FILTERS, filterMrpBuyList, type MrpBuyFilters } from "../src/lib/mrp/buy-list";
import { MRP_IDLE_TYPES, filterMrpIdle } from "../src/lib/mrp/idle";
import { MRP_BASE_FILTERS, filterMrpBase, type MrpBaseViewRow } from "../src/lib/mrp/base-view";
import { buildMrpTransitGroups } from "../src/lib/mrp/transit";
import {
  MRP_EXPORT_BASE_COLW,
  MRP_EXPORT_COLW,
  MRP_EXPORT_TRANSIT_COLW,
  buildMrpBaseExport,
  buildMrpBuyByAreaExport,
  buildMrpBuyExport,
  buildMrpFamiliesExport,
  buildMrpIdleExport,
  buildMrpTransitExport,
  mrpExportDateStamp,
  mrpExportFileName,
  type MrpExportLineItem,
  type MrpExportResult,
  type MrpExportType
} from "../src/lib/mrp/export";
import { writeMrpExportWorkbook } from "../src/lib/mrp/export-workbook";
import { outputNumber } from "../src/lib/mrp/mrp-math";
import { buildMrpMaterialsFromHtmlSeed } from "../src/lib/mrp/html-seed";
import { buildMrpImportPlan } from "../src/lib/mrp/import-plan";
import { parseMrpBase } from "../src/lib/mrp/base-parser";
import { readMrpWorkbook } from "../src/lib/mrp/workbook";
import * as F from "./mrp/fixtures";
import { loadHtmlReference } from "./mrp/html-reference";
import { createHtmlRuntime, type HtmlRuntime } from "./mrp/html-runtime";

type Any = any; // eslint-disable-line @typescript-eslint/no-explicit-any
let failures = 0;
let checks = 0;
function check(label: string, ok: boolean, detail = "") {
  checks++;
  if (!ok) failures++;
  console.log(`  ${ok ? "✓" : "✗"} ${label}${detail ? `  — ${detail}` : ""}`);
}

type HtmlExport = { file: { nome: string; sheets: { name: string; rows: unknown[][]; cols: { wch: number }[] | null }[]; b64: string | null } | null; toast: string | null };
const htmlExport = (rt: HtmlRuntime, kind: MrpExportType, withFile = false): HtmlExport => JSON.parse(rt.fn.exportar(kind, withFile));

/** Divergência documentada: o HTML baixava um arquivo SÓ com o cabeçalho; o Portal mostra "Nada para exportar." (item 51). */
let headerOnly = 0;

/** Compara a exportação do Portal com a do HTML. Retorna lista de problemas. */
function compare(html: HtmlExport, mine: MrpExportResult, type: MrpExportType): string[] {
  const problems: string[] = [];
  if (!html.file) {
    if (mine.ok) problems.push(`HTML não exportou ("${html.toast}") e o Portal exportou`);
    else if (mine.message !== html.toast) problems.push(`mensagem HTML "${html.toast}" x Portal "${mine.message}"`);
    return problems;
  }
  if (!mine.ok) {
    if (html.file.sheets.every((s) => s.rows.length === 1) && mine.message === "Nada para exportar.") headerOnly++;
    else problems.push(`HTML exportou e o Portal não ("${mine.message}")`);
    return problems;
  }
  const spec = mine.spec;
  if (!new RegExp(`^${spec.baseName}_\\d{8}\\.xlsx$`).test(html.file.nome)) problems.push(`nome HTML ${html.file.nome} x base ${spec.baseName}`);
  if (!new RegExp(`^${spec.baseName}_\\d{8}\\.xlsx$`).test(mrpExportFileName(type))) problems.push(`nome Portal ${mrpExportFileName(type)}`);
  const hn = html.file.sheets.map((s) => s.name).join("|");
  const pn = spec.sheets.map((s) => s.name).join("|");
  if (hn !== pn) problems.push(`abas HTML [${hn}] x Portal [${pn}]`);
  html.file.sheets.forEach((hs, i) => {
    const ps = spec.sheets[i];
    if (!ps) return;
    if (JSON.stringify(hs.cols) !== JSON.stringify(ps.cols)) problems.push(`${hs.name}: !cols HTML ${JSON.stringify(hs.cols)} x Portal ${JSON.stringify(ps.cols)}`);
    const pr = JSON.parse(JSON.stringify(ps.rows)) as unknown[][];
    if (hs.rows.length !== pr.length) problems.push(`${hs.name}: linhas HTML ${hs.rows.length - 1} x Portal ${pr.length - 1}`);
    for (let r = 0; r < Math.min(hs.rows.length, pr.length) && problems.length < 4; r++) {
      if (JSON.stringify(hs.rows[r]) !== JSON.stringify(pr[r])) problems.push(`${hs.name} linha ${r}: HTML ${JSON.stringify(hs.rows[r])} x Portal ${JSON.stringify(pr[r])}`);
    }
  });
  return problems;
}

/** .xlsx do HTML x .xlsx do Portal relidos pela mesma biblioteca: abas, !ref, tipo e valor de cada célula, !cols. */
function compareFiles(html: HtmlExport, mine: MrpExportResult, label: string) {
  if (!html.file?.b64 || !mine.ok) return check(`${label}: arquivo .xlsx`, false, "sem arquivo");
  const t0 = Date.now();
  const mem0 = process.memoryUsage().heapUsed;
  const buf = writeMrpExportWorkbook(mine.spec);
  const ms = Date.now() - t0;
  const mem = Math.max(0, process.memoryUsage().heapUsed - mem0);
  const a = XLSX.read(Buffer.from(html.file.b64, "base64"), { type: "buffer" });
  const b = XLSX.read(buf, { type: "buffer" });
  const problems: string[] = [];
  if (a.SheetNames.join("|") !== b.SheetNames.join("|")) problems.push(`abas ${a.SheetNames} x ${b.SheetNames}`);
  let cells = 0;
  for (const n of a.SheetNames) {
    const wa = a.Sheets[n];
    const wb = b.Sheets[n];
    if (!wb) continue;
    if (wa["!ref"] !== wb["!ref"]) problems.push(`${n}: !ref ${wa["!ref"]} x ${wb["!ref"]}`);
    for (const addr of Object.keys(wa)) {
      if (addr.startsWith("!")) continue;
      cells++;
      const ca = wa[addr];
      const cb = wb[addr];
      if (!cb || ca.t !== cb.t || !Object.is(ca.v, cb.v)) {
        if (problems.length < 4) problems.push(`${n}!${addr}: HTML ${ca.t}:${JSON.stringify(ca.v)} x Portal ${cb?.t}:${JSON.stringify(cb?.v)}`);
      }
    }
    const extra = Object.keys(wb).filter((k) => !k.startsWith("!") && !wa[k]);
    if (extra.length) problems.push(`${n}: ${extra.length} célula(s) a mais no Portal`);
    const wchA = (wa["!cols"] ?? []).map((c: Any) => c.wch ?? c.width);
    const wchB = (wb["!cols"] ?? []).map((c: Any) => c.wch ?? c.width);
    if (JSON.stringify(wchA) !== JSON.stringify(wchB)) problems.push(`${n}: larguras ${JSON.stringify(wchA)} x ${JSON.stringify(wchB)}`);
  }
  const rows = mine.spec.sheets.reduce((s, x) => s + x.rows.length - 1, 0);
  check(`${label}: .xlsx relido = .xlsx do HTML (${a.SheetNames.length} aba(s), ${rows} linhas, ${cells} células, tipo + valor + larguras)`, problems.length === 0, problems.length ? problems.join(" | ") : `gerado em ${ms} ms · ${(buf.length / 1024).toFixed(1)} KB · ~${(mem / 1048576).toFixed(1)} MB heap`);
  return { ms, bytes: buf.length, rows };
}

const toLine = (a: ReturnType<typeof analyzeMrp>[number]): MrpExportLineItem & { noParams: boolean; notFound: boolean; noMovement: boolean } => ({
  code: a.code,
  description: a.description,
  area: a.area,
  family: a.family,
  group: a.group,
  unit: a.unit,
  free: outputNumber(a.free),
  min: outputNumber(a.min),
  max: outputNumber(a.max),
  suggested: outputNumber(a.suggested),
  status: a.status,
  observation: mrpObservation(a),
  noParams: a.noParams,
  notFound: a.notFound,
  noMovement: a.noMovement
});
const toBaseRow = (m: MrpEngineMaterial): MrpBaseViewRow => ({
  code: m.code,
  description: m.description,
  group: m.group,
  unit: m.unit,
  min: outputNumber(m.min),
  max: outputNumber(m.max),
  statusMrp: m.statusMrp,
  family: m.family,
  area: m.area
});

type Perf = { label: string; ms: number; bytes: number; rows: number };
const perf: Perf[] = [];

function scenario(label: string, rt: HtmlRuntime, materials: MrpEngineMaterial[], stock: Map<string, number>, purchases: MrpEnginePurchase[], files = false) {
  console.log(`\n${label}`);
  const analysis = analyzeMrp(materials, stock, purchases);
  const rows = analysis.map(toLine);
  const families = Array.from(new Set(rows.map((r) => r.family).filter(Boolean)));

  // 1+2) Lista e Por área — filtrarCompra() em status × ordenação × filtros.
  const variants: Partial<MrpBuyFilters>[] = [{}, { area: "Mecânica" }, { area: "Elétrica" }, { family: families[0] ?? "" }, { q: "1885-0125" }, { q: "breton" }, { q: "zzz-nada" }];
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
        const filtered = filterMrpBuyList(rows, f);
        for (const [type, mine] of [["buy", buildMrpBuyExport(filtered)], ["buy-by-area", buildMrpBuyByAreaExport(filtered)]] as const) {
          combos++;
          const p = compare(htmlExport(rt, type), mine, type);
          if (p.length) {
            diverg++;
            if (diverg <= 5) console.log(`    ✗ ${type} status=${status} sort=${sort} ${JSON.stringify(v)}: ${p.join(" | ")}`);
          }
        }
      }
    }
  }
  check(`Excel da lista + Por área = exportCompra(false/true) em ${combos} exportações (filtros, ordem, abas, 12 colunas, células, wch)`, diverg === 0, `${diverg} divergência(s)`);

  // Por área com área já filtrada → só a aba daquela área.
  rt.fn.setValue("fQ", "");
  rt.fn.setValue("fStatus", "");
  rt.fn.setValue("fFam", "");
  rt.fn.setValue("fSort", "need");
  rt.fn.setValue("fArea", "Mecânica");
  const mecOnly = buildMrpBuyByAreaExport(filterMrpBuyList(rows, { q: "", status: "all", area: "Mecânica", family: "", sort: "need" }));
  check("Por área com área=Mecânica na tela: só a aba Mecânica (filtro respeitado antes de dividir)", mecOnly.ok && mecOnly.spec.sheets.map((s) => s.name).join() === "Mecânica" && JSON.parse(rt.fn.exportar("buy-by-area", false)).file.sheets.map((s: Any) => s.name).join() === "Mecânica");

  // Situação/obs.
  const all = buildMrpBuyExport(filterMrpBuyList(rows, { q: "", status: "all", area: "", family: "", sort: "need" }));
  if (all.ok) {
    const sits = new Set(all.spec.sheets[0].rows.slice(1).map((r) => r[10]));
    const semMrp = rows.filter((r) => r.noParams && r.status === "OK").length;
    check(`Situação ∈ {Comprar, Verificar, Em trânsito, OK}; sem MRP sai "OK" (${semMrp} itens), nunca "Sem MRP"/"Comprado"`, Array.from(sits).every((s) => ["Comprar", "Verificar", "Em trânsito", "OK"].includes(String(s))) && !sits.has("Sem MRP") && !sits.has("Comprado"), Array.from(sits).join(","));
    check("cabeçalho de 12 colunas e larguras da lista", JSON.stringify(all.spec.sheets[0].rows[0]) === JSON.stringify(["Código", "Descrição", "Área", "Conjunto", "Grupo", "UM", "Saldo", "Mínimo", "Máximo", "Comprar", "Situação", "Observação"]) && all.spec.sheets[0].cols.map((c) => c.wch).join() === "14,46,12,20,12,7,12,11,11,12,15,52");
  }

  // 3) Conjuntos — ignora os filtros de Comprar (deixados restritivos de propósito).
  rt.fn.setValue("fQ", "zzz-nada");
  rt.fn.setValue("fArea", "Elétrica");
  const famMine = buildMrpFamiliesExport(rows);
  const famHtml = htmlExport(rt, "families", files);
  const pf = compare(famHtml, famMine, "families");
  check(`Excel por conjunto = exportConjuntos() (análise completa, abas na ordem FAMS, substring(0,28), suggested DESC + empate estável)${famMine.ok ? `: ${famMine.spec.sheets.map((s) => `${s.name} ${s.rows.length - 1}`).join(" · ")}` : ""}`, pf.length === 0, pf.join(" | "));
  if (famMine.ok) {
    const sortedOk = famMine.spec.sheets.every((s) => {
      const body = s.rows.slice(1);
      const pos = new Map(rows.map((r, i) => [r.code, i]));
      return body.every((r, i) => i === 0 || (Number(body[i - 1][9]) > Number(r[9])) || (Number(body[i - 1][9]) === Number(r[9]) && pos.get(String(body[i - 1][0]))! < pos.get(String(r[0]))!));
    });
    check("ordem dentro do conjunto: Comprar DESC, empate na ordem da análise (position)", sortedOk);
  }
  if (files && famMine.ok) {
    const r = compareFiles(famHtml, famMine, "Excel por conjunto");
    if (r) perf.push({ label: `${label} · conjuntos`, ...r });
  }

  // 4) Estoque parado — paradoRows() com as 12 colunas.
  let idleCombos = 0;
  let idleDiv = 0;
  for (const type of MRP_IDLE_TYPES) {
    for (const area of ["", "Mecânica", "Elétrica"]) {
      for (const q of ["", "135", "motor", "zzz-nada"]) {
        rt.fn.setValue("pQ", q);
        rt.fn.setValue("pTipo", type === "all" ? "" : type);
        rt.fn.setValue("pArea", area);
        idleCombos++;
        const p = compare(htmlExport(rt, "idle"), buildMrpIdleExport(filterMrpIdle(rows, { q, type, area })), "idle");
        if (p.length) {
          idleDiv++;
          if (idleDiv <= 5) console.log(`    ✗ idle type=${type} area=${area} q="${q}": ${p.join(" | ")}`);
        }
      }
    }
  }
  check(`Estoque parado = exportParado() em ${idleCombos} combinações (aba "Sem movimentacao", 12 colunas, free DESC estável)`, idleDiv === 0, `${idleDiv} divergência(s)`);
  rt.fn.setValue("pQ", "");
  rt.fn.setValue("pTipo", "");
  rt.fn.setValue("pArea", "");
  const idleAll = buildMrpIdleExport(filterMrpIdle(rows, { q: "", type: "all", area: "" }));
  check("Estoque parado tem as 12 colunas da lista (não as 5 da tela)", idleAll.ok && idleAll.spec.sheets[0].rows[0].length === 12 && idleAll.spec.sheets[0].rows.every((r) => r.length === 12));
  if (files && idleAll.ok) {
    const r = compareFiles(htmlExport(rt, "idle", true), idleAll, "Estoque parado (Todos)");
    if (r) perf.push({ label: `${label} · parado`, ...r });
  }

  // 5) Compras — TODOS os grupos, ordem de 1ª aparição, ignora a tela.
  rt.fn.setValue("tQ", "zzz-nada");
  rt.fn.setValue("tStatus", "rec");
  rt.fn.setChecked("tSoMrp", true);
  const groups = buildMrpTransitGroups(purchases, new Map(analysis.map((a) => [a.code, { description: a.description, area: a.area }])));
  const trMine = buildMrpTransitExport(groups);
  const trHtml = htmlExport(rt, "transit", files);
  const pt = compare(trHtml, trMine, "transit");
  check(`Compras = exportTransito() (${groups.length} grupos com a tela filtrada; 12 colunas; datas DD/MM/AAAA texto)`, pt.length === 0, pt.join(" | "));
  if (trMine.ok) {
    const codes = trMine.spec.sheets[0].rows.slice(1).map((r) => String(r[0]));
    const first: string[] = [];
    for (const p of purchases) if (p.code && !first.includes(p.code)) first.push(p.code);
    const byDate = [...groups].sort((x, y) => (y.requisitionDate || "").localeCompare(x.requisitionDate || "") || x.firstSeq - y.firstSeq).map((g) => g.code);
    check("ordem = 1ª aparição de cada código (não data DESC da tela)", codes.join() === first.join() && (codes.length < 3 || codes.join() !== byDate.join() || groups.every((g) => !g.requisitionDate)));
    const outside = trMine.spec.sheets[0].rows.slice(1).filter((r) => r[2] === "fora da base");
    const outsideOk = outside.every((r) => {
      const g = groups.find((x) => x.code === r[0])!;
      return !g.inBase && r[1] === g.text;
    });
    check(`fora da base: Área "fora da base" e Descrição = texto da última compra (${outside.length})`, outsideOk && outside.length === groups.filter((g) => !g.inBase).length);
    check("Quantidade = última compra (não soma); Compras do código = nº de linhas", trMine.spec.sheets[0].rows.slice(1).every((r, i) => Object.is(r[3], groups[i].quantity) && r[11] === groups[i].count));
    check("larguras de Compras", trMine.spec.sheets[0].cols.map((c) => c.wch).join() === MRP_EXPORT_TRANSIT_COLW.map((c) => c.wch).join());
    if (files) {
      const r = compareFiles(trHtml, trMine, "Compras");
      if (r) perf.push({ label: `${label} · compras`, ...r });
    }
  }
  rt.fn.setValue("tQ", "");
  rt.fn.setValue("tStatus", "pend");
  rt.fn.setChecked("tSoMrp", false);

  // 6) Base MRP — baseFiltrada().
  const baseRows = (rt.fn.materiais() as Any[]).length === materials.length ? materials.map(toBaseRow) : [];
  let baseCombos = 0;
  let baseDiv = 0;
  for (const filter of MRP_BASE_FILTERS) {
    for (const area of ["", "Mecânica", "Elétrica"]) {
      for (const q of ["", "135", "breton", "zzz-nada"]) {
        rt.fn.setValue("bQ", q);
        rt.fn.setValue("bArea", area);
        rt.fn.setValue("bFiltro", filter === "all" ? "" : filter);
        baseCombos++;
        const p = compare(htmlExport(rt, "base"), buildMrpBaseExport(filterMrpBase(baseRows, { q, area, filter })), "base");
        if (p.length) {
          baseDiv++;
          if (baseDiv <= 5) console.log(`    ✗ base filter=${filter} area=${area} q="${q}": ${p.join(" | ")}`);
        }
      }
    }
  }
  check(`Excel da base = exportBase() em ${baseCombos} combinações (aba "Base MRP", 9 colunas, ordem de baseFiltrada())`, baseDiv === 0, `${baseDiv} divergência(s)`);
  rt.fn.setValue("bQ", "");
  rt.fn.setValue("bArea", "");
  rt.fn.setValue("bFiltro", "");
  const baseAll = buildMrpBaseExport(baseRows);
  check("larguras da base", baseAll.ok && baseAll.spec.sheets[0].cols.map((c) => c.wch).join() === MRP_EXPORT_BASE_COLW.map((c) => c.wch).join());
  if (files && baseAll.ok) {
    const r = compareFiles(htmlExport(rt, "base", true), baseAll, "Excel da base");
    if (r) perf.push({ label: `${label} · base`, ...r });
  }
  if (files) {
    rt.fn.setValue("fQ", "");
    rt.fn.setValue("fArea", "");
    rt.fn.setValue("fFam", "");
    rt.fn.setValue("fStatus", "");
    rt.fn.setValue("fSort", "need");
    const buyAll = buildMrpBuyExport(filterMrpBuyList(rows, { q: "", status: "all", area: "", family: "", sort: "need" }));
    const r1 = compareFiles(htmlExport(rt, "buy", true), buyAll, "Excel da lista (Todos)");
    if (r1) perf.push({ label: `${label} · lista`, ...r1 });
    const r2 = compareFiles(htmlExport(rt, "buy-by-area", true), buildMrpBuyByAreaExport(filterMrpBuyList(rows, { q: "", status: "all", area: "", family: "", sort: "need" })), "Por área (Todos)");
    if (r2) perf.push({ label: `${label} · por área`, ...r2 });
  }
  return { rows, groups };
}

function main() {
  const ref = loadHtmlReference();
  const seed = buildMrpMaterialsFromHtmlSeed(ref.seedMan, ref.seedEle).materials;

  // Nomes dos arquivos.
  console.log("\nNomes");
  const stamp = mrpExportDateStamp(new Date("2026-10-08T15:00:00Z"));
  check("dateStamp no fuso de Brasília: 2026-10-08 15:00Z → 20261008; 2026-10-09 02:00Z → 20261008", stamp === "20261008" && mrpExportDateStamp(new Date("2026-10-09T02:00:00Z")) === "20261008");
  const names: Record<MrpExportType, RegExp> = {
    buy: /^Lista_Compra_MRP_\d{8}\.xlsx$/,
    "buy-by-area": /^Lista_Compra_MRP_\d{8}\.xlsx$/,
    families: /^Satelites_Coroas_\d{8}\.xlsx$/,
    idle: /^Estoque_Parado_\d{8}\.xlsx$/,
    transit: /^Compras_Realizadas_\d{8}\.xlsx$/,
    base: /^Base_MRP_\d{8}\.xlsx$/
  };
  check("6 nomes: Lista_Compra_MRP / Satelites_Coroas / Estoque_Parado / Compras_Realizadas / Base_MRP _AAAAMMDD.xlsx", (Object.keys(names) as MrpExportType[]).every((t) => names[t].test(mrpExportFileName(t))), (Object.keys(names) as MrpExportType[]).map((t) => mrpExportFileName(t)).join(" "));
  check("larguras da lista = COLW do HTML", MRP_EXPORT_COLW.map((c) => c.wch).join() === "14,46,12,20,12,7,12,11,11,12,15,52");

  // 1) Base embutida + sintéticos.
  let a = 41;
  const rng = () => {
    a = (a * 1103515245 + 12345) % 2147483648;
    return a / 2147483648;
  };
  const pick = <T,>(l: readonly T[]) => l[Math.floor(rng() * l.length)];
  const stock = new Map<string, number>();
  for (const m of seed) if (rng() < 0.85) stock.set(m.code, pick([0, 0, -2, 1, 2, 5, 10, 25, 0.5, 1303]));
  const codes = [...seed.filter(() => rng() < 0.2).map((m) => m.code), "X-001", "X-002", "000013515", "99999"];
  const purchases: MrpEnginePurchase[] = [];
  for (let n = 0; n < 2400; n++) {
    purchases.push({
      seq: purchases.length,
      code: pick(codes),
      text: pick(["Motor Breton 1885-0125", "Rolamento", "Peça avulsa", "Satélite simec", ""]),
      quantity: pick([1, 2, 5, 12, 20, 100, 0.5, 2.25]),
      requisitionDate: pick(["", "2026-09-01", "2026-09-01", "2026-08-15", "2026-10-02", "2025-12-31"]),
      receiptDate: rng() < 0.4 ? "2026-09-20" : "",
      expectedDeliveryDate: rng() < 0.3 ? "2026-10-05" : "",
      purchaseOrderNumber: rng() < 0.5 ? String(4500000000 + Math.floor(rng() * 30)) : "",
      requisitionNumber: rng() < 0.6 ? String(1000000 + Math.floor(rng() * 30)) : "",
      supplier: pick(["Fornecedor A", "Fornecedor B Ltda", "", "Indústria Ação"])
    });
  }
  const rt1 = createHtmlRuntime();
  rt1.fn.setBase(null);
  const stockObj: Record<string, number> = {};
  for (const [k, v] of Array.from(stock.entries())) stockObj[k] = v;
  rt1.fn.analisarCom(stockObj, purchases.map((p) => ({ i: p.seq, codigo: p.code, texto: p.text, qtd: p.quantity, dataReq: p.requisitionDate, requisicao: p.requisitionNumber, pedido: p.purchaseOrderNumber, recebimento: p.receiptDate, previsao: p.expectedDeliveryDate, fornecedor: p.supplier })));
  scenario("Base embutida (4.280) + estoque/compras sintéticos (inclui códigos fora da base)", rt1, seed, stock, purchases, true);

  // 2) Fixtures pelo fluxo de arquivos.
  {
    const files = [F.stockFixture(), F.purchaseFixture()];
    const rt = createHtmlRuntime();
    rt.setDeposit("1400");
    rt.receber(files);
    rt.processar();
    const plan = buildMrpImportPlan(
      [{ fileName: files[0].name, wb: readMrpWorkbook(files[0].data), kind: "est", sheet: rt.arquivos().est.aba }, { fileName: files[1].name, wb: readMrpWorkbook(files[1].data), kind: "cmp", sheet: rt.arquivos().cmp.aba }],
      { depositFilter: "1400" }
    );
    const r = scenario("Fixtures (estoque 1400 + compras) sobre a base embutida", rt, seed, new Map(plan.stock!.result.items.map((i) => [i.code, i.freeQty])), plan.purchases!.result.items);
    console.log(`    linhas: lista(Todos) ${r.rows.length} · compras ${r.groups.length} grupos · parado ${filterMrpIdle(r.rows, { q: "", type: "all", area: "" }).length}`);
  }

  // 3) Arquivos reais (se presentes nesta máquina).
  const realBase = join(homedir(), "OneDrive - granitozucchi.com.br", "Manutenção - Documentos Manutenção", "Restrito", "Manutenção", "MRP Sap novo", "Controle_MRP_SAP_novo_analisado.xlsx");
  const realStock = join(homedir(), "Downloads", "estoque 0810.xlsx");
  const realCmp = join(homedir(), "Downloads", "compras 0810.xlsx");
  if ([realBase, realStock, realCmp].every(existsSync)) {
    const baseData = readFileSync(realBase);
    const files = [
      { name: "estoque 0810.xlsx", data: readFileSync(realStock) },
      { name: "compras 0810.xlsx", data: readFileSync(realCmp) }
    ];
    const rt = createHtmlRuntime();
    rt.fn.importarBase(rt.readWorkbook(baseData), "Controle_MRP_SAP_novo_analisado.xlsx");
    // O estoque real 0810 não tem linhas do depósito 1400 (o HTML recusa igual): todos os depósitos.
    rt.setDeposit("");
    rt.receber(files);
    rt.processar();
    const parsedBase = parseMrpBase(readMrpWorkbook(baseData), { defaultArea: "Mecânica" });
    const materials = orderMrpBaseMaterials(parsedBase.materials, parsedBase.sheets.map((s) => s.name));
    const plan = buildMrpImportPlan(
      [{ fileName: files[0].name, wb: readMrpWorkbook(files[0].data), kind: "est", sheet: rt.arquivos().est.aba }, { fileName: files[1].name, wb: readMrpWorkbook(files[1].data), kind: "cmp", sheet: rt.arquivos().cmp.aba }],
      { depositFilter: "" }
    );
    const r = scenario("ARQUIVOS REAIS: Controle_MRP_SAP_novo_analisado + estoque 0810 + compras 0810 (todos os depósitos)", rt, materials, new Map(plan.stock!.result.items.map((i) => [i.code, i.freeQty])), plan.purchases!.result.items, true);
    console.log(`    linhas: materiais ${r.rows.length} · compras ${plan.purchases!.result.items.length} linhas / ${r.groups.length} grupos · fora da base ${r.groups.filter((g) => !g.inBase).length}`);
  } else console.log("\nARQUIVOS REAIS NÃO ACESSÍVEIS NESTA MÁQUINA — validação real pendente");

  console.log("\nDesempenho (gravação do .xlsx no Portal)");
  for (const p of perf) console.log(`    ${p.label}: ${p.rows} linhas · ${p.ms} ms · ${(p.bytes / 1024).toFixed(1)} KB`);
  console.log(`\nRecortes sem linhas: o HTML baixava ${headerOnly} arquivo(s) só com o cabeçalho; o Portal mostra "Nada para exportar." (item 51 da FASE J).`);
  console.log(`\n${checks} checagens · ${failures} falha(s)`);
  console.log("PARIDADE MB52 REAL: PENDENTE · PARIDADE COMPRAS REAL: PENDENTE");
  if (failures) process.exitCode = 1;
}

main();
