/**
 * BACKFILL da coluna `PcFactoryRecord.fingerprint`.
 *
 *   npx tsx --env-file=.env scripts/backfill-pcfactory-fingerprint.ts --dry-run
 *   npx tsx --env-file=.env scripts/backfill-pcfactory-fingerprint.ts
 *
 * POR QUE ISTO É OBRIGATÓRIO
 * --------------------------
 * A importação incremental deduplica pelo índice único `fingerprint`. Os
 * registros gravados ANTES desta coluna têm `fingerprint = NULL`, e no
 * PostgreSQL um índice UNIQUE aceita vários NULLs — ou seja, sem o backfill a
 * primeira reimportação de um mês já carregado inseriria tudo de novo, em
 * duplicidade. Com o backfill, o banco reconhece os eventos e pula.
 *
 * COMO A CHAVE É RECALCULADA
 * --------------------------
 * Pela MESMA função da importação (`buildPcFactoryRecordFingerprint`), lendo as
 * COLUNAS JÁ PERSISTIDAS — nenhuma planilha é relida. Registros idênticos entre
 * si (mesma máquina, status, início, fim, duração, ordem e operação) recebem
 * ordinais 0,1,2… numa ordem estável por `id`: como são indistinguíveis por
 * definição, o CONJUNTO de chaves é o mesmo que a importação produziria.
 *
 * SEGURANÇA
 * ---------
 * Só escreve na coluna `fingerprint`. Nenhum registro é apagado, nenhum outro
 * campo é tocado, nenhuma outra tabela é lida para escrita. `--dry-run` não
 * grava nada e ainda assim reporta colisões.
 */
import { Prisma } from "@prisma/client";
import { prisma } from "../src/lib/prisma";
import { buildPcFactoryRecordFingerprint } from "../src/utils/pc-factory-fingerprint";

const READ_PAGE = 2000;
const WRITE_CHUNK = 500;

const DRY_RUN = process.argv.includes("--dry-run");
/** Por padrão só preenche o que está NULL; --all recalcula a tabela inteira. */
const ONLY_NULL = !process.argv.includes("--all");

type Row = {
  id: string;
  resourceName: string;
  resourceCode: string | null;
  statusCode: string | null;
  statusRaw: string | null;
  startDateTime: Date | null;
  endDateTime: Date | null;
  durationMinutes: number;
  orderNumber: string | null;
  operationCode: string | null;
};

async function main() {
  const total = await prisma.pcFactoryRecord.count();
  const pending = await prisma.pcFactoryRecord.count({ where: { fingerprint: null } });

  console.log("\nBACKFILL DE FINGERPRINT — PcFactoryRecord\n");
  console.log(`  Registros na base: ${total.toLocaleString("pt-BR")}`);
  console.log(`  Sem fingerprint:   ${pending.toLocaleString("pt-BR")}`);
  console.log(`  Modo: ${DRY_RUN ? "DRY-RUN (não grava)" : "GRAVAÇÃO"} · ${ONLY_NULL ? "só os NULL" : "TODOS"}\n`);

  if (ONLY_NULL && pending === 0) {
    console.log("  Nada a fazer: todos os registros já têm fingerprint.\n");
    await prisma.$disconnect();
    return;
  }

  /**
   * Ordinal por chave-base. Precisa varrer a tabela INTEIRA (não só os NULL)
   * para que um registro novo não receba um ordinal já usado por um antigo.
   */
  const occurrenceByBase = new Map<string, number>();
  const updates: Array<{ id: string; fingerprint: string }> = [];

  let cursor: string | null = null;
  let scanned = 0;

  for (;;) {
    const page: Row[] = await prisma.pcFactoryRecord.findMany({
      orderBy: { id: "asc" },
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      take: READ_PAGE,
      select: {
        id: true,
        resourceName: true,
        resourceCode: true,
        statusCode: true,
        statusRaw: true,
        startDateTime: true,
        endDateTime: true,
        durationMinutes: true,
        orderNumber: true,
        operationCode: true
      }
    });
    if (page.length === 0) break;
    cursor = page[page.length - 1].id;
    scanned += page.length;

    for (const row of page) {
      const base = buildPcFactoryRecordFingerprint({ ...row, occurrence: 0 });
      const used = occurrenceByBase.get(base) ?? 0;
      occurrenceByBase.set(base, used + 1);
      const fingerprint = used === 0 ? base : buildPcFactoryRecordFingerprint({ ...row, occurrence: used });
      updates.push({ id: row.id, fingerprint });
    }

    process.stdout.write(`\r  lidos: ${scanned.toLocaleString("pt-BR")}/${total.toLocaleString("pt-BR")}`);
  }

  // Diagnóstico: quantas tuplas de negócio se repetem (e por isso precisaram de
  // ordinal). Alto demais indicaria chave fraca — não é o caso aqui, mas o
  // número precisa ficar visível.
  const repeated = Array.from(occurrenceByBase.values()).filter((n) => n > 1).length;
  const distinct = occurrenceByBase.size;

  console.log(`\n\n  Tuplas de negócio distintas: ${distinct.toLocaleString("pt-BR")}`);
  console.log(`  Tuplas com repetição:        ${repeated.toLocaleString("pt-BR")}`);
  console.log(`  Fingerprints geradas:        ${updates.length.toLocaleString("pt-BR")}`);

  const unique = new Set(updates.map((u) => u.fingerprint));
  if (unique.size !== updates.length) {
    console.error(`\n  ✗ COLISÃO: ${updates.length - unique.size} fingerprint(s) repetida(s). Nada foi gravado.`);
    await prisma.$disconnect();
    process.exitCode = 1;
    return;
  }
  console.log("  ✓ Todas as fingerprints são únicas.\n");

  if (DRY_RUN) {
    console.log("  DRY-RUN: nada gravado.\n");
    await prisma.$disconnect();
    return;
  }

  // UPDATE ... FROM (VALUES ...) por lote: um round-trip a cada 500 registros,
  // em vez de 71 mil updates individuais.
  let written = 0;
  for (let i = 0; i < updates.length; i += WRITE_CHUNK) {
    const slice = updates.slice(i, i + WRITE_CHUNK);
    const values = Prisma.join(
      slice.map((u) => Prisma.sql`(${u.id}, ${u.fingerprint})`)
    );
    await prisma.$executeRaw`
      update "PcFactoryRecord" as target
         set "fingerprint" = source.fingerprint
        from (values ${values}) as source(id, fingerprint)
       where target.id = source.id
    `;
    written += slice.length;
    process.stdout.write(`\r  gravados: ${written.toLocaleString("pt-BR")}/${updates.length.toLocaleString("pt-BR")}`);
  }

  const remaining = await prisma.pcFactoryRecord.count({ where: { fingerprint: null } });
  const after = await prisma.pcFactoryRecord.count();

  console.log(`\n\n  Registros sem fingerprint agora: ${remaining}`);
  console.log(`  Total de registros: ${after.toLocaleString("pt-BR")} (antes: ${total.toLocaleString("pt-BR")})`);
  console.log(after === total ? "  ✓ Nenhum registro perdido.\n" : "  ✗ A contagem MUDOU — investigue.\n");

  await prisma.$disconnect();
}

main().catch(async (error) => {
  console.error(error);
  await prisma.$disconnect().catch(() => undefined);
  process.exit(1);
});
