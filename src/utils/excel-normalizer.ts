import * as XLSX from "xlsx";
import { normalizarNomeColuna } from "@/utils/importacao";

type ExcelRow = Record<string, unknown>;

const normalizedServiceOrderColumns: Record<string, string> = {
  osnumber: "osNumber",
  title: "title",
  description: "description",
  statusportal: "statusPortal",
  statussap: "statusSAP",
  type: "type",
  area: "area",
  priority: "priority",
  responsiblename: "responsibleName",
  responsibleid: "responsibleId",
  equipmentcode: "equipmentCode",
  equipmentname: "equipmentName",
  technicalobject: "technicalObject",
  planninggroup: "planningGroup",
  planninggroupcode: "planningGroupCode",
  openedat: "openedAt",
  workedhours: "workedHours",
  operation: "operation",
  operationcode: "operationCode",
  source: "source",
  importbatch: "importBatch",
  dataqualityissue: "dataQualityIssue"
};

export function readNormalizedExcelRows(filePath: string, sheetName = "Ordens_Normalizadas") {
  const workbook = XLSX.readFile(filePath, {
    cellDates: true
  });
  const worksheet = workbook.Sheets[sheetName];

  if (!worksheet) {
    throw new Error(`A aba "${sheetName}" não foi encontrada na planilha.`);
  }

  const rows = XLSX.utils.sheet_to_json<ExcelRow>(worksheet, {
    defval: "",
    raw: true
  });

  return rows.map(normalizeServiceOrderExcelRow);
}

function normalizeServiceOrderExcelRow(row: ExcelRow) {
  const normalized: ExcelRow = {};

  for (const key of Object.keys(row)) {
    const normalizedKey = normalizarNomeColuna(key).replace(/_/g, "");
    const targetKey = normalizedServiceOrderColumns[normalizedKey] ?? key;
    normalized[targetKey] = row[key];
  }

  return normalized;
}
