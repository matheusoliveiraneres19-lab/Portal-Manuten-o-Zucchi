/**
 * ANÁLISE MRP (FASE I) — aba BASE MRP no nível de serviço, com banco.
 *
 *   npm run test:mrp-base-db -- --direct
 *
 *   0. base exibida = base inicial (SEED_HTML 4.280 / 3.485 / 795); consultas frio/quente;
 *   1. sem análise vigente: enviar base só grava e ativa; restaurar só ativa a seed;
 *   2. snapshot: base ativa B ≠ base do run A → tela mostra A + aviso;
 *   3. nova base COM análise: BASE_REIMPORT, mesmo estoque e mesmas compras,
 *      base + run novos vigentes juntos, run anterior preservado;
 *   4. falha na análise: base e análise anteriores continuam vigentes;
 *   5. restaurar base inicial: BASE_RESTORE, seed reaproveitada (sem duplicar);
 *      restaurar de novo = nada muda; falha na restauração = nada muda.
 *
 * Grava só em tabelas MRP (+ ImportHistory/ImportStagingRow), tudo marcado e
 * apagado no fim; Base MRP ativa e análise vigente anteriores são restauradas.
 */
import "./force-utc";
import { SCRIPT_DB_MODE, connectWithRetry } from "./script-db";
import { queryCounter } from "./counting-prisma";
import { ImportStatus, ImportType } from "@prisma/client";
import { prisma } from "../../src/lib/prisma";
import type { MrpFileKind } from "../../src/lib/mrp/types";
import { confirmMrpImport } from "../../src/services/mrp-import.service";
import { activateMrpBaseVersion, getActiveMrpBaseVersion, setCurrentMrpAnalysisRun } from "../../src/services/mrp-persistence.service";
import { updateAllMrp } from "../../src/services/mrp-update.service";
import { clearMrpBaseViewCache, getCurrentMrpBaseListing, getMrpBaseListing, getMrpBaseView } from "../../src/services/mrp-base-view.service";
import { getMrpSeedBaseVersion, replaceMrpBaseFromImport, restoreMrpSeedBase } from "../../src/services/mrp-base-admin.service";
import { IMPORT_STAGES } from "../../src/types/imports";
import * as F from "./fixtures";

const settle = () => new Promise((r) => setTimeout(r, 100));
const TAG = "scripts/mrp/test-mrp-base-db.ts";
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
const baseHistory = () => openHistory("base", F.baseFixture(), "MRP Analise manutenção");
const current = () => prisma.mrpAnalysisRun.findFirst({ where: { isCurrent: true } });
const failHook = { beforeAnalysisCommit: async () => { throw new Error("falha simulada na análise"); } };

