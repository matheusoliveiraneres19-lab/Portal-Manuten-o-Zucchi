import { NextResponse, type NextRequest } from "next/server";
import { getCriticalEquipmentDetails } from "@/services/critical-equipments.service";
import type { ServiceOrderStatusLabel } from "@/types/service-orders";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
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
      areas: params.getAll("area"),
      onlyOpenOrders: params.get("abertas") === "1",
      onlyWithWorkedHours: params.get("horas") === "1"
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
