/**
 * ANÁLISE MRP — gravação do .xlsx das exportações (FASE J), no SERVIDOR.
 *
 * Mesma família de biblioteca do HTML (SheetJS), mas a versão já instalada no
 * projeto (xlsx 0.20.3) — nada vai para o bundle do navegador. Reproduz
 * `XLSX.utils.aoa_to_sheet([HDR, ...linhas])` + `ws['!cols'] = COLW` +
 * `book_append_sheet`: o conteúdo é equivalente ao do HTML, não os bytes.
 */
import * as XLSX from "xlsx";
import type { MrpExportSpec } from "./export";

export const MRP_XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

export function writeMrpExportWorkbook(spec: MrpExportSpec): Buffer {
  const wb = XLSX.utils.book_new();
  for (const s of spec.sheets) {
    const ws = XLSX.utils.aoa_to_sheet(s.rows);
    ws["!cols"] = s.cols.map((c) => ({ wch: c.wch }));
    XLSX.utils.book_append_sheet(wb, ws, s.name);
  }
  return XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
}
