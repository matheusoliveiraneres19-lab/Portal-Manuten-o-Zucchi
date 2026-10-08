/**
 * ANÁLISE MRP (FASE E) — teste de UI ponta a ponta (Playwright + `next start`).
 *
 *   npm run build && npm run test:mrp-e2e -- --direct [--shots=pasta]
 *
 * Sobe o portal localmente (porta 3107) com uma sessão ADMIN assinada e:
 *   1. /dashboard/lubrificantes redireciona para /dashboard/analise-mrp;
 *   2. menu lateral mostra "Análise MRP" (sem "Lubrificantes");
 *   3. sem análise vigente: estado vazio, sem KPIs zerados;
 *   4. "Atualizar planilhas": anexa estoque + compras. Com a chave do Storage:
 *      upload REAL, detecção nos slots, trava, "Atualizar tudo" → toast, tabela.
 *      Sem a chave (máquina local): valida o erro na tela e gera a análise pelo
 *      mesmo service do botão (updateAllMrp) com as fixtures;
 *   5. 6 KPIs da tela = MrpAnalysisRun.kpis; ordem da tabela = API;
 *   6. clique no KPI Comprar filtra; Todos + "mostrar mais" 200 → 600 → 1000;
 *      busca "1885-0125" (com debounce) encontra o material; "Sem MRP" aparece;
 *   7. celular (390 px): sem rolagem horizontal da página.
 * Limpa tudo o que criou (runs, importações, históricos, arquivos no Storage).
 * As linhas de AuditLog do usuário de teste são MANTIDAS (auditoria não se apaga).
 */
import "./force-utc";
import { SCRIPT_DB_MODE, connectWithRetry, loadDotEnv } from "./script-db";
import { spawn, type ChildProcess } from "node:child_process";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { chromium, type Page } from "playwright";
import { prisma } from "../../src/lib/prisma";
import { signSession } from "../../src/lib/session";
import { fmtMrp } from "../../src/lib/mrp/format";
import { getCurrentMrpBuyListing } from "../../src/services/mrp-listing.service";
import { activateMrpBaseVersion, getActiveMrpBaseVersion, setCurrentMrpAnalysisRun } from "../../src/services/mrp-persistence.service";
import { deleteImportFile } from "../../src/services/import-storage.service";
import { updateAllMrp } from "../../src/services/mrp-update.service";
import * as F from "./fixtures";

const PORT = 3107;
const BASE = `http://localhost:${PORT}`;
const USER = { sub: "e2e-analise-mrp", name: "Teste E2E MRP", role: "ADMIN" };
const shotsDir = process.argv.find((a) => a.startsWith("--shots="))?.slice(8);

let failures = 0;
function check(label: string, ok: boolean, detail = "") {
  if (!ok) failures++;
  console.log(`  ${ok ? "✓" : "✗"} ${label}${detail ? `  — ${detail}` : ""}`);
}

