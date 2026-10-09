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
 *   9b. Base MRP (FASE I): resumo, 6 colunas, filtros, paginação, URL, envio,
 *       aviso de base ativa diferente, restaurar pela tela, VISUALIZADOR (403).
 *   9c. Exportações (FASE J): os 6 botões baixam o .xlsx (nome, MIME, tamanho,
 *       abas e linhas = API), duplo clique, VISUALIZADOR exporta, anônimo não.
 * Limpa tudo o que criou (runs, importações, históricos, arquivos no Storage).
 * As linhas de AuditLog do usuário de teste são MANTIDAS (auditoria não se apaga).
 */
import "./force-utc";
import { SCRIPT_DB_MODE, connectWithRetry, loadDotEnv } from "./script-db";
import { spawn, type ChildProcess } from "node:child_process";
import { mkdirSync, readFileSync, rmSync } from "node:fs";
import * as XLSX from "xlsx";
import { join } from "node:path";
import { chromium, type Page } from "playwright";
import { prisma } from "../../src/lib/prisma";
import { signSession } from "../../src/lib/session";
import { fmtMrp } from "../../src/lib/mrp/format";
import { getCurrentMrpBuyListing, getMrpAreasSummary } from "../../src/services/mrp-listing.service";
import { activateMrpBaseVersion, getActiveMrpBaseVersion, setCurrentMrpAnalysisRun } from "../../src/services/mrp-persistence.service";
import { deleteImportFile } from "../../src/services/import-storage.service";
import { updateAllMrp } from "../../src/services/mrp-update.service";
import { getCurrentMrpTransitListing } from "../../src/services/mrp-transit.service";
import { getCurrentMrpIdleListing } from "../../src/services/mrp-idle.service";
import { getCurrentMrpBaseListing, getMrpBaseView } from "../../src/services/mrp-base-view.service";
import { confirmMrpImport } from "../../src/services/mrp-import.service";

