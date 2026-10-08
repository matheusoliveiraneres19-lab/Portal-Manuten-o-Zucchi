/**
 * ANÁLISE MRP (FASE E) — teste da tela COMPRAR no nível de serviço/API, com banco.
 *
 *   npm run test:mrp-screen-db -- --direct
 *
 *   0. sem análise vigente: a lista e o resumo voltam null (tela mostra o estado vazio);
 *   1. "Atualizar tudo" (estoque + compras, Base MRP ativa) gera um run vigente;
 *      KPIs da tela = MrpAnalysisRun.kpis = contar() do HTML; ordem da lista
 *      (todas as ordenações/status) = filtrarCompra() do HTML; situação e
 *      observação = bgStatus()/obsDe(); paginação 200/600/1000; consultas;
 *   2. "Atualizar tudo" com planilha do MRP nova: base ativada junto com o run;
 *   3. falha na análise: base e análise anteriores continuam vigentes.
 *
 * Grava só em tabelas MRP (+ ImportHistory/ImportStagingRow), tudo marcado e
 * apagado no fim; Base MRP ativa e análise vigente anteriores são restauradas.
 */
import "./force-utc";
import { SCRIPT_DB_MODE, connectWithRetry } from "./script-db";
import { queryCounter } from "./counting-prisma";
import { ImportStatus, ImportType } from "@prisma/client";
import { prisma } from "../../src/lib/prisma";
import { MRP_BUY_SORTS, MRP_BUY_STATUS_FILTERS, mrpSituation, type MrpBuyFilters } from "../../src/lib/mrp/buy-list";
import type { MrpFileKind } from "../../src/lib/mrp/types";
import { getCurrentMrpAnalysisSummary } from "../../src/services/mrp-analysis.service";
import { clearMrpBuyListingCache, getCurrentMrpBuyListing, getMrpAreasSummary } from "../../src/services/mrp-listing.service";
import { fmtMrp } from "../../src/lib/mrp/format";
import { activateMrpBaseVersion, getActiveMrpBaseVersion, getMrpDefaultDeposit, setCurrentMrpAnalysisRun } from "../../src/services/mrp-persistence.service";
import { updateAllMrp } from "../../src/services/mrp-update.service";
import { IMPORT_STAGES } from "../../src/types/imports";
import * as F from "./fixtures";
import { createHtmlRuntime } from "./html-runtime";
import { parseCards } from "./html-cards";

