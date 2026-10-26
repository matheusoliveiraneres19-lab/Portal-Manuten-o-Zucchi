/**
 * ANÁLISE MRP (FASE C) — testes da importação 1:1.
 *
 *   npm run test:mrp-import
 *   npm run test:mrp-import -- --html="C:\...\Analise_MRP_Compacto (1).html"
 *
 * Referência = o PRÓPRIO HTML, executado em sandbox com a SheetJS dele
 * (scripts/mrp/html-runtime.ts). Cada cenário roda nos dois lados e compara:
 *   - helpers (norm, cleanCode, parseNum, parseData, detectCol, scoreHeader,
 *     findHeaderRow, pontuar, famDe, isSemMovTxt, cmpStatus, cmpOrdem);
 *   - snapshot do ALIAS;
 *   - detecção + encaixe nos slots + trava (receberArquivos/atualizarSlots);
 *   - trocarAba / reatribuir;
 *   - processar(): base, estoque, compras e mensagens de erro;
 *   - comprasIndex (última compra);
 *   - a Base MRP REAL (Controle_MRP_SAP_novo_analisado.xlsx), se disponível;
 *   - parseData em TZ America/Sao_Paulo e UTC (processos filhos).
 *
 * Os cenários rodam em UTC (fuso das funções da Vercel, ver ./mrp/force-utc);
 * o comportamento do HTML em America/Sao_Paulo é medido na seção 9.
 *
 * Não toca no banco. Arquivos reais de estoque (MB52) e compras: PENDENTES.
 */
import "./mrp/force-utc";
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { MRP_ALIASES, detectCol, type MrpAliasField } from "../src/lib/mrp/aliases";
import { parseMrpBase } from "../src/lib/mrp/base-parser";
import { isSemMovTxt, resolveMrpFamily } from "../src/lib/mrp/classification";
import { parseData, isoOf } from "../src/lib/mrp/date-parser";
import {
  MRP_WARNING_NO_COLUMNS,
  analyzeMrpWorkbook,
  assignMrpSlots,
  diagnoseMrpSlot,
  emptyMrpSlots,
  evaluateMrpLock,
  findHeaderRow,
  pontuar,
  reassignMrpSlot,
  scoreHeader
} from "../src/lib/mrp/file-detection";
import { MrpImportError, buildMrpFilePreview, buildMrpImportPlan, type MrpImportPlan } from "../src/lib/mrp/import-plan";
import { cleanCode, cleanText, norm } from "../src/lib/mrp/normalization";
import { normalizeNegativeZero, parseNum } from "../src/lib/mrp/number-parser";
import { buildMrpPurchaseIndex, getMrpPurchaseStatus, mrpPurchaseOrderKey } from "../src/lib/mrp/purchase-parser";
import type { MrpFileDetection, MrpFileKind, MrpSlots } from "../src/lib/mrp/types";
import { readMrpWorkbook, sheetToAOA } from "../src/lib/mrp/workbook";
import * as F from "./mrp/fixtures";
import { createHtmlRuntime, type HtmlRuntime } from "./mrp/html-runtime";

type Any = any; // eslint-disable-line @typescript-eslint/no-explicit-any

let failures = 0;
let checks = 0;
function check(label: string, ok: boolean, detail = "") {
  checks += 1;
  if (!ok) failures += 1;
  console.log(`  ${ok ? "✓" : "✗"} ${label}${detail ? `  — ${detail}` : ""}`);
}
function section(title: string) {
  console.log(`\n${title}`);
}

/** Igualdade profunda entre realms (sandbox x Portal); números por Object.is. */
function same(a: unknown, b: unknown): boolean {
  if (typeof a === "number" && typeof b === "number") return Object.is(a, b);
  if (a === b) return true;
  const ta = Object.prototype.toString.call(a),
    tb = Object.prototype.toString.call(b);
  if (ta !== tb) return false;
  if (ta === "[object Date]") return (a as Date).getTime() === (b as Date).getTime();
  if (ta === "[object Array]") {
    const x = a as unknown[],
      y = b as unknown[];
    return x.length === y.length && x.every((v, i) => same(v, y[i]));
  }
  if (ta === "[object Object]") {
    const x = a as Record<string, unknown>,
      y = b as Record<string, unknown>;
    const kx = Object.keys(x).sort(),
      ky = Object.keys(y).sort();
    return same(kx, ky) && kx.every((k) => same(x[k], y[k]));
  }
  return false;
}
const show = (v: unknown) => JSON.stringify(v, (_k, x) => (typeof x === "number" && Object.is(x, -0) ? "-0" : x));
const strip = (html: string) => html.replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();

