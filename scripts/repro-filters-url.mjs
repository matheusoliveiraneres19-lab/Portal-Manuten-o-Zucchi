import { chromium } from "playwright";

const BASE = process.env.BASE ?? "https://portalzucchimanutencao.netlify.app";
const URL = `${BASE}/dashboard/compras-pendentes?status=pendente-miro,atrasado-aberto&naturezas=MATERIAL`;

const browser = await chromium.launch();
const context = await browser.newContext();
await context.addCookies([{ name: "zucchi-auth", value: "mock", domain: new URL2(BASE).hostname, path: "/" }]);
function URL2(u) { return new (globalThis.URL)(u); }
const page = await context.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
page.on("console", (m) => m.type() === "error" && errors.push(m.text()));

await page.goto(URL, { waitUntil: "networkidle", timeout: 45000 }).catch((e) => errors.push("nav: " + e.message));
await page.waitForTimeout(1500);

const body = (await page.locator("body").innerText().catch(() => "")).replace(/\s+/g, " ");
console.log("URL:", page.url());
console.log("chip 'Status: Pendente de MIRO'?:", body.includes("Status: Pendente de MIRO"));
console.log("chip 'Status: Atrasado em aberto'?:", body.includes("Status: Atrasado em aberto"));
console.log("chip 'Natureza: Material'?:", body.includes("Natureza: Material"));
console.log("contador 'Filtros ativos: 3'?:", body.includes("Filtros ativos: 3"));
console.log("error boundary?:", /Application error/i.test(body));
console.log("pageerror/console.error:", errors.length ? errors.slice(0, 5) : "nenhum");

await browser.close();
