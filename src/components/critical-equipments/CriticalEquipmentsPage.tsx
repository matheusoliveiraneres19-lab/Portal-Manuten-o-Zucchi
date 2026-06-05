"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { usePathname, useRouter } from "next/navigation";
import { toast } from "sonner";
import { CalendarRange, ShieldAlert } from "lucide-react";
import { formatPeriodRange } from "@/utils/period";
import { CriticalEquipmentDetailsDrawer } from "@/components/critical-equipments/CriticalEquipmentDetailsDrawer";
import { EquipmentHoursByResponsibleModal } from "@/components/critical-equipments/EquipmentHoursByResponsibleModal";
import type { CriticalEquipmentDetails, EquipmentHoursByResponsible } from "@/types/critical-equipments";
import {
  ActiveFilterChips,
  type ActiveFilterChip
} from "@/components/service-orders/filters/ActiveFilterChips";
import { CriticalEquipmentKpiCards } from "@/components/critical-equipments/CriticalEquipmentKpiCards";
import { CriticalEquipmentFilters, AREA_LABELS } from "@/components/critical-equipments/CriticalEquipmentFilters";
import { CriticalEquipmentRankingChart } from "@/components/critical-equipments/CriticalEquipmentRankingChart";
import { CriticalEquipmentHoursChart } from "@/components/critical-equipments/CriticalEquipmentHoursChart";
import { CriticalEquipmentStatusChart } from "@/components/critical-equipments/CriticalEquipmentStatusChart";
import { CriticalEquipmentTrendChart } from "@/components/critical-equipments/CriticalEquipmentTrendChart";
import { CriticalEquipmentTable } from "@/components/critical-equipments/CriticalEquipmentTable";
import { CriticalEquipmentEmptyState } from "@/components/critical-equipments/CriticalEquipmentEmptyState";
import type { CriticalEquipmentsPageData } from "@/types/critical-equipments";
import type { ServiceOrderStatusLabel } from "@/types/service-orders";

export type AppliedCriticalEquipmentFilters = {
  startDate: string;
  endDate: string;
  statuses: ServiceOrderStatusLabel[];
  responsibleNames: string[];
  planningGroups: string[];
  areas: string[];
  onlyOpenOrders: boolean;
  onlyWithWorkedHours: boolean;
  limit: number;
};

type CriticalEquipmentsPageProps = {
  data: CriticalEquipmentsPageData;
  appliedFilters: AppliedCriticalEquipmentFilters;
};

