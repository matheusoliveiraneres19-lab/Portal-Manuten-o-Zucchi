import { chromium } from "playwright";

const BASE = process.env.BASE ?? "http://localhost:3137";
const LOGIN = process.env.LOGIN ?? "admin";
const PASS = process.env.PASS ?? "admin123";

const browser = await chromium.launch();
const context = await browser.newContext();
const page = await context.newPage();

const consoleErrors = [];
const pageErrors = [];
const failed = [];
const navs = [];
const t0 = Date.now();
page.on("framenavigated", (frame) => {
  if (frame === page.mainFrame()) navs.push(`+${Date.now() - t0}ms -> ${frame.url()}`);
});

page.on("console", (msg) => {
  if (msg.type() === "error") consoleErrors.push(msg.text());
});
page.on("pageerror", (err) => pageErrors.push(err.stack || err.message));
page.on("requestfailed", (req) => {
  const e = req.failure()?.errorText;
  if (e && e !== "net::ERR_ABORTED") failed.push(`${req.method()} ${req.url()} :: ${e}`);
});
page.on("response", (res) => {
  if (res.status() >= 400) failed.push(`HTTP ${res.status()} ${res.url()}`);
});

console.log(`\n### Login flow em ${BASE} (login=${LOGIN}) ###`);

await page.goto(`${BASE}/login`, { waitUntil: "networkidle", timeout: 25000 });
await page.fill('input[name="login"]', LOGIN);
await page.fill('input[name="password"]', PASS);

const loginResp = page.waitForResponse((r) => r.url().includes("/api/auth/login"), { timeout: 20000 });
await page.click('button[type="submit"]');
const resp = await loginResp;
console.log("POST /api/auth/login ->", resp.status());
let payload = null;
try {
  payload = await resp.json();
} catch {}
console.log("resposta login:", JSON.stringify(payload));

// Aguarda o redirect pós-login (router.replace('/') após ~850ms) e a hidratação.
await page.waitForTimeout(12000);
console.log("URL final:", page.url());
console.log("navegações:", navs.length ? navs : "nenhuma além da inicial");

const bodyText = (await page.locator("body").innerText().catch(() => "")).replace(/\s+/g, " ").trim();
const hasErrorUI = /Application error|client-side exception|Something went wrong|Unhandled|Erro inesperado/i.test(bodyText);
console.log("texto visível (início):", JSON.stringify(bodyText.slice(0, 220)));
console.log("UI de erro visível?:", hasErrorUI);
console.log("pageerror (exceções JS):", pageErrors.length ? pageErrors.slice(0, 5) : "nenhum");
console.log("console.error:", consoleErrors.length ? consoleErrors.slice(0, 10) : "nenhum");
console.log("requests >=400:", failed.length ? failed.slice(0, 10) : "nenhum");

await browser.close();
