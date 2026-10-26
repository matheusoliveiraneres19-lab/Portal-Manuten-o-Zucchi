/**
 * ANÁLISE MRP — `importarBase()` do `Analise_MRP_Compacto (1).html`, porta 1:1.
 *
 * Regras (todas do HTML):
 *   - percorre TODAS as abas do workbook — a aba escolhida no preview serve só
 *     para detecção/validação, não limita o que é importado;
 *   - ignora abas cujo nome normalizado contém gyan / usogeral / automatico;
 *   - pula (sem falhar) abas com menos de 2 linhas ou sem Material/Mín/Máx;
 *   - área pelo nome da aba (eletric / mecanic|manutenc / padrão);
 *   - conjunto = famDe(Status MRP) (a planilha enviada não tem coluna de conjunto);
 *   - deduplicação por código: a 1ª ocorrência vence; a repetida só completa o
 *     conjunto vazio e substitui mín E máx juntos quando a 1ª tem !min && !max.
 *     NÃO completa a descrição (diferente da base embutida).
 */
import { detectCol } from "./aliases";
import { isIgnoredMrpBaseSheet, resolveMrpFamily, resolveMrpSheetArea, sheetNameDefinesArea } from "./classification";
import { findHeaderRow } from "./file-detection";
import { cleanCode, cleanText } from "./normalization";
import { parseNum } from "./number-parser";
import { sheetToRows, type MrpWorkbook } from "./workbook";

export type MrpBaseRecord = {
  code: string;
  description: string;
  group: string;
  min: number;
  max: number;
  unit: string;
  statusMrp: string;
  family: string;
  area: string;
  sourceSheet: string;
  sourceRow: number;
};

export type MrpBaseSheetSummary = {
  name: string;
  area: string;
  /** true = área veio do nome da aba; false = área padrão. */
  areaFromSheetName: boolean;
  dataRows: number;
  /** `nlin` — materiais NOVOS que a aba trouxe. */
  materials: number;
  duplicateRows: number;
  emptyCodeRows: number;
};

/** Destino de cada linha de dados, para o staging. */
export type MrpBaseRowOutcome = {
  sheet: string;
  sourceRow: number;
  cells: unknown[];
  status: "VALID" | "IGNORED";
  /** Código do material (VALID = 1ª ocorrência). */
  code: string;
  reason?: "SEM_CODIGO" | "DUPLICADO";
};

export type MrpBaseParseResult = {
  ok: boolean;
  /** Mensagem do HTML quando ok = false. */
  error?: string;
  materials: MrpBaseRecord[];
  sheets: MrpBaseSheetSummary[];
  ignoredSheets: string[];
  /** Abas sem dados suficientes ou sem Material/Mín/Máx. */
  skippedSheets: { name: string; reason: "SEM_DADOS" | "SEM_COLUNAS" }[];
  duplicateRows: number;
  emptyCodeRows: number;
  rows: MrpBaseRowOutcome[];
  /** Texto `resumo` do HTML (sem HTML). */
  summary: string;
};

export const MRP_BASE_ERROR_NO_SHEET =
  "A planilha do MRP não tem as colunas Material, Estoque mínimo e Estoque máximo em nenhuma aba.";

const fmt = (n: number) => new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 2 }).format(n || 0);

export function parseMrpBase(wb: MrpWorkbook, options: { defaultArea: string }): MrpBaseParseResult {
  const out = new Map<string, MrpBaseRecord>();
  const sheets: MrpBaseSheetSummary[] = [];
  const ignoredSheets: string[] = [];
  const skippedSheets: MrpBaseParseResult["skippedSheets"] = [];
  const rows: MrpBaseRowOutcome[] = [];
  let duplicateRows = 0;
  let emptyCodeRows = 0;

  for (const name of wb.SheetNames) {
    if (isIgnoredMrpBaseSheet(name)) {
      ignoredSheets.push(name);
      continue;
    }
    const { rows: aoa, rowNumbers } = sheetToRows(wb, name);
    if (aoa.length < 2) {
      skippedSheets.push({ name, reason: "SEM_DADOS" });
      continue;
    }
    const hr = findHeaderRow(aoa),
      H = aoa[hr].map(cleanText);
    const ci = detectCol(H, "cod"),
      mi = detectCol(H, "min"),
      xi = detectCol(H, "max");
    if (ci < 0 || mi < 0 || xi < 0) {
      skippedSheets.push({ name, reason: "SEM_COLUNAS" });
      continue;
    }
    const di = detectCol(H, "desc"),
      si = detectCol(H, "status"),
      gi = detectCol(H, "grupo"),
      ui = detectCol(H, "um");
    const area = resolveMrpSheetArea(name, options.defaultArea);
    let nlin = 0;
    let sheetDup = 0;
    let sheetEmpty = 0;

    aoa.slice(hr + 1).forEach((r, k) => {
      const sourceRow = rowNumbers[hr + 1 + k];
      const cod = cleanCode(r[ci]);
      if (!cod) {
        sheetEmpty++;
        rows.push({ sheet: name, sourceRow, cells: r, status: "IGNORED", code: "", reason: "SEM_CODIGO" });
        return;
      }
      const stat = si >= 0 ? cleanText(r[si]) : "";
      const ex = out.get(cod);
      if (ex) {
        sheetDup++;
        if (!ex.family) ex.family = resolveMrpFamily(stat);
        if (!ex.min && !ex.max) {
          ex.min = parseNum(r[mi]);
          ex.max = parseNum(r[xi]);
        }
        rows.push({ sheet: name, sourceRow, cells: r, status: "IGNORED", code: cod, reason: "DUPLICADO" });
        return;
      }
      out.set(cod, {
        code: cod,
        description: di >= 0 ? cleanText(r[di]) : "",
        group: gi >= 0 ? cleanText(r[gi]) : "",
        min: parseNum(r[mi]),
        max: parseNum(r[xi]),
        unit: ui >= 0 ? cleanText(r[ui]) : "",
        statusMrp: stat,
        family: resolveMrpFamily(stat),
        area,
        sourceSheet: name,
        sourceRow
      });
      rows.push({ sheet: name, sourceRow, cells: r, status: "VALID", code: cod });
      nlin++;
    });

    duplicateRows += sheetDup;
    emptyCodeRows += sheetEmpty;
    // No HTML só entram em `abas` as abas que trouxeram material novo (nlin > 0).
    if (nlin) {
      sheets.push({
        name,
        area,
        areaFromSheetName: sheetNameDefinesArea(name),
        dataRows: aoa.length - hr - 1,
        materials: nlin,
        duplicateRows: sheetDup,
        emptyCodeRows: sheetEmpty
      });
    }
  }

  const materials = Array.from(out.values());
  const abas = sheets.map((s) => `${s.name} · ${fmt(s.materials)} (${s.area})`);
  const summary =
    `${fmt(materials.length)} materiais de ${abas.length} aba(s) — ${abas.join(" · ")}` +
    (ignoredSheets.length ? ` · ignoradas: ${ignoredSheets.join(", ")}` : "");

  return {
    ok: materials.length > 0,
    error: materials.length ? undefined : MRP_BASE_ERROR_NO_SHEET,
    materials,
    sheets,
    ignoredSheets,
    skippedSheets,
    duplicateRows,
    emptyCodeRows,
    rows,
    summary
  };
}
