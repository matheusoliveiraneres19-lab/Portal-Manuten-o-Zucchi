/**
 * ANÁLISE MRP (FASE B) — carrega a BASE EMBUTIDA do `Analise_MRP_Compacto (1).html`
 * (SEED_MAN + SEED_ELE) como versão inicial da Base MRP do Portal.
 *
 *   npx tsx scripts/seed-mrp-html-base.ts --dry-run      (só confere, não grava)
 *   npx tsx scripts/seed-mrp-html-base.ts                (grava, se ainda não existir)
 *   npx tsx scripts/seed-mrp-html-base.ts --html="C:\...\Analise_MRP_Compacto (1).html"
 *
 * Passos:
 *   1. lê o HTML local (NÃO versionado no repositório) e extrai SEED_MAN/SEED_ELE;
 *   2. aplica a deduplicação de materiais() portada (src/lib/mrp/html-seed.ts);
 *   3. compara, material a material, com o materiais() ORIGINAL executado no
 *      próprio código do HTML — qualquer divergência aborta sem gravar;
 *   4. grava MrpBaseVersion(source = SEED_HTML) + MrpBaseMaterial numa transação
 *      e ativa a versão SE não houver nenhuma ativa (nunca desativa uma base
 *      enviada depois);
 *   5. garante PortalSetting mrp/deposito_padrao = "1400" (só cria se faltar).
 *
 * Idempotente: se já existir versão SEED_HTML, não cria outra (use --force para
 * criar uma nova versão inativa, ex.: para auditoria).
 */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { prisma } from "../src/lib/prisma";
import { buildMrpMaterialsFromHtmlSeed } from "../src/lib/mrp/html-seed";
import { MRP_AREA_ELE, MRP_AREA_MEC, MRP_FAMILIES } from "../src/lib/mrp/classification";
import { createMrpBaseVersion, getActiveMrpBaseVersion } from "../src/services/mrp-persistence.service";
import { DEFAULT_SETTINGS } from "../src/constants/portal-settings-defaults";
import { HTML_FILE_NAME, loadHtmlReference } from "./mrp/html-reference";

const EXPECTED = { [MRP_AREA_MEC]: 3485, [MRP_AREA_ELE]: 795, total: 4280 };
const DRY_RUN = process.argv.includes("--dry-run");
const FORCE = process.argv.includes("--force");

function fail(message: string): never {
  throw new Error(`[seed-mrp] ${message}`);
}

async function ensureDepositSetting() {
  const def = DEFAULT_SETTINGS.find((s) => s.category === "mrp" && s.key === "deposito_padrao");
  if (!def) fail("Default mrp/deposito_padrao ausente em portal-settings-defaults.");
  const existing = await prisma.portalSetting.findUnique({
    where: { category_key: { category: def.category, key: def.key } }
  });
  if (existing) return { created: false, value: existing.value };
  const created = await prisma.portalSetting.create({
    data: {
      category: def.category,
      key: def.key,
      label: def.label,
      description: def.description ?? null,
      value: def.value,
      valueType: def.valueType,
      isEditable: def.isEditable ?? true
    }
  });
  return { created: true, value: created.value };
}

