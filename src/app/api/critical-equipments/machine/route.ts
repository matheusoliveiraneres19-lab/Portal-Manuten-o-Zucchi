import { NextResponse, type NextRequest } from "next/server";
import {
  getCriticalEquipmentMachineMonthDetail,
  getCriticalEquipmentMachineOptions,
  getCriticalEquipmentMachineYearAnalysis
} from "@/services/critical-equipment-machine.service";
import { parseCriticalEquipmentFilterParams } from "@/utils/critical-equipment-selection";
import { requireApiSession } from "@/lib/auth-guard";

export const dynamic = "force-dynamic";

/**
 * Análise POR MÁQUINA de Equipamentos Críticos — caminho independente da família.
 *
 *   ?view=options                                  todas as máquinas válidas da base
 *   ?view=year&machineId=<TAG>&year=2026           Jan → Dez da máquina + resumo anual
 *   ?view=month&machineId=<TAG>&month=2026-08      detalhe do mês, repartimentos e OS
 *   + os filtros de OS da página (status, grupo, grupoPlan, atividade, classe, ...)
 *
 * Família, Top N e período da página NÃO limitam nada aqui (ver o service). Sem dados
 * responde 404 — nunca dados de família ou gerais no lugar.
 */
export async function GET(request: NextRequest) {
  const { error } = await requireApiSession();
  if (error) return error;

  const params = request.nextUrl.searchParams;
  const view = params.get("view");
  const machineId = params.get("machineId")?.trim() ?? "";

  try {
    if (view === "options") {
      const options = await getCriticalEquipmentMachineOptions();
      return NextResponse.json({ options }, { headers: { "Cache-Control": "no-store" } });
    }

    const filters = parseCriticalEquipmentFilterParams(params);

    if (view === "year" && machineId) {
      const yearParam = Number(params.get("year"));
      const data = await getCriticalEquipmentMachineYearAnalysis(
        machineId,
        Number.isInteger(yearParam) && yearParam > 2000 ? yearParam : null,
        filters
      );
      return data
        ? NextResponse.json(data, { headers: { "Cache-Control": "no-store" } })
        : NextResponse.json({ error: "Sem ordens para este equipamento com os filtros atuais." }, { status: 404 });
    }

    const month = params.get("month") ?? "";
    if (view === "month" && machineId && /^\d{4}-\d{2}$/.test(month)) {
      const data = await getCriticalEquipmentMachineMonthDetail(machineId, month, filters);
      return data
        ? NextResponse.json(data, { headers: { "Cache-Control": "no-store" } })
        : NextResponse.json({ error: "Mês inválido." }, { status: 400 });
    }

    return NextResponse.json(
      { error: "Use view=options, view=year&machineId=… ou view=month&machineId=…&month=AAAA-MM." },
      { status: 400 }
    );
  } catch (caught) {
    console.error("Falha ao carregar a análise por máquina de equipamentos críticos.", caught);
    return NextResponse.json({ error: "Falha ao carregar a análise da máquina." }, { status: 500 });
  }
}
