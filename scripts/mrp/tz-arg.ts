/**
 * `--tz=<IANA>` na linha de comando → fuso do processo (antes de qualquer
 * módulo). Usado pelo comparador oficial (scripts/validate-mrp-parity.ts).
 */
const arg = process.argv.find((a) => a.startsWith("--tz="))?.slice(5);
if (arg) process.env.MRP_PARITY_TZ = arg;
process.env.TZ = process.env.MRP_PARITY_TZ || "UTC";
