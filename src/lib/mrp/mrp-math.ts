/**
 * ANÁLISE MRP — aritmética do motor.
 *
 * O HTML calcula com Number (double). Para reproduzir os MESMOS resultados, o
 * motor também calcula em double: o Decimal do banco é convertido UMA vez na
 * leitura (fromMrpDecimal, ida e volta exata — FASE B) e UMA vez na gravação
 * (toMrpDecimal). Fazer a conta em Decimal daria valores DIFERENTES do HTML
 * (ex.: 0.1 + 0.2 exato = 0.3, no HTML = 0.30000000000000004).
 *
 * Os helpers abaixo existem para deixar explícita, num só lugar, a semântica
 * JavaScript de cada operação usada pelas regras.
 */

/** `x <= 0` (true também para -0). */
export const lteZero = (x: number): boolean => x <= 0;

/** `a < b` */
export const lessThan = (a: number, b: number): boolean => a < b;

/** `a - b` em double. */
export const subtract = (a: number, b: number): number => a - b;

/** `Math.max(0, x)` — 0 para x <= 0 (Math.max(0, -0) é +0). */
export const maxZero = (x: number): number => Math.max(0, x);

/** Soma NA ORDEM dada (a ordem afeta o último bit de somas em double, como no HTML). */
export function sumInOrder(values: Iterable<number>): number {
  let total = 0;
  for (const v of Array.from(values)) total += v;
  return total;
}

/** -0 -> 0, só para SAÍDA (gravação, JSON, exibição). Nunca antes de uma regra. */
export const outputNumber = (x: number): number => (Object.is(x, -0) ? 0 : x);
