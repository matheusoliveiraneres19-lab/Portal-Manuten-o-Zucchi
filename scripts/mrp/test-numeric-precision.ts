/**
 * FASE B — decisão Float × Decimal para as quantidades da Análise MRP.
 *
 * Para cada entrada: parseNum ORIGINAL do HTML → valor gravado → valor lido.
 * Compara com Object.is (exige o MESMO double e distingue -0 de 0).
 *
 *   A. Decimal pelo caminho REAL do Prisma, como o Portal grava: toMrpDecimal(v)
 *      → mrpStockItem.createMany → findMany → fromMrpDecimal (coluna
 *      DECIMAL(65,30)), numa transação REVERTIDA no fim — nada fica gravado.
 *   B. Controle negativo: o MESMO caminho, mas passando o `number` cru ao Prisma
 *      (sem toMrpDecimal). Prova por que o helper é obrigatório.
 *
 * Medição complementar da FASE B (sonda manual, ver docs/analise-mrp-persistencia.md):
 * neste banco extra_float_digits = 0 e uma coluna Float pelo ORM perde o último
 * bit tanto na gravação quanto na leitura — por isso Float foi descartado.
 *
 * Também verifica TODOS os mín/máx da base embutida do HTML.
 *
 *   npx tsx scripts/mrp/test-numeric-precision.ts [--html="..."]
 */
import { prisma } from "../../src/lib/prisma";
import { fromMrpDecimal, toMrpDecimal } from "../../src/services/mrp-persistence.service";
import { loadHtmlReference } from "./html-reference";

const INPUTS: unknown[] = [
  0, 1, -1, 1303, 0.5, 2.75, 1 / 3, 0.1 + 0.2, 1e-7, 123456789.123456, -12.5,
  "1.500", "1.5", "1,5", "1.234,56", "1.234.567", "12,345", "-0", "0,0001", "  250 ", "R$ 1.999,90",
  "abc", "", null, "1e3", "3,14159265358979", "99999999999,99", 4.35 * 100, "5-"
];

const ROLLBACK = "__rollback_precision_test__";
const keyOf = (v: number) => (Object.is(v, -0) ? "-0" : String(v));

/** A: grava cada valor distinto como MrpStockItem.freeQty (Decimal) pelo ORM e lê de volta. */
async function decimalViaPrisma(values: number[], useHelper: boolean): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  try {
    await prisma.$transaction(
      async (tx) => {
        const imp = await tx.mrpStockImport.create({
          data: {
            fileName: "precision-test",
            sheet: "-",
            depositFilter: "",
            depositInfo: "",
            depositColumnFound: false,
            rowsRead: values.length,
            rowsAccepted: values.length,
            duplicateRows: 0,
            otherDepositRows: 0,
            createdBy: "scripts/mrp/test-numeric-precision.ts"
          }
        });
        await tx.mrpStockItem.createMany({
          data: values.map((v, i) => ({ importId: imp.id, code: `V${i}`, freeQty: useHelper ? toMrpDecimal(v) : v, sourceRow: i }))
        });
        const rows = await tx.mrpStockItem.findMany({ where: { importId: imp.id } });
        for (const row of rows) out.set(keyOf(values[row.sourceRow]), fromMrpDecimal(row.freeQty));
        throw new Error(ROLLBACK);
      },
      { timeout: 60_000 }
    );
  } catch (error) {
    if ((error as Error).message !== ROLLBACK) throw error;
  }
  return out;
}

async function main() {
  const ref = loadHtmlReference();
  const values = new Map<string, number>();
  for (const input of INPUTS) values.set(`entrada ${JSON.stringify(input)}`, ref.fn.parseNum(input));
  for (const [rows, label] of [[ref.seedMan, "MAN"], [ref.seedEle, "ELE"]] as const) {
    rows.forEach((r, i) => {
      values.set(`${label}[${i}].min`, ref.fn.parseNum(r[3]));
      values.set(`${label}[${i}].max`, ref.fn.parseNum(r[4]));
    });
  }

  const distinctKeys = Array.from(new Set(Array.from(values.values()).map(keyOf)));
  const distinct = distinctKeys.map((k) => (k === "-0" ? -0 : Number(k)));
  const decimals = await decimalViaPrisma(distinct, true);
  const raws = await decimalViaPrisma(distinct, false);
  const [efd] = await prisma.$queryRaw<{ v: string }[]>`SELECT current_setting('extra_float_digits') AS v`;
  console.log(`extra_float_digits do servidor: ${efd.v}`);

  const outcomes = Array.from(values.entries()).map(([input, html]) => {
    const decimal = decimals.get(keyOf(html))!;
    const raw = raws.get(keyOf(html))!;
    return {
      input,
      html: keyOf(html),
      decimal: keyOf(decimal),
      numberCru: keyOf(raw),
      decimalOk: Object.is(decimal, html),
      numberCruOk: Object.is(raw, html)
    };
  });

  console.table(outcomes.filter((o) => o.input.startsWith("entrada") || !o.decimalOk || !o.numberCruOk));
  const decimalFail = outcomes.filter((o) => !o.decimalOk);
  const rawFail = outcomes.filter((o) => !o.numberCruOk);
  console.log(`\nValores testados: ${outcomes.length} (${distinct.length} distintos)`);
  console.log(`Decimal via toMrpDecimal (adotado): ${decimalFail.length} divergência(s) ${decimalFail.map((o) => o.input).join(", ")}`);
  console.log(`Decimal com number cru (controle):  ${rawFail.length} divergência(s) ${rawFail.map((o) => o.input).join(", ")}`);

  // Limitação conhecida e documentada: -0 vira 0 no banco (qualquer tipo).
  const onlyNegativeZero = decimalFail.every((o) => o.html === "-0");
  console.log(
    onlyNegativeZero
      ? "\nResultado: Decimal exato para todos os valores; única diferença = -0 → 0 (documentada)."
      : "\nResultado: DIVERGÊNCIA INESPERADA no Decimal."
  );
  if (!onlyNegativeZero) process.exitCode = 1;
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
