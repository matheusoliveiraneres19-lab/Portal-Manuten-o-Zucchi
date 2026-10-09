/**
 * ANÁLISE MRP (FASE J) — exportações Excel no nível de serviço, com banco.
 *
 *   npm run test:mrp-export-db -- --direct
 *
 *   0. sem análise vigente: exportações da análise recusam ("Gere a análise
 *      primeiro."); Excel da base usa a base ativa;
 *   1. run vigente (fixtures): o .xlsx de cada tipo é relido e comparado com a
 *      API da tela (mesma ordem, linha a linha) e com as regras do HTML;
 *   2. snapshot: compras mais NOVAS importadas depois do run e base ativa
 *      diferente NÃO entram — a exportação usa o run vigente e a base do run;
 *   3. consultas com cache frio e quente por tipo.
 *
 * Grava só em tabelas MRP (+ ImportHistory/ImportStagingRow), tudo marcado e
 * apagado no fim; Base MRP ativa e análise vigente anteriores são restauradas.
 */
import "./force-utc";
import { SCRIPT_DB_MODE, connectWithRetry } from "./script-db";
import { queryCounter } from "./counting-prisma";
import * as XLSX from "xlsx";
import { ImportStatus, ImportType } from "@prisma/client";
import { prisma } from "../../src/lib/prisma";
import type { MrpFileKind } from "../../src/lib/mrp/types";
import { MRP_EXPORT_TYPES, mrpExportLine, type MrpExportType } from "../../src/lib/mrp/export";
import { buildMrpExport, exportMrp, type MrpExportParams } from "../../src/services/mrp-export.service";
import { clearMrpBuyListingCache, getCurrentMrpBuyListing, getMrpRunItemsCached } from "../../src/services/mrp-listing.service";
import { clearMrpTransitCache, getMrpTransitGroups } from "../../src/services/mrp-transit.service";
import { clearMrpBaseViewCache, getCurrentMrpBaseListing, getMrpBaseView } from "../../src/services/mrp-base-view.service";
import { getCurrentMrpIdleListing } from "../../src/services/mrp-idle.service";
import { confirmMrpImport } from "../../src/services/mrp-import.service";
import { activateMrpBaseVersion, getActiveMrpBaseVersion, setCurrentMrpAnalysisRun } from "../../src/services/mrp-persistence.service";
import { updateAllMrp } from "../../src/services/mrp-update.service";
import { IMPORT_STAGES } from "../../src/types/imports";
import * as F from "./fixtures";

type Any = any; // eslint-disable-line @typescript-eslint/no-explicit-any
const settle = () => new Promise((r) => setTimeout(r, 100));
const TAG = "scripts/mrp/test-mrp-export-db.ts";
let failures = 0;
function check(label: string, ok: boolean, detail = "") {
  if (!ok) failures++;
  console.log(`  ${ok ? "✓" : "✗"} ${label}${detail ? `  — ${detail}` : ""}`);
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

const DEFAULTS: MrpExportParams = {
  buy: { q: "", status: "need", area: "", family: "", sort: "need" },
  idle: { q: "", type: "com", area: "" },
  base: { q: "", area: "", filter: "all" }
};
const readXlsx = (data: Buffer) => {
  const wb = XLSX.read(data, { type: "buffer" });
  return { names: wb.SheetNames, rows: wb.SheetNames.map((n) => XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[n], { header: 1, raw: true, defval: "" })), wb };
};

