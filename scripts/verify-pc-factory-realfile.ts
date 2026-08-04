/**
 * Round-trip contra o ARQUIVO REAL (test batch + cleanup). NÃO commitar.
 * Uso: npx tsx scripts/verify-pc-factory-realfile.ts
 */
import { prisma } from "@/lib/prisma";
import { importPcFactoryFromExcel } from "@/services/importacao/pc-factory-import.service";

const FILE = process.env.XLSX_PATH ?? "C:/Users/matheus.neres/Downloads/G0015_PC_FACTORY_ajustada_portal.xlsx";
const TEST_BATCH = "VERIFY-REALFILE-DELETE-ME";

async function main() {
  try {
    const r = await importPcFactoryFromExcel(FILE, { fileName: "verify-real.xlsx", importBatch: TEST_BATCH, importedBy: "verify" });
    console.log("RESULTADO IMPORT:", JSON.stringify({
      aba: r.sheetUsed, total: r.totalRows, importadas: r.importedRows, criadas: r.createdRows,
      atualizadas: r.updatedRows, ignoradas: r.ignoredRows, erro: r.errorRows,
      manut: r.maintenanceRows, mec: r.mechanicalMaintenanceRows, ele: r.electricalMaintenanceRows,
      auto: r.automationMaintenanceRows, aguard: r.waitingMaintenanceRows, perda: r.operationalLossRows,
      fora: r.excludedFromPlannedTimeRows, prod: r.productionRows, outros: r.otherRows, qualidade: r.dataQualityRows,
      recursos: r.resourcesDetected, grupos: r.groupsDetected, periodo: r.periodDetected
    }, null, 1));
    console.log("STATUS DETECTADOS:", r.statusDetected);
    if (r.errors.length) console.log("ERROS:", r.errors.slice(0, 10));

    const byCat = await prisma.pcFactoryRecord.groupBy({ by: ["statusCategory"], where: { importBatch: TEST_BATCH }, _count: true, _sum: { durationHours: true } });
    console.log("\nPOR CATEGORIA NO BANCO:", JSON.stringify(byCat, null, 1));
    const byType = await prisma.pcFactoryRecord.groupBy({ by: ["maintenanceType"], where: { importBatch: TEST_BATCH }, _count: true });
    console.log("POR maintenanceType:", JSON.stringify(byType, null, 1));
  } finally {
    const del = await prisma.pcFactoryRecord.deleteMany({ where: { importBatch: TEST_BATCH } });
    await prisma.importHistory.deleteMany({ where: { fileName: "verify-real.xlsx" } });
    console.log(`\nLimpeza: ${del.count} registros de teste removidos.`);
    await prisma.$disconnect();
  }
}
main().catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1); });
