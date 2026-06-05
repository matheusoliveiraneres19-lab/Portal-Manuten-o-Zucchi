/**
 * Captura telas reais do portal (Playwright) para o vídeo Remotion.
 * Requer o portal rodando (npm run dev) em http://localhost:3000.
 * Uso: node scripts/capture-portal.mjs
 */
import { chromium } from "playwright";
import { mkdir } from "node:fs/promises";
import path from "node:path";

const BASE_URL = process.env.CAPTURE_URL ?? "http://localhost:3000";
const OUT_DIR = path.resolve("public", "captures");

const VIEWPORT = { width: 1920, height: 1080 };
const SCALE = 2;

const shots = [
  { name: "login", url: "/login", auth: false, wait: 1800 },
  { name: "dashboard", url: "/", auth: true, wait: 3000 },
  { name: "ordens", url: "/dashboard/ordens-servico", auth: true, wait: 2600 },
  { name: "criticos", url: "/dashboard/equipamentos-criticos", auth: true, wait: 3400 }
];

async function main() {
  await mkdir(OUT_DIR, { recursive: true });
  const browser = await chromium.launch();

  try {
    for (const shot of shots) {
      const context = await browser.newContext({
        viewport: VIEWPORT,
        deviceScaleFactor: SCALE
      });

      if (shot.auth) {
        await context.addCookies([
          { name: "zucchi-auth", value: "mock", domain: "localhost", path: "/" }
        ]);
      }

      const page = await context.newPage();
      await page.goto(`${BASE_URL}${shot.url}`, { waitUntil: "networkidle", timeout: 60000 });
      // Espera animações de entrada (framer-motion) e gráficos lazy (recharts) assentarem.
      await page.waitForTimeout(shot.wait);

      const file = path.join(OUT_DIR, `${shot.name}.png`);
      await page.screenshot({ path: file, fullPage: false });
      console.log(`✓ ${shot.name} -> ${file}`);

      await context.close();
    }
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error("Falha na captura:", error);
  process.exit(1);
});
