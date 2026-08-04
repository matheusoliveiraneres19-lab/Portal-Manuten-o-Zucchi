import { chromium } from "playwright";

const BASE = process.env.BASE ?? "http://localhost:3137";
const ROUTE = process.env.ROUTE ?? "/dashboard/compras-pendentes";

const browser = await chromium.launch();
const context = await browser.newContext();
await context.addCookies([{ name: "zucchi-auth", value: "mock", domain: new URL(BASE).hostname, path: "/" }]);
const page = await context.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
page.on("console", (m) => m.type() === "error" && errors.push(m.text()));

await page.goto(`${BASE}${ROUTE}`, { waitUntil: "domcontentloaded", timeout: 30000 });
await page.waitForTimeout(1500);

// Abre o multiselect "Status operacional" e marca 2 opções.
const statusBtn = page.locator('button[aria-haspopup="listbox"]').filter({ hasText: /status/i }).first();
// fallback: o 5o multiselect é o de status; se o filtro acima não casar, usa índice.
const target = (await statusBtn.count()) ? statusBtn : page.locator('button[aria-haspopup="listbox"]').nth(4);
await target.click();
await page.waitForTimeout(300);
await page.getByRole("option", { name: "Pendente de MIRO" }).click().catch(() => {});
await page.getByRole("option", { name: "Atrasado em aberto" }).click().catch(() => {});
// Fecha o dropdown clicando fora.
await page.mouse.click(5, 5);
await page.waitForTimeout(200);

// Aplica filtros.
await page.getByRole("button", { name: /Aplicar filtros/i }).click();
await page.waitForTimeout(2500);

const url = page.url();
const body = (await page.locator("body").innerText()).replace(/\s+/g, " ");
console.log("URL final:", url);
console.log("tem status=... na URL?:", /status=/.test(url));
console.log("chip 'Status: Pendente de MIRO'?:", body.includes("Status: Pendente de MIRO"));
console.log("chip 'Status: Atrasado em aberto'?:", body.includes("Status: Atrasado em aberto"));
console.log("contador 'Filtros ativos'?:", /Filtros ativos:\s*\d/.test(body));
console.log("pageerror/console.error:", errors.length ? errors.slice(0, 5) : "nenhum");

await browser.close();
