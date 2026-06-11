import { PcFactoryStatus } from "@prisma/client";
import { PcFactoryPage, type AppliedPcFactoryFilters } from "@/components/pc-factory/PcFactoryPage";
import { getPcFactoryPageData } from "@/services/pc-factory.service";

export const dynamic = "force-dynamic";

type SearchParams = Record<string, string | string[] | undefined>;

type PcFactoryRouteProps = {
  searchParams?: SearchParams;
};

export default async function PcFactoryRoute({ searchParams = {} }: PcFactoryRouteProps) {
  const startDate = firstParam(searchParams.startDate);
  const endDate = firstParam(searchParams.endDate);
  const productionLines = listParam(searchParams.line);
  const resources = listParam(searchParams.resource);
  const statuses = parseStatuses(listParam(searchParams.status));
  const sectors = listParam(searchParams.sector);
  const shifts = listParam(searchParams.shift);
  const search = firstParam(searchParams.q);

  const data = await getPcFactoryPageData({
    startDate,
    endDate,
    productionLines,
    resources,
    statuses,
    sectors,
    shifts,
    search
  });

  const appliedFilters: AppliedPcFactoryFilters = {
    startDate: startDate ?? "",
    endDate: endDate ?? "",
    productionLines,
    resources,
    statuses,
    sectors,
    shifts,
    search: search ?? ""
  };

  return <PcFactoryPage data={data} appliedFilters={appliedFilters} />;
}

function firstParam(value: string | string[] | undefined): string | undefined {
  const raw = Array.isArray(value) ? value[0] : value;
  return raw && raw.trim() ? raw.trim() : undefined;
}

function listParam(value: string | string[] | undefined): string[] {
  if (Array.isArray(value)) {
    return value.map((item) => item.trim()).filter(Boolean);
  }
  return value && value.trim() ? [value.trim()] : [];
}

function parseStatuses(values: string[]): PcFactoryStatus[] {
  return values.filter((value) => value in PcFactoryStatus) as PcFactoryStatus[];
}
