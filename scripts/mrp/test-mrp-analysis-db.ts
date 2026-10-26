/**
 * ANÁLISE MRP (FASE D) — teste de INTEGRAÇÃO do motor com o banco.
 *
 *   npm run test:mrp-analysis-db -- --direct
 *
 *   1. importa as fixtures pelo fluxo real (FASE C) e roda runMrpAnalysis():
 *      run criado, nº de itens, KPIs, fontes, isCurrent; itens gravados = motor
 *      puro = analisar() do HTML (processar sobre os MESMOS arquivos);
 *   2. segundo run com as mesmas fontes: resultado idêntico, troca do current;
 *   3. falha dentro da transação: o run anterior continua current, nada parcial;
 *   4. referências inválidas e depósito divergente são recusados;
 *   5. base padrão = Base MRP ativa (seed, 4.280): métricas de tempo/consultas;
 *   6. resumo da análise vigente (sem itens).
 *
 * Grava só em tabelas MRP (+ ImportHistory), tudo marcado e apagado no fim.
 * Se já existir uma análise vigente que não seja deste teste, ela é restaurada.
 */
import "./force-utc";
import { SCRIPT_DB_MODE, connectWithRetry } from "./script-db";
import { ImportStatus, ImportType } from "@prisma/client";
import { prisma } from "../../src/lib/prisma";
import { analyzeMrp, countMrp, type MrpAnalysisResult } from "../../src/lib/mrp/analysis-engine";
import { buildMrpImportPlan } from "../../src/lib/mrp/import-plan";
import { readMrpWorkbook } from "../../src/lib/mrp/workbook";
import type { MrpFileKind } from "../../src/lib/mrp/types";
import { confirmMrpImport } from "../../src/services/mrp-import.service";
import { getCurrentMrpAnalysisSummary, getMrpAnalysisItems, loadMrpAnalysisInputs, runMrpAnalysis } from "../../src/services/mrp-analysis.service";
import { MrpPersistenceError, getActiveMrpBaseVersion, setCurrentMrpAnalysisRun } from "../../src/services/mrp-persistence.service";
import { IMPORT_STAGES } from "../../src/types/imports";
import * as F from "./fixtures";
import { createHtmlRuntime } from "./html-runtime";

type Any = any; // eslint-disable-line @typescript-eslint/no-explicit-any
const TAG = "scripts/mrp/test-mrp-analysis-db.ts";
let failures = 0;
function check(label: string, ok: boolean, detail = "") {
  if (!ok) failures++;
  console.log(`  ${ok ? "✓" : "✗"} ${label}${detail ? `  — ${detail}` : ""}`);
}
const show = (v: unknown) => JSON.stringify(v, (_k, x) => (typeof x === "number" && Object.is(x, -0) ? "-0" : x));
const out0 = (x: number) => (Object.is(x, -0) ? 0 : x);

/** Resultado do motor como sai do banco (-0 gravado como 0). */
function asStored(a: MrpAnalysisResult): MrpAnalysisResult {
  return {
    ...a,
    min: out0(a.min), max: out0(a.max), free: out0(a.free), suggested: out0(a.suggested),
    suggestedOriginal: out0(a.suggestedOriginal), missing: out0(a.missing),
    purchase: a.purchase ? { ...a.purchase, qty: out0(a.purchase.qty) } : null
  };
}
function sameItems(a: MrpAnalysisResult[], b: MrpAnalysisResult[]): { equal: boolean; diff: string } {
  if (a.length !== b.length) return { equal: false, diff: `${a.length} x ${b.length}` };
  for (let i = 0; i < a.length; i++) if (show(a[i]) !== show(b[i])) return { equal: false, diff: `#${i}: ${show(a[i])}\n      ${show(b[i])}` };
  return { equal: true, diff: "" };
}

const files = new Map<string, Buffer>();
const download = async (path: string) => files.get(path)!;
const KIND_TYPE: Record<MrpFileKind, ImportType> = { base: ImportType.MRP_BASE, est: ImportType.MRP_STOCK, cmp: ImportType.MRP_PURCHASES };
async function openHistory(kind: MrpFileKind, fixture: F.FixtureFile, sheet: string) {
  const path = `imports/analise-mrp/teste/${Date.now()}-${Math.random().toString(36).slice(2)}-${fixture.name}`;
  files.set(path, fixture.data);
  const h = await prisma.importHistory.create({
    data: { type: KIND_TYPE[kind], fileName: fixture.name, importedBy: TAG, status: ImportStatus.EM_PROCESSAMENTO, stage: IMPORT_STAGES.UPLOADED, filePath: path, bucket: "teste", metadata: { mrp: { flow: "analise-mrp", kind, sheet } } }
  });
  return { importId: h.id, kind, sheet };
}

