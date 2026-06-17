import { NextResponse, type NextRequest } from "next/server";
import { getTeamHours } from "@/services/team-hours.service";
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

export async function GET(request: NextRequest) {
  const sp = request.nextUrl.searchParams;
  const period = resolvePeriod(sp.get("startDate"), sp.get("endDate"));
  const result = await getTeamHours(period);
  return NextResponse.json(result);
}
