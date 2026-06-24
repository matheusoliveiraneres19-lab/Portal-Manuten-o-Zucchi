/**
 * Limpa TODOS os registros de PcFactoryRecord e reimporta um único arquivo.
 * Uso: npx tsx scripts/reset-pc-factory.ts "imports/pc-factory/<arquivo>.xlsx"
 * Destrutivo: apaga toda a tabela PcFactoryRecord (não toca em outros módulos).
 */
import path from "node:path";
import { prisma } from "../src/lib/prisma";
import { importPcFactoryFromExcel } from "../src/services/importacao/pc-factory-import.service";

async function main() {
  const file = path.resolve(process.argv[2] ?? "imports/pc-factory/PCFactory_2026_Unificado.xlsx");

  const before = await prisma.pcFactoryRecord.count();
  console.log(`Registros antes: ${before}`);

  const deleted = await prisma.pcFactoryRecord.deleteMany({});
  console.log(`Apagados: ${deleted.count}`);

  console.log(`Reimportando: ${file}`);
  const result = await importPcFactoryFromExcel(file, { fileName: path.basename(file), importedBy: "reset-andrey" });
  console.log(`Importadas: ${result.importedRows} (criadas ${result.createdRows}, atualizadas ${result.updatedRows}, ignoradas ${result.ignoredRows}, erros ${result.errorRows})`);
  console.log(`Manutenção: ${result.maintenanceRows} eventos | Recursos: ${result.resourcesDetected}`);

  const after = await prisma.pcFactoryRecord.count();
  console.log(`Registros depois: ${after}`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(async () => { await prisma.$disconnect(); });
