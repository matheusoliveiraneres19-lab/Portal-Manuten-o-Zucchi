import { CriticalEquipmentsPage, type AppliedCriticalEquipmentFilters } from "@/components/critical-equipments/CriticalEquipmentsPage";
import { getCriticalEquipmentsPageData } from "@/services/critical-equipments.service";
import type { ServiceOrderStatusLabel } from "@/types/service-orders";

export const dynamic = "force-dynamic";

type SearchParams = Record<string, string | string[] | undefined>;

type CriticalEquipmentsRouteProps = {
  searchParams?: SearchParams;
};

export default async function EquipamentosCriticosPage({ searchParams = {} }: CriticalEquipmentsRouteProps) {
  const params = parseParams(searchParams);
  const data = await getCriticalEquipmentsPageData({
    startDate: params.startDate || undefined,
    endDate: params.endDate || undefined,
    statuses: params.statuses,
    responsibleNames: params.responsibleNames,
    planningGroups: params.planningGroups,
    areas: params.areas,
    families: params.families,
    costCenters: params.costCenters,
    sectors: params.sectors,
    onlyOpenOrders: params.onlyOpenOrders,
    onlyWithWorkedHours: params.onlyWithWorkedHours,
    onlyRecurrent: params.onlyRecurrent,
    onlyCritical: params.onlyCritical,
    limit: params.limit
  });

  // Garante que o painel reflita o período efetivo (default resolvido no service).
  const appliedFilters: AppliedCriticalEquipmentFilters = {
    ...params,
    startDate: data.period.startDate,
    endDate: data.period.endDate
  };

  return <CriticalEquipmentsPage data={data} appliedFilters={appliedFilters} />;
}

function parseParams(searchParams: SearchParams): AppliedCriticalEquipmentFilters {
  return {
    startDate: firstParam(searchParams.startDate) ?? "",
    endDate: firstParam(searchParams.endDate) ?? "",
    statuses: toArray(searchParams.status) as ServiceOrderStatusLabel[],
    responsibleNames: toArray(searchParams.responsavel),
    planningGroups: toArray(searchParams.grupo),
    areas: toArray(searchParams.area),
    families: toArray(searchParams.familia),
    costCenters: toArray(searchParams.cc),
    sectors: toArray(searchParams.setor),
    onlyOpenOrders: firstParam(searchParams.abertas) === "1",
    onlyWithWorkedHours: firstParam(searchParams.horas) === "1",
    onlyRecurrent: firstParam(searchParams.reincidentes) === "1",
    onlyCritical: firstParam(searchParams.criticos) === "1",
    limit: parseLimit(firstParam(searchParams.top))
  };
}

function parseLimit(value?: string): number {
  const allowed = [5, 10, 20, 50];
  const parsed = Number(value);
  return allowed.includes(parsed) ? parsed : 10;
}

function firstParam(value: string | string[] | undefined): string | undefined {
  const raw = Array.isArray(value) ? value[0] : value;
  return raw && raw.trim() ? raw.trim() : undefined;
}

function toArray(value: string | string[] | undefined): string[] {
  if (Array.isArray(value)) {
    return value.map((item) => item.trim()).filter(Boolean);
  }
  return value && value.trim() ? [value.trim()] : [];
}
