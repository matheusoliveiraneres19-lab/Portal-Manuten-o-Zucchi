import { PcFactoryStatusCategory } from "@prisma/client";
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
  const groupPortals = listParam(searchParams.group);
  const resources = listParam(searchParams.resource);
  const sectors = listParam(searchParams.sector);
  const shifts = listParam(searchParams.shift);
  const statusNames = listParam(searchParams.statusName);
  const categories = parseCategories(listParam(searchParams.category));
  const onlyMaintenance = isTrue(searchParams.onlyMaintenance);
  const onlyMechanical = isTrue(searchParams.onlyMechanical);
  const onlyElectrical = isTrue(searchParams.onlyElectrical);
  const onlyAutomation = isTrue(searchParams.onlyAutomation);
  const onlyWaiting = isTrue(searchParams.onlyWaiting);
  const excludeOutOfPlanned = isTrue(searchParams.excludeOutOfPlanned);
  const search = firstParam(searchParams.q);

  const data = await getPcFactoryPageData({
    startDate,
    endDate,
    productionLines,
    groupPortals,
    resources,
    sectors,
    shifts,
    statusNames,
    categories,
    onlyMaintenance,
    onlyMechanical,
    onlyElectrical,
    onlyAutomation,
    onlyWaiting,
    excludeOutOfPlanned,
    search
  });

  const appliedFilters: AppliedPcFactoryFilters = {
    startDate: startDate ?? "",
    endDate: endDate ?? "",
    productionLines,
    groupPortals,
    resources,
    sectors,
    shifts,
    statusNames,
    categories,
    onlyMaintenance,
    onlyMechanical,
    onlyElectrical,
    onlyAutomation,
    onlyWaiting,
    excludeOutOfPlanned,
    search: search ?? ""
  };

  return <PcFactoryPage data={data} appliedFilters={appliedFilters} />;
}

function firstParam(value: string | string[] | undefined): string | undefined {
  const raw = Array.isArray(value) ? value[0] : value;
  return raw && raw.trim() ? raw.trim() : undefined;
}

function listParam(value: string | string[] | undefined): string[] {
  if (Array.isArray(value)) return value.map((item) => item.trim()).filter(Boolean);
  return value && value.trim() ? [value.trim()] : [];
}

function parseCategories(values: string[]): PcFactoryStatusCategory[] {
  return values.filter((value) => value in PcFactoryStatusCategory) as PcFactoryStatusCategory[];
}

function isTrue(value: string | string[] | undefined): boolean {
  return firstParam(value) === "1";
}
