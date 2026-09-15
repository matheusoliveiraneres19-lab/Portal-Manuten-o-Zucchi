/**
 * PERÍODO DE BASE PARCIAL / IMPLANTAÇÃO.
 *
 * Jan e fev/2026 aparecem com 181 e 163 ordens num histórico cuja mediana mensal é de
 * ~2.500 — 7% do volume normal. Não é queda de manutenção: é a base do portal que
 * começou a ser alimentada de verdade em março. Um gráfico que mostra esses meses sem
 * ressalva leva a ler "a manutenção despencou" onde a leitura correta é "ainda não
 * havia dado".
 *
 * A regra é DERIVADA dos próprios dados, não uma lista de meses no código: assim ela
 * continua valendo quando a base crescer, e não precisa ser revisada a cada importação.
 * Nenhum mês é excluído — só marcado.
 */

/** Abaixo desta fração da MEDIANA mensal, o mês é tratado como base parcial. */
const PARTIAL_THRESHOLD = 0.35;

/** Meses com volume tão baixo que a série não é comparável — precisam de aviso. */
export function detectPartialBaseMonths(countsByMonth: Map<string, number>): Set<string> {
  const meses = Array.from(countsByMonth.entries()).sort(([a], [b]) => a.localeCompare(b));
  if (meses.length < 3) return new Set();

  // Mediana, não média: um único mês gigante distorceria a média e mascararia os
  // meses fracos que a marcação existe para revelar.
  const ordenados = meses.map(([, total]) => total).sort((a, b) => a - b);
  const meio = Math.floor(ordenados.length / 2);
  const mediana = ordenados.length % 2 === 0 ? (ordenados[meio - 1] + ordenados[meio]) / 2 : ordenados[meio];
  if (mediana <= 0) return new Set();

  const limite = mediana * PARTIAL_THRESHOLD;

  // O ÚLTIMO mês da série fica de fora: ele está em curso, e volume baixo ali é
  // "o mês ainda não acabou", não implantação. Marcá-lo seria falso todo mês.
  const ultimo = meses[meses.length - 1][0];

  return new Set(meses.filter(([mes, total]) => mes !== ultimo && total < limite).map(([mes]) => mes));
}

/** Rótulo curto exibido junto ao ponto marcado. */
export const PARTIAL_BASE_LABEL = "base parcial";

/** Texto da nota de rodapé dos gráficos que têm meses marcados. */
export function partialBaseNote(months: string[]): string {
  if (months.length === 0) return "";
  const lista = months.map(formatMonthLabel).join(", ");
  return `${lista} ${months.length === 1 ? "tem" : "têm"} volume muito abaixo da mediana do histórico — período de implantação da base. Os registros continuam no gráfico, mas a comparação com os demais meses não é direta.`;
}

/** "2026-01" → "jan/26". */
export function formatMonthLabel(key: string): string {
  const [ano, mes] = key.split("-").map(Number);
  if (!Number.isFinite(ano) || !Number.isFinite(mes)) return key;
  const rotulo = new Date(Date.UTC(ano, mes - 1, 1))
    .toLocaleDateString("pt-BR", { month: "short", timeZone: "UTC" })
    .replace(".", "");
  return `${rotulo}/${String(ano).slice(2)}`;
}