/**
 * Célula comparável entre as duas SheetJS: datas pela data LOCAL (a 0.18.5 do
 * HTML tem um desvio de segundos em alguns fusos — medido no teste de fuso).
 */
function cellKey(c: unknown): unknown {
  return Object.prototype.toString.call(c) === "[object Date]" ? "D:" + isoOf(c as Date) : c;
}
const rowsKey = (rows: unknown[][]) => rows.map((r) => r.map(cellKey));

/* -------------------------------------------------------------------------- */
/*  Pipelines                                                                  */
/* -------------------------------------------------------------------------- */

type PortalSlot = { detection: MrpFileDetection; wb: ReturnType<typeof readMrpWorkbook>; kind: MrpFileKind; sheet: string; headers: string[] };

function portalReceive(files: F.FixtureFile[]): MrpSlots<PortalSlot> {
  const detected: PortalSlot[] = [];
  for (const f of files) {
    const wb = readMrpWorkbook(f.data);
    const detection = analyzeMrpWorkbook(f.name, wb);
    if (!detection) continue;
    detected.push({ detection, wb, kind: detection.kind, sheet: detection.table.sheet, headers: detection.table.headers });
  }
  return assignMrpSlots(emptyMrpSlots<PortalSlot>(), detected);
}

function portalPlan(slots: MrpSlots<PortalSlot>, deposit: string, defaultArea?: string): MrpImportPlan | MrpImportError {
  const files = (["base", "est", "cmp"] as MrpFileKind[])
    .filter((k) => slots[k])
    .map((k) => ({ fileName: slots[k]!.detection.fileName, wb: slots[k]!.wb, kind: k, sheet: slots[k]!.sheet }));
  try {
    return buildMrpImportPlan(files, { depositFilter: deposit, defaultArea });
  } catch (error) {
    if (error instanceof MrpImportError) return error;
    throw error;
  }
}

function htmlReceive(files: F.FixtureFile[], deposit = "1400", defaultArea?: string): HtmlRuntime {
  const rt = createHtmlRuntime();
  rt.setDeposit(deposit);
  if (defaultArea) rt.setDefaultArea(defaultArea);
  rt.receber(files);
  return rt;
}

/** Compara slots (arquivo, aba, tipo detectado, cabeçalhos, linhas). */
function compareSlots(label: string, rt: HtmlRuntime, slots: MrpSlots<PortalSlot>) {
  const a = rt.arquivos();
  for (const k of ["base", "est", "cmp"] as MrpFileKind[]) {
    const h = a[k],
      p = slots[k];
    if (!h || !p) {
      check(`${label}: slot ${k} ${h ? "ocupado" : "vazio"} nos dois`, !h === !p, `HTML=${h?.nome ?? "-"} Portal=${p?.detection.fileName ?? "-"}`);
      continue;
    }
    const pRows = (() => {
      const t = p.sheet === p.detection.table.sheet ? p.detection.table : null;
      return t ? t.rows : [];
    })();
    check(
      `${label}: slot ${k} = ${h.nome} · aba ${h.aba} · tipo ${h.tipo}`,
      h.nome === p.detection.fileName &&
        h.aba === p.sheet &&
        h.tipo === p.detection.kind &&
        same(h.headers, p.headers) &&
        h.linhas === (p.sheet === p.detection.table.sheet ? p.detection.table.dataRows : h.linhas) &&
        (pRows.length === 0 || same(rowsKey(h.rows), rowsKey(pRows))),
      `Portal: ${p.detection.fileName} · ${p.sheet} · ${p.detection.kind}`
    );
  }
}

