/**
 * Valida FAVORITAR e CONFIRMAR LEITURA em PRODUÇÃO com um procedimento de TESTE.
 * Cria via API, abre o detalhe, favorita e confirma leitura, checa persistência
 * (reload) e a seção "Meus favoritos". Imprime o slug para limpeza (o delete em
 * cascata remove favorito/leitura).
 *
 * USO: npx tsx --env-file=.env scripts/validate-prod-fav-read.ts
 */
import { chromium } from "playwright";
import { signSession } from "../src/lib/session";

const BASE = (process.argv[2] || "https://project-9xvus.vercel.app").replace(/\/$/, "");
const host = new URL(BASE).hostname;
const MARK = "ZZZ Teste Favorito Leitura (validação)";

async function main() {
  const secret = process.env.AUTH_SECRET;
  if (!secret) throw new Error("AUTH_SECRET ausente no .env");
  const token = await signSession({ sub: "validation-admin", name: "Validação", role: "ADMIN" }, secret, 600);

  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 1100 }, deviceScaleFactor: 2, ignoreHTTPSErrors: true });
  await ctx.addCookies([{ name: "zucchi-auth", value: token, domain: host, path: "/", secure: true, sameSite: "Lax" }]);

  const createRes = await ctx.request.post(`${BASE}/api/procedures`, {
    data: {
      title: MARK,
      categoryName: "SAP/Fiori",
      summary: "Procedimento temporário para validar favorito e confirmação de leitura.",
      content: "1. Passo de teste."
    }
  });
  const created = (await createRes.json().catch(() => null)) as { ok?: boolean; procedure?: { slug: string } } | null;
  const slug = created?.procedure?.slug;
  console.log("\n===== VALIDAÇÃO PROD — Favoritar + Confirmar leitura =====");
  console.log("Criar (POST):", createRes.status(), "| slug:", slug);
  if (!slug) throw new Error("Falha ao criar o procedimento de teste.");

  const page = await ctx.newPage();
  const errs: string[] = [];
  page.on("pageerror", (e) => errs.push(e.message));

  const detailUrl = `${BASE}/dashboard/procedimentos/${slug}`;
  await page.goto(detailUrl, { waitUntil: "networkidle", timeout: 60000 });

  // Estado inicial.
  const favBefore = await page.getByRole("button", { name: "Favoritar" }).isVisible().catch(() => false);
  const readBtnBefore = await page.getByRole("button", { name: "Li e estou ciente" }).isVisible().catch(() => false);
  console.log('Inicial -> botão "Favoritar":', favBefore, '| "Li e estou ciente":', readBtnBefore);

  // Favoritar.
  await page.getByRole("button", { name: "Favoritar" }).click();
  await page.waitForTimeout(1800);
  const favorited = await page.getByRole("button", { name: "Favoritado" }).isVisible().catch(() => false);

  // Confirmar leitura.
  await page.getByRole("button", { name: "Li e estou ciente" }).click();
  await page.waitForTimeout(1800);
  const readChip = await page.getByText(/Lido em/).isVisible().catch(() => false);
  console.log('Após ações -> "Favoritado":', favorited, '| chip "Lido em":', readChip);

  // Persistência: recarrega o detalhe.
  await page.goto(detailUrl, { waitUntil: "networkidle", timeout: 60000 });
  await page.waitForTimeout(800);
  const favPersist = await page.getByRole("button", { name: "Favoritado" }).isVisible().catch(() => false);
  const readPersist = await page.getByText(/Lido em/).isVisible().catch(() => false);
  console.log("Após reload -> Favoritado:", favPersist, "| Lido em:", readPersist);

  // "Meus favoritos" na Central.
  await page.goto(`${BASE}/dashboard/procedimentos`, { waitUntil: "networkidle", timeout: 60000 });
  await page.waitForTimeout(1000);
  const favSection = await page.getByRole("heading", { name: "Meus favoritos" }).isVisible().catch(() => false);
  const favCard = (await page.locator("article", { hasText: "Teste Favorito" }).count()) > 0;
  console.log('Seção "Meus favoritos" visível:', favSection, "| card do teste presente:", favCard);

  await page.screenshot({ path: "./.shots/prod-procedures-fav-read.png", fullPage: true });
  await browser.close();

  console.log("pageerrors:", errs.length ? errs : "nenhum");
  console.log("SLUG PARA VERIFICAR/LIMPAR NO BANCO:", slug);
}

main().catch((e) => { console.error(e); process.exit(1); });
