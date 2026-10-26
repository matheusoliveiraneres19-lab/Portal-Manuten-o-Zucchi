/**
 * Fixa o fuso do processo em UTC — o fuso das funções da Vercel, onde a
 * importação do Portal roda. Importar ANTES de qualquer outro módulo.
 *
 * O comportamento do HTML no fuso do navegador (America/Sao_Paulo) é medido à
 * parte pela sonda scripts/mrp/tz-probe.ts.
 */
// O comparador oficial (scripts/validate-mrp-parity.ts) roda também em America/Sao_Paulo.
process.env.TZ = process.env.MRP_PARITY_TZ || "UTC";
