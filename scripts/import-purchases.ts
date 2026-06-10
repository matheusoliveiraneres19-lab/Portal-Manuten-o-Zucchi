import path from "node:path";
import { prisma } from "../src/lib/prisma";
import { importPurchasesFromExcel } from "../src/services/importacao/purchases-import.service";

const defaultFilePath = path.resolve(process.cwd(), "imports", "purchases", "BASE DE DADOS PORTAL COMPRAS.xlsx");

async function main() {
  const filePath = path.resolve(process.argv[2] ?? defaultFilePath);
  const importedBy = process.argv[3] ?? "script-local";
  const fileName = path.basename(filePath);

  console.log(`Lendo planilha de compras: ${filePath}`);
  const result = await importPurchasesFromExcel(filePath, { fileName, importedBy });

  console.log("Importação de compras concluída:");
  console.log(`- Total de linhas: ${result.totalRows}`);
  console.log(`- Importadas: ${result.importedRows} (criadas ${result.createdRows} / atualizadas ${result.updatedRows})`);
  console.log(`- Ignoradas (bloqueadas/duplicadas): ${result.ignoredRows}`);
  console.log(`- Com erro: ${result.errorRows}`);
  console.log(`- Requisições sem pedido: ${result.totalWithoutPurchaseOrder}`);
  console.log(`- Requisições com pedido: ${result.totalWithPurchaseOrder}`);
  console.log(`- Com MIGO: ${result.totalMigo} | Com MIRO: ${result.totalMiro}`);
  console.log(`- Atrasados em aberto: ${result.totalLateOpen} | Recebidos com atraso: ${result.totalLateReceived}`);
  console.log(`- Regularizações Y04: ${result.totalRegularizations} | Compras normais Y01: ${result.totalNormalPurchases}`);
  console.log(`- Serviços: ${result.totalServices} | Materiais: ${result.totalMaterials}`);
  console.log(`- Valor total: ${result.totalValue.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}`);

  if (result.periodDetected?.start) {
    console.log(`- Período detectado: ${result.periodDetected.start} → ${result.periodDetected.end}`);
    console.log(`- Meses encontrados (${result.periodDetected.months.length}): ${result.periodDetected.months.join(", ")}`);
  }
  if (result.warnings?.length) {
    console.log("Avisos:");
    for (const warning of result.warnings) {
      console.log(`- ${warning}`);
    }
  }

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
