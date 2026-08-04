"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import dynamic from "next/dynamic";
import { usePathname, useRouter } from "next/navigation";
import { toast } from "sonner";
import { Activity, Factory, Info, RefreshCw, Upload, X } from "lucide-react";
import { ChartSkeleton } from "@/components/ChartSkeleton";
import { PcFactoryAvailabilityExplainer } from "@/components/pc-factory/PcFactoryAvailabilityExplainer";
import { PcFactoryKpiCards } from "@/components/pc-factory/PcFactoryKpiCards";
import { PcFactoryFilters } from "@/components/pc-factory/PcFactoryFilters";
import { PcFactoryEmptyState } from "@/components/pc-factory/PcFactoryEmptyState";
import { PcFactoryRecordsTable } from "@/components/pc-factory/PcFactoryRecordsTable";
import { PcFactoryReliabilityTable } from "@/components/pc-factory/PcFactoryReliabilityTable";
import { PcFactoryDetailsDrawer } from "@/components/pc-factory/PcFactoryDetailsDrawer";
import { PcFactoryImportModal } from "@/components/pc-factory/PcFactoryImportModal";
import { PcFactoryQualityPanel } from "@/components/pc-factory/PcFactoryQualityPanel";
import { usePortalDataRefresh } from "@/hooks/usePortalDataRefresh";
import { PC_FACTORY_CATEGORY_LABELS } from "@/utils/pc-factory-normalizer";
import type { PcFactoryPageData, PcFactoryResourceDetails, PcFactoryStatusCategory } from "@/types/pc-factory";

const PcFactoryStatusChart = dynamic(() => import("@/components/pc-factory/PcFactoryStatusChart").then((m) => m.PcFactoryStatusChart), {
  ssr: false,
  loading: () => <ChartSkeleton className="xl:col-span-5" />
});
const PcFactoryMaintenanceSplitChart = dynamic(
  () => import("@/components/pc-factory/PcFactoryMaintenanceSplitChart").then((m) => m.PcFactoryMaintenanceSplitChart),
  { ssr: false, loading: () => <ChartSkeleton className="xl:col-span-7" /> }
);
const PcFactoryCriticalMachinesStackedChart = dynamic(
  () =>
    import("@/components/pc-factory/PcFactoryCriticalMachinesStackedChart").then((m) => m.PcFactoryCriticalMachinesStackedChart),
  { ssr: false, loading: () => <ChartSkeleton className="xl:col-span-6" /> }
);
const PcFactoryCompositionChart = dynamic(
  () => import("@/components/pc-factory/PcFactoryCompositionChart").then((m) => m.PcFactoryCompositionChart),
  { ssr: false, loading: () => <ChartSkeleton className="xl:col-span-6" /> }
);
const PcFactoryTrendChart = dynamic(() => import("@/components/pc-factory/PcFactoryTrendChart").then((m) => m.PcFactoryTrendChart), {
  ssr: false,
  loading: () => <ChartSkeleton className="xl:col-span-12" />
});

export type AppliedPcFactoryFilters = {
  startDate: string;
  endDate: string;
  resources: string[];
  productionLines: string[];
  groupPortals: string[];
  sectors: string[];
  shifts: string[];
  statusNames: string[];
  categories: string[];
  onlyMaintenance: boolean;
  onlyMechanical: boolean;
  onlyElectrical: boolean;
  onlyAutomation: boolean;
  onlyWaiting: boolean;
  excludeOutOfPlanned: boolean;
  search: string;
};

type PcFactoryPageProps = {
  data: PcFactoryPageData;
  appliedFilters: AppliedPcFactoryFilters;
};

