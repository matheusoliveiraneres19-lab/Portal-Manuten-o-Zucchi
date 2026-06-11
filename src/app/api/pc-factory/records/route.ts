import { NextResponse, type NextRequest } from "next/server";
import { PcFactoryStatus } from "@prisma/client";
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
      sectors: list(sp.getAll("sector")),
      shifts: list(sp.getAll("shift")),
      statuses: parseStatuses(sp.getAll("status")),
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

function parseStatuses(values: string[]): PcFactoryStatus[] | undefined {
  const cleaned = values.filter((value) => value in PcFactoryStatus) as PcFactoryStatus[];
  return cleaned.length ? cleaned : undefined;
}

function parseNumber(value: string | null): number | undefined {
  if (!value) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}