type Any = any; // eslint-disable-line @typescript-eslint/no-explicit-any
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

    console.log("\n7. Áreas & Conjuntos (FASE F)");
    const { summary: areas } = await getMrpAreasSummary(run!.id);
    await page.goto(`${BASE}/dashboard/analise-mrp?tab=areas`, { waitUntil: "load", timeout: 120_000 });
    await page.locator("[data-testid=mrp-areas]").waitFor({ timeout: 60_000 });
    check("?tab=areas abre direto em Áreas & Conjuntos", await page.locator('[data-tab="areas"][aria-selected="true"]').isVisible());
    await page.reload({ waitUntil: "load" });
    await page.locator("[data-testid=mrp-areas]").waitFor({ timeout: 60_000 });
    check("refresh mantém a aba", await page.locator("[data-testid=mrp-areas]").isVisible());
    for (const card of [...areas.areas, ...areas.families, areas.allFamilies]) {
      const el = page.locator(`[data-card="${card.title}"]`);
      const read = async (m: string) => ((await el.locator(`[data-metric="${m}"]`).textContent()) ?? "").trim();
      const s = card.summary;
      const ok =
        (await read("total")).startsWith(`${fmtMrp(s.total)} materiais`) &&
        (await read("Comprar")) === fmtMrp(s.Comprar) &&
        (await read("Verificar")) === fmtMrp(s.Verificar) &&
        (await read("Em trânsito")) === fmtMrp(s.Comprado) &&
        (await read("Qtd. sugerida")) === fmtMrp(s.qtd);
      console.log(`    ${card.title}: ${fmtMrp(s.total)} materiais${s.noParams && card.key.startsWith("fam:") && card.key !== "fam:*" ? ` · ${fmtMrp(s.noParams)} sem mín/máx` : ""} · Comprar ${fmtMrp(s.Comprar)} · Verificar ${fmtMrp(s.Verificar)} · Em trânsito ${fmtMrp(s.Comprado)} · OK ${fmtMrp(s.OK)} · Qtd. sugerida ${fmtMrp(s.qtd)}`);
      check(`cartão ${card.title} = serviço`, ok);
    }
    check("barra de composição presente em cada cartão", (await page.locator('[data-card] [data-metric="bar"]').count()) === areas.areas.length + areas.families.length + 1);

    const openCard = async (title: string, how: "click" | "Enter" | "Space") => {
      const card = page.locator(`[data-card="${title}"]`);
      await card.waitFor({ timeout: 30_000 });
      await withList(page, async () => {
        if (how === "click") await card.click();
        else {
          await card.focus();
          await page.keyboard.press(how);
        }
      });
      // Espera a navegação assentar (URL na aba Comprar) antes de ler.
      await page.waitForFunction(() => new URLSearchParams(location.search).get("tab") === "buy", null, { timeout: 30_000 });
      await page.waitForTimeout(400);
      const url = new URL(page.url());
      const subtitle = ((await page.locator("[data-testid=mrp-buy-subtitle]").textContent()) ?? "").trim();
      return { url, subtitle, visibleBuy: await page.locator("[data-testid=mrp-buy-table], [data-testid=mrp-buy-subtitle]").first().isVisible() };
    };
    const expectBuy = (label: string, r: Awaited<ReturnType<typeof openCard>>, area: string, family: string, count: number) =>
      check(
        `${label} → Comprar, need, área "${area}", conjunto "${family}", ${count} materiais`,
        r.url.searchParams.get("tab") === "buy" && (r.url.searchParams.get("status") ?? "need") === "need" && (r.url.searchParams.get("area") ?? "") === area && (r.url.searchParams.get("family") ?? "") === family && r.visibleBuy && r.subtitle.startsWith(`${fmtMrp(count)} materiais no filtro`),
        `${r.url.search} · ${r.subtitle}`
      );
    const [mec, ele, tot] = areas.areas;
    expectBuy("clique Mecânica", await openCard("Mecânica", "click"), "Mecânica", "", mec.summary.Comprar + mec.summary.Verificar);
    await page.goBack();
    await page.locator("[data-testid=mrp-areas]").waitFor({ timeout: 30_000 });
    check("voltar retorna para Áreas & Conjuntos", new URL(page.url()).searchParams.get("tab") === "areas");
    await page.waitForTimeout(1500); // deixa terminar a recarga disparada pelo voltar
    await page.goForward();
    const mecText = `${fmtMrp(mec.summary.Comprar + mec.summary.Verificar)} materiais no filtro`;
    const forwardOk = await page.locator("[data-testid=mrp-buy-subtitle]", { hasText: mecText }).first().waitFor({ timeout: 20_000 }).then(() => true, () => false);
    await page.waitForTimeout(1500); // deixa terminar as recargas disparadas pelo voltar/avançar
    check("avançar volta para a lista filtrada da Mecânica", forwardOk && new URL(page.url()).searchParams.get("area") === "Mecânica", `${page.url()} · ${await page.locator("[data-testid=mrp-buy-subtitle]").first().textContent()}`);
    await page.locator('[data-tab="areas"]').click();
    expectBuy("Enter no cartão Elétrica", await openCard("Elétrica", "Enter"), "Elétrica", "", ele.summary.Comprar + ele.summary.Verificar);
    await page.locator('[data-tab="areas"]').click();
    expectBuy("Espaço no cartão Total", await openCard("Total", "Space"), "", "", tot.summary.Comprar + tot.summary.Verificar);
    const breton8 = areas.families.find((f) => f.title === "Satélite Breton 8");
    if (breton8) {
      await page.locator('[data-tab="areas"]').click();
      expectBuy("clique Satélite Breton 8 (limpa a área)", await openCard("Satélite Breton 8", "click"), "", "Satélite Breton 8", breton8.summary.Comprar + breton8.summary.Verificar);
    }
    await page.locator('[data-tab="areas"]').click();
    expectBuy("clique Todos os conjuntos → lista GERAL (legacy parity behavior)", await openCard("Todos os conjuntos", "click"), "", "", tot.summary.Comprar + tot.summary.Verificar);
    await page.locator('[data-tab="areas"]').click();
    await page.locator("[data-testid=mrp-areas]").waitFor();
    const sel = await page.$$eval("[data-tab]", (els) => els.map((e) => `${e.getAttribute("data-tab")}=${e.getAttribute("aria-selected")}:${e.className.includes("bg-gold/15") ? "destacada" : "-"}`));
    check("após clicar em Áreas: só a aba Áreas destacada", sel.includes("areas=true:destacada") && sel.includes("buy=false:-"), sel.join(" "));
    await page.mouse.move(5, 5);
    await shot(page, "6-areas");

    console.log("\n8. Em trânsito (FASE G)");
    const kp = run!.kpis as Record<string, Any>;
    const withTransit = async (action: () => Promise<unknown>) => {
      await Promise.all([page.waitForResponse((r) => r.url().includes("/api/mrp/analysis/current/transit"), { timeout: 60_000 }), action()]);
      await page.waitForTimeout(300);
    };
    await withTransit(() => page.goto(`${BASE}/dashboard/analise-mrp?tab=transit`, { waitUntil: "load", timeout: 120_000 }));
    await page.locator("[data-testid=mrp-transit-table], [data-testid=mrp-transit-empty]").first().waitFor({ timeout: 60_000 });
    check("?tab=transit abre direto em Em trânsito", await page.locator('[data-tab="transit"][aria-selected="true"]').isVisible());
    const tKpi = async (label: string) => ((await page.locator(`[data-testid=mrp-transit] [data-kpi="${label}"] [data-kpi-value]`).textContent()) ?? "").trim();
    const expectedK: [string, number][] = [["Linhas de compra", kp.purchases.linhas], ["Em trânsito", kp.purchases.pendentes], ["Qtd. em trânsito", kp.purchases.qtdPendente], ["Recebidos", kp.purchases.recebidos], ["Saíram do MRP", kp.removedFromMrp]];
    for (const [label, value] of expectedK) check(`KPI ${label} = ${fmtMrp(value)} (banco)`, (await tKpi(label)) === fmtMrp(value), await tKpi(label));
    const hint = ((await page.locator('[data-testid=mrp-transit] [data-kpi="Saíram do MRP"] [data-kpi-hint]').textContent()) ?? "").trim();
    check("Saíram do MRP: qtd. evitada", hint === `${fmtMrp(kp.avoidedQty)} de qtd. evitada`, hint);
    const tCodes = () => page.$$eval("[data-testid=mrp-transit-table] tbody tr", (rows) => rows.map((r) => r.getAttribute("data-code") ?? ""));
    const apiPend = await getCurrentMrpTransitListing({ q: "", status: "pend", onlyMrp: false }, 100_000);
    check(`tabela padrão (Em trânsito) = API (${apiPend!.filteredCount} códigos)`, (await tCodes()).join() === apiPend!.items.map((i) => i.code).join());
    check("8 colunas", (await page.locator("[data-testid=mrp-transit-table] thead th").allTextContents()).join("|") === "Código|Material|Qtd|Fornecedor|Pedido / Req.|Data|Previsão|Situação");
    await withTransit(() => page.selectOption("select[aria-label='Situação da compra']", "all"));
    const apiAll = await getCurrentMrpTransitListing({ q: "", status: "all", onlyMrp: false }, 100_000);
    check(`Todos = API (${apiAll!.filteredCount}) e URL com transitStatus=all`, (await tCodes()).join() === apiAll!.items.map((i) => i.code).join() && new URL(page.url()).searchParams.get("transitStatus") === "all");
    const outside = apiAll!.items.filter((i) => !i.inBase).map((i) => i.code);
    check(`materiais fora da base com selo (${outside.join(", ") || "nenhum"})`, outside.length > 0 && (await page.locator('[data-badge="fora-base"]').count()) === outside.length);
    await withTransit(() => page.locator("[data-testid=mrp-transit-only-mrp]").check());
    const apiMrp = await getCurrentMrpTransitListing({ q: "", status: "all", onlyMrp: true }, 100_000);
    check("Só materiais da base MRP: some quem está fora", (await tCodes()).join() === apiMrp!.items.map((i) => i.code).join() && (await page.locator('[data-badge="fora-base"]').count()) === 0 && new URL(page.url()).searchParams.get("transitMrp") === "1");
    await withTransit(() => page.locator("[data-testid=mrp-transit-only-mrp]").uncheck());
    await withTransit(() => page.fill("[data-testid=mrp-transit-search]", "fornecedor b"));
    const apiSearch = await getCurrentMrpTransitListing({ q: "fornecedor b", status: "all", onlyMrp: false }, 100_000);
    check(`busca por fornecedor (norm) = API (${apiSearch!.filteredCount} > 0)`, apiSearch!.filteredCount > 0 && (await tCodes()).join() === apiSearch!.items.map((i) => i.code).join());
    await withTransit(() => page.fill("[data-testid=mrp-transit-search]", ""));
    await page.locator('[data-tab="buy"]').click();
    await page.locator('[data-tab="transit"]').click();
    check("filtros de Em trânsito preservados ao ir e voltar de Comprar", (await page.locator("select[aria-label='Situação da compra']").inputValue()) === "all");
    await shot(page, "8-transito");
    const removed = kp.removedFromMrp as number;
    await withList(page, () => page.locator('[data-testid=mrp-transit] [data-kpi="Saíram do MRP"]').click());
    const boughtUrl = new URL(page.url());
    const boughtText = ((await page.locator("[data-testid=mrp-buy-subtitle]").first().textContent()) ?? "") + ((await page.getByText("Nenhum material neste filtro").count()) ? " [vazio]" : "");
    check(`Saíram do MRP → Comprar/Comprado, sem área/conjunto/busca, ${removed} materiais`,
      boughtUrl.searchParams.get("tab") === "buy" && boughtUrl.searchParams.get("status") === "Comprado" && !boughtUrl.searchParams.get("area") && !boughtUrl.searchParams.get("family") && !boughtUrl.searchParams.get("q") &&
        (removed === 0 ? boughtText.includes("[vazio]") : boughtText.startsWith(`${fmtMrp(removed)} materiais`)),
      `${boughtUrl.search} · ${boughtText}`);
    await page.goBack();
    await page.locator("[data-testid=mrp-transit]").waitFor({ timeout: 30_000 });
    check("voltar retorna para Em trânsito", new URL(page.url()).searchParams.get("tab") === "transit" && (await page.locator('[data-tab="transit"][aria-selected="true"]').isVisible()));
    await page.reload({ waitUntil: "load" });
    await page.locator("[data-testid=mrp-transit]").waitFor({ timeout: 60_000 });
    check("refresh mantém Em trânsito e o filtro da URL", (await page.locator("select[aria-label='Situação da compra']").inputValue()) === "all");

    console.log("\n9. Estoque parado (FASE H)");
    const withIdle = async (action: () => Promise<unknown>) => {
      await Promise.all([page.waitForResponse((r) => r.url().includes("/api/mrp/analysis/current/idle-stock"), { timeout: 60_000 }), action()]);
      await page.waitForTimeout(300);
    };
    await withIdle(() => page.goto(`${BASE}/dashboard/analise-mrp?tab=idle`, { waitUntil: "load", timeout: 120_000 }));
    check("?tab=idle abre direto em Estoque parado", await page.locator('[data-tab="idle"][aria-selected="true"]').isVisible());
    const iKpi = async (label: string) => ((await page.locator(`[data-testid=mrp-idle] [data-kpi="${label}"] [data-kpi-value]`).textContent()) ?? "").trim();
    const readIdleKpis = async () => [await iKpi("Sem movimentação"), await iKpi("Com saldo"), await iKpi("Qtd. parada"), await iKpi("Zerados")].join("|");
    const expectedIdle = [kp.semMov, kp.parado, kp.qtdParada, kp.semMov - kp.parado].map(fmtMrp).join("|");
    check(`4 KPIs = banco (${expectedIdle})`, (await readIdleKpis()) === expectedIdle, await readIdleKpis());
    const share = ((await page.locator('[data-testid=mrp-idle] [data-kpi="Sem movimentação"] [data-kpi-hint]').textContent()) ?? "").trim();
    check(`percentual da base "${share}"`, share === `${((kp.semMov / Math.max(1, kp.total)) * 100).toFixed(1).replace(".", ",")}% da base`);
    const iRows = () => page.$$eval("[data-testid=mrp-idle-table] tbody tr", (rows) => rows.map((r) => `${r.getAttribute("data-code")}|${r.getAttribute("data-situation")}`));
    const apiCom = await getCurrentMrpIdleListing({ q: "", type: "com", area: "" }, 100_000);
    const comRows = await iRows();
    check(`padrão "Com saldo": ${apiCom!.filteredCount} linhas, todas Capital parado, = API`, comRows.every((r) => r.endsWith("|Capital parado")) && comRows.map((r) => r.split("|")[0]).join() === apiCom!.items.map((i) => i.code).join());
    check("5 colunas", (await page.locator("[data-testid=mrp-idle-table] thead th").allTextContents()).join("|") === "Código|Material|Saldo|Grupo|Situação");
    await withIdle(() => page.selectOption("select[aria-label='Tipo de estoque parado']", "sem"));
    const semRows = await iRows();
    check(`Zerados: ${semRows.length} linhas, todas Zerado; URL idleType=sem`, semRows.length > 0 && semRows.every((r) => r.endsWith("|Zerado")) && new URL(page.url()).searchParams.get("idleType") === "sem");
    check("KPIs não mudam com o filtro", (await readIdleKpis()) === expectedIdle);
    await withIdle(() => page.selectOption("select[aria-label='Tipo de estoque parado']", "all"));
    const i200 = (await iRows()).length;
    await withIdle(() => page.getByRole("button", { name: "mostrar mais" }).click());
    const i600 = await iRows();
    await withIdle(() => page.getByRole("button", { name: "mostrar mais" }).click());
    const i1000 = await iRows();
    check("Todos + mostrar mais: 200 → 600 → 1000 sem duplicar", i200 === 200 && i600.length === 600 && i1000.length === 1000 && new Set(i1000).size === 1000 && i1000.slice(0, 600).join() === i600.join(), `${i200}/${i600.length}/${i1000.length}`);
    await withIdle(() => page.selectOption("select[aria-label='Área do estoque parado']", "Elétrica"));
    const apiEleIdle = await getCurrentMrpIdleListing({ q: "", type: "all", area: "Elétrica" }, 100_000);
    check(`área Elétrica = API (${apiEleIdle!.filteredCount})`, ((await page.locator("[data-testid=mrp-idle-count]").textContent()) ?? "").startsWith(`${fmtMrp(apiEleIdle!.filteredCount)} materiais`));
    await withIdle(() => page.fill("[data-testid=mrp-idle-search]", "anilha"));
    const apiSearchIdle = await getCurrentMrpIdleListing({ q: "anilha", type: "all", area: "Elétrica" }, 100_000);
    check(`busca "anilha" = API (${apiSearchIdle!.filteredCount} > 0)`, apiSearchIdle!.filteredCount > 0 && (await iRows()).map((r) => r.split("|")[0]).join() === apiSearchIdle!.items.map((i) => i.code).join());
    await page.locator('[data-tab="buy"]').click();
    await page.locator('[data-tab="idle"]').click();
    check("filtros preservados ao ir e voltar de Comprar", (await page.locator("select[aria-label='Tipo de estoque parado']").inputValue()) === "all" && (await page.locator("[data-testid=mrp-idle-search]").inputValue()) === "anilha");
    await page.goBack();
    check("voltar sai de Estoque parado (para Comprar)", new URL(page.url()).searchParams.get("tab") === "buy");
    await page.goForward();
    await page.locator("[data-testid=mrp-idle]").waitFor({ timeout: 30_000 });
    check("avançar volta para Estoque parado", (await page.locator('[data-tab="idle"][aria-selected="true"]').isVisible()));
    await page.reload({ waitUntil: "load" });
    await page.locator("[data-testid=mrp-idle-table]").waitFor({ timeout: 60_000 });
    check("refresh mantém a aba e os filtros (idleType/idleArea/idleQ)", (await page.locator("select[aria-label='Tipo de estoque parado']").inputValue()) === "all" && (await page.locator("select[aria-label='Área do estoque parado']").inputValue()) === "Elétrica" && (await page.locator("[data-testid=mrp-idle-search]").inputValue()) === "anilha");
    await page.mouse.move(5, 5);
    await shot(page, "10-estoque-parado");

    console.log("\n9b. Base MRP (FASE I)");
    const withBase = async (action: () => Promise<unknown>) => {
      await Promise.all([page.waitForResponse((r) => r.url().includes("/api/mrp/base/current/items"), { timeout: 60_000 }), action()]);
      await page.waitForTimeout(300);
    };
    const bRows = () => page.$$eval("[data-testid=mrp-base-table] tbody tr", (rows) => rows.map((r) => r.getAttribute("data-code") ?? ""));
    const metric = async (m: string) => ((await page.locator(`[data-testid=mrp-base-summary] [data-metric="${m}"]`).textContent()) ?? "").trim();
    const CONFIRM = "A alteração da Base MRP recalculará a análise atual usando o mesmo estoque e as mesmas compras. Deseja continuar?";
    await withBase(() => page.goto(`${BASE}/dashboard/analise-mrp?tab=base`, { waitUntil: "load", timeout: 120_000 }));
    check("?tab=base abre direto em Base MRP", await page.locator('[data-tab="base"][aria-selected="true"]').isVisible());
    const bv = await getMrpBaseView();
    const runNow = await prisma.mrpAnalysisRun.findFirst({ where: { isCurrent: true } });
    check("exibe a base da análise atual", !!bv && bv.version.id === runNow?.baseVersionId && bv.origin === "run");
    const sm = bv!.summary;
    const expectedSummary = [`${fmtMrp(sm.total)} materiais`, `Mecânica ${fmtMrp(sm.mechanical)}`, `Elétrica ${fmtMrp(sm.electrical)}`, `${fmtMrp(sm.noParams)} sem mín/máx`, `${fmtMrp(sm.inFamilies)} em satélites/coroas`].join("|");
    const shownSummary = [await metric("total"), await metric("mec"), await metric("ele"), await metric("semparam"), await metric("conj")].join("|");
    check(`resumo = banco (${expectedSummary})`, shownSummary === expectedSummary, shownSummary);
    const originText = (await page.locator("[data-testid=mrp-base-summary]").textContent()) ?? "";
    check("origem exibida", bv!.version.source === "SEED_HTML" ? originText.includes("Base inicial do sistema") : originText.includes(`Planilha enviada: ${bv!.version.fileName}`));
    check("6 colunas", (await page.locator("[data-testid=mrp-base-table] thead th").allTextContents()).join("|") === "Código|Material|Mín|Máx|Grupo|Status MRP");
    const apiBase = await getCurrentMrpBaseListing({ q: "", area: "", filter: "all" }, 100_000);
    const cells = await page.$$eval("[data-testid=mrp-base-table] tbody tr", (rows) => rows.map((r) => Array.from(r.querySelectorAll("td")).map((td, i) => (i === 1 ? "" : (td.textContent ?? "").trim())).join("|")));
    const expectedCells = apiBase!.items.slice(0, 200).map((m) => [m.code, "", fmtMrp(m.min), fmtMrp(m.max), m.group || "—", m.statusMrp || "—"].join("|"));
    check("200 primeiras linhas = API (ordem, Mín, Máx, Grupo, Status MRP; vazio = —)", cells.join("\n") === expectedCells.join("\n"));
    const b200 = await bRows();
    await withBase(() => page.getByRole("button", { name: "mostrar mais" }).click());
    const b600 = await bRows();
    await withBase(() => page.getByRole("button", { name: "mostrar mais" }).click());
    const b1000 = await bRows();
    check("mostrar mais: 200 → 600 → 1000 na ordem da base, sem duplicar", b200.length === 200 && b600.length === 600 && b1000.length === 1000 && new Set(b1000).size === 1000 && b1000.join() === apiBase!.items.slice(0, 1000).map((i) => i.code).join(), `${b200.length}/${b600.length}/${b1000.length}`);
    await withBase(() => page.selectOption("select[aria-label='Filtro da base']", "semparam"));
    const apiSem = await getCurrentMrpBaseListing({ q: "", area: "", filter: "semparam" }, 100_000);
    const semCount = ((await page.locator("[data-testid=mrp-base-count]").textContent()) ?? "").trim();
    const semRowsN = await page.locator("[data-testid=mrp-base-table] tbody tr").count();
    const semBadges = await page.locator("[data-testid=mrp-base-table] [data-badge=semparam]").count();
    check(`Sem mín/máx: ${apiSem!.filteredCount} = API, todas com o selo; URL baseFilter=semparam`, semCount.startsWith(`${fmtMrp(apiSem!.filteredCount)} materiais`) && semRowsN === semBadges && new URL(page.url()).searchParams.get("baseFilter") === "semparam", `${semCount} · ${semRowsN}/${semBadges}`);
    await withBase(() => page.selectOption("select[aria-label='Filtro da base']", "conj"));
    await withBase(() => page.selectOption("select[aria-label='Área da base']", "Mecânica"));
    const apiConj = await getCurrentMrpBaseListing({ q: "", area: "Mecânica", filter: "conj" }, 100_000);
    check(`satélites/coroas + Mecânica = API (${apiConj!.filteredCount})`, (await bRows()).join() === apiConj!.items.map((i) => i.code).join());
    await withBase(() => page.fill("[data-testid=mrp-base-search]", "breton"));
    const apiQ = await getCurrentMrpBaseListing({ q: "breton", area: "Mecânica", filter: "conj" }, 100_000);
    check(`busca "breton" = API (${apiQ!.filteredCount})`, apiQ!.filteredCount === 0 ? await page.locator("[data-testid=mrp-base-empty]").isVisible() : (await bRows()).join() === apiQ!.items.map((i) => i.code).join());
    await withBase(() => page.fill("[data-testid=mrp-base-search]", "zzz-nao-existe"));
    check("filtro sem resultado: mensagem própria", await page.locator("[data-testid=mrp-base-empty]").getByText("Nenhum material neste filtro").isVisible());
    await withBase(() => page.fill("[data-testid=mrp-base-search]", "breton"));
    check("Excel da base habilitado (FASE J)", await page.locator("[data-testid=mrp-export-base]").isEnabled());
    await page.reload({ waitUntil: "load" });
    await page.locator("[data-testid=mrp-base-summary]").waitFor({ timeout: 60_000 });
    await page.waitForTimeout(800);
    check(
      "refresh mantém a aba e os filtros (baseQ/baseArea/baseFilter)",
      (await page.locator("select[aria-label='Filtro da base']").inputValue()) === "conj" && (await page.locator("select[aria-label='Área da base']").inputValue()) === "Mecânica" && (await page.locator("[data-testid=mrp-base-search]").inputValue()) === "breton"
    );
    await page.locator('[data-tab="buy"]').click();
    await page.goBack();
    await page.waitForFunction(() => new URL(location.href).searchParams.get("tab") === "base", undefined, { timeout: 30_000 });
    check("voltar retorna para Base MRP com os filtros", (await page.locator('[data-tab="base"][aria-selected="true"]').isVisible()) && (await page.locator("[data-testid=mrp-base-search]").inputValue()) === "breton");
    await page.goForward();
    await page.waitForFunction(() => new URL(location.href).searchParams.get("tab") === "buy", undefined, { timeout: 30_000 });
    check("avançar vai para Comprar", await page.locator('[data-tab="buy"][aria-selected="true"]').isVisible());
    await shot(page, "12-base");

    // Envio de base pela aba.
    await withBase(() => page.goto(`${BASE}/dashboard/analise-mrp?tab=base`, { waitUntil: "load", timeout: 120_000 }));
    const baseFile = F.baseFixture();
    await page.setInputFiles("[data-testid=mrp-base-file]", { name: baseFile.name, mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", buffer: baseFile.data });
    if (!storageReady) {
      await page.locator("[data-testid=mrp-base] [role=alert]").waitFor({ timeout: 60_000 });
      const msg = (await page.locator("[data-testid=mrp-base] [role=alert]").textContent()) ?? "";
      check("sem Storage local: erro do envio exibido na aba", /Armazenamento de importações não configurado/.test(msg), msg);
      check("nada muda (mesma análise vigente)", (await prisma.mrpAnalysisRun.findFirst({ where: { isCurrent: true } }))?.id === runNow?.id);
      console.log("    (envio real da base pela aba: validar no Preview da Vercel, onde a chave do Storage existe)");
    } else {
      await page.locator("[data-testid=mrp-base-pending]").waitFor({ timeout: 120_000 });
      await page.locator("[data-testid=mrp-base-apply]").click();
      check("confirmação com o texto pedido", ((await page.locator("[data-testid=mrp-base-confirm]").textContent()) ?? "").includes(CONFIRM));
      await Promise.all([page.waitForResponse((r) => r.url().includes("/api/mrp/base/replace"), { timeout: 300_000 }), page.locator("[data-testid=mrp-base-confirm]").getByRole("button", { name: "Atualizar Base MRP" }).click()]);
      await page.waitForTimeout(1500);
      const rr = await prisma.mrpAnalysisRun.findFirst({ where: { isCurrent: true } });
      check("BASE_REIMPORT pela tela: mesmo estoque e compras", rr?.trigger === "BASE_REIMPORT" && rr.stockImportId === runNow?.stockImportId && rr.purchaseImportId === runNow?.purchaseImportId);
    }

    // Base ativa diferente da usada pela análise → aviso; restaurar pela tela.
    const baseFiles = new Map<string, Buffer>();
    const bpath = `imports/analise-mrp/e2e/${Date.now()}-${baseFile.name}`;
    baseFiles.set(bpath, baseFile.data);
    const bh = await prisma.importHistory.create({
      data: { type: "MRP_BASE", fileName: baseFile.name, importedBy: USER.name, status: "EM_PROCESSAMENTO", stage: "UPLOADED", filePath: bpath, bucket: "e2e", metadata: { mrp: { flow: "analise-mrp", kind: "base", sheet: "MRP Analise manutenção" } } }
    });
    const other = await confirmMrpImport({ items: [{ importId: bh.id, kind: "base", sheet: "MRP Analise manutenção" }], activateBase: true, createdBy: USER.name, download: async (p) => baseFiles.get(p)! });
    const runBefore = await prisma.mrpAnalysisRun.findFirst({ where: { isCurrent: true } });
    await withBase(() => page.reload({ waitUntil: "load" }));
    check("aviso: Base MRP ativa diferente da utilizada pela análise atual", ((await page.locator("[data-testid=mrp-base-mismatch]").textContent()) ?? "").includes("Existe uma Base MRP ativa diferente da utilizada pela análise atual."));
    const viewNow = await getMrpBaseView();
    check("continua exibindo a base da análise (não a ativa)", viewNow!.version.id === runBefore?.baseVersionId && other.baseVersionId !== runBefore?.baseVersionId && (await metric("total")) === `${fmtMrp(viewNow!.summary.total)} materiais`);
    await shot(page, "13-base-aviso");
    await page.locator("[data-testid=mrp-base-restore]").click();
    check("restaurar pede confirmação com o texto pedido", ((await page.locator("[data-testid=mrp-base-confirm]").textContent()) ?? "").includes(CONFIRM));
    const [restoreRes] = await Promise.all([page.waitForResponse((r) => r.url().includes("/api/mrp/base/restore"), { timeout: 300_000 }), page.locator("[data-testid=mrp-base-confirm]").getByRole("button", { name: "Restaurar" }).click()]);
    check("POST /api/mrp/base/restore 200", restoreRes.status() === 200, String(restoreRes.status()));
    await page.waitForTimeout(2000);
    const restored = await prisma.mrpAnalysisRun.findFirst({ where: { isCurrent: true } });
    check(
      "BASE_RESTORE: seed ativa + run novo vigente com o mesmo estoque e compras",
      restored?.trigger === "BASE_RESTORE" && restored.baseVersionId === seed.id && (await getActiveMrpBaseVersion())?.id === seed.id && restored.stockImportId === runBefore?.stockImportId && restored.purchaseImportId === runBefore?.purchaseImportId
    );
    await withBase(() => page.reload({ waitUntil: "load" }));
    check("aviso some e o botão fica desabilitado (base inicial em uso)", (await page.locator("[data-testid=mrp-base-mismatch]").count()) === 0 && (await page.locator("[data-testid=mrp-base-restore]").isDisabled()));
    check("resumo volta à base inicial (4.280)", (await metric("total")) === "4.280 materiais");

    // Permissões: VISUALIZADOR vê, mas não altera.
    const viewerToken = await signSession({ sub: "e2e-analise-mrp-viewer", name: "Teste E2E MRP Viewer", role: "VISUALIZADOR" }, secret, 60 * 60);
    const viewerCtx = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: "pt-BR" });
    await viewerCtx.addCookies([{ name: "zucchi-auth", value: viewerToken, domain: "localhost", path: "/" }]);
    const vp = await viewerCtx.newPage();
    await Promise.all([vp.waitForResponse((r) => r.url().includes("/api/mrp/base/current/items"), { timeout: 60_000 }), vp.goto(`${BASE}/dashboard/analise-mrp?tab=base`, { waitUntil: "load", timeout: 120_000 })]);
    await vp.waitForTimeout(300);
    check("VISUALIZADOR vê resumo e tabela", (await vp.locator("[data-testid=mrp-base-summary]").isVisible()) && (await vp.locator("[data-testid=mrp-base-table] tbody tr").count()) > 0);
    check("VISUALIZADOR não vê envio nem restaurar", (await vp.locator("[data-testid=mrp-base-file]").count()) === 0 && (await vp.locator("[data-testid=mrp-base-restore]").count()) === 0);
    const vh = { cookie: `zucchi-auth=${viewerToken}`, "content-type": "application/json" };
    const vReplace = await fetch(`${BASE}/api/mrp/base/replace`, { method: "POST", headers: vh, body: JSON.stringify({ importId: "x" }) });
    const vRestore = await fetch(`${BASE}/api/mrp/base/restore`, { method: "POST", headers: vh, body: "{}" });
    const vGet = await fetch(`${BASE}/api/mrp/base/current`, { headers: vh });
    check("VISUALIZADOR: POST replace/restore → 403; GET base → 200", vReplace.status === 403 && vRestore.status === 403 && vGet.status === 200, `${vReplace.status}/${vRestore.status}/${vGet.status}`);
    const anon = await fetch(`${BASE}/api/mrp/base/current`, { redirect: "manual" });
    check("sem sessão: GET base não é servido (401/redirect)", anon.status === 401 || (anon.status >= 300 && anon.status < 400), String(anon.status));
    await viewerCtx.close();

    console.log("\n9c. Exportações Excel (FASE J)");
    const dlDir = join(process.cwd(), ".e2e-downloads");
    mkdirSync(dlDir, { recursive: true });
    const exportVia = async (testId: string) => {
      const [dl, res] = await Promise.all([
        page.waitForEvent("download", { timeout: 120_000 }),
        page.waitForResponse((r) => r.url().includes("/api/mrp/export"), { timeout: 120_000 }),
        page.locator(`[data-testid=${testId}]`).click()
      ]);
      const path = join(dlDir, dl.suggestedFilename());
      await dl.saveAs(path);
      const data = readFileSync(path);
      const wb = XLSX.read(data, { type: "buffer" });
      return { name: dl.suggestedFilename(), mime: res.headers()["content-type"] ?? "", bytes: data.length, names: wb.SheetNames, rows: wb.SheetNames.map((n) => XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[n], { header: 1, raw: true, defval: "" })) };
    };
    const XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
    const expectFile = (label: string, f: Awaited<ReturnType<typeof exportVia>>, name: RegExp, sheets: string) =>
      check(`${label}: ${f.name} · ${f.mime === XLSX_MIME ? "MIME xlsx" : f.mime} · ${(f.bytes / 1024).toFixed(1)} KB · abas ${f.names.join("|")}`, name.test(f.name) && f.mime === XLSX_MIME && f.bytes > 0 && f.names.join("|") === sheets);

    await page.goto(`${BASE}/dashboard/analise-mrp?tab=buy&status=all&area=${encodeURIComponent("Elétrica")}&sort=desc`, { waitUntil: "load", timeout: 120_000 });
    await page.locator("[data-testid=mrp-buy-table]").waitFor({ timeout: 60_000 });
    await page.waitForTimeout(500);
    const fBuy = await exportVia("mrp-export-buy");
    expectFile("Excel da lista (Todos + Elétrica + A→Z)", fBuy, /^Lista_Compra_MRP_\d{8}\.xlsx$/, "Lista de compra");
    const apiBuy = await getCurrentMrpBuyListing({ q: "", status: "all", area: "Elétrica", family: "", sort: "desc" }, 100_000);
    const shownBuy = await rowCodes(page);
    check(`lista: Excel = API = tela (${apiBuy!.filteredCount} linhas, mesma ordem)`, fBuy.rows[0].slice(1).map((r) => String(r[0])).join() === apiBuy!.items.map((i) => i.code).join() && apiBuy!.items.slice(0, shownBuy.length).map((i) => i.code).join() === shownBuy.join());
    const fArea = await exportVia("mrp-export-buy-by-area");
    expectFile("Por área com área=Elétrica na tela", fArea, /^Lista_Compra_MRP_\d{8}\.xlsx$/, "Elétrica");
    // Duplo clique não gera dois downloads.
    let exportRequests = 0;
    const countExports = (r: { url(): string }) => {
      if (r.url().includes("/api/mrp/export")) exportRequests++;
    };
    page.on("request", countExports);
    const dlDouble = page.waitForEvent("download", { timeout: 120_000 });
    await page.locator("[data-testid=mrp-export-buy]").dblclick();
    await dlDouble;
    await page.waitForTimeout(1500);
    page.off("request", countExports);
    check("duplo clique: 1 requisição (botão em carregamento)", exportRequests === 1, String(exportRequests));

    await page.goto(`${BASE}/dashboard/analise-mrp?tab=areas`, { waitUntil: "load", timeout: 120_000 });
    await page.locator("[data-testid=mrp-areas]").waitFor({ timeout: 60_000 });
    const fFam = await exportVia("mrp-export-families");
    expectFile("Excel por conjunto", fFam, /^Satelites_Coroas_\d{8}\.xlsx$/, "Satélite Simec 6|Satélite Breton 8|Satélite Breton 6|Satélites Breton|Coroa Cemar");

    await page.goto(`${BASE}/dashboard/analise-mrp?tab=transit&transitQ=zzz-nada`, { waitUntil: "load", timeout: 120_000 });
    await page.locator("[data-testid=mrp-transit]").waitFor({ timeout: 60_000 });
    const fTr = await exportVia("mrp-export-transit");
    expectFile("Compras (com a tela filtrada)", fTr, /^Compras_Realizadas_\d{8}\.xlsx$/, "Compras");
    const runTr = await prisma.mrpAnalysisRun.findFirst({ where: { isCurrent: true } });
    const trAll = await getCurrentMrpTransitListing({ q: "", status: "all", onlyMrp: false }, 100_000);
    check(`Compras: TODOS os ${trAll!.totalGroups} grupos apesar do filtro da tela; 12 colunas`, fTr.rows[0].length - 1 === trAll!.totalGroups && fTr.rows[0][0].length === 12 && !!runTr);

    await page.goto(`${BASE}/dashboard/analise-mrp?tab=idle&idleType=all`, { waitUntil: "load", timeout: 120_000 });
    await page.locator("[data-testid=mrp-idle-table]").waitFor({ timeout: 60_000 });
    const fIdle = await exportVia("mrp-export-idle");
    expectFile("Estoque parado (Todos)", fIdle, /^Estoque_Parado_\d{8}\.xlsx$/, "Sem movimentacao");
    const apiIdleAll = await getCurrentMrpIdleListing({ q: "", type: "all", area: "" }, 100_000);
    check(`Estoque parado: 12 colunas, ${apiIdleAll!.filteredCount} linhas na ordem da tela`, fIdle.rows[0][0].length === 12 && fIdle.rows[0].slice(1).map((r) => String(r[0])).join() === apiIdleAll!.items.map((i) => i.code).join());

    await page.goto(`${BASE}/dashboard/analise-mrp?tab=base&baseFilter=conj`, { waitUntil: "load", timeout: 120_000 });
    await page.locator("[data-testid=mrp-base-table]").waitFor({ timeout: 60_000 });
    const fBase = await exportVia("mrp-export-base");
    expectFile("Excel da base (só satélites e coroas)", fBase, /^Base_MRP_\d{8}\.xlsx$/, "Base MRP");
    const apiBaseConj = await getCurrentMrpBaseListing({ q: "", area: "", filter: "conj" }, 100_000);
    check(`Excel da base: 9 colunas, ${apiBaseConj!.filteredCount} linhas = aba`, fBase.rows[0][0].length === 9 && fBase.rows[0].slice(1).map((r) => String(r[0])).join() === apiBaseConj!.items.map((i) => i.code).join());

    // Permissões: leitura para qualquer usuário autenticado.
    const viewerExport = await fetch(`${BASE}/api/mrp/export?type=buy&status=all`, { headers: { cookie: `zucchi-auth=${viewerToken}` } });
    const viewerBytes = (await viewerExport.arrayBuffer()).byteLength;
    check("VISUALIZADOR exporta (200, xlsx)", viewerExport.status === 200 && (viewerExport.headers.get("content-type") ?? "") === XLSX_MIME && viewerBytes > 0, `${viewerExport.status} ${viewerBytes} bytes`);
    const anonExport = await fetch(`${BASE}/api/mrp/export?type=buy`, { redirect: "manual" });
    check("sem sessão: exportação negada", anonExport.status === 401 || (anonExport.status >= 300 && anonExport.status < 400), String(anonExport.status));
    const badType = await fetch(`${BASE}/api/mrp/export?type=xyz`, { headers: { cookie: `zucchi-auth=${token}` } });
    check("tipo inválido → 400", badType.status === 400, String(badType.status));
    rmSync(dlDir, { recursive: true, force: true });

    console.log("\n10. Celular");
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`${BASE}/dashboard/analise-mrp`, { waitUntil: "load", timeout: 120_000 });
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    check("sem rolagem horizontal da página no celular", overflow <= 0, `excesso ${overflow}px`);
    await shot(page, "5-celular");
    await page.goto(`${BASE}/dashboard/analise-mrp?tab=areas`, { waitUntil: "load", timeout: 120_000 });
    await page.locator("[data-testid=mrp-areas]").waitFor({ timeout: 60_000 });
    const overflowAreas = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    check("Áreas & Conjuntos no celular sem rolagem horizontal", overflowAreas <= 0, `excesso ${overflowAreas}px`);
    await shot(page, "7-areas-celular");
    await page.goto(`${BASE}/dashboard/analise-mrp?tab=transit&transitStatus=all`, { waitUntil: "load", timeout: 120_000 });
    await page.locator("[data-testid=mrp-transit-table]").waitFor({ timeout: 60_000 });
    const overflowTransit = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    check("Em trânsito no celular sem rolagem horizontal", overflowTransit <= 0, `excesso ${overflowTransit}px`);
    await shot(page, "9-transito-celular");
    await page.goto(`${BASE}/dashboard/analise-mrp?tab=idle&idleType=all`, { waitUntil: "load", timeout: 120_000 });
    await page.locator("[data-testid=mrp-idle-table]").waitFor({ timeout: 60_000 });
    const overflowIdle = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    check("Estoque parado no celular sem rolagem horizontal", overflowIdle <= 0, `excesso ${overflowIdle}px`);
    await shot(page, "11-parado-celular");
    await page.goto(`${BASE}/dashboard/analise-mrp?tab=base`, { waitUntil: "load", timeout: 120_000 });
    await page.locator("[data-testid=mrp-base-table]").waitFor({ timeout: 60_000 });
    const overflowBase = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    check("Base MRP no celular sem rolagem horizontal", overflowBase <= 0, `excesso ${overflowBase}px`);
    await shot(page, "14-base-celular");
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