export function CriticalEquipmentsPage({ data, appliedFilters }: CriticalEquipmentsPageProps) {
  const router = useRouter();
  const pathname = usePathname();
  const [isPending, startTransition] = useTransition();
  const [draft, setDraft] = useState<AppliedCriticalEquipmentFilters>(appliedFilters);

  // Drill-down: detalhes do equipamento selecionado (carregados via API, sem recarregar a página).
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [details, setDetails] = useState<CriticalEquipmentDetails | null>(null);
  const [detailsLoading, setDetailsLoading] = useState(false);
  const [detailsError, setDetailsError] = useState<string | null>(null);
  const requestRef = useRef(0);

  // Mini-modal de horas por responsável (gráfico "Esforço de manutenção").
  const [hoursOpen, setHoursOpen] = useState(false);
  const [hoursData, setHoursData] = useState<EquipmentHoursByResponsible | null>(null);
  const [hoursLoading, setHoursLoading] = useState(false);
  const [hoursError, setHoursError] = useState<string | null>(null);
  const hoursRequestRef = useRef(0);

  const appliedSignature = JSON.stringify(appliedFilters);

  useEffect(() => {
    setDraft(appliedFilters);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [appliedSignature]);

  function navigate(filters: AppliedCriticalEquipmentFilters) {
    const params = filtersToParams(filters);
    const query = params.toString();
    startTransition(() => router.push(query ? `${pathname}?${query}` : pathname));
  }

  function updateDraft<Key extends keyof AppliedCriticalEquipmentFilters>(
    key: Key,
    value: AppliedCriticalEquipmentFilters[Key]
  ) {
    setDraft((current) => ({ ...current, [key]: value }));
  }

  function applyFilters() {
    navigate(draft);
  }

  function clearFilters() {
    startTransition(() => router.push(pathname));
  }

  function openDetails(id: string) {
    const requestId = requestRef.current + 1;
    requestRef.current = requestId;
    setSelectedId(id);
    setDetails(null);
    setDetailsError(null);
    setDetailsLoading(true);

    const params = filtersToParams(appliedFilters);
    params.set("id", id);

    fetch(`/api/critical-equipments/details?${params.toString()}`)
      .then(async (response) => {
        if (!response.ok) {
          throw new Error("request failed");
        }
        return (await response.json()) as CriticalEquipmentDetails;
      })
      .then((data) => {
        if (requestRef.current === requestId) {
          setDetails(data);
        }
      })
      .catch(() => {
        if (requestRef.current === requestId) {
          setDetailsError("Não foi possível carregar os detalhes deste equipamento.");
          toast.error("Não foi possível carregar os detalhes deste equipamento no momento.");
        }
      })
      .finally(() => {
        if (requestRef.current === requestId) {
          setDetailsLoading(false);
        }
      });
  }

  function closeDetails() {
    requestRef.current += 1;
    setSelectedId(null);
  }

  function openHoursByResponsible(id: string) {
    const requestId = hoursRequestRef.current + 1;
    hoursRequestRef.current = requestId;
    setHoursOpen(true);
    setHoursData(null);
    setHoursError(null);
    setHoursLoading(true);

    const params = filtersToParams(appliedFilters);
    params.set("id", id);

    fetch(`/api/critical-equipments/hours-by-responsible?${params.toString()}`)
      .then(async (response) => {
        if (!response.ok) {
          throw new Error("request failed");
        }
        return (await response.json()) as EquipmentHoursByResponsible;
      })
      .then((data) => {
        if (hoursRequestRef.current === requestId) {
          setHoursData(data);
        }
      })
      .catch(() => {
        if (hoursRequestRef.current === requestId) {
          setHoursError("Não foi possível carregar as horas deste equipamento no momento.");
          toast.error("Não foi possível carregar as horas deste equipamento no momento.");
        }
      })
      .finally(() => {
        if (hoursRequestRef.current === requestId) {
          setHoursLoading(false);
        }
      });
  }

  function closeHours() {
    hoursRequestRef.current += 1;
    setHoursOpen(false);
  }

  const chips = useMemo(
    () => buildChips(appliedFilters, (next) => navigate(next)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [appliedSignature]
  );

  const isEmpty = data.source === "empty" || data.ranking.length === 0;

  return (
    <section className={`space-y-4 text-champagne transition ${isPending ? "opacity-70" : ""}`}>
      {/* Hero */}
      <header className="relative overflow-hidden rounded-lg border border-gold/20 bg-[#070808] p-5 shadow-premium sm:p-6">
        <div className="login-marble-bg absolute inset-0 opacity-80" />
        <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(0,0,0,0.78),rgba(0,0,0,0.44)),radial-gradient(circle_at_88%_8%,rgba(196,154,69,0.15),transparent_22rem)]" />
        <div className="relative z-10">
          <div className="mb-3 flex items-center gap-3 text-gold">
            <ShieldAlert className="h-5 w-5" />
            <span className="rounded-md border border-gold/40 bg-gold/10 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.24em] text-champagne/80">
              Análise por Ordens de Manutenção
            </span>
          </div>
          <h1 className="font-serif text-3xl leading-tight text-white sm:text-4xl">Equipamentos Críticos</h1>
          <p className="mt-2 max-w-3xl text-sm leading-relaxed text-zinc-300 sm:text-base">
            Identifique os ativos com maior volume de ordens, maior esforço de manutenção e maior risco operacional.
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-zinc-400">
            <span>
              Criticidade operacional calculada com base no volume de ordens, horas apontadas e ordens abertas no
              período selecionado.
            </span>
            <span className="flex items-center gap-1.5">
              <CalendarRange className="h-3.5 w-3.5 text-gold" />
              Período analisado:{" "}
              <strong className="font-semibold text-champagne">
                {formatPeriodRange(data.period.startDate, data.period.endDate)}
              </strong>
            </span>
          </div>
        </div>
      </header>

      {/* Filtros */}
      <CriticalEquipmentFilters
        draft={draft}
        options={data.filterOptions}
        isPending={isPending}
        onChange={updateDraft}
        onApply={applyFilters}
        onClear={clearFilters}
      />

      <ActiveFilterChips chips={chips} onClearAll={clearFilters} />

      {isEmpty ? (
        <CriticalEquipmentEmptyState />
      ) : (
        <>
          <CriticalEquipmentKpiCards summary={data.summary} />

          <p className="text-[11px] text-zinc-500">
            <span className="font-semibold text-gold">Dica:</span> clique em um equipamento nos gráficos ou na tabela
            para visualizar as ordens vinculadas.
          </p>

          <section className="grid grid-cols-1 gap-3 xl:grid-cols-12">
            <CriticalEquipmentRankingChart items={data.ranking} selectedId={selectedId} onSelect={openDetails} />
            <CriticalEquipmentHoursChart items={data.hours} onSelect={openHoursByResponsible} />
            <CriticalEquipmentTrendChart points={data.trend} />
            <CriticalEquipmentStatusChart slices={data.statusDistribution} />
          </section>

          <CriticalEquipmentTable items={data.ranking} onSelect={openDetails} />
        </>
      )}

      <CriticalEquipmentDetailsDrawer
        open={selectedId !== null}
        loading={detailsLoading}
        error={detailsError}
        details={details}
        onClose={closeDetails}
      />

      <EquipmentHoursByResponsibleModal
        open={hoursOpen}
        loading={hoursLoading}
        error={hoursError}
        data={hoursData}
        onClose={closeHours}
      />
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* URL <-> filtros                                                    */
/* ------------------------------------------------------------------ */

function filtersToParams(filters: AppliedCriticalEquipmentFilters): URLSearchParams {
  const params = new URLSearchParams();

  if (filters.startDate) params.set("startDate", filters.startDate);
  if (filters.endDate) params.set("endDate", filters.endDate);
  filters.statuses.forEach((status) => params.append("status", status));
  filters.planningGroups.forEach((group) => params.append("grupo", group));
  filters.responsibleNames.forEach((responsible) => params.append("responsavel", responsible));
  filters.areas.forEach((area) => params.append("area", area));
  if (filters.onlyOpenOrders) params.set("abertas", "1");
  if (filters.onlyWithWorkedHours) params.set("horas", "1");
  if (filters.limit && filters.limit !== 10) params.set("top", String(filters.limit));

  return params;
}

function buildChips(
  filters: AppliedCriticalEquipmentFilters,
  apply: (next: AppliedCriticalEquipmentFilters) => void
): ActiveFilterChip[] {
  const chips: ActiveFilterChip[] = [];

  if (filters.startDate && filters.endDate) {
    chips.push({
      id: "periodo",
      groupLabel: "Período",
      valueLabel: formatPeriodRange(filters.startDate, filters.endDate),
      onRemove: () => apply({ ...filters, startDate: "", endDate: "" })
    });
  }

  for (const status of filters.statuses) {
    chips.push({
      id: `status:${status}`,
      groupLabel: "Status",
      valueLabel: status,
      onRemove: () => apply({ ...filters, statuses: filters.statuses.filter((value) => value !== status) })
    });
  }

  for (const group of filters.planningGroups) {
    chips.push({
      id: `grupo:${group}`,
      groupLabel: "Grupo",
      valueLabel: group,
      onRemove: () => apply({ ...filters, planningGroups: filters.planningGroups.filter((value) => value !== group) })
    });
  }

  for (const responsible of filters.responsibleNames) {
    chips.push({
      id: `responsavel:${responsible}`,
      groupLabel: "Responsável",
      valueLabel: responsible,
      onRemove: () =>
        apply({ ...filters, responsibleNames: filters.responsibleNames.filter((value) => value !== responsible) })
    });
  }

  for (const area of filters.areas) {
    chips.push({
      id: `area:${area}`,
      groupLabel: "Área",
      valueLabel: AREA_LABELS[area] ?? area,
      onRemove: () => apply({ ...filters, areas: filters.areas.filter((value) => value !== area) })
    });
  }

  if (filters.onlyOpenOrders) {
    chips.push({
      id: "abertas",
      groupLabel: "Filtro",
      valueLabel: "Somente com OS abertas",
      onRemove: () => apply({ ...filters, onlyOpenOrders: false })
    });
  }

  if (filters.onlyWithWorkedHours) {
    chips.push({
      id: "horas",
      groupLabel: "Filtro",
      valueLabel: "Somente com horas apontadas",
      onRemove: () => apply({ ...filters, onlyWithWorkedHours: false })
    });
  }

  return chips;
}
