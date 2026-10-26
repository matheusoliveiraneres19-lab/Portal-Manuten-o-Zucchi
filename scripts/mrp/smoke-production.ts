/**
 * ANÁLISE MRP (FASE FINAL) — smoke test SOMENTE LEITURA no deploy de Production.
 *
 *   npx tsx scripts/mrp/smoke-production.ts --url=https://project-9xvus.vercel.app [--shots=pasta]
 *
 * Sessões de teste assinadas (ADMIN, GESTOR, VISUALIZADOR). Não executa
 * "Atualizar tudo", não envia planilhas, não restaura base. As únicas
 * requisições de escrita são as do VISUALIZADOR, que precisam ser recusadas (403)
 * antes de qualquer gravação. Adapta-se ao estado do banco: sem análise vigente,
 * as abas da análise devem mostrar o estado vazio e as exportações da análise
 * devem recusar com "Gere a análise primeiro.".
 */
import { loadDotEnv } from "./script-db";
import { mkdirSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import * as XLSX from "xlsx";
import { chromium, type BrowserContext } from "playwright";
import { signSession } from "../../src/lib/session";

const BASE = (process.argv.find((a) => a.startsWith("--url="))?.slice(6) ?? "").replace(/\/$/, "");
const shotsDir = process.argv.find((a) => a.startsWith("--shots="))?.slice(8);
let failures = 0;
function check(label: string, ok: boolean, detail = "") {
  if (!ok) failures++;
  console.log(`  ${ok ? "✓" : "✗"} ${label}${detail ? `  — ${detail}` : ""}`);
}
const XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

async function main() {
  if (!/^https:\/\//.test(BASE)) throw new Error("Informe --url=https://<domínio de produção>");
  const secret = process.env.AUTH_SECRET || loadDotEnv().AUTH_SECRET;
  const tokens = {
    ADMIN: await signSession({ sub: "smoke-mrp-admin", name: "Smoke MRP Admin", role: "ADMIN" }, secret, 1800),
    GESTOR: await signSession({ sub: "smoke-mrp-gestor", name: "Smoke MRP Gestor", role: "GESTOR" }, secret, 1800),
    VISUALIZADOR: await signSession({ sub: "smoke-mrp-viewer", name: "Smoke MRP Viewer", role: "VISUALIZADOR" }, secret, 1800)
  };
  const get = (path: string, role?: keyof typeof tokens, init: RequestInit = {}) =>
    fetch(`${BASE}${path}`, { redirect: "manual", ...init, headers: { ...(role ? { cookie: `zucchi-auth=${tokens[role]}` } : {}), ...(init.headers ?? {}) } });

  console.log(`Production: ${BASE}`);
  console.log("\n1. Rotas e proteção (sem sessão)");
  const legacy = await get("/dashboard/lubrificantes");
  check("/dashboard/lubrificantes → 307 /dashboard/analise-mrp", legacy.status === 307 && (legacy.headers.get("location") ?? "").endsWith("/dashboard/analise-mrp"), `${legacy.status} ${legacy.headers.get("location")}`);
  const anonPage = await get("/dashboard/analise-mrp");
  check("/dashboard/analise-mrp sem sessão → login", anonPage.status >= 300 && anonPage.status < 400 && /login/.test(anonPage.headers.get("location") ?? ""), `${anonPage.status} ${anonPage.headers.get("location")}`);
  for (const p of ["/api/mrp/analysis/current", "/api/mrp/base/current", "/api/mrp/export?type=base"]) {
    const r = await get(p);
    check(`${p} sem sessão → negado`, r.status === 401 || (r.status >= 300 && r.status < 400), String(r.status));
  }

  console.log("\n2. Sessão de teste aceita pelo deploy");
  const who = await get("/api/mrp/base/current", "ADMIN");
  check("GET /api/mrp/base/current com sessão ADMIN → 200 (deploy novo, rota MRP presente)", who.status === 200, String(who.status));
  if (who.status !== 200) throw new Error("A sessão de teste não foi aceita (AUTH_SECRET diferente?) — smoke autenticado interrompido.");
  const cur = (await (await get("/api/mrp/analysis/current", "ADMIN")).json()) as { data?: { current?: unknown } };
  const hasRun = !!cur?.data?.current;
  console.log(`    análise vigente em Production: ${hasRun ? "SIM" : "NÃO (abas da análise em estado vazio até a 1ª atualização)"}`);

  const browser = await chromium.launch();
  const dl = join(process.cwd(), ".smoke-downloads");
  mkdirSync(dl, { recursive: true });
  const ctxFor = async (role: keyof typeof tokens, width = 1440, height = 900): Promise<BrowserContext> => {
    const c = await browser.newContext({ viewport: { width, height }, locale: "pt-BR", acceptDownloads: true });
    const host = new URL(BASE).hostname;
    await c.addCookies([{ name: "zucchi-auth", value: tokens[role], domain: host, path: "/", secure: true, httpOnly: true, sameSite: "Lax" }]);
    return c;
  };
  try {
    console.log("\n3. ADMIN — página, menu, abas");
    const admin = await ctxFor("ADMIN");
    const page = await admin.newPage();
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    let t = Date.now();
    await page.goto(`${BASE}/dashboard/analise-mrp`, { waitUntil: "load", timeout: 120_000 });
    await page.locator("h1", { hasText: "Análise MRP" }).waitFor({ timeout: 60_000 });
    console.log(`    /dashboard/analise-mrp abriu em ${Date.now() - t} ms`);
    const aside = page.locator("aside").first();
    check("menu: Análise MRP → /dashboard/analise-mrp; sem Lubrificantes", (await aside.locator('a[href="/dashboard/analise-mrp"]').count()) === 1 && (await aside.getByText("Lubrificantes").count()) === 0);
    check("5 abas, nenhuma 'em breve'", (await page.locator("[data-tab]").count()) === 5 && (await page.locator("[data-tab]", { hasText: /em breve/i }).count()) === 0);
    check("ADMIN vê 'Atualizar planilhas'", await page.getByRole("button", { name: "Atualizar planilhas" }).first().isVisible());
    if (!hasRun) check("sem análise: estado vazio (sem KPIs zerados)", (await page.getByText("Nenhuma análise MRP disponível").count()) > 0);
    else check("KPIs da aba Comprar presentes", (await page.locator("[data-kpi] [data-kpi-value]").count()) >= 6);
    if (shotsDir) {
      mkdirSync(shotsDir, { recursive: true });
      await page.screenshot({ path: join(shotsDir, "prod-1-comprar.png") });
    }
    for (const tab of ["areas", "transit", "idle", "base"]) {
      t = Date.now();
      await page.goto(`${BASE}/dashboard/analise-mrp?tab=${tab}`, { waitUntil: "load", timeout: 120_000 });
      await page.locator(`[data-tab="${tab}"][aria-selected="true"]`).waitFor({ timeout: 60_000 });
      check(`?tab=${tab} abre (${Date.now() - t} ms)`, true);
    }

    console.log("\n4. Base MRP (dados reais de Production)");
    await page.goto(`${BASE}/dashboard/analise-mrp?tab=base`, { waitUntil: "load", timeout: 120_000 });
    await page.locator("[data-testid=mrp-base-table] tbody tr").first().waitFor({ timeout: 60_000 });
    const metric = async (m: string) => ((await page.locator(`[data-testid=mrp-base-summary] [data-metric="${m}"]`).textContent()) ?? "").trim();
    const summary = [await metric("total"), await metric("mec"), await metric("ele"), await metric("semparam"), await metric("conj")].join(" · ");
    check(`resumo: ${summary}`, hasRun || summary.startsWith("4.280 materiais · Mecânica 3.485 · Elétrica 795"));
    check("6 colunas", (await page.locator("[data-testid=mrp-base-table] thead th").allTextContents()).join("|") === "Código|Material|Mín|Máx|Grupo|Status MRP");
    check("200 linhas iniciais", (await page.locator("[data-testid=mrp-base-table] tbody tr").count()) === 200);
    await page.getByRole("button", { name: "mostrar mais" }).click();
    await page.waitForFunction(() => document.querySelectorAll("[data-testid=mrp-base-table] tbody tr").length === 600, undefined, { timeout: 60_000 }).catch(() => undefined);
    check("mostrar mais → 600", (await page.locator("[data-testid=mrp-base-table] tbody tr").count()) === 600);
    await page.selectOption("select[aria-label='Filtro da base']", "conj");
    await page.waitForFunction(() => /em satélites|materiais neste filtro/.test(document.querySelector("[data-testid=mrp-base-count]")?.textContent ?? "") && document.querySelectorAll("[data-testid=mrp-base-table] tbody tr").length < 600, undefined, { timeout: 60_000 }).catch(() => undefined);
    const conjCount = ((await page.locator("[data-testid=mrp-base-count]").textContent()) ?? "").trim();
    check(`filtro satélites/coroas: ${conjCount}`, /^\d[\d.]* materiais neste filtro/.test(conjCount) && (await page.locator("[data-testid=mrp-base-table] tbody tr").count()) > 0);
    await page.fill("[data-testid=mrp-base-search]", "breton");
    await page.waitForTimeout(2500);
    const searchCount = ((await page.locator("[data-testid=mrp-base-count]").textContent().catch(() => "")) ?? "").trim();
    check(`busca "breton" (satélites/coroas): ${searchCount || "sem linhas"}`, !!searchCount || (await page.locator("[data-testid=mrp-base-empty]").count()) === 1);
    if (shotsDir) await page.screenshot({ path: join(shotsDir, "prod-2-base.png") });
    t = Date.now();
    const [d] = await Promise.all([page.waitForEvent("download", { timeout: 120_000 }), page.locator("[data-testid=mrp-export-base]").click()]);
    const file = join(dl, d.suggestedFilename());
    await d.saveAs(file);
    const wb = XLSX.read(readFileSync(file), { type: "buffer" });
    const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1 }).length - 1;
    check(`Excel da base (filtro + busca da tela): ${d.suggestedFilename()} · aba ${wb.SheetNames.join("|")} · ${rows} linhas · ${Date.now() - t} ms`, /^Base_MRP_\d{8}\.xlsx$/.test(d.suggestedFilename()) && wb.SheetNames.join() === "Base MRP" && rows > 0);
    const full = await get("/api/mrp/export?type=base", "ADMIN");
    check(`Excel da base completo via API: 200 · ${full.headers.get("content-type") === XLSX_MIME ? "xlsx" : full.headers.get("content-type")} · ${full.headers.get("content-disposition")}`, full.status === 200 && full.headers.get("content-type") === XLSX_MIME);
    await full.arrayBuffer();

    console.log("\n5. Exportações da análise");
    for (const type of ["buy", "buy-by-area", "families", "idle", "transit"]) {
      const r = await get(`/api/mrp/export?type=${type}`, "VISUALIZADOR");
      const body = r.headers.get("content-type") === XLSX_MIME ? null : ((await r.json().catch(() => null)) as { message?: string } | null);
      if (r.headers.get("content-type") === XLSX_MIME) await r.arrayBuffer();
      if (hasRun) check(`${type}: 200 xlsx (${r.headers.get("content-disposition")})`, r.status === 200 && !body);
      else check(`${type}: sem análise → 422 "${body?.message}" (sem arquivo vazio)`, r.status === 422 && body?.message === "Gere a análise primeiro.");
    }

    console.log("\n6. Permissões");
    const gestor = await ctxFor("GESTOR");
    const gp = await gestor.newPage();
    await gp.goto(`${BASE}/dashboard/analise-mrp?tab=base`, { waitUntil: "load", timeout: 120_000 });
    await gp.locator("[data-testid=mrp-base-table] tbody tr").first().waitFor({ timeout: 60_000 });
    check("GESTOR vê 'Atualizar planilhas', envio e 'Restaurar base inicial'", (await gp.getByRole("button", { name: "Atualizar planilhas" }).first().isVisible()) && (await gp.locator("[data-testid=mrp-base-file]").count()) === 1 && (await gp.locator("[data-testid=mrp-base-restore]").count()) === 1);
    await gestor.close();
    const viewer = await ctxFor("VISUALIZADOR");
    const vp = await viewer.newPage();
    await vp.goto(`${BASE}/dashboard/analise-mrp?tab=base`, { waitUntil: "load", timeout: 120_000 });
    await vp.locator("[data-testid=mrp-base-table] tbody tr").first().waitFor({ timeout: 60_000 });
    check("VISUALIZADOR consulta a Base e vê o Excel", (await vp.locator("[data-testid=mrp-export-base]").isVisible()) && (await vp.locator("[data-testid=mrp-base-table] tbody tr").count()) > 0);
    check("VISUALIZADOR não vê Atualizar planilhas / envio / restaurar", (await vp.getByRole("button", { name: "Atualizar planilhas" }).count()) === 0 && (await vp.locator("[data-testid=mrp-base-file]").count()) === 0 && (await vp.locator("[data-testid=mrp-base-restore]").count()) === 0);
    const json = { "content-type": "application/json" };
    for (const [p, body] of [["/api/mrp/update-all", { items: [] }], ["/api/mrp/base/restore", {}], ["/api/mrp/base/replace", { importId: "x" }], ["/api/mrp/import/upload-url", { fileName: "x.xlsx" }]] as const) {
      const r = await get(p, "VISUALIZADOR", { method: "POST", headers: json, body: JSON.stringify(body) });
      check(`VISUALIZADOR POST ${p} → 403`, r.status === 403, String(r.status));
    }
    await viewer.close();

    console.log("\n7. Home e responsividade");
    await page.goto(`${BASE}/dashboard`, { waitUntil: "load", timeout: 120_000 });
    await page.waitForTimeout(1500);
    check("Home sem card/link 'Lubrificantes'", (await page.locator("main").getByText("Lubrificantes").count()) === 0 && (await page.locator('a[href="/dashboard/lubrificantes"]').count()) === 0);
    for (const [w, h, label] of [[820, 1180, "tablet"], [390, 844, "celular"]] as const) {
      const c = await ctxFor("ADMIN", w, h);
      const p = await c.newPage();
      for (const tab of ["buy", "base"]) {
        await p.goto(`${BASE}/dashboard/analise-mrp?tab=${tab}`, { waitUntil: "load", timeout: 120_000 });
        await p.locator("h1", { hasText: "Análise MRP" }).waitFor({ timeout: 60_000 });
        await p.waitForTimeout(800);
        const overflow = await p.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
        check(`${label} (${w}px) ?tab=${tab}: sem rolagem horizontal da página`, overflow <= 0, `${overflow}px`);
      }
      await c.close();
    }
    check("nenhum erro de JavaScript na página", errors.length === 0, errors.slice(0, 3).join(" | "));
    await admin.close();
  } finally {
    await browser.close();
    rmSync(dl, { recursive: true, force: true });
  }
  console.log(failures ? `\n${failures} FALHA(S)` : "\nSMOKE DE PRODUCTION OK");
  if (failures) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
