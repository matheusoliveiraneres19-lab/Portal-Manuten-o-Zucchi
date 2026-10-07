/**
 * ANÁLISE MRP (FASE C) — teste de INTEGRAÇÃO da importação com o banco.
 *
 *   npm run test:mrp-import-db -- --direct      (DIRECT_URL, connection_limit=1)
 *
 * Usa as fixtures controladas e o service real (confirmMrpImport), com o
 * download do Storage substituído pelas fixtures em memória. Verifica:
 *   1. importação completa: valores persistidos = parser (exatos), base NÃO
 *      ativada, histórico COMPLETED, staging limpo, nenhuma MrpAnalysisRun;
 *   2. confirmar de novo o mesmo histórico é recusado (idempotência);
 *   3. reimportar os mesmos arquivos cria NOVAS importações sem tocar nas antigas;
 *   4. falha dentro da transação = rollback total, histórico FAILED;
 *   5. erro do parser (depósito sem linhas) = nada gravado, mensagem do HTML;
 *   6. reimportação só da Base MRP com ativação explícita;
 *   7. duas confirmações simultâneas do mesmo histórico: só uma vale.
 *
 * Escreve só em tabelas MRP + ImportHistory/ImportStagingRow, tudo marcado com
 * TAG, e apaga o que criou. A Base MRP ativa antes do teste é reativada no fim.
 */
import "./force-utc";
import { SCRIPT_DB_MODE, connectWithRetry } from "./script-db";
import { ImportStatus, ImportType } from "@prisma/client";
import { prisma } from "../../src/lib/prisma";
import { buildMrpImportPlan } from "../../src/lib/mrp/import-plan";
import { analyzeMrpWorkbook } from "../../src/lib/mrp/file-detection";
import { readMrpWorkbook } from "../../src/lib/mrp/workbook";
import type { MrpFileKind } from "../../src/lib/mrp/types";
import { MrpImportError, confirmMrpImport, inspectMrpUploads, previewMrpImport } from "../../src/services/mrp-import.service";
import { activateMrpBaseVersion, fromMrpDecimal, getActiveMrpBaseVersion } from "../../src/services/mrp-persistence.service";
import { IMPORT_STAGES } from "../../src/types/imports";
import * as F from "./fixtures";

const TAG = "scripts/mrp/test-mrp-import-db.ts";
let failures = 0;
function check(label: string, ok: boolean, detail = "") {
  if (!ok) failures += 1;
  console.log(`  ${ok ? "✓" : "✗"} ${label}${detail ? `  — ${detail}` : ""}`);
}

const files = new Map<string, Buffer>();
const download = async (path: string) => {
  const data = files.get(path);
  if (!data) throw new Error(`fixture não registrada: ${path}`);
  return data;
};

const KIND_TYPE: Record<MrpFileKind, ImportType> = { base: ImportType.MRP_BASE, est: ImportType.MRP_STOCK, cmp: ImportType.MRP_PURCHASES };

async function openHistory(kind: MrpFileKind, fixture: F.FixtureFile) {
  const path = `imports/analise-mrp/teste/${Date.now()}-${Math.random().toString(36).slice(2)}-${fixture.name}`;
  files.set(path, fixture.data);
  const sheet = analyzeMrpWorkbook(fixture.name, readMrpWorkbook(fixture.data))!.table.sheet;
  const h = await prisma.importHistory.create({
    data: {
      type: KIND_TYPE[kind],
      fileName: fixture.name,
      importedBy: TAG,
      status: ImportStatus.EM_PROCESSAMENTO,
      stage: IMPORT_STAGES.UPLOADED,
      filePath: path,
      bucket: "teste",
      metadata: { mrp: { flow: "analise-mrp", kind, sheet } }
    }
  });
  return { importId: h.id, kind, sheet };
}

