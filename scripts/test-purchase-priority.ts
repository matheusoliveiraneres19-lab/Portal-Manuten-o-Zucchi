/**
 * Testes das DUAS regras novas do módulo de Compras (não tocam o banco):
 *
 *  1. `normalizePurchasePriority` — coluna "Nº acompanhamento" → N1/N2/N3/N4.
 *  2. `parseBrazilianCurrency`    — coluna "Valor líquido" → número decimal.
 *
 * Uso: npm run test:purchases-priority
 */
import { parseBrazilianCurrency } from "@/utils/importacao";
import {
  NO_PURCHASE_PRIORITY,
  normalizePurchasePriority,
  purchasePriorityForDatabase,
  type PurchasePriorityKey
} from "@/utils/purchases-normalizer";

let failures = 0;
let total = 0;

function check(name: string, actual: unknown, expected: unknown): void {
  total += 1;
  const ok = Object.is(actual, expected);
  if (!ok) {
    failures += 1;
    console.log(`❌ ${name}\n     recebido: ${format(actual)} | esperado: ${format(expected)}`);
  } else {
    console.log(`✅ ${name}  →  ${format(actual)}`);
  }
}

function format(value: unknown): string {
  return typeof value === "string" ? `"${value}"` : String(value);
}

/* ------------------------------------------------------------------ */
/* 1. Prioridade (Nº acompanhamento)                                  */
/* ------------------------------------------------------------------ */

console.log("\n== Prioridade a partir de \"Nº acompanhamento\" ==");

const priorityCases: Array<[unknown, PurchasePriorityKey]> = [
  // Forma canônica.
  ["N1", "N1"],
  ["N2", "N2"],
  ["N3", "N3"],
  ["N4", "N4"],
  // Zero à esquerda — o caso que aparece na planilha real.
  ["N01", "N1"],
  ["N02", "N2"],
  ["N03", "N3"],
  ["N04", "N4"],
  // Só o número.
  [1, "N1"],
  ["2", "N2"],
  ["3", "N3"],
  ["04", "N4"],
  // Caixa, espaços, acento e símbolos (º, °, ., -, /).
  ["n3", "N3"],
  ["  n 03  ", "N3"],
  ["N° 2", "N2"],
  ["Nº 4", "N4"],
  ["n-1", "N1"],
  ["N.2", "N2"],
  // Texto por extenso.
  ["Prioridade 1", "N1"],
  ["PRIORIDADE 2", "N2"],
  ["prioridade 3", "N3"],
  ["Prioridade 4", "N4"],
  ["Nível 2", "N2"],
  ["nivel 3", "N3"],
  // Sem prioridade: vazio, placeholder, fora da faixa e texto livre.
  ["", NO_PURCHASE_PRIORITY],
  ["   ", NO_PURCHASE_PRIORITY],
  [null, NO_PURCHASE_PRIORITY],
  [undefined, NO_PURCHASE_PRIORITY],
  ["-", NO_PURCHASE_PRIORITY],
  ["N/A", NO_PURCHASE_PRIORITY],
  ["N0", NO_PURCHASE_PRIORITY],
  ["N5", NO_PURCHASE_PRIORITY],
  ["N10", NO_PURCHASE_PRIORITY],
  [0, NO_PURCHASE_PRIORITY],
  ["urgente", NO_PURCHASE_PRIORITY]
];

for (const [input, expected] of priorityCases) {
  check(`normalizePurchasePriority(${format(input)})`, normalizePurchasePriority(input), expected);
}

// O que vai para o banco: prioridade reconhecida ou NULL (nunca a sentinela).
check('purchasePriorityForDatabase("N03") grava "N3"', purchasePriorityForDatabase("N03"), "N3");
check("purchasePriorityForDatabase(vazio) grava NULL", purchasePriorityForDatabase(""), null);
check("purchasePriorityForDatabase(\"N9\") grava NULL", purchasePriorityForDatabase("N9"), null);

/* ------------------------------------------------------------------ */
/* 2. Valor líquido (moeda brasileira)                                */
/* ------------------------------------------------------------------ */

console.log("\n== Valor líquido (parseBrazilianCurrency) ==");

const currencyCases: Array<[unknown, number | null]> = [
  // Os exemplos exigidos pela especificação.
  ["2.200,00", 2200],
  ["1,00", 1],
  ["3.533,00", 3533],
  ["2455149,41", 2455149.41],
  ["R$ 2.455.149,41", 2455149.41],
  // Variações de prefixo/espaço.
  ["R$2.200,00", 2200],
  [" r$ 1.000,50 ", 1000.5],
  // Sem casas decimais: "." é separador de MILHAR.
  ["3.533", 3533],
  ["1.234.567", 1234567],
  // Ponto decimal (planilha em locale US) — não pode virar 245514941.
  ["2455149.41", 2455149.41],
  ["0.5", 0.5],
  // Números nativos do Excel passam intactos.
  [2200, 2200],
  [2455149.41, 2455149.41],
  [0, 0],
  // Negativos: prefixo, sufixo (SAP) e parênteses.
  ["-1.500,00", -1500],
  ["1.500,00-", -1500],
  ["(1.500,00)", -1500],
  // Vazio / inválido → null (nunca NaN, nunca Infinity).
  ["", null],
  ["   ", null],
  [null, null],
  [undefined, null],
  ["-", null],
  ["N/A", null],
  ["R$", null],
  ["abc", null],
  [Number.NaN, null],
  [Number.POSITIVE_INFINITY, null],
  [Number.NEGATIVE_INFINITY, null]
];

for (const [input, expected] of currencyCases) {
  check(`parseBrazilianCurrency(${format(input)})`, parseBrazilianCurrency(input), expected);
}

// Garantia explícita da TAREFA 16: nenhum resultado é NaN nem Infinity.
const parsedAll = currencyCases.map(([input]) => parseBrazilianCurrency(input));
check(
  "nenhum resultado é NaN",
  parsedAll.some((value) => typeof value === "number" && Number.isNaN(value)),
  false
);
check(
  "nenhum resultado é Infinity",
  parsedAll.some((value) => typeof value === "number" && !Number.isFinite(value)),
  false
);

// A soma de uma "coluna Valor líquido" continua finita e exata em 2 casas.
const column = ["2.200,00", "1,00", "3.533,00", "R$ 2.455.149,41", "", "N/A"];
const sum = column.reduce((acc, cell) => acc + (parseBrazilianCurrency(cell) ?? 0), 0);
check("soma da coluna Valor líquido", Math.round(sum * 100) / 100, 2460883.41);

console.log(
  `\n${failures === 0 ? "TODOS OS TESTES PASSARAM" : `${failures} TESTE(S) FALHARAM`} — ${total - failures}/${total}`
);
process.exit(failures === 0 ? 0 : 1);
