/**
 * ANÁLISE MRP — datas, porta 1:1 do `Analise_MRP_Compacto (1).html`.
 *
 * Saída SEMPRE texto "YYYY-MM-DD" (ou ""): o cmpOrdem() compara a chave como
 * string. Ordem de interpretação idêntica à original:
 *   1. Date            -> getters LOCAIS (isoOf) — depende do fuso do processo;
 *   2. número 20000–80000 -> serial do Excel, arredondado (Math.round), em UTC;
 *   3. "YYYY-M-D…"     -> ano-mês-dia;
 *   4. "D/M/YY(YY)", "D-M-…", "D.M.…" -> dia/mês/ano (ano < 100 soma 2000);
 *   5. fallback new Date(texto) -> getters locais.
 * Diferenças de fuso são medidas (scripts/test-mrp-import.ts), não corrigidas.
 */

const pad2 = (n: number) => String(n).padStart(2, "0");

/** `isoOf()` — data local em "YYYY-MM-DD". */
export function isoOf(d: Date): string {
  return d.getFullYear() + "-" + pad2(d.getMonth() + 1) + "-" + pad2(d.getDate());
}

/** `parseData()` */
export function parseData(v: unknown): string {
  if (v == null || v === "") return "";
  if (v instanceof Date) return isNaN(v.getTime()) ? "" : isoOf(v);
  if (typeof v === "number" && isFinite(v) && v > 20000 && v < 80000) {
    const d = new Date(Date.UTC(1899, 11, 30) + Math.round(v) * 86400000);
    return d.getUTCFullYear() + "-" + pad2(d.getUTCMonth() + 1) + "-" + pad2(d.getUTCDate());
  }
  const s = String(v).trim();
  if (!s) return "";
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return m[1] + "-" + String(+m[2]).padStart(2, "0") + "-" + String(+m[3]).padStart(2, "0");
  m = s.match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{2,4})/);
  if (m) {
    let a = +m[3];
    if (a < 100) a += 2000;
    return String(a) + "-" + String(+m[2]).padStart(2, "0") + "-" + String(+m[1]).padStart(2, "0");
  }
  const d = new Date(s);
  return isNaN(d.getTime()) ? "" : isoOf(d);
}

/** `dataBR()` — "YYYY-MM-DD" -> "DD/MM/YYYY" (exibição/exportação). */
export function dataBR(iso: string | null | undefined): string {
  if (!iso) return "";
  const p = String(iso).split("-");
  return p.length === 3 ? p[2] + "/" + p[1] + "/" + p[0] : String(iso);
}