async function main() {
  console.log(`Banco: ${SCRIPT_DB_MODE} (connection_limit=1)`);
  await connectWithRetry(prisma, { label: "teste do motor MRP" });
  const seed = await getActiveMrpBaseVersion();
  if (!seed) throw new Error("Sem Base MRP ativa.");
  const priorCurrent = await prisma.mrpAnalysisRun.findFirst({ where: { isCurrent: true }, select: { id: true } });
  const runsBefore = await prisma.mrpAnalysisRun.count();

  try {
    console.log("\n0. Fontes temporárias (importação real da FASE C)");
    const fixtures = { base: F.baseFixture(), est: F.stockFixture(), cmp: F.purchaseFixture() };
    const imported = await confirmMrpImport({
      items: [
        await openHistory("base", fixtures.base, "MRP Analise manutenção"),
        await openHistory("est", fixtures.est, "Sheet1"),
        await openHistory("cmp", fixtures.cmp, "Compras")
      ],
      depositFilter: "1400",
      createdBy: TAG,
      download
    });
    check("base (inativa), estoque e compras importados", !!imported.baseVersionId && !imported.baseActivated && !!imported.stockImportId && !!imported.purchaseImportId);

    // Referências: motor puro sobre o plano + HTML sobre os mesmos arquivos.
    const plan = buildMrpImportPlan(
      [
        { fileName: fixtures.base.name, wb: readMrpWorkbook(fixtures.base.data), kind: "base", sheet: "MRP Analise manutenção" },
        { fileName: fixtures.est.name, wb: readMrpWorkbook(fixtures.est.data), kind: "est", sheet: "Sheet1" },
        { fileName: fixtures.cmp.name, wb: readMrpWorkbook(fixtures.cmp.data), kind: "cmp", sheet: "Compras" }
      ],
      { depositFilter: "1400" }
    );
    const pure = analyzeMrp(plan.base!.result.materials, new Map(plan.stock!.result.items.map((i) => [i.code, i.freeQty])), plan.purchases!.result.items);
    const rt = createHtmlRuntime();
    rt.setDeposit("1400");
    rt.receber([fixtures.base, fixtures.est, fixtures.cmp]);
    const htmlAnalysis = rt.processar().analysis as Any[];

    /* 1 ------------------------------------------------------------------ */
    console.log("\n1. runMrpAnalysis() com fontes explícitas");
    const run1 = await runMrpAnalysis({
      baseVersionId: imported.baseVersionId,
      stockImportId: imported.stockImportId!,
      purchaseImportId: imported.purchaseImportId!,
      depositFilter: "1400",
      trigger: "FULL_UPDATE",
      userId: TAG
    });
    const row1 = await prisma.mrpAnalysisRun.findUniqueOrThrow({ where: { id: run1.runId }, include: { _count: { select: { items: true } } } });
    check("run criado com as três fontes exatas", row1.baseVersionId === imported.baseVersionId && row1.stockImportId === imported.stockImportId && row1.purchaseImportId === imported.purchaseImportId);
    check("depositFilter e trigger gravados", row1.depositFilter === "1400" && row1.trigger === "FULL_UPDATE" && row1.createdBy === TAG);
    check(`itens = materiais da base (${row1._count.items})`, row1._count.items === plan.base!.result.materials.length);
    check("run é o current", row1.isCurrent);
    const items1 = await getMrpAnalysisItems(run1.runId);
    const vsPure = sameItems(items1, pure.map(asStored));
    check("itens gravados = motor puro (ordem, valores, compra)", vsPure.equal, vsPure.diff);
    const htmlMapped: MrpAnalysisResult[] = htmlAnalysis.map((a) => asStored({
      code: a.codigo, description: a.descricao, group: a.grupo, unit: a.um, area: a.area, family: a.familia, min: a.min, max: a.max,
      free: a.livre, notFound: a.naoEnc, noParams: a.semParam, noMovement: a.semMov, status: a.status, suggested: a.sugerida, missing: a.falta,
      purchase: a.compra ? { qty: a.compra.qtd, order: a.compra.pedido, requisition: a.compra.requisicao, forecast: a.compra.previsao, supplier: a.compra.fornecedor, date: a.compra.data } : null,
      statusOriginal: a.statusOrig, suggestedOriginal: a.sugeridaOrig
    }));
    const vsHtml = sameItems(items1, htmlMapped);
    check("itens gravados = analisar() do HTML (mesmos arquivos)", vsHtml.equal, vsHtml.diff);
    const k = run1.kpis;
    const cp = countMrp(pure);
    check("KPIs = contar() + Saíram do MRP", k.total === cp.total && k.Comprar === cp.Comprar && k.Verificar === cp.Verificar && k.Comprado === cp.Comprado && k.OK === cp.OK && k.qtd === cp.qtd && k.qtdTransito === cp.qtdTransito && k.semMov === cp.semMov && k.parado === cp.parado && k.qtdParada === cp.qtdParada && k.removedFromMrp === cp.Comprado, show(k));
    const htmlCount = rt.fn.contar(htmlAnalysis);
    check("KPIs = contar() do HTML", ["total", "Comprar", "Verificar", "Comprado", "OK", "qtd", "qtdTransito", "semMov", "parado", "qtdParada"].every((key) => Object.is(htmlCount[key] ?? 0, (k as Any)[key])));
    const storedKpis = row1.kpis as Any;
    check("KPIs persistidos no run", storedKpis.total === k.total && storedKpis.avoidedQty === k.avoidedQty && storedKpis.purchases?.linhas === plan.purchases!.result.items.length);

    /* 2 ------------------------------------------------------------------ */
    console.log("\n2. Segundo run com as mesmas fontes");
    const run2 = await runMrpAnalysis({ baseVersionId: imported.baseVersionId, stockImportId: imported.stockImportId!, purchaseImportId: imported.purchaseImportId!, trigger: "BASE_REIMPORT", userId: TAG });
    const r1 = await prisma.mrpAnalysisRun.findUniqueOrThrow({ where: { id: run1.runId } });
    const r2 = await prisma.mrpAnalysisRun.findUniqueOrThrow({ where: { id: run2.runId } });
    check("primeiro isCurrent=false, segundo isCurrent=true", !r1.isCurrent && r2.isCurrent);
    check("resultado idêntico material a material", sameItems(items1, await getMrpAnalysisItems(run2.runId)).equal);
    check("primeiro run intacto (snapshot)", sameItems(items1, await getMrpAnalysisItems(run1.runId)).equal && r1.stockImportId === imported.stockImportId);

    /* 3 ------------------------------------------------------------------ */
    console.log("\n3. Falha durante a criação de um novo run");
    const before3 = await prisma.mrpAnalysisRun.count();
    let msg3 = "";
    try {
      await runMrpAnalysis({
        baseVersionId: imported.baseVersionId, stockImportId: imported.stockImportId!, purchaseImportId: imported.purchaseImportId!, trigger: "FULL_UPDATE", userId: TAG,
        hooks: { beforeCommit: async () => { throw new Error("falha simulada no run"); } }
      });
    } catch (error) {
      msg3 = (error as Error).message;
    }
    check("erro propagado", msg3 === "falha simulada no run", msg3);
    check("nenhum run/itens parciais", (await prisma.mrpAnalysisRun.count()) === before3);
    check("run anterior continua current", (await prisma.mrpAnalysisRun.findFirst({ where: { isCurrent: true } }))?.id === run2.runId);

    /* 4 ------------------------------------------------------------------ */
    console.log("\n4. Referências inválidas");
    const err = async (p: Parameters<typeof runMrpAnalysis>[0]) => {
      try { await runMrpAnalysis(p); return "não falhou"; } catch (e) { return e instanceof MrpPersistenceError ? e.message : `outro erro: ${(e as Error).message}`; }
    };
    check("estoque inexistente", /estoque não encontrada/.test(await err({ stockImportId: "x", purchaseImportId: imported.purchaseImportId!, trigger: "FULL_UPDATE", userId: TAG })));
    check("compras inexistente", /compras não encontrada/.test(await err({ stockImportId: imported.stockImportId!, purchaseImportId: "x", trigger: "FULL_UPDATE", userId: TAG })));
    check("base inexistente", /Base MRP não encontrada/.test(await err({ baseVersionId: "x", stockImportId: imported.stockImportId!, purchaseImportId: imported.purchaseImportId!, trigger: "FULL_UPDATE", userId: TAG })));
    check("depósito diferente do importado", /importado com o depósito/.test(await err({ stockImportId: imported.stockImportId!, purchaseImportId: imported.purchaseImportId!, depositFilter: "1500", trigger: "FULL_UPDATE", userId: TAG })));
    check("gatilho inválido", /Gatilho inválido/.test(await err({ stockImportId: imported.stockImportId!, purchaseImportId: imported.purchaseImportId!, trigger: "X" as never, userId: TAG })));
    check("current preservado após as recusas", (await prisma.mrpAnalysisRun.findFirst({ where: { isCurrent: true } }))?.id === run2.runId);

    /* 5 ------------------------------------------------------------------ */
    console.log("\n5. Base padrão = Base MRP ativa (seed 4.280) — tempo e consultas");
    const run5 = await runMrpAnalysis({ stockImportId: imported.stockImportId!, purchaseImportId: imported.purchaseImportId!, trigger: "FULL_UPDATE", userId: TAG });
    check("usou a base ativa e gravou o id", run5.baseVersionId === seed.id);
    check("4.280 itens", run5.kpis.total === 4280 && (await prisma.mrpAnalysisItem.count({ where: { runId: run5.runId } })) === 4280);
    const inputs = await loadMrpAnalysisInputs({ stockImportId: imported.stockImportId!, purchaseImportId: imported.purchaseImportId! });
    const pure5 = analyzeMrp(inputs.materials, inputs.stock, inputs.purchases);
    check("itens = motor puro sobre as mesmas fontes", sameItems(await getMrpAnalysisItems(run5.runId), pure5.map(asStored)).equal);
    const m = run5.metrics;
    console.log(`    métricas: ${m.materials} materiais · ${m.stockItems} estoque · ${m.purchaseItems} compras · ${m.queries} consultas · carga ${m.loadMs} ms · motor ${m.engineMs} ms · gravação ${m.persistMs} ms · total ${m.totalMs} ms`);
    check("consultas constantes (não 1 por material)", m.queries <= 20, String(m.queries));

    /* 6 ------------------------------------------------------------------ */
    console.log("\n6. Resumo da análise vigente");
    const summary = await getCurrentMrpAnalysisSummary();
    check("run, KPIs, fontes e autor — sem itens", summary?.runId === run5.runId && summary.kpis.total === 4280 && summary.sources.base.id === seed.id && summary.sources.stock.depositInfo === "depósito 1400" && summary.createdBy === TAG && !("rows" in summary));
  } finally {
    await prisma.mrpAnalysisRun.updateMany({ where: { createdBy: TAG }, data: { isCurrent: false } });
    if (priorCurrent) await setCurrentMrpAnalysisRun(priorCurrent.id);
    await prisma.mrpAnalysisRun.deleteMany({ where: { createdBy: TAG } });
    await prisma.mrpStockImport.deleteMany({ where: { createdBy: TAG } });
    await prisma.mrpPurchaseImport.deleteMany({ where: { createdBy: TAG } });
    await prisma.mrpBaseVersion.deleteMany({ where: { createdBy: TAG, isActive: false } });
    await prisma.importHistory.deleteMany({ where: { importedBy: TAG } });
    const left =
      (await prisma.mrpAnalysisRun.count({ where: { createdBy: TAG } })) +
      (await prisma.mrpStockImport.count({ where: { createdBy: TAG } })) +
      (await prisma.mrpBaseVersion.count({ where: { createdBy: TAG } })) +
      (await prisma.importHistory.count({ where: { importedBy: TAG } }));
    console.log("\nLimpeza");
    check("nenhum registro de teste restante", left === 0, String(left));
    check("análises anteriores ao teste preservadas", (await prisma.mrpAnalysisRun.count()) === runsBefore);
    check("Base MRP ativa original", (await getActiveMrpBaseVersion())?.id === seed.id);
  }
  console.log(failures ? `\n${failures} FALHA(S)` : "\nTODOS OS TESTES PASSARAM");
  if (failures) process.exitCode = 1;
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
