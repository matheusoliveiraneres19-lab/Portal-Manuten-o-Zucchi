import path from "node:path";
import { prisma } from "../src/lib/prisma";
import { importPcFactoryFromExcel } from "../src/services/importacao/pc-factory-import.service";

const defaultFilePath = path.resolve(process.cwd(), "imports", "pc-factory", "RELATORIO PC-FACTORY.xlsx");

async function main() {
  const filePath = path.resolve(process.argv[2] ?? defaultFilePath);
  const importedBy = process.argv[3] ?? "script-local";
  const fileName = path.basename(filePath);

  console.log(`Lendo planilha do PC-Factory: ${filePath}`);
  const result = await importPcFactoryFromExcel(filePath, { fileName, importedBy });

  console.log("Importação do PC-Factory concluída:");
  console.log(`- Total de linhas: ${result.totalRows}`);
  console.log(`- Importadas: ${result.importedRows}`);
  console.log(`- Criadas: ${result.createdRows} | Atualizadas: ${result.updatedRows}`);
  console.log(`- Ignoradas (duplicadas/sem recurso/sem status): ${result.ignoredRows}`);
  console.log(`- Com erro: ${result.errorRows}`);
  console.log(
    `- Manutenção: ${result.maintenanceRows} (mecânica ${result.mechanicalMaintenanceRows}, elétrica ${result.electricalMaintenanceRows}, aguardando ${result.waitingMaintenanceRows})`
  );
  console.log(`- Fora do tempo planejado: ${result.excludedFromPlannedTimeRows}`);
  console.log(`- Recursos detectados: ${result.resourcesDetected} | Status detectados: ${result.statusDetected.join(", ")}`);

  if (result.errors.length) {
    console.log("Erros encontrados:");
    for (const error of result.errors.slice(0, 20)) {
      console.log(`- Linha ${error.linha}: ${error.mensagem}`);
    }
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