/** processar() do HTML x plano do Portal. */
function compareProcess(label: string, rt: HtmlRuntime, plan: MrpImportPlan | MrpImportError) {
  const st = rt.processar();
  const htmlError = /alert err/.test(st.upMsg) ? strip(st.upMsg) : null;
  if (plan instanceof MrpImportError || htmlError) {
    const portalMsg = plan instanceof MrpImportError ? plan.userMessage : null;
    check(`${label}: falha nos dois com a mesma mensagem`, !!htmlError && !!portalMsg && htmlError === portalMsg, `HTML="${htmlError}" Portal="${portalMsg}"`);
    return;
  }
  // Base
  if (plan.base) {
    const html = (st.baseCustom ?? []).map((m: Any) => ({ ...m }));
    const portal = plan.base.result.materials.map((m) => ({
      codigo: m.code, descricao: m.description, grupo: m.group, min: m.min, max: m.max,
      um: m.unit, statusMrp: m.statusMrp, familia: m.family, area: m.area
    }));
    check(`${label}: base = baseCustom do HTML (${portal.length} materiais)`, same(html, portal));
  }
  // Estoque
  const s = plan.stock!.result;
  const portalStock: Record<string, number> = {};
  for (const it of s.items) portalStock[it.code] = it.freeQty;
  check(`${label}: estoque igual (${s.rowsAccepted} códigos)`, same({ ...st.estoque }, portalStock), `HTML=${show(st.estoque)} Portal=${show(portalStock)}`);
  check(`${label}: infoEst.linhas = rowsAccepted`, st.infoEst.linhas === s.rowsAccepted);
  check(`${label}: depFiltro/depInfo`, st.depFiltro === s.depositFilter && st.depInfo === s.depositInfo, `HTML="${st.depFiltro}"/"${st.depInfo}" Portal="${s.depositFilter}"/"${s.depositInfo}"`);
  const msg = strip(st.upMsg);
  const htmlDup = Number(/(\d+) linhas duplicadas consolidadas/.exec(msg)?.[1] ?? 0);
  const htmlFora = Number((/(\d[\d.]*) linhas de outros depósitos ignoradas/.exec(msg)?.[1] ?? "0").replace(/\./g, ""));
  check(`${label}: duplicadas (${s.duplicateRows}) e outros depósitos (${s.otherDepositRows})`, htmlDup === s.duplicateRows && htmlFora === s.otherDepositRows, `HTML dup=${htmlDup} fora=${htmlFora}`);
  check(`${label}: aviso de coluna Depósito ausente`, /coluna Depósito não foi encontrada/.test(msg) === s.depositFilterNotApplied);
  // Compras
  const c = plan.purchases!.result;
  const portalCompras = c.items.map((x) => ({
    i: x.seq, codigo: x.code, texto: x.text, qtd: x.quantity, dataReq: x.requisitionDate, requisicao: x.requisitionNumber,
    pedido: x.purchaseOrderNumber, recebimento: x.receiptDate, previsao: x.expectedDeliveryDate, fornecedor: x.supplier
  }));
  check(`${label}: compras iguais (${c.rowsAccepted} linhas)`, same(st.compras.map((x: Any) => ({ ...x })), portalCompras),
    same(st.compras.map((x: Any) => ({ ...x })), portalCompras) ? "" : `HTML=${show(st.compras)}\n      Portal=${show(portalCompras)}`);
  // Última compra
  const htmlIdx = rt.fn.comprasIndex(st.compras) as Map<string, Any>;
  const portalIdx = buildMrpPurchaseIndex(c.items);
  const lastSame = Array.from(htmlIdx.entries()).every(([code, g]) => {
    const p = portalIdx.get(code);
    return !!p && p.last.seq === g.ultima.i && p.status === g.status && p.count === g.n;
  });
  check(`${label}: última compra / status por material (${portalIdx.size})`, lastSame && htmlIdx.size === portalIdx.size);
}

/* -------------------------------------------------------------------------- */

