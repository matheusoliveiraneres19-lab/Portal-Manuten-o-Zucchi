/**
 * ANÁLISE MRP (FASE K) — COMPARADOR OFICIAL HTML x PORTAL com os ARQUIVOS REAIS.
 *
 *   npm run validate:mrp-parity                 (UTC + America/Sao_Paulo)
 *   npm run validate:mrp-parity -- --tz=UTC     (um fuso só)
 *
 * Duas implementações independentes sobre os MESMOS três arquivos originais:
 *   A. o HTML ORIGINAL (`Analise_MRP_Compacto (1).html`), executado na sandbox
 *      com a SheetJS 0.18.5 embutida nele: receberArquivos() → processar() e as
 *      próprias funções de tela/exportação;
 *   B. o PORTAL: readMrpWorkbook (SheetJS do projeto) → analyzeMrpWorkbook →
 *      buildMrpImportPlan → analyzeMrp → libs de tela/exportação.
 * Nenhuma expectativa escrita à mão: a referência é a execução do HTML.
 *
 * Arquivos (nunca editados nem regravados):
 *   Base:    OneDrive/.../MRP Sap novo/Controle_MRP_SAP_novo_analisado.xlsx
 *   Estoque: Downloads/estoque 0810.xlsx
 *   Compras: Downloads/compras 0810.xlsx
 * Depósito oficial: 1000 (coluna Depósito; 1400 é o Centro). "Todos os
 * depósitos" roda só como diagnóstico.
 *
 * Classificação de divergências: BUG_PORTAL (padrão para qualquer diferença),
 * KNOWN_LEGACY_DATE_BUG (só datas, só fora de UTC, Portal determinístico).
 * Sem banco.
 */
import "./mrp/tz-arg";
import "./mrp/force-utc";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import * as XLSX from "xlsx";
import {
  analyzeMrp,
  countMrp,
  mrpObservation,
  orderMrpBaseMaterials,
  purchaseKpis,
  removedFromMrp,
  type MrpAnalysisResult,
  type MrpEngineMaterial,
  type MrpEnginePurchase
} from "../src/lib/mrp/analysis-engine";
import { buildMrpAreasSummary } from "../src/lib/mrp/areas";
import { MRP_BUY_SORTS, MRP_BUY_STATUS_FILTERS, filterMrpBuyList, type MrpBuyFilters } from "../src/lib/mrp/buy-list";
import { MRP_AREA_ELE, MRP_AREA_MEC, MRP_FAMILIES } from "../src/lib/mrp/classification";
import { analyzeMrpWorkbook } from "../src/lib/mrp/file-detection";
import { buildMrpImportPlan, type MrpImportPlan } from "../src/lib/mrp/import-plan";
import { mrpIdleShareText } from "../src/lib/mrp/idle";
import { norm } from "../src/lib/mrp/normalization";
import { buildMrpPurchaseIndex, mrpPurchaseOrderKey } from "../src/lib/mrp/purchase-parser";
import { readMrpWorkbook } from "../src/lib/mrp/workbook";
import { createHtmlRuntime, type HtmlRuntime } from "./mrp/html-runtime";
import { FIELDS, fromHtml } from "./test-mrp-engine";
import { scenario as areasScenario, tally as areasTally } from "./test-mrp-areas";
import { runScenario as transitScenario, tally as transitTally } from "./test-mrp-transit";
import { scenario as idleScenario, tally as idleTally } from "./test-mrp-idle-stock";
import { scenario as baseViewScenario, tally as baseViewTally } from "./test-mrp-base-view";
import { scenario as exportScenario, tally as exportTally } from "./test-mrp-export";

type Any = any; // eslint-disable-line @typescript-eslint/no-explicit-any
const TZ = process.env.TZ || "UTC";
const DEPOSIT = "1000";

/* -------------------------------------------------------------------------- */
/*  Arquivos                                                                    */
/* -------------------------------------------------------------------------- */

const FILES = {
  base: join(homedir(), "OneDrive - granitozucchi.com.br", "Manutenção - Documentos Manutenção", "Restrito", "Manutenção", "MRP Sap novo", "Controle_MRP_SAP_novo_analisado.xlsx"),
  est: join(homedir(), "Downloads", "estoque 0810.xlsx"),
  cmp: join(homedir(), "Downloads", "compras 0810.xlsx")
};

/* -------------------------------------------------------------------------- */
/*  Registro de divergências                                                    */
/* -------------------------------------------------------------------------- */

type Klass = "BUG_PORTAL" | "KNOWN_LEGACY_DATE_BUG";
type Divergence = { category: string; file: string; key: string; field: string; html: unknown; portal: unknown; klass: Klass; reason: string };
type CategoryStat = { items: number; divergences: number; legacy: number; unit: string };

const divergences: Divergence[] = [];
const stats = new Map<string, CategoryStat>();
const stat = (category: string, unit = "itens") => {
  if (!stats.has(category)) stats.set(category, { items: 0, divergences: 0, legacy: 0, unit });
  return stats.get(category)!;
};
const show = (v: unknown) => JSON.stringify(v, (_k, x) => (typeof x === "number" && Object.is(x, -0) ? "-0" : x));
const DATE_FIELDS = new Set(["requisitionDate", "receiptDate", "expectedDeliveryDate", "purchase.date", "purchase.forecast"]);
const isIsoDate = (v: unknown) => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v);

/** Igualdade semântica: números por valor (−0 ≡ 0, decisão da FASE B), resto exato. */
const sameValue = (a: unknown, b: unknown) => (typeof a === "number" && typeof b === "number" ? a === b || (Number.isNaN(a) && Number.isNaN(b)) : show(a) === show(b));