export function PcFactoryPage({ data, appliedFilters }: PcFactoryPageProps) {
  const router = useRouter();
  const pathname = usePathname();
  const [isPending, startTransition] = useTransition();
  const { refresh: refreshPortalData, isRefreshing } = usePortalDataRefresh();
  const [draft, setDraft] = useState<AppliedPcFactoryFilters>(appliedFilters);

  const [selectedResource, setSelectedResource] = useState<string | null>(null);
  const [details, setDetails] = useState<PcFactoryResourceDetails | null>(null);
  const [detailsLoading, setDetailsLoading] = useState(false);
  const [detailsError, setDetailsError] = useState<string | null>(null);
  const requestRef = useRef(0);
  const [importOpen, setImportOpen] = useState(false);

  const appliedSignature = JSON.stringify(appliedFilters);
  useEffect(() => {
    setDraft(appliedFilters);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [appliedSignature]);

  function navigate(filters: AppliedPcFactoryFilters) {
    const params = filtersToParams(filters);
    const query = params.toString();
    startTransition(() => router.push(query ? `${pathname}?${query}` : pathname));
  }

  function updateDraft<Key extends keyof AppliedPcFactoryFilters>(key: Key, value: AppliedPcFactoryFilters[Key]) {
    setDraft((current) => ({ ...current, [key]: value }));
  }

  function applyFilters() {
    navigate(draft);
    toast.success("Filtros aplicados");
  }

  function clearFilters() {
    startTransition(() => router.push(pathname));
    toast("Filtros limpos");
  }

  function fetchDetails(resource: string) {
    const requestId = requestRef.current + 1;
    requestRef.current = requestId;
    setDetailsLoading(true);
    setDetailsError(null);

    fetch(`/api/pc-factory/details?resource=${encodeURIComponent(resource)}`)
      .then(async (response) => {
        if (!response.ok) throw new Error("request failed");
        return (await response.json()) as PcFactoryResourceDetails;
      })
      .then((payload) => {
        if (requestRef.current === requestId) setDetails(payload);
      })
      .catch(() => {
        if (requestRef.current === requestId) {
          setDetailsError("Não foi possível carregar os detalhes deste recurso.");
          toast.error("Não foi possível carregar os detalhes deste recurso.");
        }
      })
      .finally(() => {
        if (requestRef.current === requestId) setDetailsLoading(false);
      });
  }

  function openDetails(resource: string) {
    setSelectedResource(resource);
    setDetails(null);
    fetchDetails(resource);
  }

  function closeDetails() {
    requestRef.current += 1;
    setSelectedResource(null);
  }

  const activeChips = useMemo(() => buildChips(appliedFilters), [appliedFilters]);
  const isEmpty = data.source === "empty";

  return (
    <section className={`space-y-4 text-champagne transition ${isPending || isRefreshing ? "opacity-70" : ""}`}>
      {/* Hero */}
      <header className="relative overflow-hidden rounded-lg border border-gold/20 bg-[#070808] p-5 shadow-premium sm:p-6">
        <div className="login-marble-bg absolute inset-0 opacity-80" />
        <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(0,0,0,0.78),rgba(0,0,0,0.44)),radial-gradient(circle_at_88%_8%,rgba(196,154,69,0.15),transparent_22rem)]" />
        <div className="relative z-10">
          <div className="mb-3 flex flex-wrap items-center gap-3 text-gold">
            <Factory className="h-5 w-5" />
            <span className="rounded-md border border-gold/40 bg-gold/10 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.24em] text-champagne/80">
              Indicadores de produção e manutenção
            </span>
          </div>
          <h1 className="font-serif text-3xl leading-tight text-white sm:text-4xl">PC-Factory</h1>
          <p className="mt-2 max-w-3xl text-sm leading-relaxed text-zinc-300 sm:text-base">
            Monitore linhas de produção, máquinas, status operacionais, disponibilidade e impactos para a manutenção.
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-zinc-400">
            <span className="flex items-center gap-1.5">
              <Info className="h-3.5 w-3.5 text-gold" />
              Manutenção = grupo “Manutenção” do PC-Factory (Mecânica, Elétrica, Automação, Planejada, Terceiros e Aguardando). Base: Tempo Decorrido.
            </span>
            <span className="flex items-center gap-1.5">
              <Activity className="h-3.5 w-3.5 text-gold" />
              Período: <strong className="font-semibold text-champagne">{data.reference.label}</strong>
            </span>
          </div>
        </div>
      </header>

      {/* Ações */}
      <div className="flex flex-wrap items-center gap-2">
        <ActionButton onClick={() => setImportOpen(true)} primary>
          <Upload className="h-4 w-4" /> Importar Excel
        </ActionButton>
        <ActionButton onClick={() => refreshPortalData({ toastMessage: "Dados atualizados" })}>
          <RefreshCw className="h-4 w-4" /> Atualizar dados
        </ActionButton>
        <ActionButton onClick={clearFilters}>Limpar filtros</ActionButton>
      </div>

      <PcFactoryFilters
        draft={draft}
        options={data.filterOptions}
        isPending={isPending || isRefreshing}
        onChange={updateDraft}
        onApply={applyFilters}
        onClear={clearFilters}
      />

      {activeChips.length > 0 ? (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">Filtros ativos:</span>
          {activeChips.map((chip) => (
            <span key={chip.key} className="inline-flex items-center gap-1.5 rounded-full border border-gold/30 bg-gold/10 px-3 py-1 text-[11px] font-semibold text-champagne">
              {chip.label}
              <button type="button" onClick={() => navigate(removeChip(chip, appliedFilters))} aria-label={`Remover ${chip.label}`}>
                <X className="h-3 w-3 text-gold transition hover:text-white" />
              </button>
            </span>
          ))}
          <span className="text-[11px] text-zinc-500">· {data.records.total.toLocaleString("pt-BR")} registros</span>
        </div>
      ) : null}

      {isEmpty ? (
        <PcFactoryEmptyState onImport={() => setImportOpen(true)} />
      ) : (
        <>
          <PcFactoryKpiCards kpis={data.kpis} />

          <PcFactoryAvailabilityExplainer kpis={data.kpis} />

          <PcFactoryQualityPanel quality={data.dataQuality} />

          <p className="text-[11px] text-zinc-500">
            <span className="font-semibold text-gold">Dica:</span> clique em uma máquina nos gráficos ou na tabela para ver
            disponibilidade, MTTR, manutenção mecânica/elétrica/aguardando e recomendações.
          </p>

          <section className="grid grid-cols-1 gap-3 xl:grid-cols-12">
            <PcFactoryStatusChart className="xl:col-span-5" slices={data.statusDistribution} />
            <PcFactoryMaintenanceSplitChart className="xl:col-span-7" split={data.maintenanceSplit} />

            <PcFactoryReliabilityTable className="xl:col-span-12" rows={data.reliabilityByMachine} onSelect={openDetails} />

            <PcFactoryCriticalMachinesStackedChart
              className="xl:col-span-6"
              rows={data.criticalResources}
              onSelect={openDetails}
            />
            <PcFactoryCompositionChart className="xl:col-span-6" rows={data.productionLines} />

            <PcFactoryTrendChart
              className="xl:col-span-12"
              points={data.trend}
              selectedMachine={appliedFilters.resources.length === 1 ? appliedFilters.resources[0] : null}
            />
          </section>

          <PcFactoryRecordsTable initial={data.records} filters={toTableFilters(appliedFilters)} onSelectResource={openDetails} />
        </>
      )}

      <PcFactoryDetailsDrawer open={selectedResource !== null} loading={detailsLoading} error={detailsError} details={details} onClose={closeDetails} />
      <PcFactoryImportModal open={importOpen} onClose={() => setImportOpen(false)} onImported={() => refreshPortalData({ toastMessage: null })} />
    </section>
  );
}