function testHelpers(rt: HtmlRuntime) {
  section("1. Helpers puros x HTML");
  const texts: unknown[] = ["Utilização Livre", "  Depósito ", "Nº Material", "ÇÃO-1/2", null, undefined, 0, 13515, "MB52 - Estoque", "\u200bcod"];
  check("norm", texts.every((t) => norm(t) === rt.fn.norm(t)));
  check('norm("Utilização Livre") = "utilizacaolivre"', norm("Utilização Livre") === "utilizacaolivre");

  const codes: unknown[] = ["13515", 13515, "13515.0", "13515.00", "000000000000013515", " 135 15 ", "\uFEFF13515", null, "", 13515.5, "ABC-1"];
  check("cleanCode", codes.every((c) => cleanCode(c) === rt.fn.cleanCode(c)));
  check('cleanCode mantém zeros: "000000000000013515" ≠ "13515"', cleanCode("000000000000013515") === "000000000000013515");
  check("cleanText", texts.every((t) => cleanText(t) === rt.fn.cleanText(t)));

  const nums: unknown[] = ["1.500", "1,5", "1.500,25", "", "-", "-0", "5-", "1.234.567", "12,345", "1.5", "R$ 1.999,90", "abc", null, 0, -3, NaN, Infinity, "1e3", " 2 500 ", "0,0001", "1.50", "12.345.6"];
  check("parseNum", nums.every((n) => Object.is(parseNum(n), rt.fn.parseNum(n))), show(nums.filter((n) => !Object.is(parseNum(n), rt.fn.parseNum(n)))));
  const req: [unknown, number][] = [["1.500", 1500], ["1,5", 1.5], ["1.500,25", 1500.25], ["", 0], ["-", 0]];
  for (const [input, expected] of req) check(`parseNum(${show(input)}) = ${expected}`, Object.is(parseNum(input), expected));
  check("normalizeNegativeZero(-0) = 0 (só exibição)", Object.is(normalizeNegativeZero(parseNum("-0")), 0) && Object.is(parseNum("-0"), -0));

  const dates: unknown[] = ["01/09/2026", "1/9/26", "01-09-2026", "01.09.2026", "2026-09-01", "2026-9-1", "2026-09-01T10:00", 46266, 46266.4, 46266.6, 19999, 80000, "", null, "Sep 1 2026", "xx", "31/02/2026"];
  check("parseData (textos e números)", dates.every((d) => parseData(d) === rt.fn.parseData(d)), show(dates.map((d) => [d, parseData(d), rt.fn.parseData(d)]).filter(([, a, b]) => a !== b)));
  const dateExp: [unknown, string][] = [["01/09/2026", "2026-09-01"], ["01-09-2026", "2026-09-01"], ["01.09.2026", "2026-09-01"], ["1/9/26", "2026-09-01"], ["2026-09-01", "2026-09-01"], [46266, "2026-09-01"]];
  for (const [input, expected] of dateExp) check(`parseData(${show(input)}) = ${expected}`, parseData(input) === expected);

  const headerSets: unknown[][] = [
    ["Material", "Texto breve material", "Depósito", "Utilização livre"],
    ["Cód. Material", "Quantidade", "Data recebimento"],
    ["Item", "SKU", "Qtd livre"],
    ["Material", "Quantidade livre", "Quantid"],
    ["MB52 - Estoque por material"],
    ["Material", "Requisição", "Data recebimento", "Fornecedor"],
    ["Material", "Status", "Status MRP", "Minimo", "Maximo"],
    ["N° Material", "Denominação", "Ponto de pedido", "Est. máximo"]
  ];
  const fields = Object.keys(MRP_ALIASES) as MrpAliasField[];
  check("detectCol (8 cabeçalhos × 16 campos)", headerSets.every((h) => fields.every((f) => detectCol(h, f) === rt.fn.detectCol(h, f))));
  check('detectCol: "Data recebimento" vira `data` quando não há data de requisição', detectCol(["Material", "Data recebimento"], "data") === 1);
  check("scoreHeader", headerSets.every((h) => scoreHeader(h) === rt.fn.scoreHeader(h)));
  check("pontuar", headerSets.every((h) => same(pontuar(h), { ...rt.fn.pontuar(h) })));

  const aoa: unknown[][] = [["MB52 - Estoque por material"], ["Centro 1000", "Material"], ["Material", "Depósito", "Utilização livre"], ["1", "1400", 3]];
  check("findHeaderRow pula título SAP", findHeaderRow(aoa) === 2 && rt.fn.findHeaderRow(aoa) === 2);
  const tie: unknown[][] = [["Material", "Quantidade"], ["Material", "Quantidade"], ["x", 1]];
  check("findHeaderRow: empate = primeira linha", findHeaderRow(tie) === 0 && rt.fn.findHeaderRow(tie) === 0);
  const deep: unknown[][] = [...Array.from({ length: 12 }, () => ["titulo"]), ["Material", "Utilização livre"], ["1", 2]];
  check("findHeaderRow só olha 12 linhas", findHeaderRow(deep) === rt.fn.findHeaderRow(deep) && findHeaderRow(deep) === 0);

  const status = ["Satélite Breton 8", "satelite breton 6", "SATELITES BRETON", "Satélite Simec 6", "Coroa Cemar", "coroa", "breton 8", "", "Sem saída no período", "Inativo", "Obsoleto", "Sem giro", "Não movimentado", "OK", "sem mov."];
  check("famDe", status.every((s) => resolveMrpFamily(s) === rt.fn.famDe(s)));
  check("isSemMovTxt", status.every((s) => isSemMovTxt(s) === rt.fn.isSemMovTxt(s)));

  const purchases = [
    { i: 0, recebimento: "2026-01-01", pedido: "", requisicao: "" },
    { i: 1, recebimento: "", pedido: "45", requisicao: "" },
    { i: 2, recebimento: "", pedido: "", requisicao: "10" },
    { i: 3, recebimento: "", pedido: "", requisicao: "" }
  ];
  const portalOf = (c: Any) => ({ seq: c.i, receiptDate: c.recebimento, purchaseOrderNumber: c.pedido, requisitionNumber: c.requisicao, requisitionDate: c.dataReq ?? "", expectedDeliveryDate: c.previsao ?? "" });
  check("cmpStatus (rec / pend / pend / sem)", purchases.every((c) => getMrpPurchaseStatus(portalOf(c)) === rt.fn.cmpStatus(c)));
  const keys = [
    { i: 5, dataReq: "2026-09-01", pedido: "4500000001", requisicao: "1" },
    { i: 12, dataReq: "", recebimento: "2026-08-01", pedido: "", requisicao: "99" },
    { i: 3, dataReq: "", recebimento: "", previsao: "2026-10-01", pedido: "", requisicao: "" },
    { i: 0, pedido: "", requisicao: "" }
  ];
  check("cmpOrdem", keys.every((c) => mrpPurchaseOrderKey(portalOf(c)) === rt.fn.cmpOrdem(c)), keys.map((c) => mrpPurchaseOrderKey(portalOf(c))).join(" ; "));
  check('cmpOrdem sem datas usa "0000-00-00"', mrpPurchaseOrderKey(portalOf(keys[3])).startsWith("0000-00-00|"));
}