function record(category: string, file: string, key: string, field: string, html: unknown, portal: unknown) {
  const s = stat(category);
  // KNOWN_LEGACY_DATE_BUG: campo de data, fora de UTC, Portal com data ISO válida (determinística — conferido entre fusos no relatório).
  const legacy = TZ !== "UTC" && DATE_FIELDS.has(field) && (isIsoDate(portal) || portal === "") && (isIsoDate(html) || html === "");
  if (legacy) s.legacy++;
  else s.divergences++;
  divergences.push({
    category,
    file,
    key,
    field,
    html,
    portal,
    klass: legacy ? "KNOWN_LEGACY_DATE_BUG" : "BUG_PORTAL",
    reason: legacy ? `SheetJS 0.18.5 (cellDates) em ${TZ} desloca a data lida; Portal lê a data do arquivo sem depender do fuso` : "diferença de regra/valor"
  });
}

/** Compara dois objetos campo a campo. */
function compareFields(category: string, file: string, key: string, html: Record<string, unknown>, portal: Record<string, unknown>, fields: string[]) {
  stat(category).items++;
  for (const f of fields) if (!sameValue(html[f], portal[f])) record(category, file, key, f, html[f], portal[f]);
}

/** Integra as checagens de um módulo de teste reaproveitado (deltas de tally()). */
function tallyCategory(category: string, before: { checks: number; failures: number }, after: { checks: number; failures: number }) {
  const s = stat(category, "checagens");
  s.items += after.checks - before.checks;
  const failed = after.failures - before.failures;
  s.divergences += failed;
  for (let i = 0; i < failed; i++) divergences.push({ category, file: "-", key: "ver ✗ acima", field: "-", html: "-", portal: "-", klass: "BUG_PORTAL", reason: "checagem do módulo reaproveitado falhou" });
}

const fmt = (n: number) => n.toLocaleString("pt-BR", { maximumFractionDigits: 6 });

/* -------------------------------------------------------------------------- */
/*  Auditoria dos arquivos (pipeline oficial do Portal + leitura bruta)         */
/* -------------------------------------------------------------------------- */

function physicalRows(data: Buffer) {
  const wb = XLSX.read(data, { type: "buffer" });
  return wb.SheetNames.map((n) => ({ name: n, ref: wb.Sheets[n]["!ref"] ?? "", rows: XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[n], { header: 1, raw: true, defval: null, blankrows: true }) }));
}

function auditBase(data: Buffer, plan: MrpImportPlan) {
  console.log("\n━━ AUDITORIA — BASE (Controle_MRP_SAP_novo_analisado.xlsx)");
  for (const s of physicalRows(data)) console.log(`  aba "${s.name}": ${s.rows.length} linhas físicas (${s.ref})`);
  const b = plan.base!.result;
  for (const s of b.sheets) console.log(`  importada "${s.name}" → ${s.area}${s.areaFromSheetName ? "" : " (área padrão)"} · ${s.dataRows} linhas de dados · ${s.materials} materiais novos · ${s.duplicateRows} duplicados · ${s.emptyCodeRows} sem código`);
  console.log(`  ignoradas: ${b.ignoredSheets.join(", ") || "-"} · puladas: ${b.skippedSheets.map((s) => `${s.name} (${s.reason})`).join(", ") || "-"}`);
  const m = b.materials;
  const out = {
    materiais: m.length,
    mecanica: m.filter((x) => x.area === MRP_AREA_MEC).length,
    eletrica: m.filter((x) => x.area === MRP_AREA_ELE).length,
    semMinMax: m.filter((x) => x.min <= 0 && x.max <= 0).length,
    comConjunto: m.filter((x) => x.family).length,
    duplicados: b.duplicateRows,
    semCodigo: b.emptyCodeRows,
    porConjunto: Object.fromEntries(MRP_FAMILIES.map((f) => [f, m.filter((x) => x.family === f).length]))
  };
  console.log(`  materiais finais ${fmt(out.materiais)} · Mecânica ${fmt(out.mecanica)} · Elétrica ${fmt(out.eletrica)} · sem mín/máx ${fmt(out.semMinMax)} · com conjunto ${fmt(out.comConjunto)} · duplicados ${out.duplicados} · sem código ${out.semCodigo}`);
  console.log(`  conjuntos: ${Object.entries(out.porConjunto).map(([k, v]) => `${k} ${v}`).join(" · ")}`);
  return out;
}

