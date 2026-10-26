/**
 * ANÁLISE MRP (FASE B) — testes de schema e persistência.
 *
 *   npm run test:mrp-persistence            (usa DATABASE_URL; nesta rede, a DIRECT_URL)
 *   npm run test:mrp-persistence -- --html="C:\...\Analise_MRP_Compacto (1).html"
 *
 * Verifica:
 *   1. seed: 4.280 materiais (Mecânica 3.485 · Elétrica 795) e cada material
 *      persistido idêntico (Object.is) ao materiais() ORIGINAL do HTML;
 *   2. exatamente uma versão ativa;
 *   3. unique (versionId, code);
 *   4. MrpStockItem impede código repetido no mesmo import;
 *   5. MrpPurchaseItem aceita várias linhas do mesmo material;
 *   6. MrpAnalysisRun referencia base + estoque + compras (FK RESTRICT);
 *   7. ativar versão nova -> antiga fica inativa;
 *   8. ativação que falha (rollback) -> versão anterior continua ativa;
 *   9. versão incompleta não pode ser ativada;
 *  10. o banco barra duas versões ativas / duas análises current (índices parciais);
 *  11. só uma análise current após a troca.
 *
 * ESCREVE só nas tabelas MRP (e uma linha de ImportHistory de teste), marcando
 * tudo com createdBy = TEST_TAG, e apaga APENAS o que criou. No `finally` a
 * versão que estava ativa antes do teste é reativada.
 */
import { Prisma } from "@prisma/client";
import { prisma } from "../../src/lib/prisma";
import {
  MrpPersistenceError,
  activateMrpBaseVersion,
  createMrpBaseVersion,
  getActiveMrpBaseVersion,
  getMrpDefaultDeposit,
  setCurrentMrpAnalysisRun,
  toMrpDecimal
} from "../../src/services/mrp-persistence.service";
import { loadHtmlReference } from "./html-reference";

const TEST_TAG = "scripts/mrp/test-mrp-persistence.ts";
let failures = 0;

function check(label: string, ok: boolean, detail = "") {
  if (!ok) failures += 1;
  console.log(`  ${ok ? "✓" : "✗"} ${label}${detail ? `  — ${detail}` : ""}`);
}

async function expectPrismaError(code: string, fn: () => Promise<unknown>): Promise<boolean> {
  try {
    await fn();
    return false;
  } catch (error) {
    return error instanceof Prisma.PrismaClientKnownRequestError && error.code === code;
  }
}

async function expectRejects(fn: () => Promise<unknown>): Promise<string | null> {
  try {
    await fn();
    return null;
  } catch (error) {
    return error instanceof Error ? error.message.split("\n").pop() ?? error.message : String(error);
  }
}

const material = (code: string, area = "Mecânica") => ({
  code,
  description: `Material de teste ${code}`,
  group: "TESTE",
  unit: "PEC",
  min: 1,
  max: 2,
  statusMrp: "",
  family: "",
  area
});

async function testSeed() {
  console.log("\n1–2. Base seed (SEED_HTML)");
  const active = await getActiveMrpBaseVersion();
  check("existe versão ativa", !!active);
  if (!active) return null;
  check("versão ativa é SEED_HTML", active.source === "SEED_HTML", active.source);
  check("materialCount = 4280", active.materialCount === 4280, String(active.materialCount));

  // Sequencial de propósito: uma conexão só (pooler de sessão com limite de clientes).
  const total = await prisma.mrpBaseMaterial.count({ where: { versionId: active.id } });
  const mec = await prisma.mrpBaseMaterial.count({ where: { versionId: active.id, area: "Mecânica" } });
  const ele = await prisma.mrpBaseMaterial.count({ where: { versionId: active.id, area: "Elétrica" } });
  const activeCount = await prisma.mrpBaseVersion.count({ where: { isActive: true } });
  check("materiais gravados = 4280", total === 4280, String(total));
  check("Mecânica = 3485", mec === 3485, String(mec));
  check("Elétrica = 795", ele === 795, String(ele));
  check("exatamente uma versão ativa", activeCount === 1, String(activeCount));

  try {
    const ref = loadHtmlReference();
    const original = ref.fn.materiais();
    const rows = await prisma.mrpBaseMaterial.findMany({ where: { versionId: active.id } });
    const order = (s: string | null) => (s === "SEED_MAN" ? 0 : 1);
    rows.sort((a, b) => order(a.sourceSheet) - order(b.sourceSheet) || (a.sourceRow ?? 0) - (b.sourceRow ?? 0));
    let diverg = 0;
    original.forEach((o, i) => {
      const p = rows[i];
      const same =
        !!p &&
        Object.is(o.codigo, p.code) &&
        Object.is(o.descricao, p.description) &&
        Object.is(o.grupo, p.group) &&
        Object.is(o.min, p.min.toNumber()) &&
        Object.is(o.max, p.max.toNumber()) &&
        Object.is(o.um, p.unit) &&
        Object.is(o.statusMrp, p.statusMrp) &&
        Object.is(o.familia, p.family) &&
        Object.is(o.area, p.area);
      if (!same) diverg += 1;
    });
    check("banco = materiais() do HTML (campo a campo, Object.is)", diverg === 0 && rows.length === original.length, `${diverg} divergência(s)`);
  } catch (error) {
    check("comparação com o HTML", false, (error as Error).message);
  }
  return active;
}

