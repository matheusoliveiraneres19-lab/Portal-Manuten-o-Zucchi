import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getPreventiveOrders } from "@/services/preventive-orders.service";
import type {
  PreventiveArea,
  PreventiveFilters,
  PreventiveManagementStatus,
  PreventiveOrderRow,
  PreventiveType
} from "@/types/preventive-orders";
import { requireApiSession } from "@/lib/auth-guard";

export const dynamic = "force-dynamic";

// Motivo do alerta gerencial (mesma lógica do drawer de detalhe).
function alertReason(row: PreventiveOrderRow): string {
  switch (row.managementStatus) {
    case "Fechada sem execução":
      return "OS encerrada no SAP com trabalho real ≤ 0,1 h.";
    case "Aberta sem execução":
      return row.daysOpen !== null ? `Aberta há ${row.daysOpen} dia(s) sem execução.` : "Aberta sem execução.";
    case "Atrasada":
      return "OS vencida e ainda não concluída.";
    case "Cancelada":
      return "OS cancelada no SAP.";
    default:
      return "—";
  }
}

const HEADERS = [
  "Tipo",
  "Área",
  "Nº OS",
  "Título",
  "Local de instalação",
  "Equipamento",
  "Responsável",
  "Status SAP",
  "Status Gerencial",
  "Execução",
  "Trabalho Real (h)",
  "Data início",
  "Dias em aberto",
  "Motivo do alerta"
];

function formatDate(iso: string | null): string {
  if (!iso) return "";
  const date = new Date(iso);
  return new Intl.DateTimeFormat("pt-BR", { timeZone: "UTC" }).format(date);
}

// Escapa um valor para CSV com separador ";" (padrão Excel pt-BR).
function csvCell(value: string | number | null): string {
  const text = String(value ?? "");
  if (/[";\n]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

function firstParam(value: string | null): string {
  return value?.trim() ?? "";
}

export async function GET(request: NextRequest) {
  // Defesa em profundidade: o middleware já bloqueia /api/* sem sessão, mas a
  // rota revalida por conta própria para não depender só do matcher.
  const { error } = await requireApiSession();
  if (error) return error;

  const sp = request.nextUrl.searchParams;
  const type = firstParam(sp.get("type"));
  const area = firstParam(sp.get("area"));
  const statusSap = firstParam(sp.get("statusSap"));
  const mgmt = firstParam(sp.get("mgmt"));
  const resp = firstParam(sp.get("resp"));

  const filters: PreventiveFilters = {
    startDate: firstParam(sp.get("startDate")) || undefined,
    endDate: firstParam(sp.get("endDate")) || undefined,
    type: type === "PL" || type === "PV" ? (type as PreventiveType) : undefined,
    area: area === "Lubrificação" || area === "Elétrica" ? (area as PreventiveArea) : undefined,
    statusSap: statusSap ? [statusSap] : undefined,
    managementStatus: mgmt ? [mgmt as PreventiveManagementStatus] : undefined,
    responsibles: resp ? [resp] : undefined,
    technicalObject: firstParam(sp.get("local")) || undefined,
    equipment: firstParam(sp.get("equip")) || undefined,
    onlyNotDone: sp.get("nd") === "1",
    onlyClosedNoExec: sp.get("cne") === "1",
    onlyLate: sp.get("late") === "1"
  };

  const rows = await getPreventiveOrders(filters);

  const lines = [HEADERS.join(";")];
  for (const row of rows) {
    lines.push(
      [
        row.type,
        row.area,
        row.osNumber,
        row.title,
        row.technicalObject ?? "",
        row.equipmentName ?? "",
        row.responsibleName ?? "",
        row.statusSapLabel,
        row.managementStatus,
        row.executionStatus,
        row.workedHours.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 }),
        formatDate(row.openedAt),
        row.daysOpen ?? "",
        alertReason(row)
      ]
        .map(csvCell)
        .join(";")
    );
  }

  // BOM UTF-8 para o Excel abrir os acentos corretamente.
  const csv = `﻿${lines.join("\r\n")}`;
  const stamp = new Date().toISOString().slice(0, 10);

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="preventivas-programadas-${stamp}.csv"`
    }
  });
}
