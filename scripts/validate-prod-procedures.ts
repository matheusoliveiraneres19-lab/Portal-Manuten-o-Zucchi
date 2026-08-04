/**
 * Validação E2E da Central de Procedimentos em PRODUÇÃO (somente leitura/UI).
 * Gera um token de sessão ADMIN válido (HMAC com AUTH_SECRET — mesma secret da prod),
 * abre /dashboard/procedimentos, entra em "SAP/Fiori" e confere os cards + menu
 * Editar/Excluir. NÃO altera dados (não clica em salvar/excluir).
 *
 * USO: npx tsx --env-file=.env scripts/validate-prod-procedures.ts
 */
import { chromium } from "playwright";
import { signSession } from "../src/lib/session";

const BASE = (process.argv[2] || "https://project-9xvus.vercel.app").replace(/\/$/, "");
const host = new URL(BASE).hostname;

async function main() {
  const secret = process.env.AUTH_SECRET;
  if (!secret) throw new Error("AUTH_SECRET ausente no .env");

  const token = await signSession({ sub: "validation-admin", name: "Validação", role: "ADMIN" }, secret, 600);

  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 1100 }, deviceScaleFactor: 2, ignoreHTTPSErrors: true });
  await ctx.addCookies([{ name: "zucchi-auth", value: token, domain: host, path: "/", secure: true, sameSite: "Lax" }]);

  const page = await ctx.newPage();
  const errs: string[] = [];
  const s5: string[] = [];
  page.on("pageerror", (e) => errs.push(e.message));
  page.on("response", (r) => { if (r.status() >= 500) s5.push(`${r.status()} ${r.url()}`); });

  let status = 0;
  try {
    const r = await page.goto(`${BASE}/dashboard/procedimentos`, { waitUntil: "networkidle", timeout: 60000 });
    status = r?.status() ?? 0;
  } catch (e) {
    console.log("NAV erro:", (e as Error).message);
  }
  await page.waitForTimeout(1500);
  const finalUrl = page.url();

  // Entra em SAP/Fiori pela busca (filtra os cards client-side).
  await page.getByLabel("Buscar procedimento").fill("SAP/Fiori");
  await page.waitForTimeout(1200);

  const cardTitles = await page.locator("article h3").allInnerTexts().catch(() => []);
  const menuButtons = await page.getByRole("button", { name: "Ações do procedimento" }).count();

  // Abre o primeiro menu e confere Editar/Excluir.
  let editVisible = false;
  let deleteVisible = false;
  if (menuButtons > 0) {
    await page.getByRole("button", { name: "Ações do procedimento" }).first().click();
    await page.waitForTimeout(400);
    editVisible = await page.getByRole("menuitem", { name: "Editar" }).first().isVisible().catch(() => false);
    deleteVisible = await page.getByRole("menuitem", { name: "Excluir" }).first().isVisible().catch(() => false);
  }

  await page.screenshot({ path: "./.shots/prod-procedures-sapfiori.png", fullPage: true });
  await browser.close();

  console.log("\n===== VALIDAÇÃO PROD — Central de Procedimentos / SAP-Fiori =====");
  console.log("GET /dashboard/procedimentos:", status, "| URL final:", finalUrl);
  console.log("Logado (não redirecionou p/ login):", !finalUrl.includes("/login"));
  console.log("Cards exibidos:", cardTitles.length, "->", JSON.stringify(cardTitles));
  console.log("Botões de menu (⋮) nos cards:", menuButtons);
  console.log('Menu abre "Editar":', editVisible, '| "Excluir":', deleteVisible);
  console.log("pageerrors:", errs.length ? errs : "nenhum", "| 5xx:", s5.length ? s5 : "nenhum");
  console.log("Screenshot: ./.shots/prod-procedures-sapfiori.png");
}

main().catch((e) => { console.error(e); process.exit(1); });