async function expectError(fn: () => Promise<unknown>): Promise<string | null> {
  try {
    await fn();
    return null;
  } catch (error) {
    return error instanceof MrpImportError ? error.userMessage : (error as Error).message;
  }
}

const portalPlan = (deposit = "1400") =>
  buildMrpImportPlan(
    [
      { fileName: "base", wb: readMrpWorkbook(F.baseFixture().data), kind: "base", sheet: "MRP Analise manutenção" },
      { fileName: "est", wb: readMrpWorkbook(F.stockFixture().data), kind: "est", sheet: "Sheet1" },
      { fileName: "cmp", wb: readMrpWorkbook(F.purchaseFixture().data), kind: "cmp", sheet: "Compras" }
    ],
    { depositFilter: deposit }
  );

async function main() {
  console.log(`Banco: ${SCRIPT_DB_MODE} (connection_limit=1)`);
  await connectWithRetry(prisma, { label: "teste de importação MRP" });

  const seed = await getActiveMrpBaseVersion();
  if (!seed) throw new Error("Sem Base MRP ativa — rode o seed da FASE B antes.");
  const runsBefore = await prisma.mrpAnalysisRun.count();
  const plan = portalPlan();

  try {
    /* 1 ------------------------------------------------------------------ */
    console.log("\n1. Importação completa (base + estoque + compras), base NÃO ativada");
    const items1 = [await openHistory("base", F.baseFixture()), await openHistory("est", F.stockFixture()), await openHistory("cmp", F.purchaseFixture())];
    const r1 = await confirmMrpImport({ items: items1, depositFilter: "1400", createdBy: TAG, download });
    check("ids das três fontes", !!r1.baseVersionId && !!r1.stockImportId && !!r1.purchaseImportId);

    const version = await prisma.mrpBaseVersion.findUniqueOrThrow({ where: { id: r1.baseVersionId! }, include: { materials: true } });
    check("nova versão criada INATIVA", !version.isActive && version.source === "UPLOAD");
    check("seed continua ativa", (await getActiveMrpBaseVersion())?.id === seed.id);
    const expected = new Map(plan.base!.result.materials.map((m) => [m.code, m]));
    const baseOk =
      version.materials.length === expected.size &&
      version.materials.every((m) => {
        const e = expected.get(m.code)!;
        return (
          !!e && m.description === e.description && m.group === e.group && m.unit === e.unit && m.statusMrp === e.statusMrp &&
          m.family === e.family && m.area === e.area && Object.is(fromMrpDecimal(m.min), e.min) && Object.is(fromMrpDecimal(m.max), e.max) &&
          m.sourceSheet === e.sourceSheet && m.sourceRow === e.sourceRow
        );
      });
    check(`materiais = parser (${version.materials.length}, valores exatos, sourceRow)`, baseOk);
    check("versão guarda abas e abas ignoradas", JSON.stringify(version.ignoredSheets) === '["MRP Automatico Gyan"]' && Array.isArray(version.sheets) && (version.sheets as unknown[]).length === 3);

    const stock = await prisma.mrpStockImport.findUniqueOrThrow({ where: { id: r1.stockImportId! }, include: { items: true } });
    const s = plan.stock!.result;
    check("estoque: contadores (lidas/aceitas/dup/outros depósitos)", stock.rowsRead === s.rowsRead && stock.rowsAccepted === s.rowsAccepted && stock.duplicateRows === 1 && stock.otherDepositRows === 2, `${stock.rowsRead}/${stock.rowsAccepted}/${stock.duplicateRows}/${stock.otherDepositRows}`);
    check("estoque: depósito e info gravados", stock.depositFilter === "1400" && stock.depositInfo === "depósito 1400" && stock.depositColumnFound);
    const stockOk = s.items.every((it) => {
      const row = stock.items.find((x) => x.code === it.code);
      return !!row && Object.is(fromMrpDecimal(row.freeQty), it.freeQty === 0 ? 0 : it.freeQty) && row.sourceRow === it.sourceRow;
    });
    check(`estoque: itens = parser (${stock.items.length}; -0 gravado como 0)`, stockOk && stock.items.length === s.items.length);

    const purchase = await prisma.mrpPurchaseImport.findUniqueOrThrow({ where: { id: r1.purchaseImportId! }, include: { items: { orderBy: { seq: "asc" } } } });
    const c = plan.purchases!.result;
    const purchaseOk = c.items.every((it, i) => {
      const row = purchase.items[i];
      return (
        row.seq === it.seq && row.code === it.code && row.text === it.text && Object.is(fromMrpDecimal(row.quantity), it.quantity) &&
        row.requisitionDate === it.requisitionDate && row.receiptDate === it.receiptDate && row.expectedDeliveryDate === it.expectedDeliveryDate &&
        row.requisitionNumber === it.requisitionNumber && row.purchaseOrderNumber === it.purchaseOrderNumber && row.supplier === it.supplier
      );
    });
    check(`compras: itens = parser (${purchase.items.length}, seq 0..n-1, datas texto)`, purchaseOk && purchase.items.length === c.items.length);
    check("compras: várias linhas do mesmo material", purchase.items.filter((x) => x.code === "13515").length === 3);

    const hist = await prisma.importHistory.findMany({ where: { id: { in: items1.map((i) => i.importId) } } });
    check("históricos COMPLETED / SUCESSO", hist.every((h) => h.stage === IMPORT_STAGES.COMPLETED && h.status === ImportStatus.SUCESSO));
    check("staging limpo após sucesso", (await prisma.importStagingRow.count({ where: { importHistoryId: { in: items1.map((i) => i.importId) } } })) === 0);
    check("nenhuma MrpAnalysisRun criada (motor é FASE D)", (await prisma.mrpAnalysisRun.count()) === runsBefore);

    /* 2 ------------------------------------------------------------------ */
    console.log("\n2. Confirmar de novo o mesmo histórico");
    const again = await expectError(() => confirmMrpImport({ items: items1, depositFilter: "1400", createdBy: TAG, download }));
    check("recusado", !!again && /já foi confirmada/.test(again), again ?? "não falhou");

    /* 3 ------------------------------------------------------------------ */
    console.log("\n3. Mesmos arquivos importados de novo");
    const items3 = [await openHistory("est", F.stockFixture()), await openHistory("cmp", F.purchaseFixture())];
    const r3 = await confirmMrpImport({ items: items3, depositFilter: "1400", createdBy: TAG, download });
    check("novas importações (ids diferentes)", r3.stockImportId !== r1.stockImportId && r3.purchaseImportId !== r1.purchaseImportId);
    const firstStill = await prisma.mrpStockItem.count({ where: { importId: r1.stockImportId! } });
    check("importação anterior intacta", firstStill === stock.items.length);

    /* 4 ------------------------------------------------------------------ */
    console.log("\n4. Falha dentro da transação");
    const items4 = [await openHistory("est", F.stockFixture()), await openHistory("cmp", F.purchaseFixture())];
    const stockBefore = await prisma.mrpStockImport.count();
    const fail4 = await expectError(() =>
      confirmMrpImport({
        items: items4,
        depositFilter: "1400",
        createdBy: TAG,
        download,
        hooks: { beforeCommit: async () => { throw new Error("falha simulada antes do commit"); } }
      })
    );
    check("erro propagado", fail4 === "falha simulada antes do commit", fail4 ?? "");
    check("nenhuma importação de estoque/compras gravada", (await prisma.mrpStockImport.count()) === stockBefore && (await prisma.mrpPurchaseImport.count({ where: { importHistoryId: { in: items4.map((i) => i.importId) } } })) === 0);
    const h4 = await prisma.importHistory.findMany({ where: { id: { in: items4.map((i) => i.importId) } } });
    check("históricos FAILED", h4.every((h) => h.stage === IMPORT_STAGES.FAILED && h.status === ImportStatus.ERRO));

    /* 5 ------------------------------------------------------------------ */
    console.log("\n5. Erro do parser (depósito sem linhas)");
    const items5 = [await openHistory("est", F.stockFixture()), await openHistory("cmp", F.purchaseFixture())];
    const fail5 = await expectError(() => confirmMrpImport({ items: items5, depositFilter: "9999", createdBy: TAG, download }));
    check("mensagem do HTML", fail5 === "Nenhuma linha de estoque restou no depósito 9999. Confira o código do depósito ou deixe o campo em branco.", fail5 ?? "");
    check("nada gravado + staging vazio", (await prisma.mrpStockImport.count({ where: { importHistoryId: { in: items5.map((i) => i.importId) } } })) === 0 && (await prisma.importStagingRow.count({ where: { importHistoryId: { in: items5.map((i) => i.importId) } } })) === 0);
    const retry5 = await confirmMrpImport({ items: items5, depositFilter: "", createdBy: TAG, download });
    check("histórico FAILED pode ser confirmado de novo (todos os depósitos)", !!retry5.stockImportId && retry5.counts.stock?.depositInfo === "todos os depósitos");

    /* 6 ------------------------------------------------------------------ */
    console.log("\n6. Reimportação só da Base MRP, com ativação explícita");
    const items6 = [await openHistory("base", F.baseFixture())];
    const r6 = await confirmMrpImport({ items: items6, depositFilter: "1400", createdBy: TAG, download, activateBase: true });
    const active6 = await getActiveMrpBaseVersion();
    check("nova versão ativa", r6.baseActivated === true && active6?.id === r6.baseVersionId);
    check("seed ficou inativa (não apagada)", (await prisma.mrpBaseVersion.findUniqueOrThrow({ where: { id: seed.id } })).isActive === false);
    await activateMrpBaseVersion(seed.id);
    check("seed reativada pelo helper transacional", (await getActiveMrpBaseVersion())?.id === seed.id);

    /* 7 ------------------------------------------------------------------ */
    console.log("\n7. Duas confirmações simultâneas do mesmo histórico");
    const items7 = [await openHistory("est", F.stockFixture()), await openHistory("cmp", F.purchaseFixture())];
    const outcomes = await Promise.allSettled([
      confirmMrpImport({ items: items7, depositFilter: "1400", createdBy: TAG, download }),
      confirmMrpImport({ items: items7, depositFilter: "1400", createdBy: TAG, download })
    ]);
    const created7 = await prisma.mrpStockImport.count({ where: { importHistoryId: { in: items7.map((i) => i.importId) } } });
    const reasons = outcomes.map((o) => (o.status === "fulfilled" ? "ok" : o.reason instanceof MrpImportError ? o.reason.userMessage : String(o.reason?.message ?? o.reason)));
    check("exatamente uma importação gravada", created7 === 1, `${reasons.join(" | ")} · gravadas=${created7}`);
    check("a outra foi recusada como em processamento", outcomes.filter((o) => o.status === "fulfilled").length === 1 && reasons.some((r) => /sendo processada/.test(r)));

    /* 8 ------------------------------------------------------------------ */
    console.log("\n8. Fluxo do service: inspect → preview (trocar tipo/aba) → confirm");
    const ref = (f: F.FixtureFile) => {
      const path = `imports/analise-mrp/teste/${Date.now()}-${Math.random().toString(36).slice(2)}-${f.name}`;
      files.set(path, f.data);
      return { fileName: f.name, filePath: path, bucket: "teste", fileSize: f.data.byteLength };
    };
    const two = F.twoSheetStockFixture();
    const inspected = await inspectMrpUploads({
      files: [ref(F.unknownFixture()), ref(two), ref(F.purchaseFixture())],
      importedBy: TAG,
      depositFilter: "1400",
      download
    });
    check("slots: desconhecido→base, estoque→est, compras→cmp", inspected.slots.base?.fileName === "planilha_qualquer.xlsx" && inspected.slots.est?.fileName === two.name && inspected.slots.cmp?.fileName === "Compras_teste.xlsx");
    check("arquivo desconhecido: confidence LOW + aviso", inspected.slots.base?.preview.diagnosis.confidence === "LOW" && inspected.slots.base.preview.diagnosis.warnings.includes("Nenhuma coluna reconhecida com segurança."));
    check("trava fechada pela base inválida", inspected.lock.ready === false);
    check("prévia de estoque: depósito, duplicidades, linhas no depósito", inspected.slots.est?.preview.stock?.depositColumnFound === true && inspected.slots.est.preview.stock.duplicateRows === 1 && inspected.slots.est.preview.stock.rowsInDeposit === 5);
    check("prévia de compras: linhas com código + opcionais reconhecidos", inspected.slots.cmp?.preview.purchases?.rowsWithCode === 8 && Object.keys(inspected.slots.cmp.preview.purchases.optionalColumns).length === 8);
    const hist8 = await prisma.importHistory.findMany({ where: { id: { in: [inspected.slots.base!.importId, inspected.slots.est!.importId, inspected.slots.cmp!.importId] } } });
    check("ImportHistory UPLOADED com sha256 e tipo", hist8.length === 3 && hist8.every((h) => h.stage === IMPORT_STAGES.UPLOADED && typeof (h.metadata as { mrp?: { sha256?: string } }).mrp?.sha256 === "string"));
    const sheetPreview = await previewMrpImport({ importId: inspected.slots.est!.importId, sheet: "Resumo", download });
    check("trocarAba: prévia da aba Resumo", sheetPreview.preview.sheet === "Resumo" && sheetPreview.preview.dataRows === 1);
    await previewMrpImport({ importId: inspected.slots.est!.importId, sheet: "Estoque", download });
    const kindPreview = await previewMrpImport({ importId: inspected.slots.base!.importId, kind: "cmp", download });
    check("reatribuir: arquivo desconhecido como compras → coluna Material ausente", kindPreview.preview.kind === "cmp" && kindPreview.preview.diagnosis.requiredColumnsOk === false);
    const r8 = await confirmMrpImport({
      items: [
        { importId: inspected.slots.est!.importId, kind: "est" },
        { importId: inspected.slots.cmp!.importId, kind: "cmp" }
      ],
      depositFilter: "1400",
      createdBy: TAG,
      download
    });
    const st8 = await prisma.mrpStockImport.findUniqueOrThrow({ where: { id: r8.stockImportId! } });
    check("confirm usa a aba escolhida na prévia (Estoque)", st8.sheet === "Estoque" && st8.rowsAccepted === 4);
  } finally {
    const active = await getActiveMrpBaseVersion();
    if (active?.id !== seed.id) await activateMrpBaseVersion(seed.id);
    await prisma.mrpStockImport.deleteMany({ where: { createdBy: TAG } });
    await prisma.mrpPurchaseImport.deleteMany({ where: { createdBy: TAG } });
    await prisma.mrpBaseVersion.deleteMany({ where: { createdBy: TAG, isActive: false } });
    await prisma.importHistory.deleteMany({ where: { importedBy: TAG } });
    const left =
      (await prisma.mrpStockImport.count({ where: { createdBy: TAG } })) +
      (await prisma.mrpPurchaseImport.count({ where: { createdBy: TAG } })) +
      (await prisma.mrpBaseVersion.count({ where: { createdBy: TAG } })) +
      (await prisma.importHistory.count({ where: { importedBy: TAG } }));
    console.log("\nLimpeza");
    check("nenhum registro de teste restante", left === 0, String(left));
    check("Base MRP original ativa", (await getActiveMrpBaseVersion())?.id === seed.id);
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
