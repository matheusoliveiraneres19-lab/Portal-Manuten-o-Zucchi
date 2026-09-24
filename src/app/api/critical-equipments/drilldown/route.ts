import { NextResponse, type NextRequest } from "next/server";
import { getCriticalEquipmentFamilyDrilldown } from "@/services/critical-equipments.service";
import {
  PLANNING_ACTIVITY_ORDER,
  PLANNING_GROUP_ORDER,
  parseOrderClassFilter,
  type PlanningActivityTypeKey,
  type PlanningGroupKey
} from "@/utils/service-order-planning";
import type { ServiceOrderStatusLabel } from "@/types/service-orders";
import { requireApiSession } from "@/lib/auth-guard";

export const dynamic = "force-dynamic";

/**
 * Drill-down da "Evolução mensal de ordens por família".
 *
 *   ?family=Multifio&month=2026-08&machine=ZC-SR-G07-MF-0004&component=<TAG>
 *   + os mesmos filtros da página (startDate, endDate, status, grupo, ...).
 *
 * Devolve só o nível pedido — nunca a base inteira de OS.
 */
export async function GET(request: NextRequest) {
  const { error } = await requireApiSession();
  if (error) return error;

  const params = request.nextUrl.searchParams;
  const family = params.get("family")?.trim();

  if (!family) {
    return NextResponse.json({ error: "Parâmetro 'family' é obrigatório." }, { status: 400 });
  }

  try {
    const drilldown = await getCriticalEquipmentFamilyDrilldown(
      {
        family,
        month: params.get("month")?.trim() || null,
        machine: params.get("machine")?.trim() || null,
        component: params.get("component")?.trim() || null
      },
      {
        startDate: params.get("startDate") ?? undefined,
        endDate: params.get("endDate") ?? undefined,
        statuses: params.getAll("status") as ServiceOrderStatusLabel[],
        responsibleNames: params.getAll("responsavel"),
        planningGroups: params.getAll("grupo"),
        planningGroupKeys: params.getAll("grupoPlan").filter((value): value is PlanningGroupKey =>
          (PLANNING_GROUP_ORDER as string[]).includes(value)
        ),
        activityTypes: params.getAll("atividade").filter((value): value is PlanningActivityTypeKey =>
          (PLANNING_ACTIVITY_ORDER as string[]).includes(value)
        ),
        orderClass: parseOrderClassFilter(params.get("classe")),
        areas: params.getAll("area"),
        families: params.getAll("familia"),
        costCenters: params.getAll("cc"),
        sectors: params.getAll("setor"),
        onlyOpenOrders: params.get("abertas") === "1",
        onlyWithWorkedHours: params.get("horas") === "1",
        onlyRecurrent: params.get("reincidentes") === "1",
        onlyCritical: params.get("criticos") === "1"
      }
    );

    return NextResponse.json(drilldown);
  } catch (error) {
    console.error("Falha ao carregar drill-down da evolução por família.", error);
    return NextResponse.json({ error: "Falha ao carregar o detalhamento." }, { status: 500 });
  }
}
