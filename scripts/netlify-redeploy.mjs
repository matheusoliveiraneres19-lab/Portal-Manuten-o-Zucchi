/**
 * Redeploy do site no Netlify + smoke-test de segurança.
 *
 * Pré-requisito: liberar o crédito/minutos da conta no Netlify (os builds
 * estavam sendo pulados com "credit usage exceeded").
 *
 * Como usar (PowerShell):
 *   $env:NETLIFY_AUTH_TOKEN="<seu-token>"; node scripts/netlify-redeploy.mjs
 *
 * O token NÃO fica no repositório — é lido de NETLIFY_AUTH_TOKEN.
 * Gere/renove em: Netlify > User settings > Applications > Personal access tokens.
 */

const SITE_ID = "1350c620-e054-41f4-a65d-f74374cd25c2";
const PROD_URL = "https://portalzucchimanutencao.netlify.app";
const API = "https://api.netlify.com/api/v1";

const token = process.env.NETLIFY_AUTH_TOKEN;
if (!token) {
  console.error("ERRO: defina NETLIFY_AUTH_TOKEN antes de rodar.");
  console.error('PowerShell:  $env:NETLIFY_AUTH_TOKEN="<token>"; node scripts/netlify-redeploy.mjs');
  process.exit(1);
}

const authHeaders = { Authorization: `Bearer ${token}` };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function api(path, init = {}) {
  const res = await fetch(`${API}${path}`, { ...init, headers: { ...authHeaders, ...(init.headers || {}) } });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`${init.method || "GET"} ${path} -> ${res.status} ${res.statusText} ${body}`);
  }
  return res.json();
}

async function triggerBuild() {
  console.log("→ Disparando novo build do branch de produção...");
  const build = await api(`/sites/${SITE_ID}/builds`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ clear_cache: false })
  });
  console.log(`  build id: ${build.id} (deploy: ${build.deploy_id || "?"})`);
  return build;
}

async function waitForLatestDeploy() {
  console.log("→ Aguardando o deploy ficar pronto (timeout ~10 min)...");
  const deadline = Date.now() + 10 * 60 * 1000;
  let lastState = "";
  while (Date.now() < deadline) {
    const [deploy] = await api(`/sites/${SITE_ID}/deploys?per_page=1`);
    if (deploy.state !== lastState) {
      lastState = deploy.state;
      console.log(`  estado: ${deploy.state}  (commit ${(deploy.commit_ref || "-").slice(0, 7)})`);
    }
    if (deploy.state === "ready") return deploy;
    if (deploy.state === "error") {
      throw new Error(`Deploy falhou: ${deploy.error_message || "erro desconhecido"}`);
    }
    await sleep(5000);
  }
  throw new Error("Timeout aguardando o deploy.");
}

async function smokeTest() {
  console.log("→ Smoke-test de segurança em produção...");
  const checks = [];

  const home = await fetch(`${PROD_URL}/`, { redirect: "manual" });
  checks.push(["GET / (sem sessão) → redireciona para /login", [301, 302, 307, 308].includes(home.status), `HTTP ${home.status}`]);

  const api401 = await fetch(`${PROD_URL}/api/pc-factory/records`);
  checks.push(["GET /api/pc-factory/records (anônimo) → 401", api401.status === 401, `HTTP ${api401.status}`]);

  const forged = await fetch(`${PROD_URL}/api/pc-factory/records`, { headers: { Cookie: "zucchi-auth=mock" } });
  checks.push(["Cookie forjado 'mock' → 401", forged.status === 401, `HTTP ${forged.status}`]);

  let allOk = true;
  for (const [desc, ok, detail] of checks) {
    console.log(`  ${ok ? "✅" : "❌"} ${desc}  (${detail})`);
    if (!ok) allOk = false;
  }
  return allOk;
}

try {
  await triggerBuild();
  await waitForLatestDeploy();
  console.log("✓ Deploy pronto.");
  const ok = await smokeTest();
  console.log(ok ? "\n✅ Tudo certo: segurança ativa em produção." : "\n⚠️ Deploy subiu, mas algum check falhou — revisar acima.");
  process.exit(ok ? 0 : 2);
} catch (err) {
  console.error("\n❌ Falha:", err.message);
  if (/Forbidden|402|credit/i.test(err.message)) {
    console.error("   → Provável bloqueio de crédito/minutos da conta. Libere o billing no Netlify e rode de novo.");
  }
  process.exit(1);
}