function auditStock(data: Buffer, plan: MrpImportPlan, baseCodes: Set<string>, rt: HtmlRuntime, htmlEstoque: Record<string, number>) {
  console.log("\n━━ AUDITORIA — ESTOQUE (estoque 0810.xlsx)");
  const phys = physicalRows(data)[0];
  const t = plan.stock!.table;
  const s = plan.stock!.result;
  const H = t.headers.map((h) => norm(h));
  const depCol = H.indexOf("deposito");
  const cenCol = H.indexOf("centro");
  const freeCol = H.findIndex((h) => h.includes("livre"));
  const withCode = t.rows.filter((r) => String(r[0] ?? "").trim() !== "");
  const deposits = new Map<string, number>();
  const centers = new Map<string, number>();
  for (const r of withCode) {
    const d = String(r[depCol] ?? "");
    const c = String(r[cenCol] ?? "");
    deposits.set(d, (deposits.get(d) ?? 0) + 1);
    centers.set(c, (centers.get(c) ?? 0) + 1);
  }
  const free = s.items.map((i) => i.freeQty);
  const out = {
    linhasFisicas: phys.rows.length,
    cabecalho: t.headerSheetRow,
    linhasDeDados: s.rowsRead,
    linhasComMaterial: withCode.length,
    depositos: Object.fromEntries(deposits),
    centros: Object.fromEntries(centers),
    linhasDeposito: withCode.filter((r) => String(r[depCol] ?? "") === DEPOSIT).length,
    linhasForaDeposito: s.otherDepositRows,
    semCodigo: s.emptyCodeRows,
    codigosUnicos: s.rowsAccepted,
    duplicados: s.duplicateRows,
    somaLivre: free.reduce((a, b) => a + b, 0),
    menor: free.length ? Math.min(...free) : 0,
    maior: free.length ? Math.max(...free) : 0,
    naBase: s.items.filter((i) => baseCodes.has(i.code)).length,
    foraBase: s.items.filter((i) => !baseCodes.has(i.code)).length,
    comSaldoPositivo: free.filter((x) => x > 0).length
  };
  console.log(`  aba "${phys.name}" ${phys.ref}: ${out.linhasFisicas} linhas físicas · cabeçalho na linha ${out.cabecalho} · ${out.linhasDeDados} linhas de dados · ${out.linhasComMaterial} com Material · ${out.semCodigo} sem Material`);
  console.log(`  colunas: ${t.headers.join(" | ")}`);
  console.log(`  Depósito (coluna "${t.headers[depCol]}"): ${show(out.depositos)} · Centro (coluna "${t.headers[cenCol]}"): ${show(out.centros)}`);
  console.log(`  filtro depósito ${DEPOSIT}: ${out.linhasDeposito} linhas no depósito · ${out.linhasForaDeposito} de outros depósitos · ${out.codigosUnicos} códigos únicos · ${out.duplicados} duplicados descartados`);
  console.log(`  Utilização livre (coluna "${t.headers[freeCol]}"): soma ${fmt(out.somaLivre)} · menor ${fmt(out.menor)} · maior ${fmt(out.maior)} · ${out.comSaldoPositivo} códigos com saldo > 0`);
  console.log(`  códigos na Base MRP ${out.naBase} · fora da Base ${out.foraBase}`);
  // Linhas anômalas: sem Material ou com o valor 22 em alguma célula.
  console.log("  Linhas anômalas (sem Material ou com o valor 22 em alguma célula):");
  const outcomes = new Map(s.rows.map((r) => [r.sourceRow, r]));
  let anomalies = 0;
  t.rows.forEach((row, i) => {
    const code = String(row[0] ?? "").trim();
    const has22 = row.some((c) => c === 22 || String(c ?? "").trim() === "22");
    if (code && !has22) return;
    anomalies++;
    const o = outcomes.get(t.rowNumbers[i]);
    const htmlTook = code ? Object.prototype.hasOwnProperty.call(htmlEstoque, code) : false;
    console.log(`    linha ${t.rowNumbers[i]}: ${show(row)}\n      Portal: ${o?.status}${o?.reason ? ` (${o.reason})` : ""} · HTML: ${htmlTook ? "entra no estoque" : "não entra no estoque (chave ausente em `estoque`)"}`);
  });
  if (!anomalies) console.log("    nenhuma");
  const has22Anywhere = phys.rows.some((r) => r.some((c) => c === 22 || String(c ?? "").trim() === "22"));
  console.log(`  valor 22 em alguma célula do arquivo: ${has22Anywhere ? "SIM" : "NÃO"}`);
  void rt;
  return out;
}

function auditPurchases(data: Buffer, plan: MrpImportPlan, baseCodes: Set<string>) {
  console.log("\n━━ AUDITORIA — COMPRAS (compras 0810.xlsx)");
  const phys = physicalRows(data)[0];
  const c = plan.purchases!.result;
  const t = plan.purchases!.table;
  const idx = buildMrpPurchaseIndex(c.items);
  const groups = Array.from(idx.values());
  const byCount = new Map<number, number>();
  for (const g of groups) byCount.set(g.count, (byCount.get(g.count) ?? 0) + 1);
  const maxG = groups.reduce((m, g) => (g.count > m.count ? g : m), groups[0]);
  const pend = groups.filter((g) => g.status === "pend");
  const inBase = groups.filter((g) => baseCodes.has(g.code));
  const out = {
    linhasFisicas: phys.rows.length,
    cabecalho: t.headerSheetRow,
    linhasLidas: c.rowsRead,
    linhasAceitas: c.rowsAccepted,
    semMaterial: c.emptyCodeRows,
    codigos: groups.length,
    codigosRepetidos: groups.filter((g) => g.count > 1).length,
    maiorQtdCompras: maxG?.count ?? 0,
    maiorCodigo: maxG?.code ?? "",
    pend: pend.length,
    rec: groups.filter((g) => g.status === "rec").length,
    sem: groups.filter((g) => g.status === "sem").length,
    qtdPendenteUltima: pend.reduce((s, g) => s + (g.last.quantity || 0), 0),
    codigosNaBase: inBase.length,
    linhasNaBase: inBase.reduce((s, g) => s + g.count, 0),
    codigosForaBase: groups.length - inBase.length,
    linhasForaBase: c.rowsAccepted - inBase.reduce((s, g) => s + g.count, 0)
  };
  console.log(`  aba "${phys.name}" ${phys.ref}: ${out.linhasFisicas} linhas físicas · cabeçalho na linha ${out.cabecalho} · ${out.linhasLidas} linhas lidas · ${out.linhasAceitas} aceitas · ${out.semMaterial} sem Material`);
  console.log(`  colunas: ${t.headers.join(" | ")}`);
  console.log(`  colunas reconhecidas: ${Object.entries(c.optionalColumns).map(([k, v]) => `${k}="${v}"`).join(" · ")}`);
  console.log(`  ${out.codigos} códigos distintos · ${out.codigosRepetidos} com mais de 1 compra · maior: ${out.maiorCodigo} com ${out.maiorQtdCompras} compras`);
  console.log(`  compras por código: ${Array.from(byCount.entries()).sort((a, b) => a[0] - b[0]).map(([n, q]) => `${n}×: ${q}`).join(" · ")}`);
  console.log(`  comprasIndex(): pend ${out.pend} · rec ${out.rec} · sem ${out.sem} · Σ última compra dos pendentes ${fmt(out.qtdPendenteUltima)}`);
  console.log(`  na Base MRP: ${out.codigosNaBase} códigos / ${out.linhasNaBase} linhas · fora da Base: ${out.codigosForaBase} códigos / ${out.linhasForaBase} linhas`);
  return out;
}

