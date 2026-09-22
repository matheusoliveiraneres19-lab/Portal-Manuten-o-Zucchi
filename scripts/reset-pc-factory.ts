/**
 * RESET TOTAL da base PC-Factory: apaga TUDO e reimporta um único arquivo.
 *
 *   npx tsx scripts/reset-pc-factory.ts "imports/pc-factory/<arquivo>.xlsx" --sim-apagar-tudo
 *
 * ESTE É O ÚNICO LUGAR DO PROJETO QUE APAGA A BASE INTEIRA, e ele existe para
 * ser chamado de propósito, na mão, por quem sabe o que está fazendo. As
 * importações pelo portal são INCREMENTAIS desde 2026-09-21: importar setembro
 * não apaga janeiro a agosto (ver docs/pc-factory-importacao-incremental.md).
 *
 * Exige a flag `--sim-apagar-tudo`. Sem ela o script recusa e não toca em nada —
 * a proteção existe porque o comando antigo apagava 71 mil registros sem
 * perguntar. Rode `npm run backup:pc-factory` antes.
 *
 * Não toca em nenhum outro módulo: Ordens de Serviço, Compras, Lubrificantes,
 * Preventivas, Procedimentos, Usuários e as justificativas de disponibilidade
 * (PcFactoryAvailabilityNote) ficam intactos.
 */
import path from "node:path";
import { prisma } from "../src/lib/prisma";
import { importPcFactoryFromExcel } from "../src/services/importacao/pc-factory-import.service";

const CONFIRM_FLAG = "--sim-apagar-tudo";

async function main() {
  const file = path.resolve(
    process.argv.slice(2).find((a) => !a.startsWith("--")) ?? "imports/pc-factory/PCFactory_2026_Unificado.xlsx"
  );

  const before = await prisma.pcFactoryRecord.count();
  console.log(`Registros antes: ${before}`);

  if (!process.argv.includes(CONFIRM_FLAG)) {
    console.error(
      `\nRECUSADO: este script APAGA os ${before.toLocaleString("pt-BR")} registros do PC-Factory.\n\n` +
        `Para importar um mês novo SEM apagar nada, use a importação do portal\n` +
        `(/dashboard/pc-factory → Importar), que é incremental.\n\n` +
        `Se o reset total é mesmo o que você quer, faça o backup e repita com a flag:\n` +
        `  npm run backup:pc-factory\n` +
        `  npx tsx scripts/reset-pc-factory.ts "${process.argv[2] ?? "<arquivo>"}" ${CONFIRM_FLAG}\n`
    );
    process.exitCode = 1;
    return;
  }

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
