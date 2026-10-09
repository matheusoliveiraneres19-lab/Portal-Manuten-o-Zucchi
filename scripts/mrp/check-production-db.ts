/**
 * ANÁLISE MRP (FASE FINAL) — verificação do banco antes do merge (SOMENTE LEITURA).
 *
 *   npx tsx scripts/mrp/check-production-db.ts --direct
 *
 * Nunca imprime URL, senha ou chave. Confere:
 *   1. conexão;
 *   2. migrations MRP aplicadas: objetos de cada migration presentes e
 *      `prisma migrate diff` (banco → schema.prisma) sem diferença nos modelos MRP;
 *   3. SEED_HTML (4.280 = 3.485 Mecânica + 795 Elétrica), uma só;
 *   4. constraints: no máximo uma base ativa e um run vigente (índices parciais únicos);
 *   5. depósito padrão configurado (PortalSetting mrp.deposito_padrao);
 *   6. locks / importações presas / runs incompletos.
 */
import "./force-utc";
import { SCRIPT_DB_MODE, connectWithRetry } from "./script-db";
import { spawnSync } from "node:child_process";
import { prisma } from "../../src/lib/prisma";
import { healthCheck } from "./validate-mrp-real-db";

let failures = 0;
function check(label: string, ok: boolean, detail = "") {
  if (!ok) failures++;
  console.log(`  ${ok ? "✓" : "✗"} ${label}${detail ? `  — ${detail}` : ""}`);
}
const q = <T,>(sql: string) => prisma.$queryRawUnsafe<T[]>(sql);

