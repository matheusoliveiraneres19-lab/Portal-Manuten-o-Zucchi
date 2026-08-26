/**
 * Testes de LEITURA da planilha de compras (TAREFA 16) — não tocam o banco.
 *
 * Monta planilhas .xlsx em memória com as variações de cabeçalho de
 * "Nível requisição" (fonte da PRIORIDADE) e "Total líquido" (fonte do VALOR
 * COMPRADO), passa por `readPurchaseRows` (o mesmo caminho da importação real)
 * e confere:
 *
 *   1. a coluna é reconhecida em cada variação de cabeçalho;
 *   2. "N2", "N03" e "N04" viram N2, N3 e N4;
 *   3. os valores brasileiros ("2.200,00", "R$ 2.455.149,41") viram números;
 *   4. a soma da coluna "Total líquido" bate com a da planilha;
 *   5. nenhum resultado é NaN nem Infinity.
 *
 * Uso: npm run test:purchases-columns
 */
import * as XLSX from "xlsx";
import { readPurchaseRows } from "@/services/importacao/purchases-import.service";
import {
  parsePurchaseNetValue,
  purchasePriorityForDatabase,
  normalizeTrackingNumber
} from "@/utils/purchases-normalizer";

let failures = 0;
let total = 0;

function check(name: string, actual: unknown, expected: unknown): void {
  total += 1;
  if (!Object.is(actual, expected)) {
    failures += 1;
    console.log(`❌ ${name}\n     recebido: ${fmt(actual)} | esperado: ${fmt(expected)}`);
  } else {
    console.log(`✅ ${name}  →  ${fmt(actual)}`);
  }
}

function fmt(value: unknown): string {
  return typeof value === "string" ? `"${value}"` : String(value);
}

/** Gera um .xlsx em memória com a aba "Data" a partir de objetos linha. */
function sheetBuffer(rows: Array<Record<string, unknown>>): Buffer {
  const worksheet = XLSX.utils.json_to_sheet(rows);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "Data");
  return XLSX.write(workbook, { type: "buffer", bookType: "xlsx" }) as Buffer;
}

/* ------------------------------------------------------------------ */
/* 1. Cabeçalhos da PRIORIDADE (Nível requisição + alternativos)      */
/* ------------------------------------------------------------------ */

console.log('\n== Cabeçalho de "Nível requisição" (fonte da prioridade) ==');

const LEVEL_HEADERS = ["Nível requisição", "Nivel requisicao", "Nível da requisição", "Nivel req", "Nível"];

for (const header of LEVEL_HEADERS) {
  const [row] = readPurchaseRows(
    sheetBuffer([{ Requisição: "10000001", Material: "MAT-1", "Texto breve material": "Rolamento", [header]: "N03" }])
  );
  check(`cabeçalho "${header}" → requisitionLevel`, normalizeTrackingNumber(row?.requisitionLevel), "N03");
  check(`cabeçalho "${header}" → prioridade`, purchasePriorityForDatabase(row?.requisitionLevel), "N3");
}

console.log('\n== Cabeçalhos alternativos de "Nº acompanhamento" ==');

const TRACKING_HEADERS = [
  "Nº acompanhamento",
  "N acompanhamento",
  "Nº Acompanhamento",
  "No acompanhamento",
  "Número acompanhamento",
  "Numero acompanhamento",
  "N° acompanhamento",
  "Nr acompanhamento",
  "Acompanhamento",
  "Prioridade"
];

for (const header of TRACKING_HEADERS) {
  const [row] = readPurchaseRows(
    sheetBuffer([{ Requisição: "10000001", Material: "MAT-1", "Texto breve material": "Rolamento", [header]: "N03" }])
  );
  check(`cabeçalho "${header}" → trackingNumber`, normalizeTrackingNumber(row?.trackingNumber), "N03");
  check(`cabeçalho "${header}" → prioridade`, purchasePriorityForDatabase(row?.trackingNumber), "N3");
}

/* ------------------------------------------------------------------ */
/* 2. Cabeçalhos do VALOR COMPRADO (Total líquido)                    */
/* ------------------------------------------------------------------ */

console.log('\n== Cabeçalhos de "Total líquido" reconhecidos ==');

const NET_VALUE_HEADERS = [
  "Total líquido",
  "Total liquido",
  "Total liq",
  "Valor total líquido",
  "Valor líquido",
  "Valor liquido",
  "Valor Líq.",
  "Vlr líquido",
  "Vlr.liquido",
  "Net value"
];

for (const header of NET_VALUE_HEADERS) {
  const [row] = readPurchaseRows(
    sheetBuffer([{ Requisição: "10000001", Material: "MAT-1", "Texto breve material": "Rolamento", [header]: "2.200,00" }])
  );
  check(`cabeçalho "${header}" → netTotal`, parsePurchaseNetValue(row?.netTotal), 2200);
}