async function startServer(): Promise<ChildProcess> {
  const server = spawn(process.execPath, [require.resolve("next/dist/bin/next"), "start", "-p", String(PORT)], {
    env: { ...process.env, NODE_ENV: "production", DATABASE_URL: (process.env.DATABASE_URL ?? "").replace("connection_limit=1", "connection_limit=5") },
    stdio: ["ignore", "pipe", "pipe"]
  });
  server.stderr?.on("data", (d) => process.env.E2E_VERBOSE && process.stderr.write(d));
  for (let i = 0; i < 60; i++) {
    try {
      const res = await fetch(`${BASE}/login`);
      if (res.status < 500) return server;
    } catch {
      /* ainda subindo */
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
  server.kill();
  throw new Error("O servidor Next não subiu em 60 s (rode `npm run build` antes).");
}

const rowCodes = (page: Page) => page.$$eval("[data-testid=mrp-buy-table] tbody tr", (rows) => rows.map((r) => r.getAttribute("data-code") ?? ""));
/** Executa a ação e espera a resposta da lista (o layout mantém conexões abertas; networkidle não serve). */
async function withList(page: Page, action: () => Promise<unknown>) {
  await Promise.all([page.waitForResponse((r) => r.url().includes("/api/mrp/analysis/current/items"), { timeout: 60_000 }), action()]);
  await page.waitForTimeout(300);
}
async function shot(page: Page, name: string) {
  if (!shotsDir) return;
  mkdirSync(shotsDir, { recursive: true });
  await page.screenshot({ path: join(shotsDir, `${name}.png`), fullPage: false });
}

async function main() {
  console.log(`Banco: ${SCRIPT_DB_MODE}`);
  await connectWithRetry(prisma, { label: "e2e Análise MRP" });
  const seed = await getActiveMrpBaseVersion();
  if (!seed) throw new Error("Sem Base MRP ativa.");
  const priorCurrent = await prisma.mrpAnalysisRun.findFirst({ where: { isCurrent: true }, select: { id: true } });

  const env = loadDotEnv();
  const secret = process.env.AUTH_SECRET || env.AUTH_SECRET;
  if (!secret) throw new Error("AUTH_SECRET ausente.");
  const token = await signSession(USER, secret, 60 * 60);

  const server = await startServer();
  const browser = await chromium.launch();
  try {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: "pt-BR" });
    await context.addCookies([{ name: "zucchi-auth", value: token, domain: "localhost", path: "/" }]);
    const page = await context.newPage();

    console.log("\n1–3. Rota, menu e estado vazio");
    const legacy = await fetch(`${BASE}/dashboard/lubrificantes`, { redirect: "manual", headers: { cookie: `zucchi-auth=${token}` } });
    check("rota antiga responde 307 → /dashboard/analise-mrp", legacy.status === 307 && (legacy.headers.get("location") ?? "").endsWith("/dashboard/analise-mrp"), `${legacy.status} ${legacy.headers.get("location")}`);
    await page.goto(`${BASE}/dashboard/lubrificantes`, { waitUntil: "load", timeout: 120_000 });
    await page.locator("h1", { hasText: "Análise MRP" }).waitFor({ timeout: 60_000 });
    check("/dashboard/lubrificantes → /dashboard/analise-mrp", new URL(page.url()).pathname === "/dashboard/analise-mrp", page.url());
    const aside = page.locator("aside").first();
    check("menu mostra Análise MRP apontando para a rota nova", (await aside.locator('a[href="/dashboard/analise-mrp"]').count()) === 1 && (await aside.getByText("Análise MRP").count()) >= 1);
    check("menu sem Lubrificantes", (await aside.getByText("Lubrificantes").count()) === 0);
    check("cabeçalho: badge, título e descrição", (await page.getByText("Gestão de Materiais").count()) >= 1 && (await page.locator("h1", { hasText: "Análise MRP" }).count()) === 1);
    if (!priorCurrent) {
      check("sem análise: estado vazio", await page.getByText("Nenhuma análise MRP disponível").isVisible());
      check("sem análise: nenhum KPI zerado exibido", (await page.getByText("materiais zerados").count()) === 0);
      await shot(page, "1-sem-analise");
    }

    console.log("\n4. Atualizar planilhas → Atualizar tudo (upload real)");
    await page.getByRole("button", { name: "Atualizar planilhas" }).first().click();
    await page.getByText("Enviar planilhas do SAP").waitFor();
    const stock = F.stockFixture();
    const purchases = F.purchaseFixture();
    await page.setInputFiles("[data-testid=mrp-file-input]", [
      { name: stock.name, mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", buffer: stock.data },
      { name: purchases.name, mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", buffer: purchases.data }
    ]);
    const storageReady = !!(process.env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SERVICE_ROLE_KEY);
    if (!storageReady) {
      // Sem a SERVICE ROLE KEY (só existe na Vercel) o upload real não roda aqui:
      // valida o caminho de ERRO pela tela e gera a análise pelo MESMO service
      // que o botão "Atualizar tudo" chama (updateAllMrp), com as fixtures.
      await page.locator("[role=dialog] [role=alert]").waitFor({ timeout: 60_000 });
      const msg = (await page.locator("[role=dialog] [role=alert]").textContent()) ?? "";
      check("sem Storage local: o modal mostra o erro com clareza", /Armazenamento de importações não configurado/.test(msg), msg);
      check("nenhuma análise criada pela falha", !(await prisma.mrpAnalysisRun.findFirst({ where: { createdBy: USER.name } })));
      check("trava continua fechada", !(await page.locator("[data-testid=mrp-update-all]").isEnabled()));
      await shot(page, "2-modal-erro-storage");
      console.log("    (upload real pela tela: validar no Preview da Vercel, onde a chave do Storage existe)");
      await page.keyboard.press("Escape");
      const files = new Map<string, Buffer>();
      const items: { importId: string; kind: "est" | "cmp"; sheet: string }[] = [];
      for (const [kind, f, sheet] of [["est", stock, "Sheet1"], ["cmp", purchases, "Compras"]] as const) {
        const path = `imports/analise-mrp/e2e/${Date.now()}-${f.name}`;
        files.set(path, f.data);
        const h = await prisma.importHistory.create({
          data: { type: kind === "est" ? "MRP_STOCK" : "MRP_PURCHASES", fileName: f.name, importedBy: USER.name, status: "EM_PROCESSAMENTO", stage: "UPLOADED", filePath: path, bucket: "e2e", metadata: { mrp: { flow: "analise-mrp", kind, sheet } } }
        });
        items.push({ importId: h.id, kind, sheet });
      }
      await updateAllMrp({ items, depositFilter: "1400", userId: USER.name, download: async (path) => files.get(path)! });
      await page.reload({ waitUntil: "load" });
      await page.locator("[data-testid=mrp-buy-table]").waitFor({ timeout: 60_000 });
    } else {
      await page.locator("[data-testid=mrp-slot-cmp]").getByText(purchases.name).waitFor({ timeout: 120_000 });
      check("estoque detectado no slot 2", (await page.locator("[data-testid=mrp-slot-est]").getByText(stock.name).count()) === 1);
      check("compras detectadas no slot 3", (await page.locator("[data-testid=mrp-slot-cmp]").getByText(purchases.name).count()) === 1);
      const lockText = (await page.locator("[data-testid=mrp-lock-message]").textContent()) ?? "";
      check("trava liberada (base vigente)", /prontas/.test(lockText) && (await page.locator("[data-testid=mrp-update-all]").isEnabled()), lockText);
      await shot(page, "2-modal-slots");
      await page.locator("[data-testid=mrp-update-all]").click();
      await page.getByText("Análise MRP atualizada com sucesso.").waitFor({ timeout: 180_000 });
      await page.locator("[data-testid=mrp-buy-table]").waitFor({ timeout: 60_000 });
    }
    await page.waitForTimeout(500);
    const run = await prisma.mrpAnalysisRun.findFirst({ where: { isCurrent: true } });
    check("nova análise vigente aparece na tela", !!run && run.createdBy === USER.name && (await page.locator("[data-testid=mrp-buy-table]").isVisible()));
    await shot(page, "3-comprar");

    console.log("\n5. KPIs e ordem da tabela");
    const k = run!.kpis as Record<string, number>;
    const kpiText = await page.locator("main").innerText();
    for (const [label, key] of [["Comprar", "Comprar"], ["Verificar", "Verificar"], ["Em trânsito", "Comprado"], ["Qtd. sugerida", "qtd"], ["Sem necessidade", "OK"], ["Analisados", "total"]] as const) {
      const value = (await page.locator(`[data-kpi="${label}"] [data-kpi-value]`).textContent())?.trim();
      check(`KPI ${label} = ${fmtMrp(k[key])} (banco)`, value === fmtMrp(k[key]), value ?? "");
    }
    void kpiText;
    const apiDefault = await getCurrentMrpBuyListing({ q: "", status: "need", area: "", family: "", sort: "need" });
    const uiDefault = await rowCodes(page);
    check(`tabela padrão (Precisa comprar) = API (${uiDefault.length} linhas)`, uiDefault.join() === apiDefault!.items.map((i) => i.code).join());
    const subtitle = (await page.locator("[data-testid=mrp-buy-subtitle]").textContent()) ?? "";
    check("subtítulo: X materiais no filtro · sugerida do filtro", subtitle.includes(`${fmtMrp(apiDefault!.filteredCount)} materiais no filtro`) && subtitle.includes(fmtMrp(apiDefault!.suggestedFiltered)), subtitle);
    check("7 colunas", (await page.locator("[data-testid=mrp-buy-table] thead th").allTextContents()).join("|") === "Código|Material|Saldo|Mín|Máx|Comprar|Situação");

    console.log("\n6. Filtros, busca e mostrar mais");
    await withList(page, () => page.locator('[data-kpi="Comprar"]').click());
    const statuses = await page.$$eval("[data-testid=mrp-buy-table] tbody tr", (rows) => rows.map((r) => r.getAttribute("data-status")));
    check("clique no KPI Comprar → só Comprar, refletido na URL", statuses.length > 0 && statuses.every((s) => s === "Comprar") && page.url().includes("status=Comprar"));
    await withList(page, () => page.selectOption("select[aria-label=Status]", "all"));
    const c200 = await rowCodes(page);
    await withList(page, () => page.getByRole("button", { name: "mostrar mais" }).click());
    const c600 = await rowCodes(page);
    await withList(page, () => page.getByRole("button", { name: "mostrar mais" }).click());
    const c1000 = await rowCodes(page);
    check("mostrar mais: 200 → 600 → 1000 sem duplicar", c200.length === 200 && c600.length === 600 && c1000.length === 1000 && new Set(c1000).size === 1000 && c1000.slice(0, 600).join() === c600.join(), `${c200.length}/${c600.length}/${c1000.length}`);
    await withList(page, () => page.selectOption("select[aria-label=Status]", "OK"));
    check('situação "Sem MRP" com observação "Sem mín/máx no MRP"', (await page.getByText("Sem MRP", { exact: true }).count()) > 0 && (await page.getByText("Sem mín/máx no MRP").count()) > 0);
    await withList(page, () => page.selectOption("select[aria-label=Status]", "all"));
    await withList(page, () => page.fill("input[type=search]", "1885-0125"));
    const found = await rowCodes(page);
    check("busca 1885-0125 (norm) encontra o material 13439", found.includes("13439"), found.slice(0, 5).join(","));
    await withList(page, () => page.fill("input[type=search]", ""));
    await withList(page, () => page.selectOption("select[aria-label=Área]", "Elétrica"));
    const apiEle = await getCurrentMrpBuyListing({ q: "", status: "all", area: "Elétrica", family: "", sort: "need" });
    check("área Elétrica = API", ((await page.locator("[data-testid=mrp-buy-subtitle]").textContent()) ?? "").includes(`${fmtMrp(apiEle!.filteredCount)} materiais`));
    const famOptions = await page.$$eval("select[aria-label=Conjunto] option", (o) => o.map((x) => x.textContent));
    check("conjuntos = só os presentes na análise", famOptions.join("|") === ["Todos os conjuntos", ...apiEle!.families].join("|"), famOptions.join(", "));
    await shot(page, "4-filtros");

    console.log("\n7. Celular");
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`${BASE}/dashboard/analise-mrp`, { waitUntil: "load", timeout: 120_000 });
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    check("sem rolagem horizontal da página no celular", overflow <= 0, `excesso ${overflow}px`);
    await shot(page, "5-celular");
  } finally {
    await browser.close();
    server.kill();
    const histories = await prisma.importHistory.findMany({ where: { importedBy: USER.name }, select: { id: true, filePath: true, bucket: true } });
    let removedFiles = 0;
    for (const h of histories) {
      if (!h.filePath || h.bucket === "e2e") continue;
      await deleteImportFile(h.filePath, h.bucket ?? undefined).then(() => removedFiles++).catch(() => undefined);
    }
    await prisma.mrpAnalysisRun.updateMany({ where: { createdBy: USER.name }, data: { isCurrent: false } });
    if (priorCurrent) await setCurrentMrpAnalysisRun(priorCurrent.id);
    if ((await getActiveMrpBaseVersion())?.id !== seed.id) await activateMrpBaseVersion(seed.id);
    await prisma.mrpAnalysisRun.deleteMany({ where: { createdBy: USER.name } });
    await prisma.mrpStockImport.deleteMany({ where: { createdBy: USER.name } });
    await prisma.mrpPurchaseImport.deleteMany({ where: { createdBy: USER.name } });
    await prisma.mrpBaseVersion.deleteMany({ where: { createdBy: USER.name, isActive: false } });
    await prisma.importHistory.deleteMany({ where: { importedBy: USER.name } });
    console.log("\nLimpeza");
    console.log(`  arquivos de teste removidos do Storage: ${removedFiles}`);
    check("nenhum run/importação de teste restante", (await prisma.mrpAnalysisRun.count({ where: { createdBy: USER.name } })) + (await prisma.importHistory.count({ where: { importedBy: USER.name } })) === 0);
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
