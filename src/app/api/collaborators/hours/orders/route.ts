import { NextResponse, type NextRequest } from "next/server";
import { getCollaboratorHoursOrders } from "@/services/team-hours.service";
import type { TeamHoursOsType } from "@/types/collaborators";
import { monthRange, toEndOfDay, toStartOfDay, type DateRange } from "@/utils/date-range";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Resolve o período a partir de start/end (yyyy-mm-dd); padrão = mês corrente. */
function resolvePeriod(startDate: string | null, endDate: string | null): DateRange {
  if (startDate && endDate) {
    return { startDate: toStartOfDay(startDate), endDate: toEndOfDay(endDate) };
  }
  const now = new Date();
  return monthRange(now.getUTCFullYear(), now.getUTCMonth() + 1);
}

function resolveOsType(value: string | null): TeamHoursOsType {
  return value === "corrective" || value === "preventive" ? value : "all";
}

/**
 * Drill-down: Ordens de Manutenção que compõem as horas de um colaborador no
 * período (mesma fonte/filtros da aba Equipe e Horas). Usado pelo modal de auditoria.
 */
export async function GET(request: NextRequest) {
  const sp = request.nextUrl.searchParams;
  const collaboratorId = sp.get("collaboratorId");
  if (!collaboratorId) {
    return NextResponse.json({ error: "collaboratorId é obrigatório." }, { status: 400 });
  }

  const period = resolvePeriod(sp.get("startDate"), sp.get("endDate"));
  const osType = resolveOsType(sp.get("osType"));
  const result = await getCollaboratorHoursOrders(collaboratorId, period, osType);

  if (!result) {
    return NextResponse.json({ error: "Colaborador não encontrado." }, { status: 404 });
  }

  return NextResponse.json(result);
}
