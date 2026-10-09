/**
 * ANÁLISE MRP (FASE K.1) — confere o run REAL gerado no Preview (somente leitura).
 *
 *   npx tsx scripts/mrp/verify-preview-run.ts --direct [--run=<id>] [--limit-s=300]
 *
 * Depois do "Atualizar tudo" feito no navegador (checklist
 * docs/analise-mrp-checklist-preview.md), lê do banco (o Preview usa o mesmo):
 *   1. o run (vigente ou --run) e as fontes, com a evidência do Storage real:
 *      bucket/caminho/tamanho dos 3 arquivos = arquivos originais desta máquina;
 *   2. KPIs, áreas e compras = referências oficiais da FASE K (item 2/3 do K.1);
 *   3. os 4.259 itens gravados = análise do HTML original sobre os mesmos arquivos
 *      (depósito 1000) — e a impressão digital determinística;
 *   4. auditoria mrp_update_success/failed (resultado, tempos, routeMs) e o
 *      limite de duração da função (maxDuration da rota, ou --limit-s);
 *   5. locks / importações presas / runs incompletos.
 * Não grava nada.
 */
import "./force-utc";
import { SCRIPT_DB_MODE, connectWithRetry } from "./script-db";
import { existsSync, readFileSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { prisma } from "../../src/lib/prisma";
import { countMrp, purchaseKpis, removedFromMrp, type MrpAnalysisResult } from "../../src/lib/mrp/analysis-engine";
import { buildMrpAreasSummary } from "../../src/lib/mrp/areas";
import { mrpIdleShareText } from "../../src/lib/mrp/idle";
import { getMrpAnalysisItems } from "../../src/services/mrp-analysis.service";
import { fromMrpDecimal } from "../../src/services/mrp-persistence.service";
import { createHtmlRuntime } from "./html-runtime";
import { FIELDS, fromHtml } from "../test-mrp-engine";
import { healthCheck } from "./validate-mrp-real-db";

type Any = any; // eslint-disable-line @typescript-eslint/no-explicit-any
let failures = 0;
function check(label: string, ok: boolean, detail = "") {
  if (!ok) failures++;
  console.log(`  ${ok ? "✓" : "✗"} ${label}${detail ? `  — ${detail}` : ""}`);
}
const show = (v: unknown) => JSON.stringify(v);
const br = (n: number) => n.toLocaleString("pt-BR", { maximumFractionDigits: 2 });

/** Referências oficiais (FASE K, depósito 1000) — itens 2 e 3 da FASE K.1. */
const REF = {
  kpis: { total: 4259, Comprar: 880, Verificar: 0, Comprado: 46, OK: 3333, qtd: 25064, semMov: 3333, parado: 0, qtdParada: 0 },
  share: "78,3% da base",
  zerados: 3333,
  purchases: { linhas: 1526, materiais: 972, pendentes: 191, qtdPendente: "2.496,97", recebidos: 781 },
  removed: { count: 46, avoidedQty: 1264 },
  areas: {
    Mecânica: { total: 3465, Comprar: 720, Verificar: 0, Comprado: 36, OK: 2709, qtd: 20921 },
    Elétrica: { total: 794, Comprar: 160, Verificar: 0, Comprado: 10, OK: 624, qtd: 4143 },
    Total: { total: 4259, Comprar: 880, Verificar: 0, Comprado: 46, OK: 3333, qtd: 25064 }
  }
};
const FILES = {
  base: { name: "Controle_MRP_SAP_novo_analisado.xlsx", path: join(homedir(), "OneDrive - granitozucchi.com.br", "Manutenção - Documentos Manutenção", "Restrito", "Manutenção", "MRP Sap novo", "Controle_MRP_SAP_novo_analisado.xlsx") },
  est: { name: "estoque 0810.xlsx", path: join(homedir(), "Downloads", "estoque 0810.xlsx") },
  cmp: { name: "compras 0810.xlsx", path: join(homedir(), "Downloads", "compras 0810.xlsx") }
};
/** Origens de teste (não são Storage real). */
const TEST_BUCKETS = new Set(["teste", "e2e", "fase-k"]);

async function main() {
  console.log(`Banco: ${SCRIPT_DB_MODE} (somente leitura)`);
  await connectWithRetry(prisma, { label: "verificação do run do Preview" });
  const runArg = process.argv.find((a) => a.startsWith("--run="))?.slice(6);
  const limitS = Number(process.argv.find((a) => a.startsWith("--limit-s="))?.slice(10) ?? 300);
  const run = runArg ? await prisma.mrpAnalysisRun.findUnique({ where: { id: runArg } }) : await prisma.mrpAnalysisRun.findFirst({ where: { isCurrent: true } });
  if (!run) throw new Error(runArg ? `Run ${runArg} não encontrado.` : "Nenhuma análise vigente — execute o checklist no Preview antes.");
  console.log(`\nRun ${run.id} · ${run.trigger} · criado ${run.createdAt.toISOString()} por ${run.createdBy} · vigente ${run.isCurrent} · depósito "${run.depositFilter}"`);

  // 1. Fontes + evidência do Storage real.
  console.log("\n1. Fontes e Storage");
  const base = await prisma.mrpBaseVersion.findUniqueOrThrow({ where: { id: run.baseVersionId }, include: { importHistory: true } });
  const stock = await prisma.mrpStockImport.findUniqueOrThrow({ where: { id: run.stockImportId }, include: { importHistory: true } });
  const purchase = await prisma.mrpPurchaseImport.findUniqueOrThrow({ where: { id: run.purchaseImportId }, include: { importHistory: true } });
  check(`depósito do run = 1000`, run.depositFilter === "1000", run.depositFilter);
  check(`run criado por um usuário do portal (não por script de teste)`, !!run.createdBy && !/scripts\/|fase-k|e2e|Teste E2E/i.test(run.createdBy), run.createdBy ?? "-");
  for (const [k, src] of [["base", base], ["est", stock], ["cmp", purchase]] as const) {
    const h = src.importHistory;
    const local = existsSync(FILES[k].path) ? statSync(FILES[k].path).size : null;
    console.log(`    ${k}: ${src.fileName} · histórico ${h?.id ?? "-"} · ${h?.status} · bucket "${h?.bucket}" · ${h?.filePath} · ${h?.fileSize} bytes (local ${local}) · ${h?.createdAt.toISOString()} → ${h?.finishedAt?.toISOString() ?? "-"}`);
    check(`${k}: veio pelo Storage real (bucket de importações, caminho imports/analise-mrp/…)`, !!h && !!h.bucket && !TEST_BUCKETS.has(h.bucket) && !!h.filePath?.startsWith("imports/analise-mrp/"));
    check(`${k}: arquivo = ${FILES[k].name} original (nome e tamanho)`, src.fileName === FILES[k].name && h?.fileSize === local, `${src.fileName} ${h?.fileSize} x ${local}`);
    check(`${k}: histórico de importação = SUCESSO`, h?.status === "SUCESSO", h?.status);
  }
  check(`fontes: base ${base.materialCount} · estoque ${stock.rowsAccepted} · compras ${purchase.rowsAccepted}`, base.materialCount === 4259 && stock.rowsAccepted === 38 && purchase.rowsAccepted === 1526);

  // 2. KPIs oficiais.
  console.log("\n2. KPIs = referências oficiais");
  const k = run.kpis as Any;
  const items: MrpAnalysisResult[] = await getMrpAnalysisItems(run.id);
  const c = countMrp(items);
  for (const [key, ref] of Object.entries(REF.kpis)) check(`${key} = ${br(ref)}`, k[key] === ref && (c as Any)[key] === ref, `run.kpis ${k[key]} · itens ${(c as Any)[key]}`);
  check(`Zerados = ${br(REF.zerados)} · percentual ${REF.share}`, c.semMov - c.parado === REF.zerados && mrpIdleShareText(c.semMov, c.total) === REF.share, mrpIdleShareText(c.semMov, c.total));
  const rows = await prisma.mrpPurchaseItem.findMany({ where: { importId: run.purchaseImportId }, orderBy: { seq: "asc" } });
  const pk = purchaseKpis(
    rows.map((p) => ({ seq: p.seq, code: p.code, text: p.text, quantity: fromMrpDecimal(p.quantity), requisitionDate: p.requisitionDate, requisitionNumber: p.requisitionNumber, purchaseOrderNumber: p.purchaseOrderNumber, receiptDate: p.receiptDate, expectedDeliveryDate: p.expectedDeliveryDate, supplier: p.supplier }))
  );
  check(`compras: linhas ${pk.linhas} · códigos ${pk.materiais} · pendentes ${pk.pendentes} · qtd. em trânsito ${br(pk.qtdPendente)} · recebidos ${pk.recebidos}`, pk.linhas === REF.purchases.linhas && pk.materiais === REF.purchases.materiais && pk.pendentes === REF.purchases.pendentes && br(pk.qtdPendente) === REF.purchases.qtdPendente && pk.recebidos === REF.purchases.recebidos);
  const rem = removedFromMrp(items);
  check(`Saíram do MRP ${rem.count} · Qtd. evitada ${br(rem.avoidedQty)}`, rem.count === REF.removed.count && rem.avoidedQty === REF.removed.avoidedQty);
  const areas = buildMrpAreasSummary(items.map((x) => ({ area: x.area, family: x.family, status: x.status, suggested: x.suggested, noParams: x.noParams })));
  for (const a of areas.areas) {
    const ref = (REF.areas as Any)[a.title];
    check(`área ${a.title}: ${[a.summary.total, a.summary.Comprar, a.summary.Verificar, a.summary.Comprado, a.summary.OK, a.summary.qtd].map(br).join(" / ")}`, !!ref && Object.keys(ref).every((x) => (a.summary as Any)[x] === ref[x]));
  }

  // 3. Itens gravados = HTML original sobre os mesmos arquivos (paridade da FASE K reaproveitada).
  console.log("\n3. Itens gravados x HTML original (mesmos arquivos, depósito 1000)");
  if ([FILES.base, FILES.est, FILES.cmp].every((f) => existsSync(f.path))) {
    const rt = createHtmlRuntime();
    rt.setDeposit("1000");
    rt.receber([FILES.base, FILES.est, FILES.cmp].map((f) => ({ name: f.name, data: readFileSync(f.path) })));
    const html = (rt.processar() as Any).analysis as Any[];
    let diverg = 0;
    const samples: string[] = [];
    html.forEach((h, i) => {
      const a = fromHtml(h);
      const p = items[i];
      const bad = p ? FIELDS.filter((f) => (typeof a[f] === "number" ? a[f] !== p[f] : show(a[f]) !== show(p[f]))).map(String) : ["ausente"];
      if (p && show(a.purchase) !== show(p.purchase)) bad.push("purchase");
      if (bad.length) {
        diverg++;
        if (samples.length < 5) samples.push(`${a.code}: ${bad.join(",")}`);
      }
    });
    check(`${items.length} itens do run do Preview = analysis do HTML, campo a campo`, diverg === 0 && items.length === html.length && items.length === 4259, samples.join(" | "));
  } else check("arquivos originais disponíveis nesta máquina para a comparação", false);

  // 4. Auditoria do Atualizar tudo e tempos.
  console.log("\n4. Auditoria e tempos");
  const audits = await prisma.auditLog.findMany({ where: { action: { in: ["mrp_update_success", "mrp_update_failed"] }, createdAt: { gte: new Date(run.createdAt.getTime() - 15 * 60_000) } }, orderBy: { createdAt: "asc" } });
  for (const a of audits) {
    const d = (a.details ?? {}) as Any;
    console.log(`    ${a.createdAt.toISOString()} ${a.action} · ${d.result} · etapa ${d.stage ?? "-"} · run anterior ${d.previousRunId ?? "-"} → novo ${d.newRunId ?? "-"} · rota ${d.routeMs ?? "-"} ms${d.metrics ? ` · análise ${d.metrics.totalMs} ms (carga ${d.metrics.loadMs} · motor ${d.metrics.engineMs} · gravação ${d.metrics.persistMs}) · ${d.metrics.queries} consultas` : ""}${d.error ? ` · erro: ${d.error}` : ""}`);
  }
  const success = audits.find((a) => (a.details as Any)?.newRunId === run.id);
  check("auditoria MRP_UPDATE_SUCCESS registrada para este run (com fontes e run anterior)", !!success && (success.details as Any).stockImportId === run.stockImportId && (success.details as Any).purchaseImportId === run.purchaseImportId && (success.details as Any).baseVersionId === run.baseVersionId);
  const routeMs = success ? Number((success.details as Any).routeMs) : NaN;
  check(`Atualizar tudo terminou dentro do limite da função (${limitS} s), com folga (< 60%)`, Number.isFinite(routeMs) && routeMs < limitS * 1000 * 0.6, `${(routeMs / 1000).toFixed(1)} s`);
  const firstUpload = [base, stock, purchase].map((s) => s.importHistory?.createdAt.getTime() ?? Infinity).reduce((a, b) => Math.min(a, b));
  console.log(`    do 1º arquivo inspecionado até o run vigente: ${((run.createdAt.getTime() - firstUpload) / 1000).toFixed(1)} s (inclui o tempo do usuário no modal)`);

  // 5. Locks.
  const h = await healthCheck("5. Saúde do banco");
  check("0 transações presas · 0 locks MRP · 0 importações presas · 0 runs incompletos · 1 run vigente · 1 base ativa", h.idleTx === 0 && h.mrpLocks === 0 && h.stuck === 0 && h.incomplete === 0 && h.currents === 1 && h.actives === 1);

  console.log(failures ? `\n${failures} FALHA(S)` : "\nRUN DO PREVIEW = REFERÊNCIAS OFICIAIS (todas as checagens passaram)");
  console.log("ALERTA OPERACIONAL (DADO_DE_ORIGEM): estoque 0810.xlsx possui apenas 38 materiais, todos com saldo livre zero, dos quais somente 3 pertencem à Base MRP.");
  if (failures) process.exitCode = 1;
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
