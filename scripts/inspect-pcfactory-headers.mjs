import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const XLSX = require("xlsx");

const file = "imports/pc-factory/PCFactory_2026_Unificado.xlsx";
const wb = XLSX.readFile(file, { cellDates: true });
console.log("Abas:", wb.SheetNames.join(" | "));

const sheetName = ["Import_PC_FACTORY", "ag-grid"].find((s) => wb.SheetNames.includes(s)) ?? wb.SheetNames[0];
console.log("Aba lida:", sheetName);

const ws = wb.Sheets[sheetName];
const rows = XLSX.utils.sheet_to_json(ws, { defval: "", raw: true });
console.log("Linhas:", rows.length);

const headers = Object.keys(rows[0] ?? {});
console.log("\nCabeçalhos:");
headers.forEach((hd) => console.log("  -", hd));

// Procura colunas que pareçam "causa raiz".
const causeCols = headers.filter((hd) => /causa|raiz|root/i.test(hd));
console.log("\nColunas de causa detectadas:", causeCols.length ? causeCols.join(", ") : "NENHUMA");

for (const col of causeCols) {
  const values = new Map();
  for (const row of rows) {
    const v = String(row[col] ?? "").trim();
    values.set(v, (values.get(v) ?? 0) + 1);
  }
  const top = Array.from(values.entries()).sort((a, b) => b[1] - a[1]).slice(0, 12);
  console.log(`\nValores distintos em "${col}" (top 12):`);
  for (const [v, n] of top) console.log(`  ${n.toString().padStart(6)}  ->  ${v === "" ? "(vazio)" : v}`);
}
