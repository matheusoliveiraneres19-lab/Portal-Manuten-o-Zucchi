/**
 * Round-trip REAL contra o banco: importa um buffer sintético, lê KPIs/agregações
 * pelo service e remove APENAS o lote de teste ao final (não toca em dados existentes).
 *
 * Uso: npx tsx scripts/verify-pc-factory-roundtrip.ts
 */
import * as XLSX from "xlsx";
import { prisma } from "@/lib/prisma";
import { importPcFactoryFromExcel } from "@/services/importacao/pc-factory-import.service";

const TEST_BATCH = "VERIFY-PC-FACTORY-ROUNDTRIP";

async function main() {
  const rows = [
    { resourceName: "Bifio 01 - Bidese", resourceCode: "B01", productionLine: "Linha 01", groupPortal: "Indústria Granito", statusRaw: "Manutenção Mecânica", startDateTime: "2026-06-01T08:00:00.000Z", endDateTime: "2026-06-01T10:00:00.000Z", durationHours: 2 },
    { resourceName: "Bifio 01 - Bidese", resourceCode: "B01", productionLine: "Linha 01", groupPortal: "Indústria Granito", statusRaw: "Manutenção Automação", startDateTime: "2026-06-01T11:00:00.000Z", endDateTime: "2026-06-01T12:30:00.000Z", durationHours: 1.5 },
    { resourceName: "Levigadora 20 Keda", resourceCode: "LV20", productionLine: "Linha 02", groupPortal: "Indústria Mármore", statusRaw: "Falta de Utilidades", startDateTime: "2026-06-02T07:00:00.000Z", endDateTime: "2026-06-02T08:00:00.000Z", durationHours: 1 },
    { resourceName: "Levigadora 20 Keda", resourceCode: "LV20", productionLine: "Linha 02", groupPortal: "Indústria Mármore", statusRaw: "Produção", startDateTime: "2026-06-02T08:00:00.000Z", endDateTime: "2026-06-02T16:00:00.000Z", durationHours: 8 }
  ];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), "Import_PC_FACTORY");
  const buffer = XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;

  try {
    const result = await importPcFactoryFromExcel(buffer, { fileName: "verify.xlsx", importBatch: TEST_BATCH, importedBy: "verify" });
    console.log("Import:", { aba: result.sheetUsed, criadas: result.createdRows, manut: result.maintenanceRows, automacao: result.automationMaintenanceRows, perda: result.operationalLossRows, grupos: result.groupsDetected });

    // Lê de volta do banco (valida colunas derivadas gravadas — TAREFA 2).
    const saved = await prisma.pcFactoryRecord.findMany({
      where: { importBatch: TEST_BATCH },
      select: { resourceName: true, groupPortal: true, statusRaw: true, statusCategory: true, maintenanceType: true, isMaintenanceKpi: true, isDowntimeForAvailability: true, durationHours: true },
      orderBy: { startDateTime: "asc" }
    });
    console.table(saved);

    const automacao = saved.find((r) => r.statusRaw === "Manutenção Automação");
    const utilidades = saved.find((r) => r.statusRaw === "Falta de Utilidades");
    const grupos = new Set(saved.map((r) => r.groupPortal).filter(Boolean));

    const ok =
      result.createdRows === 4 &&
      automacao?.statusCategory === "MANUTENCAO" &&
      automacao?.maintenanceType === "AUTOMACAO" &&
      automacao?.isMaintenanceKpi === true &&
      utilidades?.statusCategory === "PARADA_PERDA" &&
      utilidades?.isMaintenanceKpi === false &&
      utilidades?.isDowntimeForAvailability === true &&
      grupos.size === 2;
    console.log(ok ? "\n✅ ROUND-TRIP OK (colunas derivadas corretas no banco)" : "\n❌ ROUND-TRIP DIVERGENTE");
  } finally {
    const del = await prisma.pcFactoryRecord.deleteMany({ where: { importBatch: TEST_BATCH } });
    await prisma.importHistory.deleteMany({ where: { fileName: "verify.xlsx", importedBy: "verify" } });
    console.log(`Limpeza: ${del.count} registros de teste removidos.`);
    await prisma.$disconnect();
  }
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
