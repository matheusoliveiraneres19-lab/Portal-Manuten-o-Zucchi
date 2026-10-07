/**
 * Sonda de FUSO do parseData (FASE C). Executada por scripts/test-mrp-import.ts
 * em processos filhos com TZ=America/Sao_Paulo e TZ=UTC. Lê as MESMAS células
 * de data pelo HTML (SheetJS 0.18.5 + parseData original) e pelo Portal
 * (SheetJS 0.20.3 + parseData portado) e imprime JSON numa única linha.
 */
import { parseData } from "../../src/lib/mrp/date-parser";
import { readMrpWorkbook, sheetToAOA } from "../../src/lib/mrp/workbook";
import { csv, dateCell, serial, workbook } from "./fixtures";
import { createHtmlRuntime } from "./html-runtime";

const CASES: [string, unknown][] = [
  ["serial data 00:00", dateCell(serial(2026, 9, 1))],
  ["serial data 12:00", dateCell(serial(2026, 9, 1, 12))],
  ["serial data 23:59:00", dateCell(serial(2026, 9, 1, 23 + 59 / 60))],
  ["serial data 23:59:45", dateCell(serial(2026, 9, 1, 23 + 59 / 60 + 45 / 3600))],
  ["serial data 1999-12-31", dateCell(serial(1999, 12, 31))],
  ["horário de verão antigo 2018-11-04", dateCell(serial(2018, 11, 4))],
  ["número 46266 (sem formato)", serial(2026, 9, 1)],
  ["número 46266.75 (sem formato)", serial(2026, 9, 1, 18)],
  ["texto 01/09/2026", "01/09/2026"],
  ["texto 1-9-26", "1-9-26"],
  ["texto 01.09.2026", "01.09.2026"],
  ["texto 2026-09-01", "2026-09-01"],
  ["texto 2026-09-01T23:30:00", "2026-09-01T23:30:00"],
  ["texto Sep 1 2026 (fallback)", "Sep 1 2026"],
  ["texto inválido", "não é data"]
];

const xlsx = workbook("datas.xlsx", { Plan1: [["Material", "Data"], ...CASES.map(([, v], i) => [String(i), v])] });
const CSV_DATES = ["01/09/2026", "2026-09-01", "09/13/2026", "1/9/26"];
const csvFile = csv("datas.csv", ["Material,Data", ...CSV_DATES.map((d, i) => `${i + 1},${d}`)].join("\n"));

const rt = createHtmlRuntime();
const out: { label: string; html: string; portal: string }[] = [];

for (const file of [xlsx, csvFile]) {
  const htmlRows = rt.fn.sheetToAOA(rt.readWorkbook(file.data), rt.readWorkbook(file.data).SheetNames[0]) as unknown[][];
  const wb = readMrpWorkbook(file.data);
  const portalRows = sheetToAOA(wb, wb.SheetNames[0]);
  for (let i = 1; i < Math.max(htmlRows.length, portalRows.length); i++) {
    const label = file === xlsx ? CASES[i - 1][0] : `csv "${CSV_DATES[i - 1]}"`;
    out.push({
      label,
      html: String(rt.fn.parseData(htmlRows[i]?.[1])),
      portal: parseData(portalRows[i]?.[1])
    });
  }
}

console.log(JSON.stringify({ tz: process.env.TZ ?? "", offset: new Date(2026, 8, 1).getTimezoneOffset(), cases: out }));
