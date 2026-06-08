import { LubricantMovementCategory } from "@prisma/client";
import { LubricantsPage, type AppliedLubricantFilters } from "@/components/lubricants/LubricantsPage";
import { getLubricantsPageData } from "@/services/lubricants.service";

export const dynamic = "force-dynamic";

type SearchParams = Record<string, string | string[] | undefined>;

type LubricantsRouteProps = {
  searchParams?: SearchParams;
};

export default async function LubrificantesPage({ searchParams = {} }: LubricantsRouteProps) {
  const startDate = firstParam(searchParams.startDate);
  const endDate = firstParam(searchParams.endDate);
  const year = parseNumber(firstParam(searchParams.ano));
  const month = parseMonth(firstParam(searchParams.mes));
  const code = firstParam(searchParams.code);
  const category = parseCategory(firstParam(searchParams.tipo));
  const unit = firstParam(searchParams.unidade);
  const search = firstParam(searchParams.q);

  const data = await getLubricantsPageData({
    startDate,
    endDate,
    year,
    month,
    code,
    movementCategory: category,
    unit,
    search
  });

  // Reflete o período/ano efetivamente resolvido pelo service nos filtros da UI.
  const appliedFilters: AppliedLubricantFilters = {
    startDate: data.period.startDate,
    endDate: data.period.endDate,
    year: data.reference.year,
    month: data.reference.month,
    code: code ?? "",
    category: category ?? "",
    unit: unit ?? "",
    search: search ?? ""
  };

  return <LubricantsPage data={data} appliedFilters={appliedFilters} />;
}

function firstParam(value: string | string[] | undefined): string | undefined {
  const raw = Array.isArray(value) ? value[0] : value;
  return raw && raw.trim() ? raw.trim() : undefined;
}

function parseNumber(value?: string): number | undefined {
  if (!value) {
    return undefined;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function parseMonth(value?: string): number | undefined {
  const parsed = parseNumber(value);
  return parsed && parsed >= 1 && parsed <= 12 ? parsed : undefined;
}

function parseCategory(value?: string): LubricantMovementCategory | undefined {
  return value && value in LubricantMovementCategory ? (value as LubricantMovementCategory) : undefined;
}