/* -------------------------------------------------------------------------- */
/*  Paridade                                                                    */
/* -------------------------------------------------------------------------- */

function htmlRuntimeFromFiles(files: { name: string; data: Buffer }[], deposit: string) {
  const rt = createHtmlRuntime();
  rt.setDeposit(deposit);
  rt.receber(files);
  return rt;
}

function portalPlan(files: { name: string; data: Buffer }[], rt: HtmlRuntime, deposit: string): MrpImportPlan {
  const slots = rt.arquivos();
  const items = (["base", "est", "cmp"] as const).map((kind) => {
    const f = files.find((x) => x.name === slots[kind]?.nome);
    if (!f) throw new Error(`HTML não colocou arquivo no slot ${kind}`);
    const wb = readMrpWorkbook(f.data);
    const det = analyzeMrpWorkbook(f.name, wb);
    if (!det || det.kind !== kind) throw new Error(`Portal detectou ${f.name} como ${det?.kind} (HTML: ${kind})`);
    return { fileName: f.name, wb, kind, sheet: det.table.sheet };
  });
  return buildMrpImportPlan(items, { depositFilter: deposit });
}

function compareSlots(rt: HtmlRuntime, files: { name: string; data: Buffer }[]) {
  const slots = rt.arquivos();
  for (const kind of ["base", "est", "cmp"] as const) {
    const h = slots[kind];
    const f = files.find((x) => x.name === h?.nome)!;
    const det = analyzeMrpWorkbook(f.name, readMrpWorkbook(f.data))!;
    compareFields("Detecção", f.name, kind, { tipo: h.tipo, aba: h.aba, headers: h.headers, linhas: kind === "base" ? 0 : h.linhas }, { tipo: det.kind, aba: det.table.sheet, headers: det.table.headers, linhas: kind === "base" ? 0 : det.table.dataRows }, ["tipo", "aba", "headers", "linhas"]);
  }
}

function compareBase(st: Any, plan: MrpImportPlan) {
  const html = (st.baseCustom ?? []) as Any[];
  const portal = orderMrpBaseMaterials(plan.base!.result.materials, plan.base!.result.sheets.map((s) => s.name));
  const n = Math.max(html.length, portal.length);
  for (let i = 0; i < n; i++) {
    const h = html[i];
    const p = portal[i];
    const H = h ? { code: h.codigo, description: h.descricao, group: h.grupo, unit: h.um, min: h.min, max: h.max, statusMrp: h.statusMrp, family: h.familia, area: h.area, ordem: i } : {};
    const P = p ? { code: p.code, description: p.description, group: p.group, unit: p.unit, min: p.min, max: p.max, statusMrp: p.statusMrp, family: p.family, area: p.area, ordem: i } : {};
    compareFields("Base", "Controle_MRP_SAP_novo_analisado.xlsx", `#${i} ${p?.code ?? h?.codigo}`, H, P, ["code", "description", "group", "unit", "min", "max", "statusMrp", "family", "area", "ordem"]);
  }
  return portal;
}

function compareStock(st: Any, plan: MrpImportPlan, rt: HtmlRuntime) {
  const s = plan.stock!.result;
  const html = st.estoque as Record<string, number>;
  const hCodes = Object.keys(html);
  const pMap = new Map(s.items.map((i) => [i.code, i]));
  for (const code of Array.from(new Set([...hCodes, ...Array.from(pMap.keys())]))) {
    compareFields("Estoque", "estoque 0810.xlsx", code, { code: code in html ? code : null, freeQty: html[code] }, { code: pMap.has(code) ? code : null, freeQty: pMap.get(code)?.freeQty }, ["code", "freeQty"]);
  }
  const msg = String(st.upMsg).replace(/<[^>]+>/g, "").replace(/\s+/g, " ");
  const htmlDup = Number(/(\d+) linhas duplicadas consolidadas/.exec(msg)?.[1] ?? 0);
  const htmlOther = Number((/(\d[\d.]*) linhas de outros depósitos ignoradas/.exec(msg)?.[1] ?? "0").replace(/\./g, ""));
  compareFields(
    "Estoque",
    "estoque 0810.xlsx",
    "contagens",
    { rowsRead: rt.arquivos().est.linhas, rowsAccepted: st.infoEst?.linhas, duplicateRows: htmlDup, otherDepositRows: htmlOther, depositColumnFound: !/coluna Depósito não foi encontrada/.test(msg), depositFilter: st.depFiltro, depositInfo: st.depInfo },
    { rowsRead: s.rowsRead, rowsAccepted: s.rowsAccepted, duplicateRows: s.duplicateRows, otherDepositRows: s.otherDepositRows, depositColumnFound: s.depositColumnFound, depositFilter: s.depositFilter, depositInfo: s.depositInfo },
    ["rowsRead", "rowsAccepted", "duplicateRows", "otherDepositRows", "depositColumnFound", "depositFilter", "depositInfo"]
  );
  return msg;
}

