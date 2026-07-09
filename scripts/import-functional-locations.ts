import path from "node:path";
import { prisma } from "../src/lib/prisma";
import { importFunctionalLocationsFromExcel } from "../src/services/importacao/functional-locations-import.service";

/**
 * Importa a hierarquia de LOCAIS DE INSTALAÇÃO ("Local de Instalação.xlsx") para
 * o model FunctionalLocation. Camada OPCIONAL de enriquecimento da aba
 * Equipamentos Críticos (a resolução da raiz funciona sem ela).
 *
 * Uso:
 *   npm run import:functional-locations -- "caminho/para/Local de Instalação.xlsx"
 *
 * A planilha NÃO deve ser commitada. Coloque-a fora do versionamento (ex.:
 * imports/functional-locations/) e passe o caminho como argumento.
 */
const defaultFilePath = path.resolve(
  process.cwd(),
  "imports",
  "functional-locations",
  "Local de Instalação.xlsx"
);

async function main() {
  const filePath = path.resolve(process.argv[2] ?? defaultFilePath);
  const importedBy = process.argv[3] ?? "script-local";
  const fileName = path.basename(filePath);

  console.log(`Lendo planilha de locais de instalação: ${filePath}`);
  const result = await importFunctionalLocationsFromExcel(filePath, { fileName, importedBy });

  console.log("Importação de Locais de Instalação concluída:");
  console.log(`- Total de TAGs: ${result.totalRows}`);
  console.log(`- Criados: ${result.createdRows}`);
  console.log(`- Atualizados: ${result.updatedRows}`);
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
