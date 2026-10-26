/**
 * ANÁLISE MRP — classificações do `Analise_MRP_Compacto (1).html`, porta 1:1:
 * área (pelo nome da aba), conjunto (famDe), "sem movimentação" (isSemMovTxt)
 * e abas ignoradas da base.
 */
import { norm } from "./normalization";

export const MRP_AREA_MEC = "Mecânica";
export const MRP_AREA_ELE = "Elétrica";
export type MrpArea = typeof MRP_AREA_MEC | typeof MRP_AREA_ELE;

/** `FAMS` — nomes exatos e ordem dos conjuntos. */
export const MRP_FAMILIES = [
  "Satélite Simec 6",
  "Satélite Breton 8",
  "Satélite Breton 6",
  "Satélites Breton",
  "Coroa Cemar"
] as const;

/** `famDe()` — conjunto a partir do texto do Status MRP ("" = nenhum). */
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

/** `isSemMovTxt()` — status MRP que indica material sem movimentação. */
export function isSemMovTxt(v: unknown): boolean {
  if (v == null || v === "") return false;
  const n = norm(v);
  if (!n) return false;
  return (
    n.includes("semsaida") ||
    n.includes("semmovimenta") ||
    n.includes("semmov") ||
    n.includes("semconsumo") ||
    n.includes("semgiro") ||
    n.includes("naomovimentado") ||
    n.includes("obsoleto") ||
    n.includes("inativo")
  );
}

/** Aba da planilha do MRP que importarBase() pula (gyan / uso geral / automático). */
export function isIgnoredMrpBaseSheet(sheetName: string): boolean {
  const n = norm(sheetName);
  return n.includes("gyan") || n.includes("usogeral") || n.includes("automatico");
}

/** Área da aba: "eletric" -> Elétrica; "mecanic"/"manutenc" -> Mecânica; senão a padrão. */
export function resolveMrpSheetArea(sheetName: string, defaultArea: string): string {
  const n = norm(sheetName);
  return n.includes("eletric") ? MRP_AREA_ELE : n.includes("mecanic") || n.includes("manutenc") ? MRP_AREA_MEC : defaultArea;
}

/** true quando o nome da aba define a área (sem cair na área padrão). */
export function sheetNameDefinesArea(sheetName: string): boolean {
  const n = norm(sheetName);
  return n.includes("eletric") || n.includes("mecanic") || n.includes("manutenc");
}