/* ------------------------------------------------------------------ */
/* 3. Planilha completa: prioridades + valores                        */
/* ------------------------------------------------------------------ */

console.log("\n== Planilha completa (prioridades + valor líquido) ==");

const SHEET = [
  { Requisição: "10000001", Material: "MAT-1", "Texto breve material": "Rolamento 6205", "Nível requisição": "N1", "Total líquido": "2.200,00" },
  { Requisição: "10000002", Material: "MAT-2", "Texto breve material": "Mangueira 1/2", "Nível requisição": "N2", "Total líquido": "1,00" },
  { Requisição: "10000003", Material: "MAT-3", "Texto breve material": "Correia A-45", "Nível requisição": "N03", "Total líquido": "3.533,00" },
  { Requisição: "10000004", Material: "MAT-4", "Texto breve material": "Óleo hidráulico", "Nível requisição": "N04", "Total líquido": "R$ 2.455.149,41" },
  { Requisição: "10000005", Material: "MAT-5", "Texto breve material": "Parafuso M8", "Nível requisição": "", "Total líquido": "" },
  { Requisição: "10000006", Material: "MAT-6", "Texto breve material": "Luva de raspa", "Nível requisição": "N9", "Total líquido": "N/A" }
];

const rows = readPurchaseRows(sheetBuffer(SHEET));
check("linhas lidas", rows.length, SHEET.length);

const priorities = rows.map((row) => purchasePriorityForDatabase(row.requisitionLevel));
check("linha 1 (N1)", priorities[0], "N1");
check("linha 2 (N2)", priorities[1], "N2");
check("linha 3 (N03 → N3)", priorities[2], "N3");
check("linha 4 (N04 → N4)", priorities[3], "N4");
check("linha 5 (vazio → NULL)", priorities[4], null);
check("linha 6 (N9 fora da faixa → NULL)", priorities[5], null);

// O CRU é preservado — é o que a coluna secundária da tabela exibe.
check("Nível requisição cru da linha 3", normalizeTrackingNumber(rows[2].requisitionLevel), "N03");
check("Nível requisição cru da linha 4", normalizeTrackingNumber(rows[3].requisitionLevel), "N04");

const netValues = rows.map((row) => parsePurchaseNetValue(row.netTotal));
check("valor da linha 1", netValues[0], 2200);
check("valor da linha 2", netValues[1], 1);
check("valor da linha 3", netValues[2], 3533);
check("valor da linha 4 (R$ 2.455.149,41)", netValues[3], 2455149.41);
check("valor da linha 5 (vazio → null)", netValues[4], null);
check("valor da linha 6 (N/A → null)", netValues[5], null);

const sum = netValues.reduce<number>((acc, value) => acc + (value ?? 0), 0);
check("soma da coluna Total líquido", Math.round(sum * 100) / 100, 2460883.41);

check(
  "nenhum valor é NaN",
  netValues.some((value) => typeof value === "number" && Number.isNaN(value)),
  false
);
check(
  "nenhum valor é Infinity",
  netValues.some((value) => typeof value === "number" && !Number.isFinite(value)),
  false
);

/* ------------------------------------------------------------------ */
/* 4. A PRIORIDADE não invade as colunas N1..N4                       */
/* ------------------------------------------------------------------ */

console.log("\n== Prioridade × classificação N1..N4 (colunas independentes) ==");

const [mixed] = readPurchaseRows(
  sheetBuffer([
    {
      Requisição: "10000007",
      Material: "MAT-7",
      "Texto breve material": "Contator 3P",
      "Nível requisição": "N1",
      N1: "Material Elétrico",
      N2: "Comandos",
      "Total líquido": "150,00"
    }
  ])
);
check("prioridade lida do Nível requisição", purchasePriorityForDatabase(mixed.requisitionLevel), "N1");
check("classificationN1 segue vindo da coluna N1", String(mixed.classificationN1), "Material Elétrico");
check("classificationN2 segue vindo da coluna N2", String(mixed.classificationN2), "Comandos");

// Planilha SEM a coluna: a chave nem aparece na linha mapeada — é assim que a
// auditoria detecta "coluna não encontrada" e a aba mostra o aviso.
const [noTracking] = readPurchaseRows(
  sheetBuffer([{ Requisição: "10000008", Material: "MAT-8", "Texto breve material": "Sensor indutivo" }])
);
check("sem a coluna, requisitionLevel não é mapeado", "requisitionLevel" in noTracking, false);
check("sem a coluna, trackingNumber não é mapeado", "trackingNumber" in noTracking, false);
check("sem a coluna, netTotal não é mapeado", "netTotal" in noTracking, false);

console.log(
  `\n${failures === 0 ? "TODOS OS TESTES PASSARAM" : `${failures} TESTE(S) FALHARAM`} — ${total - failures}/${total}`
);
process.exit(failures === 0 ? 0 : 1);
