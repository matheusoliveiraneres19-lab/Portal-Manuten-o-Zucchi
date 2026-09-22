/**
 * BACKUP da base PC-Factory + contagem por mês.
 *
 *   npx tsx --env-file=.env scripts/backup-pc-factory.ts
 *   npx tsx --env-file=.env scripts/backup-pc-factory.ts --out=".backups/pcfactory.ndjson"
 *   npx tsx --env-file=.env scripts/backup-pc-factory.ts --counts-only
 *
 * Só leitura. Grava NDJSON (uma linha por registro) para poder restaurar em
 * caso de acidente, e imprime a contagem por mês de `startDateTime` — que é o
 * retrato "ANTES" exigido pela auditoria de importação incremental.
 *
 * O destino padrão fica em `.backups/`, que está no .gitignore: um dump da base
 * NUNCA vai para o Git.
 */
import fs from "node:fs";
import path from "node:path";
import { prisma } from "../src/lib/prisma";

const PAGE = 2000;

function arg(name: string): string | undefined {
  const prefix = `--${name}=`;
  const found = process.argv.slice(2).find((v) => v.startsWith(prefix));
  return found ? found.slice(prefix.length) : undefined;
}

/** Contagem por mês civil de startDateTime (+ os sem data). */
export async function countByMonth(): Promise<{ months: Array<{ month: string; count: number }>; total: number; noDate: number }> {
  const rows = await prisma.$queryRawUnsafe<Array<{ month: string | null; count: bigint }>>(
    `select to_char("startDateTime", 'YYYY-MM') as month, count(*)::bigint as count
       from "PcFactoryRecord"
      group by 1
      order by 1`
  );
  const months = rows.filter((r) => r.month).map((r) => ({ month: r.month as string, count: Number(r.count) }));
  const noDate = rows.filter((r) => !r.month).reduce((sum, r) => sum + Number(r.count), 0);
  return { months, total: months.reduce((s, m) => s + m.count, 0) + noDate, noDate };
}

async function main() {
  const { months, total, noDate } = await countByMonth();

  console.log("\nCONTAGEM POR MÊS (startDateTime)\n");
  for (const m of months) console.log(`  ${m.month}: ${m.count.toLocaleString("pt-BR")}`);
  if (noDate > 0) console.log(`  (sem data): ${noDate.toLocaleString("pt-BR")}`);
  console.log(`  ----------------\n  TOTAL: ${total.toLocaleString("pt-BR")}\n`);

  if (process.argv.includes("--counts-only")) {
    await prisma.$disconnect();
    return;
  }

  const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const out = path.resolve(arg("out") ?? `.backups/pcfactory-${stamp}.ndjson`);
  fs.mkdirSync(path.dirname(out), { recursive: true });

  const stream = fs.createWriteStream(out, { encoding: "utf8" });
  let cursor: string | null = null;
  let written = 0;

  for (;;) {
    const page: Array<Record<string, unknown>> = await prisma.pcFactoryRecord.findMany({
      orderBy: { id: "asc" },
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      take: PAGE
    });
    if (page.length === 0) break;
    for (const row of page) stream.write(`${JSON.stringify(row)}\n`);
    written += page.length;
    cursor = page[page.length - 1].id as string;
    process.stdout.write(`\r  gravados: ${written.toLocaleString("pt-BR")}`);
  }

  await new Promise<void>((resolve) => stream.end(resolve));
  const sizeMb = (fs.statSync(out).size / 1024 / 1024).toFixed(1);
  console.log(`\n\n  Backup: ${out}  (${written.toLocaleString("pt-BR")} registros, ${sizeMb} MB)`);
  console.log("  Fora do Git (.backups está no .gitignore).\n");

  await prisma.$disconnect();
}

if (require.main === module) {
  main().catch(async (e) => {
    console.error(e);
    await prisma.$disconnect().catch(() => undefined);
    process.exit(1);
  });
}
