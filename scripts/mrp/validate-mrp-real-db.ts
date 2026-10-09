/**
 * ANÁLISE MRP (FASE K) — validação com os ARQUIVOS REAIS no banco (serviços).
 *
 *   npx tsx scripts/mrp/validate-mrp-real-db.ts --direct --setup
 *   (UI: npx tsx scripts/mrp/e2e-mrp-real.ts --direct)
 *   npx tsx scripts/mrp/validate-mrp-real-db.ts --direct --cleanup
 *
 * --setup:
 *   1. antes: locks MRP, importações presas, runs incompletos, contagens;
 *   2. inspect (por arquivo) → preview → "Atualizar tudo" com os 3 arquivos
 *      reais, depósito 1000 — tempos de cada etapa e do motor;
 *   3. o run GRAVADO (Decimal) relido do banco = análise do HTML original sobre
 *      os mesmos arquivos (item a item) e KPIs = contar();
 *   4. telas: tempo e consultas com cache frio/quente;
 *   5. rollback: nova atualização com os mesmos arquivos e falha forçada na
 *      análise → run, base e fontes anteriores continuam vigentes;
 *   6. depois: locks / importações presas / runs incompletos.
 *   O run real fica vigente para o teste de tela; o estado anterior é salvo.
 * --cleanup: restaura base ativa e run vigente anteriores e remove só o que esta
 *   validação criou (createdBy/importedBy = TAG). AuditLog não é apagado.
 *
 * Os arquivos são lidos do disco e entregues aos serviços por `download` — o
 * Storage do Supabase NÃO é usado aqui (a chave não existe nesta máquina).
 */