function testAliasSnapshot(rt: HtmlRuntime) {
  section("2. Snapshot do ALIAS");
  const SNAPSHOT =
    '{"cod":["material","codigomaterial","codigo","codmaterial","codigodomaterial","nmaterial","item","sku"],' +
    '"desc":["textobrevematerial","textobrevedopedido","descricao","descricaodomaterial","denominacao","textobreve","texto"],' +
    '"dep":["deposito","dep","lgort","localdedeposito","depositoestoque","depos"],' +
    '"min":["estoqueminimo","estoquemin","minimo","estminimo","minimomrp","minmrp","pontodepedido","min"],' +
    '"max":["estoquemaximo","estoquemax","maximo","estmaximo","maximomrp","maxmrp","max"],' +
    '"status":["statusmrp","statusdomrp","statusmovimentacao","movimentacao","statusmaterial","saidanoperiodo","status"],' +
    '"grupo":["grupodemercadorias","grupomercadorias","grpmercadorias","grupodemercadoria","grupomaterial","grupo"],' +
    '"um":["unidademedida","unidadedemedida","unidade","umb","um"],' +
    '"livre":["utilizacaolivre","estoquelivre","livreutilizacao","qtdutilizacaolivre","quantidadelivre","qtdlivre","disponivel","estoquedisponivel","saldolivre","livre"],' +
    '"qtd":["quantid","quantidade","qtd","qtde","quantidadepedida","quant"],' +
    '"data":["datadarequisicao","datarequisicao","datadopedido","datapedido","datadecriacao","data"],' +
    '"req":["requisicao","requisicaodecompra","numerodarequisicao","nrequisicao","rc"],' +
    '"ped":["pedidodecompra","pedidocompra","numerodopedido","npedido","pedido","oc"],' +
    '"rec":["datarecebimento","datadorecebimento","dataderecebimento","recebimento","dataentrega"],' +
    '"prev":["previsaodeentrega","previsaoentrega","previsaodaentrega","dataprevista","previsao"],' +
    '"forn":["descricaofornecedor","nomefornecedor","fornecedor","razaosocial"]}';
  check("MRP_ALIASES = snapshot (16 campos, ordem preservada)", JSON.stringify(MRP_ALIASES) === SNAPSHOT);
  check("MRP_ALIASES = ALIAS do HTML", JSON.stringify(MRP_ALIASES) === JSON.stringify(rt.fn.ALIAS));
  check("ALIAS.rec presente e completo", JSON.stringify(MRP_ALIASES.rec) === '["datarecebimento","datadorecebimento","dataderecebimento","recebimento","dataentrega"]');
}

function testWorkbookReading() {
  section("3. Leitura do workbook (sheetToAOA) x HTML");
  const rt = createHtmlRuntime();
  for (const f of [F.baseFixture(), F.stockFixture(), F.purchaseFixture(), F.purchaseCsvFixture(), F.twoSheetStockFixture()]) {
    const h = rt.readWorkbook(f.data);
    const p = readMrpWorkbook(f.data);
    const ok = same([...h.SheetNames], p.SheetNames) && p.SheetNames.every((n) => same(rowsKey(rt.fn.sheetToAOA(h, n)), rowsKey(sheetToAOA(p, n))));
    check(`${f.name}: mesmas abas e mesmas linhas`, ok);
  }
}

