/**
 * Limpeza OPCIONAL e MANUAL dos registros de teste sem equipamento
 * (rotulados na UI como "Equipamento não informado").
 *
 * IMPORTANTE (TAREFA 8):
 *  - Este script NÃO roda automaticamente e NÃO é importado por nenhuma rota.
 *  - Por padrão faz DRY-RUN: apenas conta e mostra uma amostra, sem apagar nada.
 *  - Para APAGAR fisicamente, execute explicitamente com a flag --confirm.
 *
 * As análises do portal JÁ ignoram esses registros via
 * `excludeInvalidTestEquipmentWhere()` — apagar do banco é opcional e só deve ser
 * feito após conferência. Nenhum dado é removido sem --confirm.
 *
 * Uso:
 *   npx tsx scripts/cleanup-invalid-test-equipment.ts            # dry-run (não apaga)
 *   npx tsx scripts/cleanup-invalid-test-equipment.ts --confirm  # apaga de verdade
 */
import { prisma } from "@/lib/prisma";
import { matchInvalidTestEquipmentWhere } from "@/utils/service-order-classification";

async function main() {
  const confirm = process.argv.includes("--confirm");
  const where = matchInvalidTestEquipmentWhere();

  const total = await prisma.serviceOrder.count();
  const invalid = await prisma.serviceOrder.count({ where });

  console.log(`Total de Ordens de Serviço no banco: ${total}`);
  console.log(`Registros de teste sem equipamento (Equipamento não informado): ${invalid}`);

  const sample = await prisma.serviceOrder.findMany({
    where,
    select: { osNumber: true, title: true, openedAt: true, source: true },
    orderBy: { osNumber: "asc" },
    take: 10
  });
  console.log("\nAmostra (até 10):");
  for (const row of sample) {
    console.log(`  ${row.osNumber} | ${row.title} | ${row.openedAt?.toISOString().slice(0, 10) ?? "-"} | ${row.source ?? "-"}`);
  }

  if (!confirm) {
    console.log("\nDRY-RUN: nenhum registro foi apagado. Rode com --confirm para apagar fisicamente.");
    return;
  }

  const result = await prisma.serviceOrder.deleteMany({ where });
  console.log(`\n--confirm informado: ${result.count} registro(s) apagado(s) fisicamente.`);
}

main()
  .catch((error) => {
    console.error("Falha na limpeza de registros de teste sem equipamento.", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
