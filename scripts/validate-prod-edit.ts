/**
 * Valida o FLUXO DE EDIÇÃO (mudança de categoria) da Central em PRODUÇÃO com um
 * procedimento de TESTE. Cria em SAP/Fiori via API, edita pela UI mudando a
 * categoria para PC-Factory, confere a migração. Imprime o slug para limpeza.
 *
 * USO: npx tsx --env-file=.env scripts/validate-prod-edit.ts
 */
import { chromium } from "playwright";
import { signSession } from "../src/lib/session";

const BASE = (process.argv[2] || "https://project-9xvus.vercel.app").replace(/\/$/, "");
const host = new URL(BASE).hostname;
const MARK = "ZZZ Teste Edição (validação)";

async function main() {
  const secret = process.env.AUTH_SECRET;
  if (!secret) throw new Error("AUTH_SECRET ausente no .env");
  const token = await signSession({ sub: "validation-admin", name: "Validação", role: "ADMIN" }, secret, 600);

  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 1100 }, deviceScaleFactor: 2, ignoreHTTPSErrors: true });
  await ctx.addCookies([{ name: "zucchi-auth", value: token, domain: host, path: "/", secure: true, sameSite: "Lax" }]);

  // 1) Cria o procedimento de teste em SAP/Fiori.
  const createRes = await ctx.request.post(`${BASE}/api/procedures`, {
    data: {
      title: MARK,
      categoryName: "SAP/Fiori",
      summary: "Procedimento temporário para validar a edição/mudança de categoria.",
      content: "1. Passo de teste."
    }
  });
  const created = (await createRes.json().catch(() => null)) as { ok?: boolean; procedure?: { slug: string } } | null;
  const slug = created?.procedure?.slug;
  console.log("\n===== VALIDAÇÃO PROD — Fluxo de edição (mudar categoria) =====");
  console.log("Criar em SAP/Fiori (POST):", createRes.status(), "| slug:", slug);
  if (!slug) throw new Error("Falha ao criar o procedimento de teste.");

  const page = await ctx.newPage();
  const errs: string[] = [];
  page.on("pageerror", (e) => errs.push(e.message));

  // 2) Abre a Central, busca o teste e lê a categoria atual no card.
  await page.goto(`${BASE}/dashboard/procedimentos`, { waitUntil: "networkidle", timeout: 60000 });
  await page.getByLabel("Buscar procedimento").fill(MARK);
  await page.waitForTimeout(1000);
  const cardBefore = page.locator("article", { hasText: "Teste Edição" }).first();
  const chipBefore = (await cardBefore.locator("span").first().innerText().catch(() => "")).trim();
  console.log("Categoria no card (antes):", JSON.stringify(chipBefore));

  // 3) Menu -> Editar -> muda categoria para PC-Factory -> salva.
  await page.getByRole("button", { name: "Ações do procedimento" }).first().click();
  await page.waitForTimeout(300);
  await page.getByRole("menuitem", { name: "Editar" }).first().click();
  await page.getByRole("heading", { name: "Editar procedimento" }).waitFor({ timeout: 15000 });
  await page.getByLabel("Categoria *").selectOption({ label: "PC-Factory" });
  await page.getByRole("button", { name: "Salvar alterações" }).click();
  await page.waitForTimeout(2500); // PUT + router.refresh()

  // 4) Confere migração: não aparece mais filtrando SAP/Fiori; aparece em PC-Factory.
  await page.getByLabel("Buscar procedimento").fill("SAP/Fiori");
  await page.waitForTimeout(1000);
  const inSapFiori = (await page.locator("article h3").allInnerTexts()).some((t) => t.includes("Teste Edição"));

  await page.getByLabel("Buscar procedimento").fill("PC-Factory");
  await page.waitForTimeout(1000);
  const inPcFactory = (await page.locator("article", { hasText: "Teste Edição" }).count()) > 0;
  const chipAfter = (await page.locator("article", { hasText: "Teste Edição" }).first().locator("span").first().innerText().catch(() => "")).trim();

  await page.screenshot({ path: "./.shots/prod-procedures-edit.png", fullPage: true });
  await browser.close();

  console.log("Ainda em SAP/Fiori (esperado false):", inSapFiori);
  console.log("Agora em PC-Factory (esperado true):", inPcFactory, "| chip:", JSON.stringify(chipAfter));
  console.log("pageerrors:", errs.length ? errs : "nenhum");
  console.log("SLUG PARA VERIFICAR/LIMPAR NO BANCO:", slug);
}

main().catch((e) => { console.error(e); process.exit(1); });
