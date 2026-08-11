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
  // Grupo de planejamento — variações do SAP/Fiori (TAREFA 1).
  grupodeplanejamento: "planningGroup",
  grupoplanejamento: "planningGroup",
  grupoplanej: "planningGroup",
  grupodeplanej: "planningGroup",
  codigogrupoplanejamento: "planningGroupCode",
  codigodogrupodeplanejamento: "planningGroupCode",
  codgrupoplanejamento: "planningGroupCode",
  // Tipo de atividade de planejamento — variações do SAP/Fiori (TAREFA 1).
  planningactivitytype: "planningActivityType",
  tipodeatividadedemanutencao: "planningActivityType",
  tipoatividademanutencao: "planningActivityType",
  tipodeatividade: "planningActivityType",
  tipoatividade: "planningActivityType",
  atividadedeplanejamento: "planningActivityType",
  tipodeatividadedeplanejamento: "planningActivityType",
  // Tipo de manutenção / tipo de ordem.
  maintenancetype: "maintenanceType",
  tipomanutencao: "maintenanceType",
  tipodemanutencao: "maintenanceType",
  ordertype: "orderType",
  tipodeordem: "orderType",
  tipoordem: "orderType",
  openedat: "openedAt",
  closedat: "closedAt",
  dataconclusao: "closedAt",
  datafechamento: "closedAt",
  dataencerramento: "closedAt",
  fimreal: "closedAt",
  datafimreal: "closedAt",
  workedhours: "workedHours",
  operation: "operation",
  operationcode: "operationCode",
  source: "source",
  importbatch: "importBatch",
  dataqualityissue: "dataQualityIssue"
};

export const NORMALIZED_SERVICE_ORDER_SHEET = "Ordens_Normalizadas";

export function readNormalizedExcelRows(filePath: string, sheetName = NORMALIZED_SERVICE_ORDER_SHEET) {
  const workbook = XLSX.readFile(filePath, {
    cellDates: true
  });
  const worksheet = workbook.Sheets[sheetName];

  if (!worksheet) {
    throw new Error(`A aba "${sheetName}" não foi encontrada na planilha.`);
  }

  return readNormalizedWorksheet(worksheet);
}

/** Lê e mapeia as linhas de uma worksheet já no layout normalizado do portal. */
export function readNormalizedWorksheet(worksheet: XLSX.WorkSheet) {
  const rows = XLSX.utils.sheet_to_json<ExcelRow>(worksheet, {
    defval: "",
    raw: true
  });

  return rows.map(normalizeServiceOrderExcelRow);
}

/** True quando os cabeçalhos batem com o layout já normalizado (osNumber + operationCode). */
export function looksLikeNormalizedLayout(headers: string[]): boolean {
  const keys = new Set(headers.map((header) => normalizarNomeColuna(header).replace(/_/g, "")));
  return keys.has("osnumber") && keys.has("operationcode");
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
