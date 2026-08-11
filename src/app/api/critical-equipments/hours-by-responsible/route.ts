import { NextResponse, type NextRequest } from "next/server";
import { getEquipmentHoursByResponsible } from "@/services/critical-equipments.service";
import {
  PLANNING_ACTIVITY_ORDER,
  PLANNING_GROUP_ORDER,
  parseOrderClassFilter,
  type PlanningActivityTypeKey,
  type PlanningGroupKey
} from "@/utils/service-order-planning";
import type { ServiceOrderStatusLabel } from "@/types/service-orders";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const id = params.get("id");

  if (!id) {
    return NextResponse.json({ error: "Parâmetro 'id' é obrigatório." }, { status: 400 });
  }

  try {
    const data = await getEquipmentHoursByResponsible(id, {
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
    });

    if (!data) {
      return NextResponse.json({ error: "Equipamento não encontrado no período." }, { status: 404 });
    }

    return NextResponse.json(data);
  } catch (error) {
    console.error("Falha ao carregar horas por responsável.", error);
    return NextResponse.json({ error: "Falha ao carregar horas por responsável." }, { status: 500 });
  }
}
