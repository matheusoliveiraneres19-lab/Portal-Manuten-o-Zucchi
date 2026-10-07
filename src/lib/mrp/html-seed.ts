/**
 * ANÁLISE MRP — montagem da base embutida do HTML (SEED_MAN / SEED_ELE),
 * porta 1:1 do ramo "base embutida" de `materiais()` no
 * `Analise_MRP_Compacto (1).html`.
 *
 * Formato de cada linha do HTML:
 *   [0]cod [1]desc [2]grupo [3]min [4]max [5]semMov [6]livre [7]UM [8]statusMrp [9]conjunto
 * ([5] e [6] não são usados pela análise do HTML e não são persistidos.)
 *
 * Deduplicação por código, idêntica ao HTML: a PRIMEIRA ocorrência vence
 * (Mecânica antes de Elétrica); uma repetição só
 *   - preenche o conjunto se o primeiro estiver vazio;
 *   - substitui mín E máx juntos se o primeiro tiver !min && !max;
 *   - preenche a descrição se a primeira estiver vazia.
 */
import { MRP_AREA_ELE, MRP_AREA_MEC, resolveMrpFamily } from "./classification";
import { cleanCode, cleanText } from "./normalization";
import { parseNum } from "./number-parser";

export type HtmlSeedRow = (string | number | null)[];

export type MrpSeedMaterial = {
  code: string;
  description: string;
  group: string;
  min: number;
  max: number;
  unit: string;
  statusMrp: string;
  family: string;
  area: string;
  /** "SEED_MAN" | "SEED_ELE" */
  sourceSheet: string;
  /** Posição (1-based) da linha no array da base embutida. */
  sourceRow: number;
};

export type MrpSeedBuildResult = {
  materials: MrpSeedMaterial[];
  rawRows: { [MRP_AREA_MEC]: number; [MRP_AREA_ELE]: number; total: number };
  /** Linhas sem código (ignoradas, como no HTML). */
  emptyCodeRows: number;
  /** Linhas cujo código já tinha aparecido (mescladas na primeira ocorrência). */
  duplicateRows: number;
  duplicateCodes: string[];
};

export function buildMrpMaterialsFromHtmlSeed(seedMan: HtmlSeedRow[], seedEle: HtmlSeedRow[]): MrpSeedBuildResult {
  const byCode = new Map<string, MrpSeedMaterial>();
  let emptyCodeRows = 0;
  let duplicateRows = 0;
  const duplicateCodes: string[] = [];

  const blocks: [HtmlSeedRow[], string, string][] = [
    [seedMan, MRP_AREA_MEC, "SEED_MAN"],
    [seedEle, MRP_AREA_ELE, "SEED_ELE"]
  ];
  for (const [rows, area, sourceSheet] of blocks) {
    rows.forEach((r, index) => {
      const code = cleanCode(r[0]);
      if (!code) {
        emptyCodeRows += 1;
        return;
      }
      const statusMrp = cleanText(r[8]);
      const rec: MrpSeedMaterial = {
        code,
        description: cleanText(r[1]),
        group: cleanText(r[2]),
        min: parseNum(r[3]),
        max: parseNum(r[4]),
        unit: cleanText(r[7]),
        statusMrp,
        family: cleanText(r[9]) || resolveMrpFamily(statusMrp),
        area,
        sourceSheet,
        sourceRow: index + 1
      };
      const ex = byCode.get(code);
      if (ex) {
        duplicateRows += 1;
        duplicateCodes.push(code);
        if (!ex.family) ex.family = rec.family;
        if (!ex.min && !ex.max) {
          ex.min = rec.min;
          ex.max = rec.max;
        }
        if (!ex.description) ex.description = rec.description;
        return;
      }
      byCode.set(code, rec);
    });
  }

  return {
    materials: Array.from(byCode.values()),
    rawRows: { [MRP_AREA_MEC]: seedMan.length, [MRP_AREA_ELE]: seedEle.length, total: seedMan.length + seedEle.length },
    emptyCodeRows,
    duplicateRows,
    duplicateCodes
  };
}
