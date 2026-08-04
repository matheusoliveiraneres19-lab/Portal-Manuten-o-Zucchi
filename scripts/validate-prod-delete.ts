/**
 * Valida o FLUXO DE EXCLUSÃO (arquivamento) da Central em PRODUÇÃO com um
 * procedimento de TESTE. Cria via API, exclui pela UI (menu -> Excluir ->
 * confirmar), confere que sumiu e que o contador caiu. Imprime o slug para
 * verificação/limpeza posterior no banco.
 *
 * USO: npx tsx --env-file=.env scripts/validate-prod-delete.ts
 */
import { chromium } from "playwright";
import { signSession } from "../src/lib/session";

const BASE = (process.argv[2] || "https://project-9xvus.vercel.app").replace(/\/$/, "");
const host = new URL(BASE).hostname;
const MARK = "ZZZ Teste Exclusão (validação)";

function countFromBody(body: string): number | null {
  const m = body.match(/(\d+)\s+procedimento\(s\)\s+publicado\(s\)/i);
  return m ? Number(m[1]) : null;
}

async function main() {
  const secret = process.env.AUTH_SECRET;
  if (!secret) throw new Error("AUTH_SECRET ausente no .env");
  const token = await signSession({ sub: "validation-admin", name: "Validação", role: "ADMIN" }, secret, 600);

  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 1100 }, deviceScaleFactor: 2, ignoreHTTPSErrors: true });
  await ctx.addCookies([{ name: "zucchi-auth", value: token, domain: host, path: "/", secure: true, sameSite: "Lax" }]);

  // 1) Cria o procedimento de teste via API (valida POST/permissão).
  const createRes = await ctx.request.post(`${BASE}/api/procedures`, {
    data: {
      title: MARK,
      categoryName: "SAP/Fiori",
      summary: "Procedimento temporário criado para validar o fluxo de exclusão.",
      content: "1. Passo de teste.\n2. Será excluído na validação."
    }
  });
  const created = (await createRes.json().catch(() => null)) as { ok?: boolean; procedure?: { slug: string } } | null;
  const slug = created?.procedure?.slug;
  console.log("\n===== VALIDAÇÃO PROD — Fluxo de exclusão =====");
  console.log("Criar (POST /api/procedures):", createRes.status(), "| slug:", slug);
  if (!slug) throw new Error("Falha ao criar o procedimento de teste.");

  const page = await ctx.newPage();
  const errs: string[] = [];
  page.on("pageerror", (e) => errs.push(e.message));

  // 2) Abre a Central e confirma que o card de teste aparece na busca.
  await page.goto(`${BASE}/dashboard/procedimentos`, { waitUntil: "networkidle", timeout: 60000 });
  await page.waitForTimeout(1000);
  const countBefore = countFromBody(await page.locator("body").innerText());

  await page.getByLabel("Buscar procedimento").fill(MARK);
  await page.waitForTimeout(1000);
  const beforeCards = await page.locator("article h3").allInnerTexts();
  const foundBefore = beforeCards.some((t) => t.includes("Teste Exclusão"));
  console.log("Publicados (antes):", countBefore, "| card de teste visível:", foundBefore, "| cards:", beforeCards.length);

  // 3) Menu -> Excluir -> confirma no modal.
  await page.getByRole("button", { name: "Ações do procedimento" }).first().click();
  await page.waitForTimeout(300);
  await page.getByRole("menuitem", { name: "Excluir" }).first().click();
  await page.waitForTimeout(400);
  const modalVisible = await page.getByText("Tem certeza que deseja excluir").isVisible().catch(() => false);
  console.log('Modal de confirmação "Excluir procedimento" abriu:', modalVisible);
  await page.getByRole("button", { name: "Excluir procedimento" }).click();
  await page.waitForTimeout(2500); // aguarda PUT + router.refresh()

  // 4) Confirma que sumiu da busca e que o contador caiu.
  await page.getByLabel("Buscar procedimento").fill(MARK);
  await page.waitForTimeout(1000);
  const afterCards = await page.locator("article h3").allInnerTexts();
  const foundAfter = afterCards.some((t) => t.includes("Teste Exclusão"));

  await page.getByLabel("Buscar procedimento").fill("");
  await page.waitForTimeout(800);
  const countAfter = countFromBody(await page.locator("body").innerText());

  await page.screenshot({ path: "./.shots/prod-procedures-delete.png", fullPage: true });
  await browser.close();

  console.log("Após excluir -> card de teste ainda visível:", foundAfter, "(esperado: false)");
  console.log("Publicados (depois):", countAfter, "(esperado:", countBefore != null ? countBefore - 1 : "?", ")");
  console.log("pageerrors:", errs.length ? errs : "nenhum");
  console.log("SLUG PARA VERIFICAR/LIMPAR NO BANCO:", slug);
}

main().catch((e) => { console.error(e); process.exit(1); });
