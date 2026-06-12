/**
 * Verificação pura (sem banco) da correção do importador PC-Factory.
 * Monta uma planilha em memória com as abas `ag-grid` (bruta) e `Import_PC_FACTORY`
 * (ajustada) e confere: preferência de aba, mapeamento de colunas, regra de duração
 * fração-de-dia e a nova regra de classificação (Automação entra; Falta de Utilidades → perda).
 *
 * Uso: npx tsx scripts/verify-pc-factory-import.ts
 */
import * as XLSX from "xlsx";
import { readPcFactorySheet } from "@/services/importacao/pc-factory-import.service";
import {
  classifyPcFactoryStatus,
  isMaintenanceStatus,
  isDowntimeForAvailability,
  maintenanceKind,
  parseAgGridElapsedToMinutes
} from "@/utils/pc-factory-normalizer";

let failures = 0;
function check(label: string, got: unknown, expected: unknown) {
  const ok = JSON.stringify(got) === JSON.stringify(expected);
  if (!ok) failures += 1;
  console.log(`${ok ? "✓" : "✗"} ${label} → ${JSON.stringify(got)}${ok ? "" : ` (esperado ${JSON.stringify(expected)})`}`);
}

// 1) Regras de classificação (a nova regra de manutenção)
console.log("\n== Regras de status ==");
check("Manutenção Automação → MANUTENCAO", classifyPcFactoryStatus("Manutenção Automação"), "MANUTENCAO");
check("Manutenção Automação é manutenção (KPI)", isMaintenanceStatus("Manutenção Automação"), true);
check("Manutenção Automação tipo", maintenanceKind("Manutenção Automação"), "AUTOMACAO");
check("Falta de Utilidades → PARADA_PERDA", classifyPcFactoryStatus("Falta de Utilidades"), "PARADA_PERDA");
check("Falta de Utilidades NÃO é manutenção", isMaintenanceStatus("Falta de Utilidades"), false);
check("Falta de Utilidades reduz disponibilidade", isDowntimeForAvailability("Falta de Utilidades"), true);
check("Manutenção Mecânica tipo", maintenanceKind("Manutenção Mecânica"), "MECANICA");
check("Manutenção de Terceiros NÃO é manutenção", isMaintenanceStatus("Manutenção de Terceiros"), false);

// 2) Regra de duração da aba bruta (fração de dia → ×24)
console.log("\n== Duração ag-grid (fração de dia) ==");
check("0,347 dia → ~500 min (8,33 h)", parseAgGridElapsedToMinutes(0.347), Math.round(0.347 * 24 * 60 * 100) / 100);
check("2.0 (>=1.5) já em horas → 120 min", parseAgGridElapsedToMinutes(2), 120);

// 3) Planilha em memória com as duas abas (ag-grid primeiro, Import depois)
const agGrid = [
  {
    "Apelido Recurso": "Bifio 01 - Bidese",
    "Nome Status Recurso": "Manutenção Automação",
    "Detalhes Status Recurso": "Troca de CLP",
    "Início": "01/06/2026 08:00",
    "Término": "01/06/2026 16:20",
    "Tempo Decorrido [hr]": 0.347,
    "Resp.Inicial": "João",
    "Cód. da Ordem": "OP-1",
    "Cód da Operação": "010",
    "Nome da Operação": "Polimento",
    "Cód. Produto": "P1",
    "Nome Produto": "Chapa Granito",
    "Comentários": "ok",
    "Causa Raiz": "Falha CLP"
  }
];
const importSheet = [
  {
    resourceName: "Levigadora 20 Keda",
    resourceCode: "LV20",
    productionLine: "Linha 02",
    groupPortal: "Indústria Mármore",
    statusRaw: "Falta de Utilidades",
    startDateTime: "2026-06-02T07:00:00.000Z",
    endDateTime: "2026-06-02T09:30:00.000Z",
    durationMinutes: 150,
    durationHours: 2.5
  }
];

const wb = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(agGrid), "ag-grid");
XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(importSheet), "Import_PC_FACTORY");
const buffer = XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;

console.log("\n== Preferência de aba e mapeamento ==");
const preferred = readPcFactorySheet(buffer);
check("Aba preferida = Import_PC_FACTORY", preferred.sheetUsed, "Import_PC_FACTORY");
check("camelCase mapeou resourceName", preferred.rows[0]?.resourceName, "Levigadora 20 Keda");
check("camelCase mapeou statusRaw → status", preferred.rows[0]?.status, "Falta de Utilidades");
check("camelCase mapeou groupPortal", preferred.rows[0]?.groupPortal, "Indústria Mármore");

const raw = readPcFactorySheet(buffer, "ag-grid");
check("aba ag-grid forçada", raw.sheetUsed, "ag-grid");
check("ag-grid mapeou Apelido Recurso", raw.rows[0]?.resourceName, "Bifio 01 - Bidese");
check("ag-grid mapeou Nome Status Recurso", raw.rows[0]?.status, "Manutenção Automação");
check("ag-grid mapeou Tempo Decorrido [hr]", raw.rows[0]?.elapsedDayFraction, 0.347);
check("ag-grid mapeou Causa Raiz", raw.rows[0]?.rootCause, "Falha CLP");

console.log(failures === 0 ? "\n✅ TODOS OS CHECKS PASSARAM" : `\n❌ ${failures} CHECK(S) FALHARAM`);
process.exit(failures === 0 ? 0 : 1);
