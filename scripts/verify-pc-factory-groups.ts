/**
 * Valida a classificação da Tabela Gerencial usando o CÓDIGO de produção
 * (classifyManagementGroup do normalizer) sobre uma planilha do PC-Factory.
 * Uso: npx tsx scripts/verify-pc-factory-groups.ts "C:/caminho/arquivo.xlsx"
 */
import path from "node:path";
import * as XLSX from "xlsx";
import {
  classifyManagementGroup,
  PC_FACTORY_MANAGEMENT_GROUP_LABELS,
  PC_FACTORY_MANAGEMENT_GROUP_ORDER,
  type PcFactoryManagementGroup
} from "../src/utils/pc-factory-normalizer";

const file = path.resolve(process.argv[2] ?? "imports/pc-factory/PCFactory_2026_Unificado.xlsx");
const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(
  XLSX.readFile(file, { cellDates: false }).Sheets["ag-grid"],
  { defval: "", raw: true }
);

const toHours = (v: unknown) => (typeof v === "number" && v >= 0 ? (v < 1.5 ? v * 24 : v) : 0);
const fmt = (h: number) => {
  const s = Math.round(h * 3600);
  return `${Math.floor(s / 3600)}:${String(Math.floor((s % 3600) / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
};

const byGroup = new Map<PcFactoryManagementGroup, number>();
let total = 0;
for (const r of rows) {
  const group = classifyManagementGroup(r["G0015.RCODSTATUS"], r["Nome Status Recurso"]);
  const hours = toHours(r["Tempo Decorrido [hr]"]);
  byGroup.set(group, (byGroup.get(group) ?? 0) + hours);
  total += hours;
}

console.log(`Arquivo: ${file}\nLinhas: ${rows.length}\n`);
console.log("Grupo".padEnd(20), "%".padStart(8), "Tempo Decorrido".padStart(16));
let cum = 0;
for (const g of PC_FACTORY_MANAGEMENT_GROUP_ORDER) {
  const h = byGroup.get(g) ?? 0;
  if (h <= 0) continue;
  cum += h;
  console.log(
    PC_FACTORY_MANAGEMENT_GROUP_LABELS[g].padEnd(20),
    `${((h / total) * 100).toFixed(2)}%`.padStart(8),
    fmt(h).padStart(16),
    ` (acum ${((cum / total) * 100).toFixed(2)}%)`
  );
}
console.log("Total".padEnd(20), "100.00%".padStart(8), fmt(total).padStart(16));
