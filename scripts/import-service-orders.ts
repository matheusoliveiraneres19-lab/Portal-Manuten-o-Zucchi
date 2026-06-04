import path from "node:path";
import { prisma } from "../src/lib/prisma";
import { importServiceOrdersFromNormalizedRows } from "../src/services/importacao/service-orders-import.service";
import { readNormalizedExcelRows } from "../src/utils/excel-normalizer";
import type { LinhaOrdemServicoNormalizada } from "../src/types/importacao";

const defaultFilePath = path.resolve(
  process.cwd(),
  "imports",
  "service-orders",
  "Ordens_manutencao_normalizadas_para_portal.xlsx"
);

async function main() {
  const filePath = path.resolve(process.argv[2] ?? defaultFilePath);
  const importedBy = process.argv[3] ?? "script-local";
  const fileName = path.basename(filePath);

  console.log(`Lendo planilha: ${filePath}`);
  const rows = readNormalizedExcelRows(filePath) as LinhaOrdemServicoNormalizada[];

  const result = await importServiceOrdersFromNormalizedRows(rows, {
    fileName,
    importedBy
  });

  console.log("Importação de Ordens de Serviço concluída:");
  console.log(`- Total de linhas: ${result.totalRows}`);
  console.log(`- Criadas: ${result.createdRows}`);
  console.log(`- Atualizadas: ${result.updatedRows}`);
  console.log(`- Com erro: ${result.errorRows}`);

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