function scenario(label: string, files: F.FixtureFile[], opts: { deposit?: string; defaultArea?: string; hasActiveBase?: boolean } = {}) {
  // Sem Base vigente é regra só do Portal (o HTML sempre tem a base embutida).
  const portalOnlyLock = opts.hasActiveBase === false;
  const deposit = opts.deposit ?? "1400";
  const rt = htmlReceive(files, deposit, opts.defaultArea);
  const slots = portalReceive(files);
  compareSlots(label, rt, slots);
  const lock = evaluateMrpLock(slots, opts.hasActiveBase ?? true);
  if (!portalOnlyLock) check(`${label}: trava (${lock.ready ? "liberada" : "travada"})`, lock.ready === !rt.lock().disabled, `HTML disabled=${rt.lock().disabled}`);
  if (lock.ready || slots.base) {
    const plan = portalPlan(slots, deposit, opts.defaultArea);
    if (lock.ready) compareProcess(label, rt, plan);
    return { rt, slots, plan };
  }
  return { rt, slots, plan: null };
}

function testScenarios() {
  section("4. Cenários de importação x processar() do HTML");

  scenario("completo (base + estoque 1400 + compras)", [F.baseFixture(), F.stockFixture(), F.purchaseFixture()]);
  scenario("estoque todos os depósitos", [F.stockFixture(), F.purchaseFixture()], { deposit: "" });
  scenario('depósito "01400" (zeros à esquerda no filtro)', [F.stockFixture(), F.purchaseFixture()], { deposit: "01400" });
  scenario("estoque sem coluna Depósito (filtro 1400)", [F.stockNoDepositFixture(), F.purchaseFixture()]);
  scenario("estoque sem linhas no depósito 9999 (erro)", [F.stockFixture(), F.purchaseFixture()], { deposit: "9999" });
  scenario("compras só com Material", [F.stockFixture(), F.purchaseMinimalFixture()]);
  scenario("compras só com Data recebimento", [F.stockFixture(), F.purchaseOnlyReceiptDateFixture()]);
  scenario("compras em CSV", [F.stockFixture(), F.purchaseCsvFixture()]);
  scenario("estoque .xls com duas abas", [F.twoSheetStockFixture(), F.purchaseFixture()]);
  scenario("área padrão Elétrica", [F.baseFixture(), F.stockFixture(), F.purchaseFixture()], { defaultArea: "Elétrica" });

  section("5. Detecção, score zero e slots");
  const unknown = F.unknownFixture();
  const det = analyzeMrpWorkbook(unknown.name, readMrpWorkbook(unknown.data))!;
  const rtU = createHtmlRuntime();
  const htmlU = rtU.fn.analisarArquivo({ name: unknown.name }, rtU.readWorkbook(unknown.data));
  check("score 0/0/0 → tipo base (regra do HTML)", det.kind === "base" && htmlU.tipo === "base" && det.score === 0);
  const diag = diagnoseMrpSlot("base", det.table.headers, det.scores);
  check("score zero → confidence LOW + aviso", diag.confidence === "LOW" && diag.warnings.includes(MRP_WARNING_NO_COLUMNS));
  scenario("arquivo desconhecido + estoque + compras (base inválida trava)", [unknown, F.stockFixture(), F.purchaseFixture()]);

  const dets = [F.baseFixture(), F.stockFixture(), F.purchaseFixture()].map((f) => analyzeMrpWorkbook(f.name, readMrpWorkbook(f.data))!);
  check("detecção: Base / Estoque / Compras", dets[0].kind === "base" && dets[1].kind === "est" && dets[2].kind === "cmp", dets.map((d) => d.kind).join(","));
  check("cabeçalho do MB52 na linha 3 (título ignorado)", dets[1].table.headerSheetRow === 3, String(dets[1].table.headerSheetRow));

  scenario("dois estoques (2º vai para o 1º slot vazio)", [F.stockFixture(), F.twoSheetStockFixture(), F.purchaseFixture()]);
  scenario("só estoque (falta compras)", [F.stockFixture()]);
  const noBase = evaluateMrpLock(portalReceive([F.stockFixture(), F.purchaseFixture()]), false);
  check("Portal sem base vigente: travado com mensagem própria", !noBase.ready && /Base MRP vigente/.test(noBase.message), noBase.message);

  section("6. trocarAba / reatribuir (sem reenviar o arquivo)");
  const two = F.twoSheetStockFixture();
  const rt = htmlReceive([two, F.purchaseFixture()]);
  let slots = portalReceive([two, F.purchaseFixture()]);
  rt.trocarAba("est", "Resumo");
  const wb = slots.est!.wb;
  const preview = buildMrpFilePreview(two.name, wb, { kind: "est", sheet: "Resumo", depositFilter: "1400" });
  const h = rt.arquivos().est;
  check("trocarAba: mesma aba, cabeçalho e linhas", h.aba === preview.sheet && same(h.headers, preview.headers) && h.linhas === preview.dataRows);
  rt.reatribuir("est", "base");
  slots = reassignMrpSlot(slots, "est", "base");
  const a = rt.arquivos();
  check("reatribuir est→base: arquivos trocam de slot", a.base?.nome === slots.base?.detection.fileName && !a.est && !slots.est);
  check("reatribuir: trava igual", evaluateMrpLock({ base: { headers: h.headers }, est: null, cmp: slots.cmp }, true).ready === !rt.lock().disabled);
}