async function main() {
  const ref = loadHtmlReference();
  const htmlHash = createHash("sha256").update(readFileSync(ref.path)).digest("hex");
  console.log(`HTML de referência: ${ref.path}`);
  console.log(`sha256: ${htmlHash}`);

  // 1–2. Base embutida + deduplicação portada.
  const built = buildMrpMaterialsFromHtmlSeed(ref.seedMan, ref.seedEle);
  console.log("\nLinhas brutas:", built.rawRows);
  console.log(`Sem código: ${built.emptyCodeRows} · duplicadas: ${built.duplicateRows} · materiais finais: ${built.materials.length}`);
  if (built.duplicateCodes.length) console.log("Códigos duplicados:", built.duplicateCodes.join(", "));

  if (built.rawRows[MRP_AREA_MEC] !== EXPECTED[MRP_AREA_MEC]) fail(`Mecânica bruta ${built.rawRows[MRP_AREA_MEC]} ≠ ${EXPECTED[MRP_AREA_MEC]}`);
  if (built.rawRows[MRP_AREA_ELE] !== EXPECTED[MRP_AREA_ELE]) fail(`Elétrica bruta ${built.rawRows[MRP_AREA_ELE]} ≠ ${EXPECTED[MRP_AREA_ELE]}`);
  if (built.rawRows.total !== EXPECTED.total) fail(`Total bruto ${built.rawRows.total} ≠ ${EXPECTED.total}`);

  // 3. Paridade com o materiais() ORIGINAL do HTML.
  const original = ref.fn.materiais();
  if (original.length !== built.materials.length) {
    fail(`HTML gera ${original.length} materiais; o port gera ${built.materials.length}.`);
  }
  let divergences = 0;
  original.forEach((o, i) => {
    const p = built.materials[i];
    const pairs: [string, unknown, unknown][] = [
      ["codigo", o.codigo, p.code],
      ["descricao", o.descricao, p.description],
      ["grupo", o.grupo, p.group],
      ["min", o.min, p.min],
      ["max", o.max, p.max],
      ["um", o.um, p.unit],
      ["statusMrp", o.statusMrp, p.statusMrp],
      ["familia", o.familia, p.family],
      ["area", o.area, p.area]
    ];
    for (const [field, a, b] of pairs) {
      if (!Object.is(a, b)) {
        divergences += 1;
        if (divergences <= 20) console.log(`  ✗ #${i} ${o.codigo} ${field}: HTML=${JSON.stringify(a)} Portal=${JSON.stringify(b)}`);
      }
    }
  });
  console.log(`\nParidade com materiais() do HTML: ${divergences} divergência(s) em ${original.length} materiais.`);
  if (divergences) fail("Port divergente do HTML — nada foi gravado.");

  const byArea = {
    [MRP_AREA_MEC]: built.materials.filter((m) => m.area === MRP_AREA_MEC).length,
    [MRP_AREA_ELE]: built.materials.filter((m) => m.area === MRP_AREA_ELE).length
  };
  const families = Object.fromEntries(
    MRP_FAMILIES.map((f) => [f, built.materials.filter((m) => m.family === f).length])
  );
  const noParams = built.materials.filter((m) => m.min <= 0 && m.max <= 0).length;
  console.log("Materiais por área:", byArea);
  console.log("Conjuntos:", families);
  console.log(`Sem mín/máx: ${noParams}`);

  if (DRY_RUN) {
    console.log("\n--dry-run: nada gravado.");
    return;
  }

  // 4. Gravação (idempotente).
  const existingSeed = await prisma.mrpBaseVersion.findFirst({
    where: { source: "SEED_HTML" },
    orderBy: { createdAt: "asc" }
  });
  if (existingSeed && !FORCE) {
    console.log(`\nJá existe versão SEED_HTML (${existingSeed.id}, ativa=${existingSeed.isActive}) — nada a criar.`);
  } else {
    const active = await getActiveMrpBaseVersion();
    const version = await createMrpBaseVersion({
      fileName: HTML_FILE_NAME,
      source: "SEED_HTML",
      sheets: [
        { name: "SEED_MAN", area: MRP_AREA_MEC, rows: built.rawRows[MRP_AREA_MEC], materials: byArea[MRP_AREA_MEC] },
        { name: "SEED_ELE", area: MRP_AREA_ELE, rows: built.rawRows[MRP_AREA_ELE], materials: byArea[MRP_AREA_ELE] }
      ],
      ignoredSheets: [],
      defaultArea: MRP_AREA_MEC,
      materials: built.materials,
      metadata: {
        htmlSha256: htmlHash,
        rawRows: built.rawRows,
        emptyCodeRows: built.emptyCodeRows,
        duplicateRows: built.duplicateRows,
        duplicateCodes: built.duplicateCodes,
        finalCount: built.materials.length,
        byArea,
        families,
        noParams
      },
      createdBy: "scripts/seed-mrp-html-base.ts",
      // Nunca derruba uma base enviada depois: só ativa se não houver nenhuma ativa.
      activate: !active
    });
    console.log(`\nVersão criada: ${version.id} · ativa=${version.isActive} · materiais=${version.materialCount}`);
  }

  // 5. Depósito padrão.
  const deposit = await ensureDepositSetting();
  console.log(`PortalSetting mrp/deposito_padrao = ${JSON.stringify(deposit.value)} (${deposit.created ? "criado" : "já existia"})`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
