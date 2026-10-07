/**
 * ANÁLISE MRP — normalização de texto, porta 1:1 do `Analise_MRP_Compacto (1).html`.
 *
 * Não acrescentar transformações: a paridade com o HTML depende destas três
 * funções exatamente como estão (verificadas contra o original em
 * scripts/test-mrp-import.ts).
 */

/** `norm()` — minúsculas, sem acentos (NFD) e só [a-z0-9]. */
export function norm(s: unknown): string {
  return String(s == null ? "" : s)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]/g, "")
    .trim();
}

/**
 * `cleanCode()` — tira caracteres invisíveis, espaços extras e o ".0" de
 * números lidos como texto ("13515.0" -> "13515"). NÃO remove zeros à esquerda:
 * "000000000000013515" continua diferente de "13515", como no HTML.
 */
export function cleanCode(v: unknown): string {
  if (v == null) return "";
  let s = String(v).replace(/[​‌‍﻿]/g, "").trim().replace(/\s+/g, " ");
  if (/^\d+\.0+$/.test(s)) s = s.replace(/\.0+$/, "");
  return s;
}

/** `cleanText()` */
export function cleanText(v: unknown): string {
  return v == null ? "" : String(v).replace(/[​‌‍﻿]/g, "").trim().replace(/\s+/g, " ");
}