function ActionButton({ children, onClick, primary = false }: { children: React.ReactNode; onClick: () => void; primary?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        primary
          ? "inline-flex h-10 items-center gap-2 rounded-lg border border-gold/55 bg-gold/15 px-4 text-sm font-bold text-gold transition hover:bg-gold/25"
          : "inline-flex h-10 items-center gap-2 rounded-lg border border-gold/20 px-4 text-sm font-semibold text-zinc-300 transition hover:border-gold/40 hover:text-white"
      }
    >
      {children}
    </button>
  );
}

function toTableFilters(filters: AppliedPcFactoryFilters) {
  return {
    startDate: filters.startDate,
    endDate: filters.endDate,
    resources: filters.resources,
    productionLines: filters.productionLines,
    groupPortals: filters.groupPortals,
    sectors: filters.sectors,
    shifts: filters.shifts,
    statusNames: filters.statusNames,
    categories: filters.categories,
    onlyMaintenance: filters.onlyMaintenance,
    onlyMechanical: filters.onlyMechanical,
    onlyElectrical: filters.onlyElectrical,
    onlyAutomation: filters.onlyAutomation,
    onlyWaiting: filters.onlyWaiting,
    excludeOutOfPlanned: filters.excludeOutOfPlanned,
    search: filters.search
  };
}

/* ------------------------------------------------------------------ */
/* Chips de filtros ativos                                            */
/* ------------------------------------------------------------------ */

type Chip = { key: string; label: string; kind: keyof AppliedPcFactoryFilters; value?: string };

const TOGGLE_LABELS: Partial<Record<keyof AppliedPcFactoryFilters, string>> = {
  onlyMaintenance: "Somente manutenção",
  onlyMechanical: "Só mecânica",
  onlyElectrical: "Só elétrica",
  onlyAutomation: "Só automação",
  onlyWaiting: "Só aguardando",
  excludeOutOfPlanned: "Excluir fora do planejado"
};