async function main() {
  const originalActive = await testSeed();
  if (!originalActive) {
    console.log("\nSem base ativa — rode scripts/seed-mrp-html-base.ts antes.");
    process.exitCode = 1;
    return;
  }

  console.log("\n   Depósito");
  const deposit = await getMrpDefaultDeposit();
  check("mrp/deposito_padrao = \"1400\"", deposit === "1400", JSON.stringify(deposit));

  const created = { versions: [] as string[], stock: [] as string[], purchase: [] as string[], runs: [] as string[], history: [] as string[] };

  try {
    // ── 3. unique (versionId, code) ─────────────────────────────────────
    console.log("\n3. Unique versão + código");
    const vA = await createMrpBaseVersion({
      fileName: "teste-A.xlsx",
      source: "UPLOAD",
      sheets: [],
      ignoredSheets: [],
      defaultArea: "Mecânica",
      materials: [material("T-0001"), material("T-0002", "Elétrica")],
      createdBy: TEST_TAG,
      activate: false
    });
    created.versions.push(vA.id);
    check("versão de teste criada inativa", !vA.isActive);
    check(
      "código repetido na mesma versão é rejeitado (P2002)",
      await expectPrismaError("P2002", () => prisma.mrpBaseMaterial.create({ data: { versionId: vA.id, ...material("T-0001") } }))
    );
    const rolledBack = await expectRejects(() =>
      createMrpBaseVersion({
        fileName: "teste-dup.xlsx",
        source: "UPLOAD",
        sheets: [],
        ignoredSheets: [],
        defaultArea: "Mecânica",
        materials: [material("T-DUP"), material("T-DUP")],
        createdBy: TEST_TAG,
        activate: true
      })
    );
    const orphan = await prisma.mrpBaseVersion.count({ where: { fileName: "teste-dup.xlsx" } });
    check("versão com duplicado falha inteira (sem versão órfã)", !!rolledBack && orphan === 0, `órfãs=${orphan}`);

    // ── 4. Estoque ──────────────────────────────────────────────────────
    console.log("\n4. Estoque");
    const history = await prisma.importHistory.create({
      data: { type: "MRP_STOCK", fileName: "teste-estoque.xlsx", importedBy: TEST_TAG, status: "SUCESSO" }
    });
    created.history.push(history.id);
    check("ImportType MRP_STOCK aceito pelo banco", history.type === "MRP_STOCK");
    const stock = await prisma.mrpStockImport.create({
      data: {
        importHistoryId: history.id,
        fileName: "teste-estoque.xlsx",
        sheet: "Plan1",
        depositFilter: "1400",
        depositInfo: "depósito 1400",
        depositColumnFound: true,
        rowsRead: 3,
        rowsAccepted: 2,
        duplicateRows: 1,
        otherDepositRows: 0,
        createdBy: TEST_TAG,
        items: {
          create: [
            { code: "T-0001", freeQty: 5, sourceRow: 2 },
            { code: "T-0002", freeQty: -0, sourceRow: 3 },
            { code: "T-0003", freeQty: toMrpDecimal(0.1 + 0.2), sourceRow: 5 },
            { code: "T-0004", freeQty: toMrpDecimal(434.99999999999994), sourceRow: 6 }
          ]
        }
      }
    });
    created.stock.push(stock.id);
    check(
      "mesmo código duas vezes no mesmo import é rejeitado (P2002)",
      await expectPrismaError("P2002", () =>
        prisma.mrpStockItem.create({ data: { importId: stock.id, code: "T-0001", freeQty: 9, sourceRow: 4 } })
      )
    );
    const qty = async (code: string) =>
      (await prisma.mrpStockItem.findUniqueOrThrow({ where: { importId_code: { importId: stock.id, code } } })).freeQty.toNumber();
    const q3 = await qty("T-0003");
    const q4 = await qty("T-0004");
    check("Decimal devolve o double exato (0.1+0.2)", Object.is(q3, 0.1 + 0.2), String(q3));
    check("Decimal devolve o double exato (434.99999999999994)", Object.is(q4, 434.99999999999994), String(q4));
    const negZero = await qty("T-0002");
    check("-0 é gravado como 0 (limitação documentada)", Object.is(negZero, 0), String(negZero));

    // ── 5. Compras ──────────────────────────────────────────────────────
    console.log("\n5. Compras");
    const purchase = await prisma.mrpPurchaseImport.create({
      data: {
        fileName: "teste-compras.xlsx",
        sheet: "Plan1",
        rowsRead: 3,
        rowsAccepted: 3,
        createdBy: TEST_TAG,
        items: {
          create: [0, 1, 2].map((seq) => ({
            seq,
            code: "T-0001",
            text: "Material de teste",
            quantity: seq + 1,
            requisitionDate: `2026-09-0${seq + 1}`,
            receiptDate: seq === 2 ? "" : "2026-09-20",
            expectedDeliveryDate: "",
            requisitionNumber: `R${seq}`,
            purchaseOrderNumber: "",
            supplier: "Fornecedor teste"
          }))
        }
      }
    });
    created.purchase.push(purchase.id);
    const sameCode = await prisma.mrpPurchaseItem.count({ where: { importId: purchase.id, code: "T-0001" } });
    check("3 linhas do mesmo material aceitas (sem dedup)", sameCode === 3, String(sameCode));
    const dates = await prisma.mrpPurchaseItem.findMany({ where: { importId: purchase.id }, orderBy: { seq: "asc" } });
    check("datas voltam como texto ISO idêntico", dates[0].requisitionDate === "2026-09-01" && dates[2].receiptDate === "");

    // ── 6. AnalysisRun ──────────────────────────────────────────────────
    console.log("\n6. AnalysisRun → base + estoque + compras");
    const runData = (trigger: string) => ({
      baseVersionId: vA.id,
      stockImportId: stock.id,
      purchaseImportId: purchase.id,
      depositFilter: "1400",
      trigger,
      kpis: { total: 2 },
      createdBy: TEST_TAG,
      items: {
        create: [
          {
            code: "T-0001", description: "x", group: "TESTE", unit: "PEC", area: "Mecânica", family: "",
            min: 1, max: 2, free: 5, notFound: false, noParams: false, noMovement: false,
            status: "OK", statusOriginal: "OK", suggested: 0, suggestedOriginal: 0, missing: 0
          }
        ]
      }
    });
    const run1 = await prisma.mrpAnalysisRun.create({ data: runData("FULL_UPDATE") });
    created.runs.push(run1.id);
    const linked = await prisma.mrpAnalysisRun.findUniqueOrThrow({
      where: { id: run1.id },
      include: { baseVersion: true, stockImport: true, purchaseImport: true, _count: { select: { items: true } } }
    });
    check(
      "run referencia as três fontes",
      linked.baseVersion.id === vA.id && linked.stockImport.id === stock.id && linked.purchaseImport.id === purchase.id
    );
    check("run tem itens", linked._count.items === 1);
    check(
      "fonte usada por um run não pode ser apagada (FK RESTRICT, P2003)",
      await expectPrismaError("P2003", () => prisma.mrpStockImport.delete({ where: { id: stock.id } }))
    );

    // ── 11 / 10. Análise current ────────────────────────────────────────
    console.log("\n10–11. Análise current");
    const priorCurrent = await prisma.mrpAnalysisRun.findFirst({ where: { isCurrent: true }, select: { id: true } });
    if (priorCurrent) {
      console.log("  (já existe análise current real — testes de current pulados para não alterá-la)");
    } else {
      const run2 = await prisma.mrpAnalysisRun.create({ data: runData("BASE_REIMPORT") });
      created.runs.push(run2.id);
      await setCurrentMrpAnalysisRun(run1.id);
      await setCurrentMrpAnalysisRun(run2.id);
      const current = await prisma.mrpAnalysisRun.findMany({ where: { isCurrent: true }, select: { id: true } });
      check("trocar current deixa só a nova", current.length === 1 && current[0].id === run2.id);
      check(
        "banco barra duas análises current (índice parcial, P2002)",
        await expectPrismaError("P2002", () => prisma.mrpAnalysisRun.update({ where: { id: run1.id }, data: { isCurrent: true } }))
      );
      await prisma.mrpAnalysisRun.updateMany({ where: { id: { in: created.runs } }, data: { isCurrent: false } });
    }

    // ── 7. Ativação ─────────────────────────────────────────────────────
    console.log("\n7. Ativar versão nova");
    await activateMrpBaseVersion(vA.id);
    const afterActivate = await prisma.mrpBaseVersion.findMany({ where: { isActive: true }, select: { id: true } });
    const oldNow = await prisma.mrpBaseVersion.findUniqueOrThrow({ where: { id: originalActive.id } });
    check("nova versão ativa", afterActivate.length === 1 && afterActivate[0].id === vA.id);
    check("versão anterior ficou inativa (com deactivatedAt)", !oldNow.isActive && !!oldNow.deactivatedAt);

    // ── 8. Falha na ativação ────────────────────────────────────────────
    console.log("\n8. Ativação que falha → anterior continua ativa");
    await activateMrpBaseVersion(originalActive.id); // volta para a seed
    const simulated = await expectRejects(() =>
      prisma.$transaction(async (tx) => {
        await activateMrpBaseVersion(vA.id, tx);
        throw new Error("falha simulada depois da ativação");
      })
    );
    const stillActive = await getActiveMrpBaseVersion();
    check("transação revertida", simulated === "falha simulada depois da ativação", simulated ?? "não falhou");
    check("seed continua ativa após rollback", stillActive?.id === originalActive.id);

    // ── 9. Versão incompleta ────────────────────────────────────────────
    console.log("\n9. Versão incompleta");
    await prisma.mrpBaseVersion.update({ where: { id: vA.id }, data: { materialCount: 3 } });
    const incomplete = await expectRejects(() => activateMrpBaseVersion(vA.id));
    check("ativação recusada", !!incomplete && /incompleta/.test(incomplete), incomplete ?? "");
    check("seed continua ativa", (await getActiveMrpBaseVersion())?.id === originalActive.id);
    const missing = await expectRejects(() => activateMrpBaseVersion("nao-existe"));
    check("versão inexistente recusada", !!missing);

    // ── 10. Índice parcial da base ──────────────────────────────────────
    console.log("\n10. Banco barra duas versões ativas");
    check(
      "update direto para 2ª versão ativa → P2002",
      await expectPrismaError("P2002", () => prisma.mrpBaseVersion.update({ where: { id: vA.id }, data: { isActive: true } }))
    );
    check("seed continua ativa", (await getActiveMrpBaseVersion())?.id === originalActive.id);
    check("erro de domínio é MrpPersistenceError", new MrpPersistenceError("x").name === "MrpPersistenceError");
  } finally {
    // Restaura a versão que estava ativa e apaga só o que o teste criou.
    const active = await getActiveMrpBaseVersion();
    if (active?.id !== originalActive.id) await activateMrpBaseVersion(originalActive.id);
    if (created.runs.length) await prisma.mrpAnalysisRun.deleteMany({ where: { id: { in: created.runs }, createdBy: TEST_TAG } });
    if (created.stock.length) await prisma.mrpStockImport.deleteMany({ where: { id: { in: created.stock }, createdBy: TEST_TAG } });
    if (created.purchase.length) await prisma.mrpPurchaseImport.deleteMany({ where: { id: { in: created.purchase }, createdBy: TEST_TAG } });
    if (created.versions.length) await prisma.mrpBaseVersion.deleteMany({ where: { id: { in: created.versions }, createdBy: TEST_TAG } });
    if (created.history.length) await prisma.importHistory.deleteMany({ where: { id: { in: created.history }, importedBy: TEST_TAG } });
    const leftovers =
      (await prisma.mrpBaseVersion.count({ where: { createdBy: TEST_TAG } })) +
      (await prisma.mrpStockImport.count({ where: { createdBy: TEST_TAG } })) +
      (await prisma.mrpPurchaseImport.count({ where: { createdBy: TEST_TAG } })) +
      (await prisma.mrpAnalysisRun.count({ where: { createdBy: TEST_TAG } }));
    console.log("\nLimpeza");
    check("nenhum registro de teste restante", leftovers === 0, String(leftovers));
    check("seed reativada / ativa no fim", (await getActiveMrpBaseVersion())?.id === originalActive.id);
  }

  console.log(failures ? `\n${failures} FALHA(S)` : "\nTODOS OS TESTES PASSARAM");
  if (failures) process.exitCode = 1;
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
