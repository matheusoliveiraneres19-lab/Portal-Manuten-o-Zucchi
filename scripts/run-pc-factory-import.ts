/**
 * Importação REAL (persiste no banco) da planilha ajustada do PC-Factory.
 * Uso: npx tsx scripts/run-pc-factory-import.ts "<caminho.xlsx>"
 * NÃO commitar planilhas. Este script só lê o arquivo informado.
 */
import { prisma } from "@/lib/prisma";
import { importPcFactoryFromExcel } from "@/services/importacao/pc-factory-import.service";

const FILE = process.argv[2] ?? process.env.XLSX_PATH ?? "C:/Users/matheus.neres/Downloads/G0015_PC_FACTORY_ajustada_portal.xlsx";

async function main() {
  try {
    const r = await importPcFactoryFromExcel(FILE, {
      fileName: "G0015_PC_FACTORY_ajustada_portal.xlsx",
      importedBy: "import-cli",
      importBatch: "G0015_2026_PCFACTORY"
    });
    console.log("RESULTADO:", JSON.stringify({
      aba: r.sheetUsed, total: r.totalRows, importadas: r.importedRows, criadas: r.createdRows,
      atualizadas: r.updatedRows, ignoradas: r.ignoredRows, motivos: r.ignoredReasons, erro: r.errorRows,
      manut: r.maintenanceRows, mec: r.mechanicalMaintenanceRows, ele: r.electricalMaintenanceRows,
      auto: r.automationMaintenanceRows, aguard: r.waitingMaintenanceRows, perda: r.operationalLossRows,
      horasTotais: r.totalHours, horasManut: r.maintenanceHours,
      recursos: r.resourcesDetected, grupos: r.groupsDetected, periodo: r.periodDetected
    }, null, 1));
    const total = await prisma.pcFactoryRecord.count();
    console.log(`\nTOTAL NO BANCO AGORA: ${total}`);
  } finally {
    await prisma.$disconnect();
  }
}
main().catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1); });
