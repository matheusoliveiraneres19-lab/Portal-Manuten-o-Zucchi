import { NextResponse, type NextRequest } from "next/server";
import { getCriticalEquipmentDashboardData } from "@/services/critical-equipments.service";
import {
  parseCriticalEquipmentFilterParams,
  parseCriticalEquipmentSelection
} from "@/utils/critical-equipment-selection";
import { requireApiSession } from "@/lib/auth-guard";

export const dynamic = "force-dynamic";

/**
 * Recorte da análise de Equipamentos Críticos (seleção família → mês → máquina →
 * repartimento sobre os filtros gerais da página).
 *
 *   ?family=Multifio&month=2026-08&machine=ZC-SR-G07-MF-0004&partition=<TAG>
 *   + os mesmos filtros da página (startDate, endDate, status, grupo, ...).
 *
 * Uma resposta alimenta TODOS os dashboards recortados (KPIs, ranking, horas,
 * status, grupo, corretivas x planejadas, tipo de atividade e drill-down) — uma
 * requisição por clique, não uma por gráfico.
 */
export async function GET(request: NextRequest) {
  const { error } = await requireApiSession();
  if (error) return error;

  const params = request.nextUrl.searchParams;
  try {
    const data = await getCriticalEquipmentDashboardData(
      parseCriticalEquipmentSelection(params),
      parseCriticalEquipmentFilterParams(params)
    );
    return NextResponse.json(data);
  } catch (error) {
    console.error("Falha ao carregar o recorte de equipamentos críticos.", error);
    return NextResponse.json({ error: "Falha ao carregar a análise." }, { status: 500 });
  }
}
