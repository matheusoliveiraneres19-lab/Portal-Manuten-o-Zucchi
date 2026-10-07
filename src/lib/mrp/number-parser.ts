/**
 * ANÁLISE MRP — `parseNum()` do `Analise_MRP_Compacto (1).html`, porta 1:1.
 *
 * Peculiaridades preservadas de propósito:
 *   "1.500" -> 1500 (ponto seguido de 3 dígitos = milhar), "1.5" -> 1.5,
 *   "1,5" -> 1.5, "1.500,25" -> 1500.25, "" / "-" / texto -> 0, "-0" -> -0,
 *   "5-" -> 5 (sinal à direita é ignorado).
 */
export function parseNum(v: unknown): number {
  if (v == null || v === "") return 0;
  if (typeof v === "number") return isFinite(v) ? v : 0;
  let s = String(v).replace(/[ \s]/g, "").replace(/[^\d.,-]/g, "");
  if (s === "" || s === "-") return 0;
  const c = s.includes(","),
    d = s.includes(".");
  if (c && d) s = s.replace(/\./g, "").replace(",", ".");
  else if (c) s = s.replace(",", ".");
  else if (d) {
    const p = s.split(".");
    if (p.length > 2 || (p.length === 2 && p[1].length === 3)) {
      if (p.every((x, i) => (i === 0 ? x.length <= 3 : x.length === 3))) s = p.join("");
    }
  }
  const n = parseFloat(s);
  return isFinite(n) ? n : 0;
}

/**
 * -0 vira 0 — SÓ para serialização, comparação e exibição. Nunca usar antes
 * de uma regra (o motor trabalha com o valor original do parseNum).
 */
export function normalizeNegativeZero(value: number): number {
  return Object.is(value, -0) ? 0 : value;
}
