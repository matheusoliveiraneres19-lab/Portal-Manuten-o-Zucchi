/**
 * ANÁLISE MRP — leitura do workbook com as MESMAS opções do HTML:
 *   XLSX.read(arrayBuffer, { type: "array", cellDates: true, raw: false })
 *   sheet_to_json(ws, { header: 1, defval: "", raw: true }) + descarte de linhas vazias
 *
 * Diferença deliberada e neutra: a leitura usa `blankrows: true` e descarta as
 * linhas vazias depois — o resultado é o mesmo `sheetToAOA()` do HTML, mas
 * assim sabemos a linha real da planilha de cada registro (sourceRow).
 * Equivalência verificada contra o HTML em scripts/test-mrp-import.ts.
 *
 * O HTML usa a SheetJS 0.18.5; o Portal usa a 0.20.3 (a 0.18.5 tem falhas de
 * segurança conhecidas na leitura de arquivos). Diferenças de leitura entre as
 * versões são medidas pelos testes de paridade, não presumidas.
 */
import * as XLSX from "xlsx";
import type { MrpRow } from "./types";

export type MrpWorkbook = XLSX.WorkBook;

export function readMrpWorkbook(data: Buffer | Uint8Array | ArrayBuffer): MrpWorkbook {
  const ab =
    data instanceof ArrayBuffer ? data : data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength);
  return XLSX.read(ab, { type: "array", cellDates: true, raw: false });
}

const isFilled = (row: MrpRow) => row.some((c) => c !== "" && c != null);

/** Linhas não vazias da aba + a linha (1-based) de cada uma na planilha. */
export function sheetToRows(wb: MrpWorkbook, name: string): { rows: MrpRow[]; rowNumbers: number[] } {
  const ws = wb.Sheets[name];
  const all = XLSX.utils.sheet_to_json<MrpRow>(ws, { header: 1, defval: "", blankrows: true, raw: true });
  const firstRow = ws && ws["!ref"] ? XLSX.utils.decode_range(ws["!ref"]).s.r : 0;
  const rows: MrpRow[] = [];
  const rowNumbers: number[] = [];
  all.forEach((row, i) => {
    if (isFilled(row)) {
      rows.push(row);
      rowNumbers.push(firstRow + i + 1);
    }
  });
  return { rows, rowNumbers };
}

/** `sheetToAOA()` do HTML. */
export function sheetToAOA(wb: MrpWorkbook, name: string): MrpRow[] {
  return sheetToRows(wb, name).rows;
}