const P_FIELDS = ["seq", "code", "text", "quantity", "requisitionDate", "requisitionNumber", "purchaseOrderNumber", "receiptDate", "expectedDeliveryDate", "supplier"];
function comparePurchases(st: Any, plan: MrpImportPlan) {
  const html = st.compras as Any[];
  const portal = plan.purchases!.result.items;
  const n = Math.max(html.length, portal.length);
  for (let i = 0; i < n; i++) {
    const h = html[i];
    const p = portal[i];
    const H = h ? { seq: h.i, code: h.codigo, text: h.texto, quantity: h.qtd, requisitionDate: h.dataReq, requisitionNumber: h.requisicao, purchaseOrderNumber: h.pedido, receiptDate: h.recebimento, expectedDeliveryDate: h.previsao, supplier: h.fornecedor } : {};
    compareFields("Compras", "compras 0810.xlsx", `linha seq ${p?.seq ?? h?.i} ${p?.code ?? h?.codigo}`, H, (p ?? {}) as Any, P_FIELDS);
  }
}

function compareLastPurchase(rt: HtmlRuntime, st: Any, plan: MrpImportPlan) {
  const html = st.compras as Any[];
  const portal = plan.purchases!.result.items;
  // cmpOrdem de TODAS as linhas.
  portal.forEach((p, i) => {
    const h = html[i];
    compareFields("Última compra", "compras 0810.xlsx", `cmpOrdem seq ${p.seq} ${p.code}`, { key: h ? rt.fn.cmpOrdem(h) : null }, { key: mrpPurchaseOrderKey(p) }, ["key"]);
  });
  const hIdx = rt.fn.comprasIndex(html) as Map<string, Any>;
  const pIdx = buildMrpPurchaseIndex(portal);
  for (const code of Array.from(new Set([...Array.from(hIdx.keys()), ...Array.from(pIdx.keys())]))) {
    const h = hIdx.get(code);
    const p = pIdx.get(code);
    compareFields("Última compra", "compras 0810.xlsx", `grupo ${code}`, { lastSeq: h?.ultima.i, count: h?.n, status: h?.status, statusCmp: h ? rt.fn.cmpStatus(h.ultima) : null }, { lastSeq: p?.last.seq, count: p?.count, status: p?.status, statusCmp: p?.status }, ["lastSeq", "count", "status", "statusCmp"]);
  }
  return { htmlGroups: hIdx.size, portalGroups: pIdx.size };
}

const ENGINE_FIELDS = [...FIELDS.map(String), "purchase.qty", "purchase.order", "purchase.requisition", "purchase.forecast", "purchase.supplier", "purchase.date", "observation"];
function compareEngine(rt: HtmlRuntime, st: Any, portal: MrpAnalysisResult[]) {
  const html = st.analysis as Any[];
  const flat = (a: MrpAnalysisResult | null, obs: string | null) => {
    if (!a) return {};
    const o: Record<string, unknown> = {};
    for (const f of FIELDS) o[String(f)] = a[f];
    o["purchase.qty"] = a.purchase?.qty ?? null;
    o["purchase.order"] = a.purchase?.order ?? null;
    o["purchase.requisition"] = a.purchase?.requisition ?? null;
    o["purchase.forecast"] = a.purchase?.forecast ?? null;
    o["purchase.supplier"] = a.purchase?.supplier ?? null;
    o["purchase.date"] = a.purchase?.date ?? null;
    o.observation = obs;
    return o;
  };
  const n = Math.max(html.length, portal.length);
  for (let i = 0; i < n; i++) {
    const h = html[i] ? fromHtml(html[i]) : null;
    const p = portal[i] ?? null;
    compareFields("Motor", "-", `#${i} ${p?.code ?? h?.code}`, flat(h, html[i] ? rt.fn.obsDe(html[i]) : null), flat(p, p ? mrpObservation(p) : null), ENGINE_FIELDS);
  }
}

function compareKpis(rt: HtmlRuntime, st: Any, portal: MrpAnalysisResult[], purchases: MrpEnginePurchase[]) {
  const html = st.analysis as Any[];
  const ch = { ...rt.fn.contar(html) } as Record<string, number>;
  const cp = countMrp(portal);
  const keys = ["total", "Comprar", "Verificar", "Comprado", "OK", "qtd", "qtdTransito", "semMov", "parado", "qtdParada"];
  compareFields("KPIs", "-", "contar()", Object.fromEntries(keys.map((k) => [k, ch[k] ?? 0])), cp as Any, keys);
  const ret = html.filter((a) => a.status === "Comprado");
  const rem = removedFromMrp(portal);
  compareFields("KPIs", "-", "Saíram do MRP", { count: ret.length, avoidedQty: ret.reduce((s: number, a: Any) => s + a.sugeridaOrig, 0) }, rem as Any, ["count", "avoidedQty"]);
  const zer = { zerados: (ch.semMov ?? 0) - (ch.parado ?? 0), share: mrpIdleShareText(ch.semMov ?? 0, ch.total ?? 0) };
  rt.fn.setValue("pQ", "");
  rt.fn.setValue("pTipo", "com");
  rt.fn.setValue("pArea", "");
  const sub = /<div class="sub">([^<]*)<\/div>/.exec(rt.fn.renderParadoHtml(200).kpis)?.[1] ?? "";
  compareFields("KPIs", "-", "Estoque parado", { zerados: zer.zerados, share: sub.replace(".", ",") }, { zerados: cp.semMov - cp.parado, share: mrpIdleShareText(cp.semMov, cp.total) }, ["zerados", "share"]);
  // Compras (aba Em trânsito): todos os grupos de comprasIndex().
  const hIdx = Array.from((rt.fn.comprasIndex(st.compras) as Map<string, Any>).values());
  const hp = hIdx.filter((g) => g.status === "pend");
  const pk = purchaseKpis(purchases);
  compareFields(
    "KPIs",
    "-",
    "Compras",
    { linhas: st.compras.length, materiais: hIdx.length, pendentes: hp.length, recebidos: hIdx.filter((g) => g.status === "rec").length, semPedido: hIdx.filter((g) => g.status === "sem").length, qtdPendente: hp.reduce((s: number, g: Any) => s + (g.ultima.qtd || 0), 0) },
    pk as Any,
    ["linhas", "materiais", "pendentes", "recebidos", "semPedido", "qtdPendente"]
  );
  return { cp, rem, pk };
}

