import { NextResponse, type NextRequest } from "next/server";
import { LubricantMovementCategory } from "@prisma/client";
import { getLubricantMovements } from "@/services/lubricants.service";

export const dynamic = "force-dynamic";

function parseCategory(value: string | null): LubricantMovementCategory | undefined {
  if (value && value in LubricantMovementCategory) {
    return value as LubricantMovementCategory;
  }
  return undefined;
}

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;

  try {
    const result = await getLubricantMovements({
      startDate: params.get("startDate") ?? undefined,
      endDate: params.get("endDate") ?? undefined,
      code: params.get("code") ?? undefined,
      unit: params.get("unit") ?? undefined,
      search: params.get("search") ?? undefined,
      movementCategory: parseCategory(params.get("category")),
      page: numberParam(params.get("page")),
      pageSize: numberParam(params.get("pageSize"))
    });
    return NextResponse.json(result);
  } catch (error) {
    console.error("Falha ao carregar movimentações de lubrificantes.", error);
    return NextResponse.json({ error: "Falha ao carregar movimentações." }, { status: 500 });
  }
}

function numberParam(value: string | null): number | undefined {
  if (!value) {
    return undefined;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}