function testBase() {
  section("7. Base MRP (fixture): áreas, abas ignoradas e deduplicação");
  const f = F.baseFixture();
  const result = parseMrpBase(readMrpWorkbook(f.data), { defaultArea: "Mecânica" });
  const byCode = new Map(result.materials.map((m) => [m.code, m]));
  check("aba Gyan ignorada", same(result.ignoredSheets, ["MRP Automatico Gyan"]));
  check('"Notas" pulada por falta de colunas', result.skippedSheets.some((s) => s.name === "Notas" && s.reason === "SEM_COLUNAS"));
  check("áreas: manutenção→Mecânica, Eletrica→Elétrica, sem indicação→padrão",
    same(result.sheets.map((s) => [s.name, s.area, s.areaFromSheetName]), [["MRP Analise manutenção", "Mecânica", true], ["MRP Analise Eletrica", "Elétrica", true], ["Lubrificação extra", "Mecânica", false]]));
  const m13515 = byCode.get("13515")!;
  check("dup com 1ª mín=máx=0: mín/máx substituídos", m13515.min === 5 && m13515.max === 10);
  check("dup: conjunto completado pelo duplicado", m13515.family === "Satélite Breton 6");
  check("dup: descrição NÃO completada (fica a da 1ª)", m13515.description === "Modulo Beckhoff");
  check("dup: área/grupo continuam da 1ª ocorrência", m13515.area === "Mecânica" && m13515.group === "Y0035");
  const m20002 = byCode.get("20002")!;
  check("dup com 1ª mín>0: mín/máx mantidos", m20002.min === 3 && m20002.max === 6);
  check("dup com 1ª mín>0: conjunto vazio ainda é completado (regra do HTML)", m20002.family === "Satélite Simec 6" && m20002.description === "Primeira ocorrência mín>0");
  check('"000013515" ≠ "13515"', byCode.has("000013515") && byCode.get("000013515")!.description === "Mesmo código com zeros");
  check('"13516.0" → "13516" e "1.500"/"2,5" → 1500/2.5', byCode.get("13516")?.min === 1500 && byCode.get("13516")?.max === 2.5);
  check("linhas duplicadas = 2 · sem código = 1", result.duplicateRows === 2 && result.emptyCodeRows === 1);
  const rows13515 = result.rows.filter((r) => r.code === "13515");
  check("staging: 1ª ocorrência VALID, repetida IGNORED/DUPLICADO", rows13515[0].status === "VALID" && rows13515[1].reason === "DUPLICADO");
  check("sourceRow aponta a linha real da planilha (título + linha vazia)", byCode.get("13515")!.sourceRow === 4, String(byCode.get("13515")!.sourceRow));
}

function testRealBase() {
  section("8. Base MRP REAL — Controle_MRP_SAP_novo_analisado.xlsx");
  const path = join(homedir(), "OneDrive - granitozucchi.com.br", "Manutenção - Documentos Manutenção", "Restrito", "Manutenção", "MRP Sap novo", "Controle_MRP_SAP_novo_analisado.xlsx");
  if (!existsSync(path)) {
    console.log("  (arquivo não encontrado — pulado)");
    return;
  }
  const data = readFileSync(path);
  const rt = createHtmlRuntime();
  const htmlSummary = rt.fn.importarBase(rt.readWorkbook(data), "Controle.xlsx");
  const htmlBase = rt.fn.baseCustom().map((m: Any) => ({ ...m }));
  const wb = readMrpWorkbook(data);
  const result = parseMrpBase(wb, { defaultArea: "Mecânica" });
  const portal = result.materials.map((m) => ({ codigo: m.code, descricao: m.description, grupo: m.group, min: m.min, max: m.max, um: m.unit, statusMrp: m.statusMrp, familia: m.family, area: m.area }));
  let diverg = 0;
  htmlBase.forEach((m: Any, i: number) => {
    if (!same(m, portal[i])) diverg++;
  });
  console.log(`  HTML: ${strip(htmlSummary)}`);
  console.log(`  Portal: ${result.summary}`);
  for (const s of result.sheets) console.log(`    · ${s.name} → ${s.area} · ${s.dataRows} linhas · ${s.materials} materiais · ${s.duplicateRows} dup · ${s.emptyCodeRows} sem código`);
  check("MRP Analise manutenção → Mecânica", result.sheets.find((s) => s.name === "MRP Analise manutenção")?.area === "Mecânica");
  check("MRP Analise Eletrica → Elétrica", result.sheets.find((s) => s.name === "MRP Analise Eletrica")?.area === "Elétrica");
  check("MRP Automatico Gyan → ignorada", same(result.ignoredSheets, ["MRP Automatico Gyan"]));
  check(`Portal = HTML (${portal.length} materiais, ${diverg} divergências)`, htmlBase.length === portal.length && diverg === 0);
  const det = analyzeMrpWorkbook("Controle.xlsx", wb)!;
  check(`detectado como base (aba ${det.table.sheet})`, det.kind === "base");
  const preview = buildMrpFilePreview("Controle.xlsx", wb, { kind: "base", depositFilter: "1400" });
  check("prévia estima a mesma quantidade de materiais", preview.base?.estimatedMaterials === portal.length);
}

