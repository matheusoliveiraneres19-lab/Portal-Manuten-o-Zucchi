/**
 * Valida a correção do parser de duração do PC-Factory.
 *
 * Bug: no layout de resumo diário a planilha traz só "(R)Data de Produção", sem hora. O
 * parser sintetizava início 00:00:00 / fim 23:59:59 e `computeDurationMinutes` usava o
 * delta dessas datas (1.439,98 min ≈ 24 h) no lugar da coluna "Tempo Decorrido" —
 * gravando durationHours = 24 em 100% dos 21.822 registros.
 *
 * Monta linhas sintéticas nos dois layouts e confere que a duração vem da planilha.
 * Não toca no banco.
 *
 * Uso: npx tsx scripts/check-pc-factory-duration-parse.ts
 */
import { parseRow } from "@/services/importacao/pc-factory-import.service";

type Caso = {
  nome: string;
  row: Record<string, unknown>;
  decimalHours: boolean;
  esperado: number;
};

// Chaves = campos JÁ normalizados pelo mapa de aliases (não os cabeçalhos da planilha).
const CASOS: Caso[] = [
  {
    nome: "Resumo diário — Tempo Decorrido 3,5 h",
    row: { resourceName: "Multifio 02 - Gasp", status: "Producao", productionDate: "15/07/2026", elapsedDayFraction: 3.5, occurrence: 1 },
    decimalHours: true,
    esperado: 3.5
  },
  {
    nome: "Resumo diário — Tempo Decorrido 0,25 h",
    row: { resourceName: "Politriz 22", status: "Manutenção Mecânica", productionDate: "15/07/2026", elapsedDayFraction: 0.25, occurrence: 1 },
    decimalHours: true,
    esperado: 0.25
  },
  {
    nome: "Resumo diário — Tempo Decorrido 12 h",
    row: { resourceName: "Levigadora 20", status: "Setup - Serrad", productionDate: "15/07/2026", elapsedDayFraction: 12, occurrence: 1 },
    decimalHours: true,
    esperado: 12
  },
  {
    nome: "Transacional — início/término reais 08:00 → 10:30",
    row: { resourceName: "Multifio 06", status: "Producao", startDate: "15/07/2026", startTime: "08:00:00", endDate: "15/07/2026", endTime: "10:30:00" },
    decimalHours: false,
    esperado: 2.5
  }
];

let falhas = 0;
const obtidos: number[] = [];

console.log("\n=== Duração por linha (esperado x obtido) ===\n");
for (const caso of CASOS) {
  const outcome = parseRow(caso.row as never, 1, caso.decimalHours);
  const obtido = "row" in outcome ? outcome.row.durationHours : NaN;
  if (Number.isFinite(obtido)) obtidos.push(obtido);
  const ok = Math.abs(obtido - caso.esperado) < 0.02;
  if (!ok) falhas += 1;
  console.log(`${ok ? "OK   " : "FALHA"} ${caso.nome}`);
  console.log(
    `       esperado ${caso.esperado} h | obtido ${Number.isNaN(obtido) ? `IGNORADA (${(outcome as { ignore: string }).ignore})` : `${obtido} h`}`
  );
}

console.log("\n=== Regressão do bug: nenhuma linha pode sair com 24 h fixo ===\n");
const distintos = new Set(obtidos);
const todos24 = obtidos.length > 0 && obtidos.every((v) => v === 24);
console.log(`Valores distintos de durationHours: ${distintos.size} — [${Array.from(distintos).join(", ")}]`);
console.log(todos24 ? "FALHA — todas as linhas voltaram 24 h (bug presente)" : "OK — durações variam conforme a planilha");
if (todos24) falhas += 1;

console.log(`\n${falhas === 0 ? "TODOS OS CASOS PASSARAM" : `${falhas} caso(s) falharam`}\n`);
process.exit(falhas === 0 ? 0 : 1);
