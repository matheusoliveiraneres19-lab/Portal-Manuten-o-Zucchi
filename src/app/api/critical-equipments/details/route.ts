import { NextResponse, type NextRequest } from "next/server";
import { getCriticalEquipmentDetails } from "@/services/critical-equipments.service";
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

export async function GET(request: NextRequest) {
  // Defesa em profundidade: o middleware já bloqueia /api/* sem sessão, mas a
  // rota revalida por conta própria para não depender só do matcher.
  const { error } = await requireApiSession();
  if (error) return error;

  const params = request.nextUrl.searchParams;
  const id = params.get("id");

  if (!id) {
    return NextResponse.json({ error: "Parâmetro 'id' é obrigatório." }, { status: 400 });
  }

  try {
    const details = await getCriticalEquipmentDetails(id, {
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

    if (!details) {
      return NextResponse.json({ error: "Equipamento não encontrado no período." }, { status: 404 });
    }

    return NextResponse.json(details);
  } catch (error) {
    console.error("Falha ao carregar detalhes do equipamento crítico.", error);
    return NextResponse.json({ error: "Falha ao carregar detalhes." }, { status: 500 });
  }
}
