import { NextResponse, type NextRequest } from "next/server";
import { getTeamHours } from "@/services/team-hours.service";
import type { TeamHoursOsType } from "@/types/collaborators";
import { monthRange, toEndOfDay, toStartOfDay, type DateRange } from "@/utils/date-range";
import { requireApiSession } from "@/lib/auth-guard";

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

/** Valida o filtro de tipo de OS vindo da URL (default: todas). */
function resolveOsType(value: string | null): TeamHoursOsType {
  return value === "corrective" || value === "preventive" ? value : "all";
}

export async function GET(request: NextRequest) {
  // Defesa em profundidade: o middleware já bloqueia /api/* sem sessão, mas a
  // rota revalida por conta própria para não depender só do matcher.
  const { error } = await requireApiSession();
  if (error) return error;

  const sp = request.nextUrl.searchParams;
  const period = resolvePeriod(sp.get("startDate"), sp.get("endDate"));
  const osType = resolveOsType(sp.get("osType"));
  const result = await getTeamHours(period, osType);
  return NextResponse.json(result);
}