type Any = any; // eslint-disable-line @typescript-eslint/no-explicit-any
const TAG = "scripts/mrp/test-mrp-screen-db.ts";
let failures = 0;
function check(label: string, ok: boolean, detail = "") {
  if (!ok) failures++;
  console.log(`  ${ok ? "✓" : "✗"} ${label}${detail ? `  — ${detail}` : ""}`);
}
const strip = (s: string) => s.replace(/<[^>]+>/g, "");

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
  await connectWithRetry(prisma, { label: "teste da tela MRP" });
  const seed = await getActiveMrpBaseVersion();
  if (!seed) throw new Error("Sem Base MRP ativa.");
  const priorCurrent = await prisma.mrpAnalysisRun.findFirst({ where: { isCurrent: true }, select: { id: true } });

  try {
    console.log("\n0. Sem análise vigente");
    if (priorCurrent) console.log("  (já existe análise vigente real — verificação do estado vazio pulada)");
    else {
      check("lista = null (tela mostra o estado vazio)", (await getCurrentMrpBuyListing({ q: "", status: "need", area: "", family: "", sort: "need" })) === null);
      check("resumo = null", (await getCurrentMrpAnalysisSummary()) === null);
    }

    console.log("\n1. Atualizar tudo (estoque + compras, Base MRP ativa)");
    const r1 = await updateAllMrp({
      items: [await openHistory("est", F.stockFixture(), "Sheet1"), await openHistory("cmp", F.purchaseFixture(), "Compras")],
      depositFilter: "1400",
      userId: TAG,
      download
    });
    const run1 = await prisma.mrpAnalysisRun.findUniqueOrThrow({ where: { id: r1.analysis.runId } });
    check("run vigente criado com a base ativa", run1.isCurrent && run1.baseVersionId === seed.id && run1.trigger === "FULL_UPDATE");

    const summary = await getCurrentMrpAnalysisSummary();
    const dbKpis = run1.kpis as Any;
    const sixKpis = ["Comprar", "Verificar", "Comprado", "qtd", "OK", "total"] as const;
    check("6 KPIs da tela = MrpAnalysisRun.kpis", summary?.runId === run1.id && sixKpis.every((k) => Object.is((summary!.kpis as Any)[k], dbKpis[k])), sixKpis.map((k) => `${k}=${dbKpis[k]}`).join(" "));

    // Referência: o próprio HTML sobre os MESMOS arquivos (base embutida = seed ativa).
    const rt = createHtmlRuntime();
    rt.setDeposit("1400");
    rt.receber([F.stockFixture(), F.purchaseFixture()]);
    const htmlAnalysis = rt.processar().analysis as Any[];
    const hc = rt.fn.contar(htmlAnalysis);
    check("KPIs = contar() do HTML", sixKpis.every((k) => Object.is(hc[k] ?? 0, dbKpis[k])));

    const all = await getCurrentMrpBuyListing({ q: "", status: "all", area: "", family: "", sort: "need" }, 100_000);
    const byCode = new Map(htmlAnalysis.map((a) => [a.codigo, a]));
    check(
      "situação e observação de cada linha = bgStatus()/obsDe() do HTML",
      !!all && all.items.length === htmlAnalysis.length && all.items.every((it) => {
        const h = byCode.get(it.code);
        return !!h && strip(rt.fn.bgStatus(h)) === it.situation && rt.fn.obsDe(h) === it.observation && it.situation === mrpSituation(it).label;
      })
    );

    let combos = 0;
    let diverg = 0;
    const families = all!.families;
    for (const status of MRP_BUY_STATUS_FILTERS) {
      for (const sort of MRP_BUY_SORTS) {
        for (const v of [{}, { area: "Elétrica" }, { family: families[0] ?? "" }, { q: "1885-0125" }, { q: "breton" }] as Partial<MrpBuyFilters>[]) {
          const f: MrpBuyFilters = { q: "", area: "", family: "", ...v, status, sort };
          rt.fn.setValue("fQ", f.q);
          rt.fn.setValue("fStatus", status === "all" ? "" : status);
          rt.fn.setValue("fArea", f.area);
          rt.fn.setValue("fFam", f.family);
          rt.fn.setValue("fSort", sort);
          const h = rt.fn.filtrarCompra() as Any[];
          const api = await getCurrentMrpBuyListing(f, 100_000);
          combos++;
          const same = api!.items.map((i) => i.code).join("|") === h.map((a) => a.codigo).join("|") && api!.filteredCount === h.length;
          if (!same) {
            diverg++;
            console.log(`    ✗ status=${status} sort=${sort} ${JSON.stringify(v)}: HTML ${h.length} x API ${api!.filteredCount}`);
          }
        }
      }
    }
    check(`ordem da API = ordem do HTML em ${combos} combinações`, diverg === 0, `${diverg} divergência(s)`);

    const def = await getCurrentMrpBuyListing({ q: "", status: "need", area: "", family: "", sort: "need" });
    check("filtro padrão = Precisa comprar (só Comprar + Verificar)", !!def && def.items.every((i) => i.status === "Comprar" || i.status === "Verificar") && def.filteredCount === hc.Comprar + hc.Verificar);
    const p200 = await getCurrentMrpBuyListing({ q: "", status: "all", area: "", family: "", sort: "need" }, 200);
    const p600 = await getCurrentMrpBuyListing({ q: "", status: "all", area: "", family: "", sort: "need" }, 600);
    const p1000 = await getCurrentMrpBuyListing({ q: "", status: "all", area: "", family: "", sort: "need" }, 1000);
    const codes = [p200!, p600!, p1000!].map((p) => p.items.map((i) => i.code));
    check("paginação 200 → 600 → 1000, prefixos, sem duplicar", codes[0].length === 200 && codes[1].length === 600 && codes[2].length === 1000 && codes[1].slice(0, 200).join() === codes[0].join() && codes[2].slice(0, 600).join() === codes[1].join() && new Set(codes[2]).size === 1000 && p1000!.hasMore);
    check("sugerida do filtro ≠ KPI global (soma só do filtro)", def!.suggestedFiltered <= dbKpis.qtd && Number.isFinite(def!.suggestedFiltered));

    console.log("\n   Consultas");
    clearMrpBuyListingCache();
    queryCounter.reset();
    const pageSummary = await getCurrentMrpAnalysisSummary();
    await getCurrentMrpBuyListing({ q: "", status: "need", area: "", family: "", sort: "need" });
    await getActiveMrpBaseVersion();
    await getMrpDefaultDeposit();
    const pageQueries = queryCounter.value;
    queryCounter.reset();
    await getCurrentMrpBuyListing({ q: "rolamento", status: "all", area: "Mecânica", family: "", sort: "qtd" });
    const filterQueries = queryCounter.value;
    console.log(`    abrir a página (dados do módulo): ${pageQueries} consultas · aplicar um filtro: ${filterQueries} consulta(s)`);
    check("abrir a página: consultas constantes (não por material)", !!pageSummary && pageQueries <= 10, String(pageQueries));
    check("aplicar filtro: 1 consulta (itens do run em cache)", filterQueries === 1, String(filterQueries));

    console.log("\n1b. Áreas & Conjuntos (FASE F) sobre o run gravado");
    clearMrpBuyListingCache();
    queryCounter.reset();
    const areasCold = await getMrpAreasSummary(run1.id);
    const areasColdQueries = queryCounter.value;
    queryCounter.reset();
    await getCurrentMrpBuyListing({ q: "", status: "need", area: "", family: "", sort: "need" });
    const areasWarm = await getMrpAreasSummary(run1.id);
    const warmQueries = queryCounter.value;
    console.log(`    consultas: resumo das áreas com cache frio ${areasColdQueries} · lista + áreas com cache quente ${warmQueries}`);
    check("áreas: 1 consulta (itens do run) e 0 extra com o cache da lista", areasColdQueries === 1 && warmQueries === 1 && areasWarm.queries === 0);
    const markup = rt.fn.renderAreasHtml();
    const htmlCards = [...parseCards(markup.area), ...parseCards(markup.fam)];
    const portalCards = [...areasCold.summary.areas, ...areasCold.summary.families, areasCold.summary.allFamilies];
    const cardDiff = portalCards.filter((c, i) => {
      const h = htmlCards[i];
      const s = c.summary;
      return !h || h.title !== c.title || h.tot !== fmtMrp(s.total) || h.Comprar !== fmtMrp(s.Comprar) || h.Verificar !== fmtMrp(s.Verificar) || h.Comprado !== fmtMrp(s.Comprado) || h.qtd !== fmtMrp(s.qtd) || h.target.area !== c.target.area || h.target.family !== c.target.family;
    });
    check(`cartões do run gravado = renderAreas() do HTML (${portalCards.length} cartões)`, cardDiff.length === 0 && htmlCards.length === portalCards.length, cardDiff.map((c) => c.title).join(", "));
    for (const card of [...areasCold.summary.areas, ...areasCold.summary.families]) {
      const list = await getCurrentMrpBuyListing({ q: "", status: "need", area: card.target.area, family: card.target.family, sort: "need" });
      check(`clique "${card.title}" → lista need com ${card.summary.Comprar + card.summary.Verificar} = Comprar + Verificar do cartão`, list!.filteredCount === card.summary.Comprar + card.summary.Verificar, String(list!.filteredCount));
    }
    const allFam = areasCold.summary.allFamilies;
    const generalNeed = await getCurrentMrpBuyListing({ q: "", status: "need", area: "", family: "", sort: "need" });
    check("Todos os conjuntos: números só dos itens com conjunto, clique = lista geral (legacy parity behavior)",
      allFam.summary.total === all!.items.filter((i) => i.family).length && allFam.summary.total < all!.totalCount && allFam.target.area === "" && allFam.target.family === "" && generalNeed!.filteredCount === hc.Comprar + hc.Verificar);

    console.log("\n2. Atualizar tudo com planilha do MRP nova");
    const r2 = await updateAllMrp({
      items: [await openHistory("base", F.baseFixture(), "MRP Analise manutenção"), await openHistory("est", F.stockFixture(), "Sheet1"), await openHistory("cmp", F.purchaseFixture(), "Compras")],
      depositFilter: "1400",
      userId: TAG,
      download
    });
    const active2 = await getActiveMrpBaseVersion();
    const run2 = await prisma.mrpAnalysisRun.findUniqueOrThrow({ where: { id: r2.analysis.runId } });
    check("base nova ativada junto com o run", active2?.id === r2.imported.baseVersionId && run2.isCurrent && run2.baseVersionId === active2?.id);
    check("seed inativa e run anterior não vigente (ambos preservados)", !(await prisma.mrpBaseVersion.findUniqueOrThrow({ where: { id: seed.id } })).isActive && !(await prisma.mrpAnalysisRun.findUniqueOrThrow({ where: { id: run1.id } })).isCurrent);
    check("tela passa a mostrar a análise nova (8 materiais)", (await getCurrentMrpAnalysisSummary())?.kpis.total === 8);
    const areas2 = await getMrpAreasSummary(run2.id);
    check("Áreas & Conjuntos reflete o NOVO run (sem cache da análise anterior)", areas2.summary.areas[2].summary.total === 8 && areas2.summary.families.length === 5);

    console.log("\n3. Falha na análise (depois da importação)");
    let msg = "";
    try {
      await updateAllMrp({
        items: [await openHistory("base", F.baseFixture(), "MRP Analise manutenção"), await openHistory("est", F.stockFixture(), "Sheet1"), await openHistory("cmp", F.purchaseFixture(), "Compras")],
        depositFilter: "1400",
        userId: TAG,
        download,
        hooks: { beforeAnalysisCommit: async () => { throw new Error("falha simulada na análise"); } }
      });
    } catch (error) {
      msg = (error as Error).message;
    }
    check("erro propagado", msg === "falha simulada na análise", msg);
    check("análise anterior continua vigente", (await prisma.mrpAnalysisRun.findFirst({ where: { isCurrent: true } }))?.id === run2.id);
    check("base anterior continua ativa (a nova NÃO foi ativada)", (await getActiveMrpBaseVersion())?.id === active2?.id);
    check("tela continua mostrando a análise anterior", (await getCurrentMrpAnalysisSummary())?.runId === run2.id);
  } finally {
    await prisma.mrpAnalysisRun.updateMany({ where: { createdBy: TAG }, data: { isCurrent: false } });
    if (priorCurrent) await setCurrentMrpAnalysisRun(priorCurrent.id);
    if ((await getActiveMrpBaseVersion())?.id !== seed.id) await activateMrpBaseVersion(seed.id);
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
    check("Base MRP ativa original restaurada", (await getActiveMrpBaseVersion())?.id === seed.id);
    check("análise vigente original preservada", (await prisma.mrpAnalysisRun.findFirst({ where: { isCurrent: true }, select: { id: true } }))?.id === priorCurrent?.id);
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
