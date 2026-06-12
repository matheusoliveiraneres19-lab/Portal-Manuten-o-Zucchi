import { NextResponse, type NextRequest } from "next/server";
import { PcFactoryStatusCategory } from "@prisma/client";
import { getPcFactoryRecords } from "@/services/pc-factory.service";
import type { PcFactoryQueryParams } from "@/types/pc-factory";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  try {
    const sp = request.nextUrl.searchParams;
    const params: PcFactoryQueryParams = {
      startDate: optional(sp.get("startDate")),
      endDate: optional(sp.get("endDate")),
      resources: list(sp.getAll("resource")),
      productionLines: list(sp.getAll("line")),
      groupPortals: list(sp.getAll("group")),
      sectors: list(sp.getAll("sector")),
      shifts: list(sp.getAll("shift")),
      statusNames: list(sp.getAll("statusName")),
      categories: parseCategories(sp.getAll("category")),
      onlyMaintenance: sp.get("onlyMaintenance") === "1",
      onlyMechanical: sp.get("onlyMechanical") === "1",
      onlyElectrical: sp.get("onlyElectrical") === "1",
      onlyAutomation: sp.get("onlyAutomation") === "1",
      onlyWaiting: sp.get("onlyWaiting") === "1",
      excludeOutOfPlanned: sp.get("excludeOutOfPlanned") === "1",
      search: optional(sp.get("search")),
      page: parseNumber(sp.get("page")),
      pageSize: parseNumber(sp.get("pageSize"))
    };

    const result = await getPcFactoryRecords(params);
    return NextResponse.json(result);
  } catch (error) {
    console.error("Falha ao listar registros do PC-Factory.", error);
    return NextResponse.json({ error: "Falha ao listar registros." }, { status: 500 });
  }
}

function optional(value: string | null): string | undefined {
  return value && value.trim() ? value.trim() : undefined;
}

function list(values: string[]): string[] | undefined {
  const cleaned = values.map((value) => value.trim()).filter(Boolean);
  return cleaned.length ? cleaned : undefined;
}

function parseCategories(values: string[]): PcFactoryStatusCategory[] | undefined {
  const cleaned = values.filter((value) => value in PcFactoryStatusCategory) as PcFactoryStatusCategory[];
  return cleaned.length ? cleaned : undefined;
}

function parseNumber(value: string | null): number | undefined {
  if (!value) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}