import "./force-utc";
import { SCRIPT_DB_MODE, connectWithRetry } from "./script-db";
import { queryCounter } from "./counting-prisma";
import { existsSync, readFileSync, writeFileSync, unlinkSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import { prisma } from "../../src/lib/prisma";
import { countMrp, type MrpAnalysisResult } from "../../src/lib/mrp/analysis-engine";
import { inspectMrpUploads, previewMrpImport } from "../../src/services/mrp-import.service";
import { getCurrentMrpAnalysisSummary, getMrpAnalysisItems } from "../../src/services/mrp-analysis.service";
import { clearMrpBuyListingCache, getCurrentMrpBuyListing, getMrpAreasSummary } from "../../src/services/mrp-listing.service";
import { clearMrpTransitCache, getCurrentMrpTransitListing } from "../../src/services/mrp-transit.service";
import { getCurrentMrpIdleListing } from "../../src/services/mrp-idle.service";
import { clearMrpBaseViewCache, getCurrentMrpBaseListing, getMrpBaseView } from "../../src/services/mrp-base-view.service";
import { activateMrpBaseVersion, getActiveMrpBaseVersion, setCurrentMrpAnalysisRun } from "../../src/services/mrp-persistence.service";
import { updateAllMrp } from "../../src/services/mrp-update.service";
import { createHtmlRuntime } from "./html-runtime";
import { FIELDS, fromHtml } from "../test-mrp-engine";

type Any = any; // eslint-disable-line @typescript-eslint/no-explicit-any
export const TAG = "fase-k-validacao-real";
const STATE = join(tmpdir(), "mrp-fase-k-state.json");
const settle = () => new Promise((r) => setTimeout(r, 120));
let failures = 0;
function check(label: string, ok: boolean, detail = "") {
  if (!ok) failures++;
  console.log(`  ${ok ? "✓" : "✗"} ${label}${detail ? `  — ${detail}` : ""}`);
}
const show = (v: unknown) => JSON.stringify(v, (_k, x) => (typeof x === "number" && Object.is(x, -0) ? "-0" : x));

const FILES = {
  base: { name: "Controle_MRP_SAP_novo_analisado.xlsx", path: join(homedir(), "OneDrive - granitozucchi.com.br", "Manutenção - Documentos Manutenção", "Restrito", "Manutenção", "MRP Sap novo", "Controle_MRP_SAP_novo_analisado.xlsx") },
  est: { name: "estoque 0810.xlsx", path: join(homedir(), "Downloads", "estoque 0810.xlsx") },
  cmp: { name: "compras 0810.xlsx", path: join(homedir(), "Downloads", "compras 0810.xlsx") }
};
const MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

/** Locks, importações presas e runs incompletos. */
export async function healthCheck(label: string) {
  console.log(`\n${label}: locks / importações presas / runs incompletos`);
  const idleTx = await prisma.$queryRawUnsafe<{ n: number }[]>(`select count(*)::int n from pg_stat_activity where datname = current_database() and state like 'idle in transaction%' and pid <> pg_backend_pid()`);
  const mrpLocks = await prisma.$queryRawUnsafe<{ rel: string; mode: string; granted: boolean; state: string }[]>(
    `select l.relation::regclass::text rel, l.mode, l.granted, coalesce(a.state, '') state from pg_locks l join pg_stat_activity a on a.pid = l.pid where l.relation is not null and l.relation::regclass::text like '"Mrp%' and l.pid <> pg_backend_pid()`
  );
  const stuck = await prisma.importHistory.findMany({ where: { type: { in: ["MRP_BASE", "MRP_STOCK", "MRP_PURCHASES"] }, status: "EM_PROCESSAMENTO" }, select: { id: true, type: true, createdAt: true, importedBy: true } });
  const incomplete = await prisma.$queryRawUnsafe<{ id: string; total: number; items: number }[]>(
    `select r.id, coalesce((r.kpis->>'total')::int, -1) total, (select count(*)::int from "MrpAnalysisItem" i where i."runId" = r.id) items from "MrpAnalysisRun" r where coalesce((r.kpis->>'total')::int, -1) <> (select count(*)::int from "MrpAnalysisItem" i where i."runId" = r.id)`
  );
  const currents = await prisma.mrpAnalysisRun.count({ where: { isCurrent: true } });
  const actives = await prisma.mrpBaseVersion.count({ where: { isActive: true } });
  console.log(`    transações "idle in transaction": ${idleTx[0].n} · locks em tabelas MRP: ${mrpLocks.length}${mrpLocks.length ? ` ${show(mrpLocks)}` : ""}`);
  console.log(`    importações MRP em processamento: ${stuck.length}${stuck.length ? ` ${show(stuck.map((s) => ({ ...s, importedBy: s.importedBy === TAG ? TAG : "(outro)" })))}` : ""} · runs incompletos: ${incomplete.length} · runs vigentes: ${currents} · bases ativas: ${actives}`);
  return { idleTx: idleTx[0].n, mrpLocks: mrpLocks.length, stuck: stuck.length, incomplete: incomplete.length, currents, actives };
}

async function setup() {
  for (const f of Object.values(FILES)) if (!existsSync(f.path)) throw new Error(`ARQUIVOS REAIS NÃO ACESSÍVEIS: ${f.path}`);
  const data = Object.fromEntries(Object.entries(FILES).map(([k, f]) => [k, readFileSync(f.path)])) as Record<"base" | "est" | "cmp", Buffer>;
  const priorActive = await getActiveMrpBaseVersion();
  const priorCurrent = await prisma.mrpAnalysisRun.findFirst({ where: { isCurrent: true }, select: { id: true } });
  writeFileSync(STATE, JSON.stringify({ priorActive: priorActive?.id ?? null, priorCurrent: priorCurrent?.id ?? null }));
  const before = await healthCheck("ANTES");
  check("antes: nenhum lock/importação presa/run incompleto", before.mrpLocks === 0 && before.stuck === 0 && before.incomplete === 0 && before.currents <= 1 && before.actives === 1);

  // Arquivos "enviados": o download devolve o arquivo original do disco.
  const store = new Map<string, Buffer>();
  const ref = (k: "base" | "est" | "cmp") => {
    const path = `imports/analise-mrp/fase-k/${Date.now()}-${FILES[k].name}`;
    store.set(path, data[k]);
    return { fileName: FILES[k].name, filePath: path, bucket: "fase-k", fileSize: data[k].length, mimeType: MIME };
  };
  const download = async (path: string) => store.get(path)!;

  console.log("\n2. inspect → preview → Atualizar tudo (depósito 1000)");
  const times: Record<string, number> = {};
  const slots: Partial<Record<"base" | "est" | "cmp", string>> = {};
  for (const k of ["base", "est", "cmp"] as const) {
    const t = Date.now();
    const ins = await inspectMrpUploads({ files: [ref(k)], importedBy: TAG, currentSlots: slots, depositFilter: "1000", download });
    times[`inspect ${k}`] = Date.now() - t;
    const slot = (ins.slots as Any)[k];
    check(`inspect ${FILES[k].name}: detectado como ${k}`, !!slot, show(ins.rejected ?? null));
    if (slot) slots[k] = slot.importId;
  }
  for (const k of ["base", "est", "cmp"] as const) {
    const t = Date.now();
    const prev = await previewMrpImport({ importId: slots[k]!, kind: k, depositFilter: "1000", download });
    times[`preview ${k}`] = Date.now() - t;
    const p = (prev as Any).preview ?? prev;
    console.log(`    preview ${k}: ${show(k === "base" ? { materiais: p.base?.estimatedMaterials, abas: p.base?.compatibleSheets?.map((s: Any) => `${s.name}/${s.area}`), ignoradas: p.base?.ignoredSheets } : k === "est" ? p.stock ?? p.est ?? p : p.purchases ?? p.cmp ?? p).slice(0, 400)}`);
  }
  const t0 = Date.now();
  const r = await updateAllMrp({ items: [{ importId: slots.base!, kind: "base" }, { importId: slots.est!, kind: "est" }, { importId: slots.cmp!, kind: "cmp" }], depositFilter: "1000", userId: TAG, download });
  times["Atualizar tudo (confirm + motor + gravação)"] = Date.now() - t0;
  const m = r.analysis.metrics;
  console.log(`    tempos: ${Object.entries(times).map(([k, v]) => `${k} ${v} ms`).join(" · ")}`);
  console.log(`    análise: carga ${m.loadMs} ms · motor ${m.engineMs} ms · gravação ${m.persistMs} ms · total ${m.totalMs} ms · ${m.queries} consultas`);
  const run = await prisma.mrpAnalysisRun.findUniqueOrThrow({ where: { id: r.analysis.runId } });
  const active = await getActiveMrpBaseVersion();
  check("run real vigente com a base nova ativa (depósito 1000)", run.isCurrent && run.depositFilter === "1000" && active?.id === run.baseVersionId && run.trigger === "FULL_UPDATE");
  const imports = {
    stock: await prisma.mrpStockImport.findUniqueOrThrow({ where: { id: run.stockImportId } }),
    purchase: await prisma.mrpPurchaseImport.findUniqueOrThrow({ where: { id: run.purchaseImportId } }),
    base: await prisma.mrpBaseVersion.findUniqueOrThrow({ where: { id: run.baseVersionId } })
  };
  check(`fontes gravadas: base ${imports.base.materialCount} · estoque ${imports.stock.rowsAccepted} · compras ${imports.purchase.rowsAccepted}`, imports.base.materialCount === 4259 && imports.stock.rowsAccepted === 38 && imports.purchase.rowsAccepted === 1526);

  console.log("\n3. Run gravado (relido do banco) x HTML original");
  const rt = createHtmlRuntime();
  rt.setDeposit("1000");
  rt.receber([{ name: FILES.base.name, data: data.base }, { name: FILES.est.name, data: data.est }, { name: FILES.cmp.name, data: data.cmp }]);
  const st = rt.processar() as Any;
  const dbItems: MrpAnalysisResult[] = await getMrpAnalysisItems(run.id);
  let diverg = 0;
  const samples: string[] = [];
  (st.analysis as Any[]).forEach((h, i) => {
    const a = fromHtml(h);
    const p = dbItems[i];
    const bad = p ? FIELDS.filter((f) => !(typeof a[f] === "number" ? a[f] === p[f] : show(a[f]) === show(p[f]))) : ["ausente"];
    if (p && show(a.purchase) !== show(p.purchase)) bad.push("purchase" as Any);
    if (bad.length) {
      diverg++;
      if (samples.length < 5) samples.push(`${a.code}: ${bad.join(",")}`);
    }
  });
  check(`${dbItems.length} itens gravados = analysis do HTML, campo a campo (Decimal relido)`, diverg === 0 && dbItems.length === st.analysis.length && dbItems.length === 4259, samples.join(" | "));
  const ch = { ...rt.fn.contar(st.analysis) } as Any;
  const k = run.kpis as Any;
  check(`KPIs gravados = contar() do HTML: Comprar ${k.Comprar} · Verificar ${k.Verificar} · Comprado ${k.Comprado} · OK ${k.OK} · qtd ${k.qtd}`, ["total", "Comprar", "Verificar", "Comprado", "OK", "qtd", "semMov", "parado", "qtdParada"].every((x) => (ch[x] ?? 0) === k[x]));
  check("countMrp(itens relidos) = KPIs gravados", Object.entries(countMrp(dbItems)).every(([x, v]) => k[x] === v));

  console.log("\n4. Telas: tempo e consultas (cache frio / quente)");
  const measure = async (label: string, fn: () => Promise<unknown>) => {
    const out: string[] = [];
    for (const phase of ["frio", "quente"]) {
      if (phase === "frio") {
        clearMrpBuyListingCache();
        clearMrpTransitCache();
        clearMrpBaseViewCache();
      }
      await settle();
      queryCounter.reset();
      const t = Date.now();
      await fn();
      const ms = Date.now() - t;
      await settle();
      out.push(`${phase} ${ms} ms / ${queryCounter.value} consultas`);
    }
    console.log(`    ${label}: ${out.join(" · ")}`);
  };
  await measure("Comprar (resumo + lista)", async () => {
    await getCurrentMrpAnalysisSummary();
    await getCurrentMrpBuyListing({ q: "", status: "need", area: "", family: "", sort: "need" });
  });
  await measure("Áreas & Conjuntos", () => getMrpAreasSummary(run.id));
  await measure("Em trânsito", () => getCurrentMrpTransitListing({ q: "", status: "pend", onlyMrp: false }));
  await measure("Estoque parado", () => getCurrentMrpIdleListing({ q: "", type: "com", area: "" }));
  await measure("Base MRP", async () => {
    await getMrpBaseView();
    await getCurrentMrpBaseListing({ q: "", area: "", filter: "all" });
  });

  console.log("\n5. Rollback: nova atualização com os mesmos arquivos reais e falha forçada");
  const counts0 = { stock: await prisma.mrpStockImport.count(), purchase: await prisma.mrpPurchaseImport.count(), base: await prisma.mrpBaseVersion.count() };
  const slots2: Partial<Record<"base" | "est" | "cmp", string>> = {};
  for (const k2 of ["base", "est", "cmp"] as const) {
    const ins = await inspectMrpUploads({ files: [ref(k2)], importedBy: TAG, currentSlots: slots2, depositFilter: "1000", download });
    slots2[k2] = (ins.slots as Any)[k2].importId;
  }
  let msg = "";
  try {
    await updateAllMrp({
      items: [{ importId: slots2.base!, kind: "base" }, { importId: slots2.est!, kind: "est" }, { importId: slots2.cmp!, kind: "cmp" }],
      depositFilter: "1000",
      userId: TAG,
      download,
      hooks: { beforeAnalysisCommit: async () => { throw new Error("falha controlada (FASE K)"); } }
    });
  } catch (error) {
    msg = (error as Error).message;
  }
  check("erro propagado", msg === "falha controlada (FASE K)", msg);
  const cur = await prisma.mrpAnalysisRun.findFirst({ where: { isCurrent: true } });
  check("análise real anterior continua vigente", cur?.id === run.id);
  check("base anterior continua ativa", (await getActiveMrpBaseVersion())?.id === run.baseVersionId);
  const newStock = await prisma.mrpStockImport.findMany({ where: { createdBy: TAG, id: { not: run.stockImportId } } });
  const newPurchase = await prisma.mrpPurchaseImport.findMany({ where: { createdBy: TAG, id: { not: run.purchaseImportId } } });
  const newBase = await prisma.mrpBaseVersion.findMany({ where: { createdBy: TAG, id: { not: run.baseVersionId } } });
  console.log(`    fontes novas gravadas antes da falha: estoque ${newStock.length} · compras ${newPurchase.length} · base ${newBase.length} (antes: ${show(counts0)})`);
  check(
    "nenhuma importação parcial utilizável: fontes novas completas, base nova INATIVA e nenhuma usada por run vigente",
    newBase.every((b) => !b.isActive && b.materialCount === 4259) && newStock.every((s) => s.rowsAccepted === 38) && newPurchase.every((p) => p.rowsAccepted === 1526) && cur?.stockImportId === run.stockImportId && cur?.purchaseImportId === run.purchaseImportId
  );
  const hist = await prisma.importHistory.findMany({ where: { id: { in: Object.values(slots2) as string[] } }, select: { status: true, errorMessage: true } as Any });
  console.log(`    históricos da tentativa: ${show(hist)}`);
  check("tela continua na análise real anterior", (await getCurrentMrpAnalysisSummary())?.runId === run.id);

  const after = await healthCheck("DEPOIS DO SETUP");
  check("depois: nenhum lock/importação presa/run incompleto", after.mrpLocks === 0 && after.stuck === 0 && after.incomplete === 0 && after.currents === 1 && after.actives === 1);
  writeFileSync(STATE, JSON.stringify({ priorActive: priorActive?.id ?? null, priorCurrent: priorCurrent?.id ?? null, runId: run.id }));
}

async function cleanup() {
  const state = existsSync(STATE) ? JSON.parse(readFileSync(STATE, "utf8")) : { priorActive: null, priorCurrent: null };
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
  if (state.priorCurrent) await setCurrentMrpAnalysisRun(state.priorCurrent);
  if (state.priorActive && (await getActiveMrpBaseVersion())?.id !== state.priorActive) await activateMrpBaseVersion(state.priorActive);
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
  check("nenhum registro desta validação restante", left === 0, String(left));
  check("Base MRP ativa original restaurada", (await getActiveMrpBaseVersion())?.id === state.priorActive);
  check("análise vigente original restaurada", ((await prisma.mrpAnalysisRun.findFirst({ where: { isCurrent: true }, select: { id: true } }))?.id ?? null) === state.priorCurrent);
  const h = await healthCheck("DEPOIS DA LIMPEZA");
  check("nenhum lock/importação presa/run incompleto", h.mrpLocks === 0 && h.stuck === 0 && h.incomplete === 0);
  if (!failures && existsSync(STATE)) unlinkSync(STATE);
}

async function main() {
  console.log(`Banco: ${SCRIPT_DB_MODE} (connection_limit=1)`);
  await connectWithRetry(prisma, { label: "validação real FASE K" });
  if (process.argv.includes("--cleanup")) await cleanup();
  else await setup();
  console.log(failures ? `\n${failures} FALHA(S)` : "\nTODAS AS CHECAGENS PASSARAM");
  if (failures) process.exitCode = 1;
}

if (require.main === module)
  main()
    .catch((error) => {
      console.error(error);
      process.exitCode = 1;
    })
    .finally(() => prisma.$disconnect());