function testTimezones() {
  section("9. parseData em America/Sao_Paulo x UTC (processos filhos)");
  const tsxCli = require.resolve("tsx/cli");
  const runs: Record<string, { offset: number; cases: { label: string; html: string; portal: string }[] }> = {};
  for (const tz of ["America/Sao_Paulo", "UTC"]) {
    const res = spawnSync(process.execPath, [tsxCli, "scripts/mrp/tz-probe.ts", ...process.argv.filter((a) => a.startsWith("--html="))], {
      env: { ...process.env, TZ: tz },
      encoding: "utf8",
      maxBuffer: 10 * 1024 * 1024
    });
    const line = res.stdout.trim().split("\n").pop() ?? "";
    try {
      runs[tz] = JSON.parse(line);
    } catch {
      check(`sonda ${tz} executou`, false, res.stderr.slice(0, 400));
      return;
    }
  }
  const sp = runs["America/Sao_Paulo"],
    utc = runs.UTC;
  check("fusos efetivos (offset 180 e 0)", sp.offset === 180 && utc.offset === 0, `${sp.offset}/${utc.offset}`);

  // UTC = fuso do servidor (Vercel): Portal tem de ser idêntico ao HTML.
  const badUtc = utc.cases.filter((c) => c.html !== c.portal);
  check(`UTC: Portal = HTML em ${utc.cases.length} casos`, badUtc.length === 0, show(badUtc));

  // America/Sao_Paulo = fuso do navegador onde o HTML roda. Divergências vêm da
  // SheetJS 0.18.5 do HTML (desvio de LMT de +28 s, meia-noite inexistente no
  // horário de verão, data ISO de CSV criada em UTC). Registradas, NÃO corrigidas.
  const KNOWN_SP = new Set(["serial data 23:59:45", "horário de verão antigo 2018-11-04", 'csv "2026-09-01"']);
  const badSp = sp.cases.filter((c) => c.html !== c.portal);
  console.log(`  America/Sao_Paulo: ${badSp.length} divergência(s) Portal x HTML (${sp.cases.length} casos):`);
  for (const c of badSp) console.log(`    · ${c.label}: HTML=${c.html} · Portal=${c.portal}${KNOWN_SP.has(c.label) ? "  [conhecida]" : "  [NOVA]"}`);
  check("America/Sao_Paulo: só divergências conhecidas da SheetJS 0.18.5", badSp.every((c) => KNOWN_SP.has(c.label)));

  const crossPortal = sp.cases.filter((c, i) => c.portal !== utc.cases[i].portal);
  console.log(`  Portal entre fusos: ${crossPortal.length} diferença(s)`);
  for (const c of crossPortal) console.log(`    · ${c.label}: São Paulo=${c.portal} · UTC=${utc.cases.find((x) => x.label === c.label)?.portal}`);
  const crossHtml = sp.cases.filter((c, i) => c.html !== utc.cases[i].html);
  console.log(`  HTML entre fusos: ${crossHtml.length} diferença(s)`);
  for (const c of crossHtml) console.log(`    · ${c.label}: São Paulo=${c.html} · UTC=${utc.cases.find((x) => x.label === c.label)?.html}`);
}

function main() {
  const rt = createHtmlRuntime();
  console.log(`Referência: HTML com SheetJS ${rt.xlsxVersion} · TZ do processo: offset ${new Date(2026, 8, 1).getTimezoneOffset()} min`);
  testHelpers(rt);
  testAliasSnapshot(rt);
  testWorkbookReading();
  testScenarios();
  testBase();
  testRealBase();
  testTimezones();
  console.log(`\n${checks} checagens · ${failures} falha(s)`);
  console.log("PARIDADE COM ARQUIVOS REAIS DE ESTOQUE (MB52) E COMPRAS: PENDENTE");
  if (failures) process.exitCode = 1;
}

main();
