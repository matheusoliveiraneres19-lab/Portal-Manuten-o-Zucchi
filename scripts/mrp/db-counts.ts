/**
 * Contagem das tabelas existentes do portal — usada ANTES e DEPOIS da migration
 * da Análise MRP (FASE B) para provar que nenhum dado antigo foi alterado.
 * Somente leitura.
 *
 *   npx tsx scripts/mrp/db-counts.ts [--out=arquivo.json]
 */
import { connectWithRetry } from "./script-db";
import { writeFileSync } from "node:fs";
import { prisma } from "../../src/lib/prisma";

async function main() {
  await connectWithRetry(prisma, { label: "contagens" });
  const counts = {
    User: await prisma.user.count(),
    ServiceOrder: await prisma.serviceOrder.count(),
    Purchase: await prisma.purchase.count(),
    PurchaseRecord: await prisma.purchaseRecord.count(),
    Material: await prisma.material.count(),
    MaterialMovement: await prisma.materialMovement.count(),
    Lubricant: await prisma.lubricant.count(),
    LubricantMovement: await prisma.lubricantMovement.count(),
    PcFactoryRecord: await prisma.pcFactoryRecord.count(),
    PcFactoryAvailabilityNote: await prisma.pcFactoryAvailabilityNote.count(),
    Procedure: await prisma.procedure.count(),
    Equipment: await prisma.equipment.count(),
    FunctionalLocation: await prisma.functionalLocation.count(),
    Alert: await prisma.alert.count(),
    ImportHistory: await prisma.importHistory.count(),
    ImportStagingRow: await prisma.importStagingRow.count(),
    AuditLog: await prisma.auditLog.count(),
    PortalSetting: await prisma.portalSetting.count()
  };
  console.table(counts);
  const out = process.argv.find((a) => a.startsWith("--out="))?.slice(6);
  if (out) writeFileSync(out, JSON.stringify(counts, null, 2));
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
