import { NextResponse, type NextRequest } from "next/server";
import { getEquipmentHoursByResponsible } from "@/services/critical-equipments.service";
import {
  parseCriticalEquipmentFilterParams,
  parseCriticalEquipmentSelection
} from "@/utils/critical-equipment-selection";
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
    const data = await getEquipmentHoursByResponsible(
      id,
      parseCriticalEquipmentFilterParams(params),
      // Mesmo recorte da análise (família/mês/máquina/repartimento) que a página exibe.
      parseCriticalEquipmentSelection(params)
    );

    if (!data) {
      return NextResponse.json({ error: "Equipamento não encontrado no período." }, { status: 404 });
    }

    return NextResponse.json(data);
  } catch (error) {
    console.error("Falha ao carregar horas por responsável.", error);
    return NextResponse.json({ error: "Falha ao carregar horas por responsável." }, { status: 500 });
  }
}
