import { createRequire } from "module";
const require = createRequire(import.meta.url);
const XLSX = require("xlsx");

const path = process.env.XLSX_PATH ?? "C:/Users/matheus.neres/Downloads/G0015_PC_FACTORY_ajustada_portal.xlsx";
const wb = XLSX.readFile(path, { cellDates: true });
console.log("ABAS:", wb.SheetNames);
const sheetName = wb.SheetNames.find((s) => s.toLowerCase().trim() === "import_pc_factory") ?? wb.SheetNames[0];
console.log("ABA INSPECIONADA:", sheetName);
const ws = wb.Sheets[sheetName];

const aoa = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "", raw: true });
console.log("TOTAL LINHAS (aoa):", aoa.length);
console.log("\n--- LINHA 0 ---\n", JSON.stringify(aoa[0]));
console.log("\n--- LINHA 1 ---\n", JSON.stringify(aoa[1]));
console.log("\n--- LINHA 2 ---\n", JSON.stringify(aoa[2]));

const objs = XLSX.utils.sheet_to_json(ws, { defval: "", raw: true });
console.log("\nTOTAL OBJETOS:", objs.length);
console.log("\n--- CHAVES DETECTADAS (headers) ---\n", JSON.stringify(Object.keys(objs[0] ?? {})));
console.log("\n--- PRIMEIRO OBJETO ---\n", JSON.stringify(objs[0], null, 1));
console.log("\n--- SEGUNDO OBJETO ---\n", JSON.stringify(objs[1], null, 1));
