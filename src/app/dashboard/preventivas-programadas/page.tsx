import { PreventivasProgramadasPage } from "@/components/preventivas/PreventivasProgramadasPage";
import { getPreventiveOrdersPageData } from "@/services/preventive-orders.service";
import type {
  PreventiveArea,
  PreventiveFilters,
  PreventiveManagementStatus,
  PreventiveType
} from "@/types/preventive-orders";

export const dynamic = "force-dynamic";

type SearchParams = Record<string, string | string[] | undefined>;

function firstParam(value: string | string[] | undefined): string {
  const raw = Array.isArray(value) ? value[0] : value;
  return raw?.trim() ?? "";
}

function isTrue(value: string | string[] | undefined): boolean {
  return firstParam(value) === "1";
}

export default async function PreventivasProgramadasRoute({
  searchParams = {}
}: {
  searchParams?: SearchParams;
}) {
  const startDate = firstParam(searchParams.startDate);
  const endDate = firstParam(searchParams.endDate);
  const type = firstParam(searchParams.type);
  const area = firstParam(searchParams.area);
  const statusSap = firstParam(searchParams.statusSap);
  const mgmt = firstParam(searchParams.mgmt);
  const resp = firstParam(searchParams.resp);
  const local = firstParam(searchParams.local);
  const equip = firstParam(searchParams.equip);
  const onlyNotDone = isTrue(searchParams.nd);
  const onlyClosedNoExec = isTrue(searchParams.cne);
  const onlyLate = isTrue(searchParams.late);

  const filters: PreventiveFilters = {
    startDate: startDate || undefined,
    endDate: endDate || undefined,
    type: type === "PL" || type === "PV" ? (type as PreventiveType) : undefined,
    area: area === "Lubrificação" || area === "Elétrica" ? (area as PreventiveArea) : undefined,
    statusSap: statusSap ? [statusSap] : undefined,
    managementStatus: mgmt ? [mgmt as PreventiveManagementStatus] : undefined,
    responsibles: resp ? [resp] : undefined,
    technicalObject: local || undefined,
    equipment: equip || undefined,
    onlyNotDone,
    onlyClosedNoExec,
    onlyLate
  };

  const data = await getPreventiveOrdersPageData(filters);

  return (
    <PreventivasProgramadasPage
      data={data}
      applied={{
        startDate,
        endDate,
        type,
        area,
        statusSap,
        mgmt,
        resp,
        local,
        equip,
        onlyNotDone,
        onlyClosedNoExec,
        onlyLate
      }}
    />
  );
}
