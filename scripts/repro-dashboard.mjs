import { chromium } from "playwright";

const BASE = process.env.BASE ?? "http://localhost:3137";
const ROUTES = (process.env.ROUTES ?? "/dashboard,/dashboard/geral,/dashboard/ordens-servico").split(",");
const COOKIE_DOMAIN = new URL(BASE).hostname;

const browser = await chromium.launch();
const context = await browser.newContext();

// Sessão mock (cookie do middleware) + localStorage do usuário (como após login real).
await context.addCookies([
  { name: "zucchi-auth", value: "mock", domain: COOKIE_DOMAIN, path: "/" }
]);
await context.addInitScript(() => {
  localStorage.setItem(
    "zucchi-auth-user",
    JSON.stringify({ login: "administrador", name: "Administrador", role: "Administrador" })
  );
});

for (const route of ROUTES) {
  const page = await context.newPage();
  const consoleErrors = [];
  const pageErrors = [];
  const failed = [];

  page.on("console", (msg) => {
    if (msg.type() === "error") consoleErrors.push(msg.text());
  });
  page.on("pageerror", (err) => pageErrors.push(err.stack || err.message));
  page.on("requestfailed", (req) => failed.push(`${req.method()} ${req.url()} :: ${req.failure()?.errorText}`));
  page.on("response", (res) => {
    if (res.status() >= 500) failed.push(`HTTP ${res.status()} ${res.url()}`);
  });

  let nav = "ok";
  try {
    const resp = await page.goto(`${BASE}${route}`, { waitUntil: "networkidle", timeout: 25000 });
    nav = `status ${resp?.status()}`;
  } catch (err) {
    nav = `NAV ERROR: ${err.message}`;
  }

  // Dá tempo para hidratação/erros client-side aparecerem.
  await page.waitForTimeout(1500);

  const bodyText = (await page.locator("body").innerText().catch(() => "")).slice(0, 400);
  const hasErrorBoundary = /Application error|client-side exception|Something went wrong|Erro/.test(bodyText);

  console.log(`\n================ ${route} (${nav}) ================`);
  console.log("Texto visível (início):", JSON.stringify(bodyText.replace(/\s+/g, " ").trim().slice(0, 240)));
  console.log("ErrorBoundary visível?:", hasErrorBoundary);
  console.log("pageerror (exceções JS):", pageErrors.length ? pageErrors : "nenhum");
  console.log("console.error:", consoleErrors.length ? consoleErrors.slice(0, 8) : "nenhum");
  console.log("requests falhos / 5xx:", failed.length ? failed.slice(0, 8) : "nenhum");

  await page.close();
}

await browser.close();