/** Matriz da aba Comprar: filtrarCompra() x filterMrpBuyList(). */
function compareBuyMatrix(rt: HtmlRuntime, portal: MrpAnalysisResult[]) {
  const rows = portal.map((a) => ({ ...a, observation: mrpObservation(a) }));
  const families = MRP_FAMILIES.filter((f) => rows.some((r) => r.family === f));
  // Buscas amostradas dos próprios dados reais: códigos (inteiro e parcial) e palavras de descrição.
  const step = Math.max(1, Math.floor(rows.length / 6));
  const sampleCodes = [0, 1, 2, 3, 4, 5].map((k) => rows[Math.min(rows.length - 1, k * step)].code);
  const words = Array.from(new Set(rows.slice(0, 600).flatMap((r) => r.description.split(/\s+/)).filter((w) => w.length >= 5))).slice(0, 6);
  const queries = [...sampleCodes, sampleCodes[0].slice(0, 3), ...words, words[0]?.toUpperCase() ?? "", "zzz-sem-resultado"];
  const combos: MrpBuyFilters[] = [];
  for (const status of MRP_BUY_STATUS_FILTERS) for (const sort of MRP_BUY_SORTS) for (const area of ["", MRP_AREA_MEC, MRP_AREA_ELE]) combos.push({ q: "", status, area, family: "", sort });
  for (const status of MRP_BUY_STATUS_FILTERS) for (const family of families) for (const sort of ["need", "qtd"] as const) combos.push({ q: "", status, area: "", family, sort });
  for (const family of families) for (const area of [MRP_AREA_MEC, MRP_AREA_ELE]) combos.push({ q: "", status: "all", area, family, sort: "need" });
  for (const q of queries) for (const status of ["need", "all"] as const) for (const sort of ["need", "cod"] as const) combos.push({ q, status, area: "", family: "", sort });
  for (const q of words.slice(0, 3)) combos.push({ q, status: "all", area: MRP_AREA_MEC, family: "", sort: "desc" });
  let empty = 0;
  for (const f of combos) {
    rt.fn.setValue("fQ", f.q);
    rt.fn.setValue("fStatus", f.status === "all" ? "" : f.status);
    rt.fn.setValue("fArea", f.area);
    rt.fn.setValue("fFam", f.family);
    rt.fn.setValue("fSort", f.sort);
    const h = rt.fn.filtrarCompra() as Any[];
    const p = filterMrpBuyList(rows, f);
    if (!p.length) empty++;
    const H = { count: h.length, order: h.map((a) => a.codigo).join("|"), suggestedFiltered: h.reduce((s: number, a: Any) => s + a.sugerida, 0), first: h.slice(0, 3).map((a) => a.codigo).join(","), last: h.slice(-3).map((a) => a.codigo).join(",") };
    const P = { count: p.length, order: p.map((a) => a.code).join("|"), suggestedFiltered: p.reduce((s, a) => s + a.suggested, 0), first: p.slice(0, 3).map((a) => a.code).join(","), last: p.slice(-3).map((a) => a.code).join(",") };
    compareFields("Comprar", "-", show(f), H, P, ["count", "order", "suggestedFiltered", "first", "last"]);
  }
  console.log(`  Comprar: ${combos.length} combinações (cada filtro isolado, pares status×ordenação×área, conjuntos, ${queries.length} buscas reais, ${empty} vazias)`);
  return combos.length;
}

/** Conjuntos: métricas pedidas por conjunto (inclui noParams) contra contar() do HTML no mesmo recorte. */
function compareFamilies(rt: HtmlRuntime, st: Any, portal: MrpAnalysisResult[]) {
  const html = st.analysis as Any[];
  const summary = buildMrpAreasSummary(portal.map((x) => ({ area: x.area, family: x.family, status: x.status, suggested: x.suggested, noParams: x.noParams })));
  const pick = (c: Any, n: number) => ({ total: c.total ?? 0, Comprar: c.Comprar ?? 0, Verificar: c.Verificar ?? 0, Comprado: c.Comprado ?? 0, OK: c.OK ?? 0, suggested: c.qtd ?? 0, noParams: n });
  const keys = ["total", "Comprar", "Verificar", "Comprado", "OK", "suggested", "noParams"];
  for (const card of summary.families) {
    const hs = html.filter((a) => a.familia === card.title);
    compareFields("Conjuntos", "-", card.title, pick({ ...rt.fn.contar(hs) }, hs.filter((a) => a.semParam).length), pick(card.summary, portal.filter((a) => a.family === card.title && a.noParams).length), keys);
  }
  const hAll = html.filter((a) => a.familia);
  compareFields("Conjuntos", "-", "Todos os conjuntos", pick({ ...rt.fn.contar(hAll) }, hAll.filter((a) => a.semParam).length), pick(summary.allFamilies.summary, portal.filter((a) => a.family && a.noParams).length), keys);
  ([MRP_AREA_MEC, MRP_AREA_ELE, ""] as const).forEach((area, i) => {
    const hs = area ? html.filter((a) => a.area === area) : html;
    compareFields("Áreas", "-", area || "Total", pick({ ...rt.fn.contar(hs) }, 0), pick(summary.areas[i].summary, 0), keys.slice(0, 6));
  });
  return summary;
}

