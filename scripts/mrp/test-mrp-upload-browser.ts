/**
 * ANÁLISE MRP — teste do UPLOAD pelo navegador (correção do "Failed to fetch").
 *
 *   npx tsx scripts/mrp/test-mrp-upload-browser.ts --direct --url=https://project-9xvus.vercel.app
 *
 * Exige um deploy com o Storage configurado (Production/Preview acessível).
 *   1. POST /api/mrp/import/upload-url: ADMIN e GESTOR → 200 com URL HTTPS do
 *      Supabase (token nunca impresso); VISUALIZADOR → 403;
 *   2. aba Base MRP: upload normal → upload-url → PUT Storage → inspect →
 *      preview → card "pendente" (para ANTES de alterar a Base);
 *   3. aba Base MRP: arquivo ALTERADO logo depois da seleção (OneDrive/Excel) —
 *      antes da correção: PUT net::ERR_UPLOAD_FILE_CHANGED → "Failed to fetch";
 *      depois: o arquivo é lido na seleção e o envio conclui;
 *   4. Storage inacessível (PUT abortado) → mensagem amigável da etapa, nunca
 *      "Failed to fetch";
 *   5. modal "Atualizar planilhas": anexa a planilha de estoque → slot preenchido;
 *   6. planilha REAL (Controle_MRP_SAP_novo_analisado.xlsx), se existir → pendente.
 * No fim cancela TODAS as importações pendentes criadas aqui (nada é aplicado:
 * nem Base nova, nem análise). Os objetos enviados ficam no bucket, sem uso.
 */
