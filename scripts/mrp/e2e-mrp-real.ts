/**
 * ANÁLISE MRP (FASE K) — tela com a ANÁLISE REAL vigente (somente leitura).
 *
 *   npx tsx scripts/mrp/validate-mrp-real-db.ts --direct --setup
 *   npm run build && npx tsx scripts/mrp/e2e-mrp-real.ts --direct [--shots=pasta]
 *   npx tsx scripts/mrp/validate-mrp-real-db.ts --direct --cleanup
 *
 * `next start` local (porta 3108) com sessão ADMIN assinada. O Preview da
 * Vercel tem Deployment Protection (SSO) e não é acessível daqui. Confere as 5
 * abas contra o banco (KPIs, cartões, primeiras linhas = API), tempos de
 * carregamento (frio/quente), as 6 exportações (linhas = serviço) e celular.
 * Não grava nada.
 */
import "./force-utc";
import { SCRIPT_DB_MODE, connectWithRetry, loadDotEnv } from "./script-db";
import { spawn, type ChildProcess } from "node:child_process";
import { mkdirSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import * as XLSX from "xlsx";
import { chromium, type Page } from "playwright";
import { prisma } from "../../src/lib/prisma";
import { signSession } from "../../src/lib/session";
import { fmtMrp } from "../../src/lib/mrp/format";
import { getCurrentMrpAnalysisSummary } from "../../src/services/mrp-analysis.service";
import { getCurrentMrpBuyListing, getMrpAreasSummary } from "../../src/services/mrp-listing.service";
import { getCurrentMrpTransitListing } from "../../src/services/mrp-transit.service";
import { getCurrentMrpIdleListing } from "../../src/services/mrp-idle.service";
import { getMrpBaseView } from "../../src/services/mrp-base-view.service";
import { exportMrp } from "../../src/services/mrp-export.service";
import { TAG } from "./validate-mrp-real-db";

type Any = any; // eslint-disable-line @typescript-eslint/no-explicit-any
const PORT = 3108;
const BASE = `http://localhost:${PORT}`;
const USER = { sub: "e2e-analise-mrp-real", name: "Teste E2E MRP Real", role: "ADMIN" };
const shotsDir = process.argv.find((a) => a.startsWith("--shots="))?.slice(8);
let failures = 0;
function check(label: string, ok: boolean, detail = "") {
  if (!ok) failures++;
  console.log(`  ${ok ? "✓" : "✗"} ${label}${detail ? `  — ${detail}` : ""}`);
}
async function shot(page: Page, name: string) {
  if (!shotsDir) return;
  mkdirSync(shotsDir, { recursive: true });
  await page.screenshot({ path: join(shotsDir, `${name}.png`), fullPage: false });
}

async function startServer(): Promise<ChildProcess> {
  const server = spawn(process.execPath, [require.resolve("next/dist/bin/next"), "start", "-p", String(PORT)], {
    env: { ...process.env, NODE_ENV: "production", DATABASE_URL: (process.env.DATABASE_URL ?? "").replace("connection_limit=1", "connection_limit=5") },
    stdio: ["ignore", "pipe", "pipe"]
  });
  for (let i = 0; i < 60; i++) {
    try {
      if ((await fetch(`${BASE}/login`)).status < 500) return server;
    } catch {
      /* subindo */
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
  server.kill();
  throw new Error("next start não subiu (rode npm run build).");
}

async function main() {
  console.log(`Banco: ${SCRIPT_DB_MODE}`);
  await connectWithRetry(prisma, { label: "e2e real" });
  const run = await prisma.mrpAnalysisRun.findFirst({ where: { isCurrent: true } });
  if (!run || run.createdBy !== TAG) throw new Error("Rode antes: validate-mrp-real-db.ts --setup (análise real vigente).");
  const summary = (await getCurrentMrpAnalysisSummary())!;
  const kp = summary.kpis as Any;
  const env = loadDotEnv();
  const token = await signSession(USER, process.env.AUTH_SECRET || env.AUTH_SECRET, 3600);
  const server = await startServer();
  const browser = await chromium.launch();
  const dl = join(process.cwd(), ".e2e-real-downloads");
  try {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: "pt-BR", acceptDownloads: true });
    await context.addCookies([{ name: "zucchi-auth", value: token, domain: "localhost", path: "/" }]);
    const page = await context.newPage();
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    const open = async (tab: string, ready: string) => {
      const times: number[] = [];
      for (let i = 0; i < 2; i++) {
        const t = Date.now();
        await page.goto(`${BASE}/dashboard/analise-mrp?tab=${tab}`, { waitUntil: "load", timeout: 180_000 });
        await page.locator(ready).first().waitFor({ timeout: 120_000 }).catch(async (e) => {
          console.log(`    (diagnóstico: ${page.url()}) ${((await page.locator("body").innerText().catch(() => "")) || "").slice(0, 400).replace(/s+/g, " ")}`);
          throw e;
        });
        times.push(Date.now() - t);
      }
      return `1ª ${times[0]} ms · 2ª ${times[1]} ms`;
    };

    console.log("\nComprar");
    console.log(`    carregamento: ${await open("buy", "[data-testid=mrp-buy-table]")}`);
    for (const [label, key] of [["Comprar", "Comprar"], ["Verificar", "Verificar"], ["Em trânsito", "Comprado"], ["Qtd. sugerida", "qtd"], ["Sem necessidade", "OK"], ["Analisados", "total"]] as const) {
      const v = ((await page.locator(`[data-kpi="${label}"] [data-kpi-value]`).textContent()) ?? "").trim();
      check(`KPI ${label} = ${fmtMrp(kp[key])}`, v === fmtMrp(kp[key]), v);
    }
    const api = await getCurrentMrpBuyListing({ q: "", status: "need", area: "", family: "", sort: "need" });
    const codes = await page.$$eval("[data-testid=mrp-buy-table] tbody tr", (rows) => rows.map((r) => r.getAttribute("data-code") ?? ""));
    check(`lista (Precisa comprar): ${codes.length} primeiras linhas = API (${api!.filteredCount} no filtro)`, codes.join() === api!.items.map((i) => i.code).join());
    await shot(page, "k1-comprar");

    console.log("\nÁreas & Conjuntos");
    console.log(`    carregamento: ${await open("areas", "[data-testid=mrp-areas]")}`);
    const areas = (await getMrpAreasSummary(run.id)).summary;
    for (const card of [...areas.areas, ...areas.families, areas.allFamilies]) {
      const el = page.locator(`[data-card="${card.title}"]`);
      const read = async (m: string) => ((await el.locator(`[data-metric="${m}"]`).textContent()) ?? "").trim();
      const s = card.summary;
      const ok = (await read("total")).startsWith(`${fmtMrp(s.total)} materiais`) && (await read("Comprar")) === fmtMrp(s.Comprar) && (await read("Verificar")) === fmtMrp(s.Verificar) && (await read("Em trânsito")) === fmtMrp(s.Comprado) && (await read("Qtd. sugerida")) === fmtMrp(s.qtd);
      check(`cartão ${card.title}: ${fmtMrp(s.total)} · Comprar ${fmtMrp(s.Comprar)} · Em trânsito ${fmtMrp(s.Comprado)} · Qtd. ${fmtMrp(s.qtd)}`, ok);
    }
    await shot(page, "k2-areas");

    console.log("\nEm trânsito");
    console.log(`    carregamento: ${await open("transit", "[data-testid=mrp-transit-table]")}`);
    const tKpi = async (label: string) => ((await page.locator(`[data-testid=mrp-transit] [data-kpi="${label}"] [data-kpi-value]`).textContent()) ?? "").trim();
    for (const [label, value] of [["Linhas de compra", kp.purchases.linhas], ["Em trânsito", kp.purchases.pendentes], ["Qtd. em trânsito", kp.purchases.qtdPendente], ["Recebidos", kp.purchases.recebidos], ["Saíram do MRP", kp.removedFromMrp]] as [string, number][]) {
      check(`KPI ${label} = ${fmtMrp(value)}`, (await tKpi(label)) === fmtMrp(value), await tKpi(label));
    }
    const tr = await getCurrentMrpTransitListing({ q: "", status: "pend", onlyMrp: false });
    const tCodes = await page.$$eval("[data-testid=mrp-transit-table] tbody tr", (rows) => rows.map((r) => r.getAttribute("data-code") ?? ""));
    check(`tabela Em trânsito (pend): ${tCodes.length} linhas = API (${tr!.filteredCount}), data DESC`, tCodes.join() === tr!.items.map((i) => i.code).join());
    await shot(page, "k3-transito");

    console.log("\nEstoque parado");
    console.log(`    carregamento: ${await open("idle", "[data-testid=mrp-idle]")}`);
    const iKpi = async (label: string) => ((await page.locator(`[data-testid=mrp-idle] [data-kpi="${label}"] [data-kpi-value]`).textContent()) ?? "").trim();
    const idleExp = [kp.semMov, kp.parado, kp.qtdParada, kp.semMov - kp.parado].map(fmtMrp).join("|");
    const idleShown = [await iKpi("Sem movimentação"), await iKpi("Com saldo"), await iKpi("Qtd. parada"), await iKpi("Zerados")].join("|");
    check(`4 KPIs = banco (${idleExp})`, idleShown === idleExp, idleShown);
    const idleApi = await getCurrentMrpIdleListing({ q: "", type: "com", area: "" });
    check(`"Com saldo" (padrão): ${idleApi!.filteredCount} materiais → estado vazio próprio`, idleApi!.filteredCount > 0 || (await page.locator("[data-testid=mrp-idle]").getByText(/Nenhum material/).first().isVisible()));
    await shot(page, "k4-parado");

    console.log("\nBase MRP");
    console.log(`    carregamento: ${await open("base", "[data-testid=mrp-base-table]")}`);
    const bv = (await getMrpBaseView())!;
    const metric = async (m: string) => ((await page.locator(`[data-testid=mrp-base-summary] [data-metric="${m}"]`).textContent()) ?? "").trim();
    check(`resumo: ${await metric("total")} · ${await metric("mec")} · ${await metric("ele")} · ${await metric("semparam")} · ${await metric("conj")}`, (await metric("total")) === `${fmtMrp(bv.summary.total)} materiais` && bv.summary.total === 4259 && (await metric("mec")) === "Mecânica 3.465" && (await metric("ele")) === "Elétrica 794");
    check("origem: Planilha enviada: Controle_MRP_SAP_novo_analisado.xlsx; sem aviso de base diferente", ((await page.locator("[data-testid=mrp-base-summary]").textContent()) ?? "").includes("Planilha enviada: Controle_MRP_SAP_novo_analisado.xlsx") && (await page.locator("[data-testid=mrp-base-mismatch]").count()) === 0);
    await shot(page, "k5-base");

    console.log("\nExportações (download pela tela = serviço)");
    mkdirSync(dl, { recursive: true });
    for (const [tab, testId, type, ready] of [
      ["buy", "mrp-export-buy", "buy", "[data-testid=mrp-buy-table]"],
      ["buy", "mrp-export-buy-by-area", "buy-by-area", "[data-testid=mrp-buy-table]"],
      ["areas", "mrp-export-families", "families", "[data-testid=mrp-areas]"],
      ["transit", "mrp-export-transit", "transit", "[data-testid=mrp-transit-table]"],
      ["idle&idleType=all", "mrp-export-idle", "idle", "[data-testid=mrp-idle-table]"],
      ["base", "mrp-export-base", "base", "[data-testid=mrp-base-table]"]
    ] as const) {
      await page.goto(`${BASE}/dashboard/analise-mrp?tab=${tab}`, { waitUntil: "load", timeout: 180_000 });
      await page.locator(ready).first().waitFor({ timeout: 120_000 });
      await page.waitForTimeout(500);
      const t = Date.now();
      const [d] = await Promise.all([page.waitForEvent("download", { timeout: 180_000 }), page.locator(`[data-testid=${testId}]`).click()]);
      const ms = Date.now() - t;
      const path = join(dl, d.suggestedFilename());
      await d.saveAs(path);
      const buf = readFileSync(path);
      const wb = XLSX.read(buf, { type: "buffer" });
      const rows = wb.SheetNames.reduce((s, n) => s + XLSX.utils.sheet_to_json(wb.Sheets[n], { header: 1 }).length - 1, 0);
      const svc = await exportMrp(type, {
        buy: { q: "", status: "need", area: "", family: "", sort: "need" },
        idle: { q: "", type: "all", area: "" },
        base: { q: "", area: "", filter: "all" }
      });
      check(`${d.suggestedFilename()}: ${wb.SheetNames.join("|")} · ${rows} linhas = serviço · ${(buf.length / 1024).toFixed(0)} KB · ${ms} ms`, svc.ok && rows === svc.rows && svc.sheets.join("|") === wb.SheetNames.join("|"));
    }

    console.log("\nCelular (390 px)");
    await page.setViewportSize({ width: 390, height: 844 });
    for (const [tab, ready] of [["buy", "[data-testid=mrp-buy-table]"], ["areas", "[data-testid=mrp-areas]"], ["transit", "[data-testid=mrp-transit-table]"], ["idle", "[data-testid=mrp-idle]"], ["base", "[data-testid=mrp-base-table]"]] as const) {
      await page.goto(`${BASE}/dashboard/analise-mrp?tab=${tab}`, { waitUntil: "load", timeout: 180_000 });
      await page.locator(ready).first().waitFor({ timeout: 120_000 });
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      check(`${tab}: sem rolagem horizontal`, overflow <= 0, `${overflow}px`);
    }
    await shot(page, "k6-celular");
    check("nenhum erro de JavaScript na página", errors.length === 0, errors.slice(0, 3).join(" | "));
  } finally {
    await browser.close();
    server.kill();
    rmSync(dl, { recursive: true, force: true });
  }
  console.log(failures ? `\n${failures} FALHA(S)` : "\nTODAS AS CHECAGENS PASSARAM");
  if (failures) process.exitCode = 1;
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
