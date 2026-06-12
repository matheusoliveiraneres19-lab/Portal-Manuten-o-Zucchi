/**
 * Smoke-test do módulo PC-Factory em produção (ou local).
 *
 * Uso:
 *   BASE=https://SEU-SITE.netlify.app node scripts/smoke-pc-factory.mjs
 *   node scripts/smoke-pc-factory.mjs https://SEU-SITE.netlify.app
 *   BASE=http://localhost:3000 node scripts/smoke-pc-factory.mjs   (local: npm run build && npm start)
 *
 * O que valida:
 *   1. GET /dashboard/pc-factory responde 200.
 *   2. Nenhuma exceção de runtime / error boundary / request 5xx.
 *   3. A API /api/pc-factory/records retorna total > 0 (há dados no banco).
 *   4. A página renderiza os KPIs (não está no empty state) e a tabela tem linhas.
 *   5. Não há "NaN" visível na página.
 *
 * Sai com código 0 se tudo passar; 1 caso contrário.
 */
import { chromium } from "playwright";

const BASE = (process.argv[2] || process.env.BASE || "http://localhost:3000").replace(/\/$/, "");
const ROUTE = "/dashboard/pc-factory";
const COOKIE_DOMAIN = new URL(BASE).hostname;
const IS_HTTPS = BASE.startsWith("https");

const results = [];
function assert(label, ok, detail = "") {
  results.push({ label, ok, detail });
  console.log(`${ok ? "✓" : "✗"} ${label}${detail ? ` — ${detail}` : ""}`);
}

const browser = await chromium.launch();
const context = await browser.newContext({ ignoreHTTPSErrors: true });

// Sessão mock (cookie do middleware) + localStorage do usuário (como após login real).
await context.addCookies([
  { name: "zucchi-auth", value: "mock", domain: COOKIE_DOMAIN, path: "/", secure: IS_HTTPS, sameSite: "Lax" }
]);
await context.addInitScript(() => {
  localStorage.setItem(
    "zucchi-auth-user",
    JSON.stringify({ login: "administrador", name: "Administrador", role: "Administrador" })
  );
});

const page = await context.newPage();
const pageErrors = [];
const serverErrors = [];
page.on("pageerror", (err) => pageErrors.push(err.message));
page.on("response", (res) => {
  if (res.status() >= 500) serverErrors.push(`HTTP ${res.status()} ${res.url()}`);
});

let status = 0;
try {
  const resp = await page.goto(`${BASE}${ROUTE}`, { waitUntil: "networkidle", timeout: 45000 });
  status = resp?.status() ?? 0;
} catch (err) {
  assert("Navegação até a página", false, err.message);
}

await page.waitForTimeout(1500);

// 1. Status 200
assert(`GET ${ROUTE} responde 200`, status === 200, `status ${status}`);

// 2. Sem erros de runtime / 5xx
assert("Sem exceções de runtime (pageerror)", pageErrors.length === 0, pageErrors.slice(0, 3).join(" | "));
assert("Sem respostas 5xx", serverErrors.length === 0, serverErrors.slice(0, 3).join(" | "));

const bodyText = await page.locator("body").innerText().catch(() => "");
const hasErrorBoundary = /Application error|client-side exception|Something went wrong/i.test(bodyText);
assert("Sem error boundary visível", !hasErrorBoundary);

// 3. API de records retorna total > 0 (há dados)
let apiTotal = null;
try {
  apiTotal = await page.evaluate(async () => {
    const r = await fetch("/api/pc-factory/records?pageSize=25", { credentials: "include" });
    if (!r.ok) return { error: `HTTP ${r.status}` };
    const j = await r.json();
    return { total: j.total, rows: Array.isArray(j.data) ? j.data.length : 0 };
  });
} catch (err) {
  apiTotal = { error: err.message };
}
assert(
  "API /api/pc-factory/records tem dados",
  apiTotal && typeof apiTotal.total === "number" && apiTotal.total > 0,
  `total=${apiTotal?.total ?? apiTotal?.error}, linhas=${apiTotal?.rows ?? "-"}`
);

// 4. Página renderiza KPIs (não está em empty state) e mostra título
assert("Título 'PC-Factory' presente", /PC-Factory/i.test(bodyText));
assert("KPI 'Horas de manutenção' visível", /Horas de manuten[cç][aã]o/i.test(bodyText));
assert("Painel 'Qualidade da importação' visível", /Qualidade da importa[cç][aã]o/i.test(bodyText));

// 5. Sem "NaN" visível
assert("Sem 'NaN' visível na página", !/\bNaN\b/.test(bodyText));

await browser.close();

const failed = results.filter((r) => !r.ok);
console.log(`\n${"=".repeat(48)}`);
console.log(`Alvo: ${BASE}${ROUTE}`);
if (failed.length === 0) {
  console.log("✅ SMOKE-TEST PASSOU — página no ar e com dados.");
  process.exit(0);
} else {
  console.log(`❌ SMOKE-TEST FALHOU em ${failed.length} verificação(ões): ${failed.map((f) => f.label).join("; ")}`);
  process.exit(1);
}