/* -------------------------------------------------------------------------- */

function child() {
  if (![FILES.base, FILES.est, FILES.cmp].every(existsSync)) {
    console.log("ARQUIVOS REAIS NÃO ACESSÍVEIS NO WORKSPACE");
    for (const [k, v] of Object.entries(FILES)) console.log(`  ${k}: ${existsSync(v) ? "ok" : "AUSENTE"} ${v}`);
    process.exitCode = 2;
    return;
  }
  const files = [
    { name: "Controle_MRP_SAP_novo_analisado.xlsx", data: readFileSync(FILES.base) },
    { name: "estoque 0810.xlsx", data: readFileSync(FILES.est) },
    { name: "compras 0810.xlsx", data: readFileSync(FILES.cmp) }
  ];
  const sha = files.map((f) => `${f.name}: ${createHash("sha256").update(f.data).digest("hex").slice(0, 16)} (${f.data.length} bytes)`);
  console.log(`Fuso do processo: ${TZ} (offset ${new Date(2026, 9, 8).getTimezoneOffset()} min) · depósito ${DEPOSIT}`);
  console.log(`Arquivos (sha256 parcial, só leitura):\n  ${sha.join("\n  ")}`);

  // A) HTML original.
  const t0 = Date.now();
  const rt = htmlRuntimeFromFiles(files, DEPOSIT);
  const st = rt.processar() as Any;
  const htmlMs = Date.now() - t0;
  const htmlMsg = String(st.upMsg).replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
  console.log(`\nHTML (SheetJS ${rt.xlsxVersion}): ${htmlMsg} [${htmlMs} ms]`);

  // B) Portal.
  const t1 = Date.now();
  const plan = portalPlan(files, rt, DEPOSIT);
  const materials = orderMrpBaseMaterials(plan.base!.result.materials, plan.base!.result.sheets.map((s) => s.name));
  const stockMap = new Map(plan.stock!.result.items.map((i) => [i.code, i.freeQty]));
  const purchases = plan.purchases!.result.items;
  const portal = analyzeMrp(materials, stockMap, purchases);
  console.log(`Portal (SheetJS ${XLSX.version}): ${portal.length} materiais analisados [${Date.now() - t1} ms]`);

  const baseCodes = new Set(materials.map((m) => m.code));
  const audit = TZ === "UTC" ? { base: auditBase(files[0].data, plan), stock: auditStock(files[1].data, plan, baseCodes, rt, st.estoque), purchases: auditPurchases(files[2].data, plan, baseCodes) } : null;

  console.log("\n━━ PARIDADE");
  compareSlots(rt, files);
  compareBase(st, plan);
  compareStock(st, plan, rt);
  comparePurchases(st, plan);
  compareLastPurchase(rt, st, plan);
  if (portal.length !== 4259 || (st.analysis as Any[]).length !== 4259) {
    console.log(`  PARAR: o motor tem ${portal.length} (Portal) / ${(st.analysis as Any[]).length} (HTML) itens — esperado 4.259.`);
    record("Motor", "-", "quantidade", "itens", (st.analysis as Any[]).length, portal.length);
  }
  compareEngine(rt, st, portal);
  const { cp, rem, pk } = compareKpis(rt, st, portal, purchases);
  compareBuyMatrix(rt, portal);
  const summary = compareFamilies(rt, st, portal);

  // Módulos de tela/exportação já validados nas fases E–J, agora com os dados reais.
  // Em UTC o HTML usa as compras que ELE leu dos arquivos (fluxo completo); fora
  // de UTC usa as do Portal, para isolar o bug de data da SheetJS antiga na camada de importação.
  const endToEnd = TZ === "UTC";
  const rtFor = () => {
    if (endToEnd) return rt;
    const r = createHtmlRuntime();
    r.fn.setBase(materials.map((m) => ({ codigo: m.code, descricao: m.description, grupo: m.group, min: m.min, max: m.max, um: m.unit, statusMrp: m.statusMrp, familia: m.family, area: m.area })));
    const stockObj: Record<string, number> = {};
    for (const [k, v] of Array.from(stockMap.entries())) stockObj[k] = v;
    r.fn.analisarCom(stockObj, purchases.map((p) => ({ i: p.seq, codigo: p.code, texto: p.text, qtd: p.quantity, dataReq: p.requisitionDate, requisicao: p.requisitionNumber, pedido: p.purchaseOrderNumber, recebimento: p.receiptDate, previsao: p.expectedDeliveryDate, fornecedor: p.supplier })));
    return r;
  };
  let b = areasTally();
  areasScenario("Áreas & Conjuntos (cartões renderAreas())", materials, stockMap, purchases);
  tallyCategory("Áreas/Conjuntos (cartões)", b, areasTally());
  b = transitTally();
  transitScenario("Em trânsito (renderTransito(): KPIs + 48 combinações)", endToEnd ? rt : createHtmlRuntime(), materials, stockMap, purchases, endToEnd);
  tallyCategory("Em trânsito", b, transitTally());
  b = idleTally();
  idleScenario("Estoque parado (renderParado(): KPIs + 45 combinações)", rtFor(), portal);
  tallyCategory("Estoque parado", b, idleTally());
  b = baseViewTally();
  baseViewScenario("Base MRP (renderBase()/baseFiltrada())", rt, plan.base!.result.materials, plan.base!.result.sheets.map((s) => s.name));
  tallyCategory("Base MRP UI", b, baseViewTally());
  b = exportTally();
  exportScenario("Exportações (6 tipos, todas as combinações + .xlsx relido)", rtFor(), materials, stockMap, purchases, true);
  tallyCategory("Exportações", b, exportTally());

  // Diagnóstico: todos os depósitos (não é a validação oficial).
  const rtAll = htmlRuntimeFromFiles(files, "");
  const stAll = rtAll.processar() as Any;
  const planAll = portalPlan(files, rtAll, "");
  const portalAll = analyzeMrp(materials, new Map(planAll.stock!.result.items.map((i) => [i.code, i.freeQty])), planAll.purchases!.result.items);
  const cAll = countMrp(portalAll);
  const hAll = { ...rtAll.fn.contar(stAll.analysis) } as Any;
  console.log(`\nDiagnóstico (todos os depósitos): Portal ${show(cAll)} · HTML igual: ${["total", "Comprar", "Verificar", "Comprado", "OK", "qtd"].every((k) => Object.is(hAll[k] ?? 0, (cAll as Any)[k]))} · estoque ${planAll.stock!.result.rowsAccepted} códigos`);

  // Resumo do fuso.
  console.log(`\n━━ RESULTADO (${TZ})`);
  console.log("  Categoria | Itens comparados | Divergências Portal | Legacy known bugs");
  for (const [k, s] of Array.from(stats.entries())) console.log(`  ${k} | ${fmt(s.items)} ${s.unit} | ${s.divergences} | ${s.legacy}`);
  const bugs = divergences.filter((d) => d.klass === "BUG_PORTAL");
  const legacy = divergences.filter((d) => d.klass === "KNOWN_LEGACY_DATE_BUG");
  for (const d of bugs.slice(0, 200)) console.log(`  ✗ BUG_PORTAL ${d.category} · ${d.file} · ${d.key} · ${d.field}: HTML ${show(d.html)} x Portal ${show(d.portal)}`);
  for (const d of legacy) console.log(`  ⚠ KNOWN_LEGACY_DATE_BUG · ${d.file} · ${d.key} · ${d.field}: HTML ${show(d.html)} x Portal ${show(d.portal)} — ${d.reason}`);
  console.log(`  BUG_PORTAL = ${bugs.length} · KNOWN_LEGACY_DATE_BUG = ${legacy.length}`);

  // Impressão digital das saídas do Portal (para provar que não dependem do fuso).
  const fingerprint = createHash("sha256")
    .update(show({ base: materials, stock: plan.stock!.result.items, purchases, analysis: portal }))
    .digest("hex");
  const result = { tz: TZ, bugs: bugs.length, legacy: legacy.length, stats: Object.fromEntries(stats), fingerprint, audit, kpis: { ...cp, removed: rem, purchases: pk }, areas: summary.areas.map((a) => ({ title: a.title, ...a.summary })), families: [...summary.families, summary.allFamilies].map((a) => ({ title: a.title, ...a.summary })) };
  console.log(`##RESULT ${JSON.stringify(result)}`);
  if (bugs.length) process.exitCode = 1;
}