async function main() {
  console.log(`Banco: ${SCRIPT_DB_MODE} (connection_limit=1)`);
  await connectWithRetry(prisma, { label: "teste da aba Base MRP" });
  const seed = await getMrpSeedBaseVersion();
  if (!seed) throw new Error("Sem versão SEED_HTML.");
  const priorActive = await getActiveMrpBaseVersion();
  const priorCurrent = await prisma.mrpAnalysisRun.findFirst({ where: { isCurrent: true }, select: { id: true } });
  const seedCountBefore = await prisma.mrpBaseVersion.count({ where: { source: "SEED_HTML" } });

  try {
    console.log("\n0. Base inicial exibida");
    const seedListing = await getMrpBaseListing(seed.id, { q: "", area: "", filter: "all" }, 200);
    const seedView = await getMrpBaseView();
    if (!priorCurrent && priorActive?.id === seed.id) {
      check("sem análise: exibe a base ATIVA (seed)", seedView?.version.id === seed.id && seedView.origin === "active" && !seedView.activeDiffers);
      const s = seedView!.summary;
      check("resumo: 4.280 · Mecânica 3.485 · Elétrica 795", s.total === 4280 && s.mechanical === 3485 && s.electrical === 795, JSON.stringify(s));
      check("origem = Base inicial do sistema (SEED_HTML)", seedView!.version.source === "SEED_HTML");
    } else console.log(`  (estado real: análise vigente ${priorCurrent?.id ?? "-"} / base ativa ${priorActive?.id ?? "-"} — checagem do estado inicial pulada)`);
    check("tabela da seed: 200 primeiras de 4.280, hasMore", seedListing!.items.length === 200 && seedListing!.total === 4280 && seedListing!.hasMore);

    clearMrpBaseViewCache();
    await settle();
    queryCounter.reset();
    await getMrpBaseView();
    await getCurrentMrpBaseListing({ q: "", area: "", filter: "all" });
    await settle();
    const cold = queryCounter.value;
    queryCounter.reset();
    await getMrpBaseView();
    await getCurrentMrpBaseListing({ q: "rolamento", area: "Mecânica", filter: "semparam" });
    await settle();
    const warm = queryCounter.value;
    console.log(`    abrir a aba (frio): ${cold} consultas · com cache (resumo + filtro): ${warm} consultas`);
    check("frio: consultas constantes (não por material)", cold <= 6, String(cold));
    check("quente: só resolve run/base ativa (4 = 2 + 2)", warm <= 4, String(warm));

    console.log("\n1. Sem análise vigente");
    let versionB: string;
    if (priorCurrent) {
      console.log("  (já existe análise vigente real — fluxo sem análise pulado)");
      versionB = (await confirmMrpImport({ items: [await baseHistory()], activateBase: false, createdBy: TAG, download })).baseVersionId!;
    } else {
      const r = await replaceMrpBaseFromImport({ importId: (await baseHistory()).importId, userId: TAG, download });
      versionB = r.baseVersionId;
      check("enviar base: grava e ATIVA, sem análise nova", r.analysis === null && (await getActiveMrpBaseVersion())?.id === r.baseVersionId && !(await current()));
      const v = await getMrpBaseView();
      check("tela mostra a base nova (8 materiais, planilha enviada)", v?.version.id === r.baseVersionId && v.summary.total === 8 && v.version.source !== "SEED_HTML" && v.origin === "active");
      const rs = await restoreMrpSeedBase({ userId: TAG });
      check("restaurar sem análise: só ativa a seed", rs.analysis === null && !rs.unchanged && (await getActiveMrpBaseVersion())?.id === seed.id);
      check("restaurar de novo: nada muda", !!(await restoreMrpSeedBase({ userId: TAG })).unchanged);
    }

    console.log("\n2. Snapshot: base ativa ≠ base da análise vigente");
    const r1 = await updateAllMrp({
      items: [await openHistory("est", F.stockFixture(), "Sheet1"), await openHistory("cmp", F.purchaseFixture(), "Compras")],
      depositFilter: "1400",
      userId: TAG,
      download
    });
    const run1 = await prisma.mrpAnalysisRun.findUniqueOrThrow({ where: { id: r1.analysis.runId } });
    const run1Base = run1.baseVersionId;
    await activateMrpBaseVersion(versionB);
    const mis = await getMrpBaseView();
    check("mostra a base do RUN (A), não a ativa (B)", mis?.version.id === run1Base && mis.origin === "run" && mis.activeVersionId === versionB);
    check("aviso: base ativa diferente", mis?.activeDiffers === true);
    check("tabela também é a da base do run", (await getCurrentMrpBaseListing({ q: "", area: "", filter: "all" }))?.versionId === run1Base);
    await activateMrpBaseVersion(run1Base);
    check("base ativa = base do run → sem aviso", (await getMrpBaseView())?.activeDiffers === false);

    console.log("\n3. Nova base COM análise vigente (BASE_REIMPORT)");
    const r2 = await replaceMrpBaseFromImport({ importId: (await baseHistory()).importId, userId: TAG, download });
    const run2 = await prisma.mrpAnalysisRun.findUniqueOrThrow({ where: { id: r2.analysis!.runId } });
    check("run novo BASE_REIMPORT vigente com a base nova", run2.isCurrent && run2.trigger === "BASE_REIMPORT" && run2.baseVersionId === r2.baseVersionId);
    check("MESMO estoque e MESMAS compras do run anterior", run2.stockImportId === run1.stockImportId && run2.purchaseImportId === run1.purchaseImportId && run2.depositFilter === run1.depositFilter);
    check("base nova ativa; run anterior preservado e não vigente", (await getActiveMrpBaseVersion())?.id === r2.baseVersionId && !(await prisma.mrpAnalysisRun.findUniqueOrThrow({ where: { id: run1.id } })).isCurrent);
    const v2 = await getMrpBaseView();
    check("tela mostra a base nova (8 materiais) sem aviso", v2?.version.id === r2.baseVersionId && v2.summary.total === 8 && !v2.activeDiffers && (run2.kpis as { total?: number }).total === 8);

    console.log("\n4. Falha na análise ao trocar a base");
    let msg = "";
    const versionsBefore = await prisma.mrpBaseVersion.count({ where: { createdBy: TAG } });
    try {
      await replaceMrpBaseFromImport({ importId: (await baseHistory()).importId, userId: TAG, download, hooks: failHook });
    } catch (error) {
      msg = (error as Error).message;
    }
    check("erro propagado", msg === "falha simulada na análise", msg);
    check("análise anterior continua vigente", (await current())?.id === run2.id);
    check("base anterior continua ativa (a nova NÃO foi ativada)", (await getActiveMrpBaseVersion())?.id === r2.baseVersionId);
    check("versão nova fica só no histórico, inativa", (await prisma.mrpBaseVersion.count({ where: { createdBy: TAG } })) === versionsBefore + 1);
    check("tela continua na base anterior", (await getMrpBaseView())?.version.id === r2.baseVersionId);

    console.log("\n5. Restaurar base inicial (BASE_RESTORE)");
    msg = "";
    try {
      await restoreMrpSeedBase({ userId: TAG, hooks: failHook });
    } catch (error) {
      msg = (error as Error).message;
    }
    const afterFail = { current: (await current())?.id, active: (await getActiveMrpBaseVersion())?.id };
    check("falha na restauração: nada muda", msg === "falha simulada na análise" && afterFail.current === run2.id && afterFail.active === r2.baseVersionId, JSON.stringify({ msg, ...afterFail, run2: run2.id, base2: r2.baseVersionId }));
    const r3 = await restoreMrpSeedBase({ userId: TAG });
    const run3 = await prisma.mrpAnalysisRun.findUniqueOrThrow({ where: { id: r3.analysis!.runId } });
    check("run BASE_RESTORE vigente com a seed", run3.isCurrent && run3.trigger === "BASE_RESTORE" && run3.baseVersionId === seed.id);
    check("MESMO estoque e MESMAS compras", run3.stockImportId === run1.stockImportId && run3.purchaseImportId === run1.purchaseImportId);
    check("seed ativa; seed reaproveitada (sem nova versão SEED_HTML)", (await getActiveMrpBaseVersion())?.id === seed.id && (await prisma.mrpBaseVersion.count({ where: { source: "SEED_HTML" } })) === seedCountBefore);
    const v3 = await getMrpBaseView();
    check("tela mostra a base inicial 4.280 sem aviso", v3?.version.id === seed.id && v3.summary.total === 4280 && !v3.activeDiffers && (run3.kpis as { total?: number }).total === 4280);
    check("restaurar de novo: nada muda", !!(await restoreMrpSeedBase({ userId: TAG })).unchanged && (await current())?.id === run3.id);
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
    if (priorActive && (await getActiveMrpBaseVersion())?.id !== priorActive.id) await activateMrpBaseVersion(priorActive.id);
    await retry(() => prisma.mrpAnalysisRun.deleteMany({ where: { createdBy: TAG } }));
    await retry(() => prisma.mrpStockImport.deleteMany({ where: { createdBy: TAG } }));
    await retry(() => prisma.mrpPurchaseImport.deleteMany({ where: { createdBy: TAG } }));
    await retry(() => prisma.mrpBaseVersion.deleteMany({ where: { createdBy: TAG, isActive: false } }));
    await retry(() => prisma.importHistory.deleteMany({ where: { importedBy: TAG } }));
    clearMrpBaseViewCache();
    const left =
      (await prisma.mrpAnalysisRun.count({ where: { createdBy: TAG } })) +
      (await prisma.mrpStockImport.count({ where: { createdBy: TAG } })) +
      (await prisma.mrpPurchaseImport.count({ where: { createdBy: TAG } })) +
      (await prisma.mrpBaseVersion.count({ where: { createdBy: TAG } })) +
      (await prisma.importHistory.count({ where: { importedBy: TAG } }));
    console.log("\nLimpeza");
    check("nenhum registro de teste restante", left === 0, String(left));
    check("Base MRP ativa original restaurada", (await getActiveMrpBaseVersion())?.id === priorActive?.id);
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
