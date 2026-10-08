/**
 * ANÁLISE MRP — formatação de exibição (`fmt()` do HTML: pt-BR, até 2 casas).
 * Só apresentação: 22270.499999999985 aparece como "22.270,5"; o valor
 * persistido e o cálculo do motor não mudam.
 */
const nf = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 2 });

/** `fmt()` do HTML. */
export const fmtMrp = (v: number | null | undefined): string => nf.format(v || 0);