function parent() {
  const zones = ["UTC", "America/Sao_Paulo"];
  const results: Any[] = [];
  for (const tz of zones) {
    console.log(`\n================ ${tz} ================`);
    const r = spawnSync(process.execPath, [...process.execArgv, __filename, `--tz=${tz}`], { env: { ...process.env, MRP_PARITY_TZ: tz }, encoding: "utf8", maxBuffer: 256 * 1024 * 1024 });
    const out = r.stdout ?? "";
    process.stdout.write(out.split("\n").filter((l) => !l.startsWith("##RESULT")).join("\n"));
    if (r.stderr) process.stderr.write(r.stderr);
    const line = out.split("\n").find((l) => l.startsWith("##RESULT "));
    if (!line) {
      console.log(`\n✗ ${tz}: o comparador não terminou (código ${r.status}).`);
      process.exitCode = 1;
      return;
    }
    results.push(JSON.parse(line.slice(9)));
  }
  console.log("\n================ CONSOLIDADO ================");
  for (const r of results) console.log(`  ${r.tz}: BUG_PORTAL = ${r.bugs} · KNOWN_LEGACY_DATE_BUG = ${r.legacy}`);
  const sameFp = results.every((r) => r.fingerprint === results[0].fingerprint);
  console.log(`  Saídas do Portal idênticas entre ${zones.join(" e ")} (base, estoque, compras, análise): ${sameFp ? "SIM" : "NÃO"}`);
  const bugs = results.reduce((s, r) => s + r.bugs, 0);
  console.log(`\n  BUG_PORTAL = ${bugs}`);
  if (bugs || !sameFp) process.exitCode = 1;
}

if (require.main === module) {
  if (process.argv.some((a) => a.startsWith("--tz="))) child();
  else parent();
}