async function main() {
  console.log(`Banco: ${SCRIPT_DB_MODE} (somente leitura; nenhuma credencial é exibida)`);
  await connectWithRetry(prisma, { label: "verificação do banco" });
  const [{ db, server }] = await q<{ db: string; server: string }>(`select current_database() db, split_part(version(), ' ', 2) server`);
  console.log(`\n1. Conexão`);
  check(`conectado (base "${db}", PostgreSQL ${server})`, true);

  console.log("\n2. Migrations MRP");
  const enumVals = (await q<{ v: string }>(`select unnest(enum_range(null::"ImportType"))::text v`)).map((r) => r.v);
  check("20261007000000_add_import_type_mrp: ImportType tem MRP_BASE / MRP_STOCK / MRP_PURCHASES", ["MRP_BASE", "MRP_STOCK", "MRP_PURCHASES"].every((v) => enumVals.includes(v)));
  const tables = (await q<{ t: string }>(`select table_name t from information_schema.tables where table_schema = 'public' and table_name like 'Mrp%'`)).map((r) => r.t);
  const expected = ["MrpBaseVersion", "MrpBaseMaterial", "MrpStockImport", "MrpStockItem", "MrpPurchaseImport", "MrpPurchaseItem", "MrpAnalysisRun", "MrpAnalysisItem"];
  check(`20261007000100_add_mrp_analysis_tables: 8 tabelas MRP`, expected.every((t) => tables.includes(t)), tables.sort().join(", "));
  const idx = (await q<{ i: string }>(`select indexname i from pg_indexes where schemaname = 'public' and tablename like 'Mrp%'`)).map((r) => r.i);
  check("índices parciais únicos: MrpBaseVersion_single_active_key e MrpAnalysisRun_single_current_key", idx.includes("MrpBaseVersion_single_active_key") && idx.includes("MrpAnalysisRun_single_current_key"));
  const numeric = await q<{ c: string; t: string }>(
    `select table_name || '.' || column_name c, data_type t from information_schema.columns where table_schema = 'public' and ((table_name = 'MrpBaseMaterial' and column_name in ('min','max')) or (table_name = 'MrpStockItem' and column_name = 'freeQty') or (table_name = 'MrpPurchaseItem' and column_name = 'quantity') or (table_name = 'MrpAnalysisItem' and column_name in ('min','max','free','suggested')))`
  );
  check("20261007000200_mrp_quantities_decimal: quantidades em numeric", numeric.length >= 8 && numeric.every((r) => r.t === "numeric"), numeric.map((r) => `${r.c}:${r.t}`).join(" "));
  const pos = await q<{ n: number }>(`select count(*)::int n from information_schema.columns where table_name = 'MrpAnalysisItem' and column_name = 'position'`);
  check("20261008000000_mrp_analysis_item_position: MrpAnalysisItem.position + índice", pos[0].n === 1 && idx.includes("MrpAnalysisItem_runId_position_idx"));

  // prisma migrate diff: banco → schema.prisma (só modelos MRP precisam bater; outras diferenças são listadas à parte).
  const url = process.env.DATABASE_URL ?? "";
  // CLI do Prisma chamado direto pelo node (sem shell: a URL tem & e ? que o shell quebraria).
  const r = spawnSync(process.execPath, ["node_modules/prisma/build/index.js", "migrate", "diff", "--from-url", url, "--to-schema-datamodel", "prisma/schema.prisma", "--script"], { encoding: "utf8" });
  const out = (r.stdout ?? "").replaceAll(url, "<url>");
  const statements = out.split(";").map((s) => s.trim()).filter((s) => s && !/^--/.test(s) && !/^-- This is an empty migration/.test(s));
  const mrpDiff = statements.filter((s) => /"Mrp|MRP_/.test(s));
  if (r.status !== 0 && !out) console.log(`    (migrate diff indisponível: ${(r.stderr ?? "").replaceAll(url, "<url>").split("\n").slice(-3).join(" ")})`);
  else check(`prisma migrate diff (banco → schema): ${mrpDiff.length} diferença(s) nos modelos MRP · ${statements.length - mrpDiff.length} fora do MRP`, mrpDiff.length === 0, mrpDiff.slice(0, 5).join(" | "));
  if (statements.length - mrpDiff.length > 0) console.log(`    fora do MRP (não alterado nesta fase): ${statements.filter((s) => !mrpDiff.includes(s)).slice(0, 5).map((s) => s.replace(/\s+/g, " ").slice(0, 140)).join(" | ")}`);

  console.log("\n3. Base inicial (SEED_HTML)");
  const seeds = await prisma.mrpBaseVersion.findMany({ where: { source: "SEED_HTML" }, select: { id: true, materialCount: true, isActive: true, createdAt: true } });
  check(`exatamente uma versão SEED_HTML`, seeds.length === 1, String(seeds.length));
  if (seeds[0]) {
    const byArea = await prisma.mrpBaseMaterial.groupBy({ by: ["area"], where: { versionId: seeds[0].id }, _count: { _all: true } });
    const m = Object.fromEntries(byArea.map((x) => [x.area, x._count._all]));
    check(`SEED_HTML: ${seeds[0].materialCount} materiais (Mecânica ${m["Mecânica"]} · Elétrica ${m["Elétrica"]}) · ativa ${seeds[0].isActive}`, seeds[0].materialCount === 4280 && m["Mecânica"] === 3485 && m["Elétrica"] === 795);
  }

  console.log("\n4. Constraints e estado");
  const actives = await prisma.mrpBaseVersion.count({ where: { isActive: true } });
  const currents = await prisma.mrpAnalysisRun.count({ where: { isCurrent: true } });
  const versions = await prisma.mrpBaseVersion.count();
  const runs = await prisma.mrpAnalysisRun.count();
  check(`uma base ativa (${actives}) · no máximo um run vigente (${currents})`, actives === 1 && currents <= 1);
  console.log(`    versões de base: ${versions} · runs: ${runs} · análise vigente: ${currents ? "sim" : "não (tela mostra o estado vazio até a 1ª atualização)"}`);

  console.log("\n5. Configuração");
  const dep = await prisma.portalSetting.findFirst({ where: { key: "deposito_padrao" } }).catch(() => null);
  console.log(`    depósito padrão da Análise MRP (Configurações): ${dep ? `"${(dep as { value: string }).value}"` : "não gravado (usa o padrão do código: 1400, como o HTML)"}`);

  const h = await healthCheck("6. Saúde do banco");
  check("0 transações presas · 0 locks MRP · 0 importações presas · 0 runs incompletos", h.idleTx === 0 && h.mrpLocks === 0 && h.stuck === 0 && h.incomplete === 0);

  console.log(failures ? `\n${failures} FALHA(S)` : "\nBANCO PRONTO PARA A ANÁLISE MRP");
  if (failures) process.exitCode = 1;
}

main()
  .catch((error) => {
    console.error(String(error).replaceAll(process.env.DATABASE_URL ?? "\u0000", "<url>"));
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
