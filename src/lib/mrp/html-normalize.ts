/**
 * ANÁLISE MRP — funções puras portadas 1:1 do `Analise_MRP_Compacto (1).html`.
 *
 * O HTML é a fonte de verdade funcional: cada função abaixo reproduz a original
 * linha a linha (nome original no comentário). NÃO "melhorar" nenhuma delas sem
 * uma fase de melhorias aprovada — a paridade numérica depende disso e é
 * verificada contra o próprio HTML por scripts/seed-mrp-html-base.ts e
 * scripts/mrp/test-numeric-precision.ts.
 *
 * Sem Prisma e sem React: usável no servidor, em scripts e em testes.
 */

export const MRP_AREA_MEC = "Mecânica";
export const MRP_AREA_ELE = "Elétrica";
export type MrpArea = typeof MRP_AREA_MEC | typeof MRP_AREA_ELE;

/** `FAMS` do HTML — nomes exatos e ordem de exibição dos conjuntos. */
export const MRP_FAMILIES = [
  "Satélite Simec 6",
  "Satélite Breton 8",
  "Satélite Breton 6",
  "Satélites Breton",
  "Coroa Cemar"
] as const;

/** `norm()` — minúsculas, sem acentos e só [a-z0-9]. */
export function norm(s: unknown): string {
  return String(s == null ? "" : s)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]/g, "")
    .trim();
}

/** `cleanCode()` — NÃO remove zeros à esquerda; só tira "13515.0" -> "13515". */
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

/**
 * `parseNum()` — número no formato brasileiro/SAP. Peculiaridades preservadas:
 * "1.500" -> 1500 (ponto + 3 dígitos = milhar), "-0" -> -0, texto -> 0.
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

/** `famDe()` — conjunto (satélites/coroas) a partir do texto do Status MRP. */
export function resolveMrpFamily(status: unknown): string {
  const n = norm(status);
  if (!n) return "";
  if (n.includes("coroa") && n.includes("cemar")) return "Coroa Cemar";
  if (!n.includes("satel")) return "";
  if (n.includes("simec")) return "Satélite Simec 6";
  if (n.includes("breton")) {
    if (n.includes("8")) return "Satélite Breton 8";
    if (n.includes("6")) return "Satélite Breton 6";
    return "Satélites Breton";
  }
  return "";
}