async function main() {
  console.log(`Banco: ${SCRIPT_DB_MODE} (connection_limit=1)`);
  await connectWithRetry(prisma, { label: "teste das exportações MRP" });
  const priorActive = await getActiveMrpBaseVersion();
  if (!priorActive) throw new Error("Sem Base MRP ativa.");
  const priorCurrent = await prisma.mrpAnalysisRun.findFirst({ where: { isCurrent: true }, select: { id: true } });

  try {
    console.log("\n0. Sem análise vigente");
    if (priorCurrent) console.log("  (já existe análise vigente real — verificação pulada)");
    else {
      const msgs = await Promise.all((["buy", "buy-by-area", "families", "idle", "transit"] as MrpExportType[]).map(async (t) => (await exportMrp(t, DEFAULTS)) as Any));
      check('Lista/Por área/Conjuntos/Parado/Compras: "Gere a análise primeiro." (sem arquivo)', msgs.every((m) => !m.ok && m.message === "Gere a análise primeiro."));
      const b = await exportMrp("base", DEFAULTS);
      check("Excel da base usa a base ATIVA", b.ok && b.baseVersionId === priorActive.id && b.rows === priorActive.materialCount, b.ok ? `${b.rows} linhas` : b.message);
    }

    console.log("\n1. Run vigente (fixtures) — Excel x API da tela");
    const r1 = await updateAllMrp({
      items: [await openHistory("est", F.stockFixture(), "Sheet1"), await openHistory("cmp", F.purchaseFixture(), "Compras")],
      depositFilter: "1400",
      userId: TAG,
      download
    });
    const run = await prisma.mrpAnalysisRun.findUniqueOrThrow({ where: { id: r1.analysis.runId } });

    const now = new Date("2026-10-08T15:00:00Z");
    for (const status of ["need", "all", "Comprado"] as const) {
      for (const v of [{}, { area: "Elétrica" }, { q: "rolamento" }]) {
        const buy = { ...DEFAULTS.buy, ...v, status };
        const file = await exportMrp("buy", { ...DEFAULTS, buy }, now);
        const api = await getCurrentMrpBuyListing(buy, 100_000);
        if (!file.ok) {
          check(`lista status=${status} ${JSON.stringify(v)}: sem linhas → mensagem (API ${api!.filteredCount})`, api!.filteredCount === 0 && file.message === "Nada para exportar.");
          continue;
        }
        const x = readXlsx(file.data);
        const expected = api!.items.map((i) => mrpExportLine(i));
        const same = x.names.join() === "Lista de compra" && JSON.stringify(x.rows[0].slice(1)) === JSON.stringify(expected);
        check(`lista status=${status} ${JSON.stringify(v)}: ${file.fileName} = API da tela (${api!.filteredCount} linhas, mesma ordem, 12 colunas)`, same && file.fileName === "Lista_Compra_MRP_20261008.xlsx" && file.runId === run.id);
      }
    }
    const byArea = await exportMrp("buy-by-area", { ...DEFAULTS, buy: { ...DEFAULTS.buy, status: "all" } });
    if (byArea.ok) {
      const x = readXlsx(byArea.data);
      const mec = await getCurrentMrpBuyListing({ ...DEFAULTS.buy, status: "all", area: "Mecânica" }, 100_000);
      check(`Por área: abas ${x.names.join(" + ")}; Mecânica = API com área Mecânica`, x.names[0] === "Mecânica" && x.rows[0].length - 1 === mec!.filteredCount);
    } else check("Por área", false, byArea.message);
    const byAreaEle = await exportMrp("buy-by-area", { ...DEFAULTS, buy: { ...DEFAULTS.buy, status: "all", area: "Elétrica" } });
    check("Por área com área=Elétrica na tela: só a aba Elétrica", byAreaEle.ok && byAreaEle.sheets.join() === "Elétrica");

    const fam = await exportMrp("families", { ...DEFAULTS, buy: { ...DEFAULTS.buy, q: "zzz-nada" } });
    const items = (await getMrpRunItemsCached(run.id)).rows;
    check(`Conjuntos ignora a busca de Comprar: ${fam.ok ? fam.sheets.join(" · ") : "-"}`, fam.ok && fam.rows === items.filter((i) => i.family).length && fam.fileName.startsWith("Satelites_Coroas_"));

    const idle = await exportMrp("idle", { ...DEFAULTS, idle: { q: "", type: "all", area: "" } });
    const idleApi = await getCurrentMrpIdleListing({ q: "", type: "all", area: "" }, 100_000);
    if (idle.ok) {
      const x = readXlsx(idle.data);
      check(`Estoque parado: aba "Sem movimentacao", 12 colunas, ${idleApi!.filteredCount} linhas na ordem da tela`, x.names.join() === "Sem movimentacao" && x.rows[0][0].length === 12 && x.rows[0].slice(1).map((r) => String(r[0])).join() === idleApi!.items.map((i) => i.code).join());
    } else check("Estoque parado", false, idle.message);

    const tr = await exportMrp("transit", DEFAULTS);
    const { groups } = await getMrpTransitGroups(run.id, run.purchaseImportId);
    if (tr.ok) {
      const x = readXlsx(tr.data);
      check(`Compras: ${groups.length} grupos (todos), ordem de 1ª aparição, aba "Compras"`, x.names.join() === "Compras" && x.rows[0].slice(1).map((r) => String(r[0])).join() === groups.map((g) => g.code).join());
      const fora = x.rows[0].slice(1).filter((r) => r[2] === "fora da base");
      check(`fora da base (${fora.length}) com o texto da última compra`, fora.length === groups.filter((g) => !g.inBase).length && fora.every((r) => groups.find((g) => g.code === r[0])!.text === r[1]));
    } else check("Compras", false, tr.message);

    const base = await exportMrp("base", { ...DEFAULTS, base: { q: "", area: "Elétrica", filter: "semparam" } });
    const baseApi = await getCurrentMrpBaseListing({ q: "", area: "Elétrica", filter: "semparam" }, 100_000);
    if (base.ok) {
      const x = readXlsx(base.data);
      check(`Excel da base: aba "Base MRP", 9 colunas, ${baseApi!.filteredCount} linhas = aba (Elétrica + sem mín/máx)`, x.names.join() === "Base MRP" && x.rows[0][0].length === 9 && x.rows[0].slice(1).map((r) => String(r[0])).join() === baseApi!.items.map((i) => i.code).join() && base.baseVersionId === run.baseVersionId);
    } else check("Excel da base", false, base.message);

    console.log("\n2. Snapshot");
    // Compras mais novas importadas (sem nova análise) e base ativa diferente.
    const newer = await confirmMrpImport({ items: [await openHistory("est", F.stockFixture(), "Sheet1"), await openHistory("cmp", F.purchaseFixture(), "Compras")], depositFilter: "1400", createdBy: TAG, download });
    const otherBase = await confirmMrpImport({ items: [await openHistory("base", F.baseFixture(), "MRP Analise manutenção")], activateBase: true, createdBy: TAG, download });
    check("existe importação de estoque/compras mais nova que a do run", !!newer.purchaseImportId && newer.purchaseImportId !== run.purchaseImportId && newer.stockImportId !== run.stockImportId);
    const tr2 = await buildMrpExport("transit", DEFAULTS);
    check("Compras usa a importação DO RUN (não a mais nova)", tr2.result.ok && tr2.runId === run.id && tr2.result.spec.sheets[0].rows.length - 1 === groups.length);
    check("base ativa ≠ base do run → aba mostra a do run", (await getMrpBaseView())?.activeDiffers === true && (await getActiveMrpBaseVersion())?.id === otherBase.baseVersionId);
    const b2 = await exportMrp("base", DEFAULTS);
    check("Excel da base = base exibida (a do run, 4.280), nunca a ativa (8)", b2.ok && b2.baseVersionId === run.baseVersionId && b2.rows === 4280, b2.ok ? `${b2.rows}` : b2.message);
    await activateMrpBaseVersion(run.baseVersionId);

    console.log("\n3. Consultas e tempo por exportação");
    for (const t of MRP_EXPORT_TYPES) {
      clearMrpBuyListingCache();
      clearMrpTransitCache();
      clearMrpBaseViewCache();
      await settle();
      queryCounter.reset();
      const cold = await exportMrp(t, { ...DEFAULTS, buy: { ...DEFAULTS.buy, status: "all" }, idle: { ...DEFAULTS.idle, type: "all" } });
      await settle();
      const qCold = queryCounter.value;
      queryCounter.reset();
      const warm = await exportMrp(t, { ...DEFAULTS, buy: { ...DEFAULTS.buy, status: "all" }, idle: { ...DEFAULTS.idle, type: "all" } });
      await settle();
      const qWarm = queryCounter.value;
      const ok = cold.ok && warm.ok;
      console.log(`    ${t}: frio ${qCold} consultas · quente ${qWarm} · ${ok && cold.ok ? `${cold.rows} linhas · ${(cold.data.length / 1024).toFixed(1)} KB · ${cold.ms} ms frio / ${warm.ok ? warm.ms : "-"} ms quente` : (cold as Any).message}`);
      check(`${t}: consultas constantes (frio ≤ 4, quente ≤ 2)`, qCold <= 4 && qWarm <= 2, `${qCold}/${qWarm}`);
    }
  } finally {
    const retry = async (fn: () => Promise<unknown>) => {
      for (let i = 0; ; i++) {
        try {
          return await fn();
        } catch (error) {
          if (i >= 3) throw error;
          console.log(`  (limpeza: nova tentativa — ${(error as Error).message.split("\n").pop()})`);
        }
      }
    };
    await prisma.mrpAnalysisRun.updateMany({ where: { createdBy: TAG }, data: { isCurrent: false } });
    if (priorCurrent) await setCurrentMrpAnalysisRun(priorCurrent.id);
    if ((await getActiveMrpBaseVersion())?.id !== priorActive.id) await activateMrpBaseVersion(priorActive.id);
    await retry(() => prisma.mrpAnalysisRun.deleteMany({ where: { createdBy: TAG } }));
    await retry(() => prisma.mrpStockImport.deleteMany({ where: { createdBy: TAG } }));
    await retry(() => prisma.mrpPurchaseImport.deleteMany({ where: { createdBy: TAG } }));
    await retry(() => prisma.mrpBaseVersion.deleteMany({ where: { createdBy: TAG, isActive: false } }));
    await retry(() => prisma.importHistory.deleteMany({ where: { importedBy: TAG } }));
    const left =
      (await prisma.mrpAnalysisRun.count({ where: { createdBy: TAG } })) +
      (await prisma.mrpStockImport.count({ where: { createdBy: TAG } })) +
      (await prisma.mrpPurchaseImport.count({ where: { createdBy: TAG } })) +
      (await prisma.mrpBaseVersion.count({ where: { createdBy: TAG } })) +
      (await prisma.importHistory.count({ where: { importedBy: TAG } }));
    console.log("\nLimpeza");
    check("nenhum registro de teste restante", left === 0, String(left));
    check("Base MRP ativa original restaurada", (await getActiveMrpBaseVersion())?.id === priorActive.id);
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
