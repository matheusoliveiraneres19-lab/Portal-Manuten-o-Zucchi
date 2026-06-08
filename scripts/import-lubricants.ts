import path from "node:path";
import { prisma } from "../src/lib/prisma";
import { importLubricantsFromExcel } from "../src/services/importacao/lubricants-import.service";

const defaultFilePath = path.resolve(
  process.cwd(),
  "imports",
  "lubricants",
  "BASE DE DADOS LUBRIFICACAO.xlsx"
);

async function main() {
  const filePath = path.resolve(process.argv[2] ?? defaultFilePath);
  const importedBy = process.argv[3] ?? "script-local";
  const fileName = path.basename(filePath);

  console.log(`Lendo planilha de lubrificação: ${filePath}`);
  const result = await importLubricantsFromExcel(filePath, { fileName, importedBy });

  console.log("Importação de lubrificantes concluída:");
  console.log(`- Total de linhas: ${result.totalRows}`);
  console.log(`- Importadas: ${result.importedRows}`);
  console.log(`- Lubrificantes criados: ${result.createdLubricants}`);
  console.log(`- Movimentações criadas: ${result.createdMovements}`);
  console.log(`- Ignoradas (duplicadas): ${result.ignoredRows}`);
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