function buildChips(filters: AppliedPcFactoryFilters): Chip[] {
  const chips: Chip[] = [];
  if (filters.startDate || filters.endDate) {
    chips.push({ key: "period", label: `Período: ${filters.startDate || "…"} → ${filters.endDate || "…"}`, kind: "startDate" });
  }
  filters.groupPortals.forEach((v) => chips.push({ key: `grp:${v}`, label: `Grupo: ${v}`, kind: "groupPortals", value: v }));
  filters.productionLines.forEach((v) => chips.push({ key: `line:${v}`, label: `Linha: ${v}`, kind: "productionLines", value: v }));
  filters.resources.forEach((v) => chips.push({ key: `res:${v}`, label: `Máquina: ${v}`, kind: "resources", value: v }));
  filters.statusNames.forEach((v) => chips.push({ key: `sn:${v}`, label: `Status: ${v}`, kind: "statusNames", value: v }));
  filters.categories.forEach((v) =>
    chips.push({ key: `cat:${v}`, label: `Classe: ${PC_FACTORY_CATEGORY_LABELS[v as PcFactoryStatusCategory] ?? v}`, kind: "categories", value: v })
  );
  filters.sectors.forEach((v) => chips.push({ key: `sec:${v}`, label: `Setor: ${v}`, kind: "sectors", value: v }));
  filters.shifts.forEach((v) => chips.push({ key: `sh:${v}`, label: `Turno: ${v}`, kind: "shifts", value: v }));
  (["onlyMaintenance", "onlyMechanical", "onlyElectrical", "onlyAutomation", "onlyWaiting", "excludeOutOfPlanned"] as const).forEach((key) => {
    if (filters[key]) chips.push({ key, label: TOGGLE_LABELS[key] ?? key, kind: key });
  });
  if (filters.search) chips.push({ key: "search", label: `Busca: ${filters.search}`, kind: "search" });
  return chips;
}

function removeChip(chip: Chip, applied: AppliedPcFactoryFilters): AppliedPcFactoryFilters {
  const next: AppliedPcFactoryFilters = {
    ...applied,
    resources: [...applied.resources],
    productionLines: [...applied.productionLines],
    groupPortals: [...applied.groupPortals],
    sectors: [...applied.sectors],
    shifts: [...applied.shifts],
    statusNames: [...applied.statusNames],
    categories: [...applied.categories]
  };
  if (chip.kind === "startDate") {
    next.startDate = "";
    next.endDate = "";
  } else if (chip.kind === "search") {
    next.search = "";
  } else if (
    chip.kind === "onlyMaintenance" ||
    chip.kind === "onlyMechanical" ||
    chip.kind === "onlyElectrical" ||
    chip.kind === "onlyAutomation" ||
    chip.kind === "onlyWaiting" ||
    chip.kind === "excludeOutOfPlanned"
  ) {
    next[chip.kind] = false;
  } else if (chip.value) {
    const list = next[chip.kind] as string[];
    next[chip.kind] = list.filter((value) => value !== chip.value) as never;
  }
  return next;
}

function filtersToParams(filters: AppliedPcFactoryFilters): URLSearchParams {
  const params = new URLSearchParams();
  if (filters.startDate) params.set("startDate", filters.startDate);
  if (filters.endDate) params.set("endDate", filters.endDate);
  filters.productionLines.forEach((v) => params.append("line", v));
  filters.groupPortals.forEach((v) => params.append("group", v));
  filters.resources.forEach((v) => params.append("resource", v));
  filters.sectors.forEach((v) => params.append("sector", v));
  filters.shifts.forEach((v) => params.append("shift", v));
  filters.statusNames.forEach((v) => params.append("statusName", v));
  filters.categories.forEach((v) => params.append("category", v));
  if (filters.onlyMaintenance) params.set("onlyMaintenance", "1");
  if (filters.onlyMechanical) params.set("onlyMechanical", "1");
  if (filters.onlyElectrical) params.set("onlyElectrical", "1");
  if (filters.onlyAutomation) params.set("onlyAutomation", "1");
  if (filters.onlyWaiting) params.set("onlyWaiting", "1");
  if (filters.excludeOutOfPlanned) params.set("excludeOutOfPlanned", "1");
  if (filters.search) params.set("q", filters.search);
  return params;
}