import "./force-utc";
import { connectWithRetry, loadDotEnv } from "./script-db";
import { appendFileSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import { chromium, type BrowserContext, type Page } from "playwright";
import { prisma } from "../../src/lib/prisma";
import { signSession } from "../../src/lib/session";
import { cancelMrpImports } from "../../src/services/mrp-import.service";
import * as F from "./fixtures";

const BASE = (process.argv.find((a) => a.startsWith("--url="))?.slice(6) ?? "").replace(/\/$/, "");
const USERS = {
  ADMIN: { sub: "upload-test-admin", name: "Teste Upload MRP Admin", role: "ADMIN" },
  GESTOR: { sub: "upload-test-gestor", name: "Teste Upload MRP Gestor", role: "GESTOR" },
  VISUALIZADOR: { sub: "upload-test-viewer", name: "Teste Upload MRP Viewer", role: "VISUALIZADOR" }
} as const;
const REAL_BASE = join(homedir(), "OneDrive - granitozucchi.com.br", "Manutenção - Documentos Manutenção", "Restrito", "Manutenção", "MRP Sap novo", "Controle_MRP_SAP_novo_analisado.xlsx");
let failures = 0;
function check(label: string, ok: boolean, detail = "") {
  if (!ok) failures++;
  console.log(`  ${ok ? "✓" : "✗"} ${label}${detail ? `  — ${detail}` : ""}`);
}
const mask = (u: string) => u.replace(/token=[^&]+/, "token=<omitido>").replace(/(analise-mrp\/\d{4}\/\d{2}\/)[^?]+/, "$1<arquivo>");

async function main() {
  if (!/^https:\/\//.test(BASE)) throw new Error("Informe --url=https://<deploy>");
  await connectWithRetry(prisma, { label: "teste de upload" });
  const secret = process.env.AUTH_SECRET || loadDotEnv().AUTH_SECRET;
  const tokens = Object.fromEntries(await Promise.all(Object.entries(USERS).map(async ([k, u]) => [k, await signSession(u, secret, 1800)]))) as Record<keyof typeof USERS, string>;
  const host = new URL(BASE).hostname;
  const dir = mkdtempSync(join(tmpdir(), "mrp-upload-"));
  const browser = await chromium.launch();
  try {
    console.log(`Deploy: ${BASE}`);
    console.log("\n1. upload-url");
    for (const role of ["ADMIN", "GESTOR", "VISUALIZADOR"] as const) {
      const r = await fetch(`${BASE}/api/mrp/import/upload-url`, { method: "POST", headers: { cookie: `zucchi-auth=${tokens[role]}`, "content-type": "application/json" }, body: JSON.stringify({ fileName: "teste.xlsx" }) });
      const body = (await r.json().catch(() => null)) as { data?: { uploadUrl?: string } } | null;
      if (role === "VISUALIZADOR") check(`${role} → 403`, r.status === 403, String(r.status));
      else {
        let u: URL | null = null;
        try {
          u = new URL(body?.data?.uploadUrl ?? "");
        } catch {
          u = null;
        }
        check(`${role} → 200 · URL ${u ? `${u.protocol}//${u.host}${u.pathname.replace(/[^/]+$/, "<arquivo>")}` : "inválida"}`, r.status === 200 && !!u && u.protocol === "https:" && /\.supabase\.co$/.test(u.host) && u.searchParams.has("token"));
      }
    }

    const ctx = async (role: keyof typeof USERS): Promise<BrowserContext> => {
      const c = await browser.newContext({ viewport: { width: 1440, height: 900 } });
      await c.addCookies([{ name: "zucchi-auth", value: tokens[role], domain: host, path: "/", secure: true, httpOnly: true, sameSite: "Lax" }]);
      return c;
    };
    const watch = (p: Page) => {
      const log: string[] = [];
      p.on("requestfailed", (r) => {
        if (/supabase|api\/mrp/.test(r.url())) log.push(`${r.method()} ${mask(r.url())} :: ${r.failure()?.errorText}`);
      });
      return log;
    };
    const baseUpload = async (label: string, prepare: (p: Page) => Promise<void>, expect: "pending" | "friendly-error") => {
      const c = await ctx("ADMIN");
      const p = await c.newPage();
      const failed = watch(p);
      await p.goto(`${BASE}/dashboard/analise-mrp?tab=base`, { waitUntil: "load", timeout: 120_000 });
      await p.locator("[data-testid=mrp-base-file]").waitFor({ state: "attached", timeout: 60_000 });
      const t = Date.now();
      await prepare(p);
      await p.locator("[data-testid=mrp-base-pending], [data-testid=mrp-base] [role=alert]").first().waitFor({ timeout: 120_000 }).catch(() => undefined);
      await p.waitForTimeout(800);
      const alert = ((await p.locator("[data-testid=mrp-base] [role=alert]").textContent().catch(() => null)) ?? "").trim();
      const pending = ((await p.locator("[data-testid=mrp-base-pending]").textContent().catch(() => null)) ?? "").trim();
      const ms = Date.now() - t;
      if (expect === "pending") check(`${label}: chegou ao "pendente" (antes de alterar a Base) em ${ms} ms`, !!pending && !alert, alert || pending.slice(0, 160));
      else check(`${label}: mensagem amigável, sem "Failed to fetch"`, !!alert && !/failed to fetch/i.test(alert) && /Storage/.test(alert), alert);
      if (failed.length) console.log(`    requisições com falha: ${failed.join(" | ")}`);
      await c.close();
      return pending;
    };

    console.log("\n2. Base MRP — upload normal (fixture pequena)");
    const fx = F.baseFixture();
    await baseUpload("upload → Storage → inspect → preview", (p) => p.setInputFiles("[data-testid=mrp-base-file]", { name: fx.name, mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", buffer: fx.data }), "pending");

    console.log("\n3. Base MRP — arquivo alterado logo depois da seleção (OneDrive/Excel)");
    const changing = join(dir, "Controle_MRP_teste.xlsx");
    writeFileSync(changing, fx.data);
    await baseUpload(
      "arquivo alterado após a seleção",
      async (p) => {
        await p.setInputFiles("[data-testid=mrp-base-file]", changing);
        await p.waitForTimeout(150);
        appendFileSync(changing, Buffer.from([0]));
      },
      "pending"
    );

    console.log("\n4. Storage inacessível");
    await baseUpload(
      "PUT no Storage abortado pela rede",
      async (p) => {
        await p.route("**/storage/v1/object/upload/sign/**", (route) => route.abort("connectionrefused"));
        await p.setInputFiles("[data-testid=mrp-base-file]", { name: fx.name, mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", buffer: fx.data });
      },
      "friendly-error"
    );

    console.log("\n5. Modal Atualizar planilhas — preparar o upload");
    {
      const c = await ctx("GESTOR");
      const p = await c.newPage();
      const failed = watch(p);
      await p.goto(`${BASE}/dashboard/analise-mrp`, { waitUntil: "load", timeout: 120_000 });
      await p.getByRole("button", { name: "Atualizar planilhas" }).first().click();
      await p.getByText("Enviar planilhas do SAP").waitFor({ timeout: 30_000 });
      const st = F.stockFixture();
      await p.setInputFiles("[data-testid=mrp-file-input]", { name: st.name, mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", buffer: st.data });
      const ok = await p.locator("[data-testid=mrp-slot-est]").getByText(st.name).waitFor({ timeout: 120_000 }).then(() => true, () => false);
      const err = ((await p.locator("[role=dialog] [role=alert]").textContent().catch(() => null)) ?? "").trim();
      check("GESTOR anexa a planilha de estoque → slot 2 preenchido (Storage + inspect)", ok && !/failed to fetch/i.test(err), err);
      if (failed.length) console.log(`    requisições com falha: ${failed.join(" | ")}`);
      await c.close();
    }

    console.log("\n6. Planilha real");
    if (existsSync(REAL_BASE)) {
      const real = join(dir, "Controle_MRP_SAP_novo_analisado.xlsx");
      writeFileSync(real, readFileSync(REAL_BASE));
      const pending = await baseUpload("Controle_MRP_SAP_novo_analisado.xlsx", (p) => p.setInputFiles("[data-testid=mrp-base-file]", real), "pending");
      check("preview da planilha real: ~4.259 materiais, Gyan ignorada", /4\.259 materiais/.test(pending) && /MRP Automatico Gyan/.test(pending), pending.slice(0, 200));
    } else console.log("  (planilha real não encontrada nesta máquina — pulada)");
  } finally {
    await browser.close();
    rmSync(dir, { recursive: true, force: true });
    const open = await prisma.importHistory.findMany({ where: { importedBy: { in: Object.values(USERS).map((u) => u.name) }, status: "EM_PROCESSAMENTO" }, select: { id: true } });
    if (open.length) await cancelMrpImports(open.map((o) => o.id), "Teste de upload — cancelado sem aplicar.");
    const left = await prisma.importHistory.count({ where: { importedBy: { in: Object.values(USERS).map((u) => u.name) }, status: "EM_PROCESSAMENTO" } });
    const base = await prisma.mrpBaseVersion.findFirst({ where: { isActive: true }, select: { source: true, materialCount: true } });
    const runs = await prisma.mrpAnalysisRun.count({ where: { isCurrent: true } });
    console.log("\nLimpeza");
    check(`importações de teste canceladas (${open.length}); nenhuma pendente`, left === 0, String(left));
    check(`Base ativa inalterada (${base?.source} ${base?.materialCount}); análise vigente inalterada (${runs})`, base?.source === "SEED_HTML" && base.materialCount === 4280);
    await prisma.$disconnect();
  }
  console.log(failures ? `\n${failures} FALHA(S)` : "\nTODOS OS TESTES PASSARAM");
  if (failures) process.exitCode = 1;
}

main().catch((error) => {
  console.error(String(error).replace(/token=[^&\s]+/g, "token=<omitido>"));
  process.exitCode = 1;
});
