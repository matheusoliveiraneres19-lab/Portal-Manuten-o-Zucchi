"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import dynamic from "next/dynamic";
import { usePathname, useRouter } from "next/navigation";
import { toast } from "sonner";
import { Activity, Factory, Info, RefreshCw, Upload, X } from "lucide-react";
import { ChartSkeleton } from "@/components/ChartSkeleton";
import { PcFactoryKpiCards } from "@/components/pc-factory/PcFactoryKpiCards";
import { PcFactoryFilters } from "@/components/pc-factory/PcFactoryFilters";
import { PcFactoryEmptyState } from "@/components/pc-factory/PcFactoryEmptyState";
import { PcFactoryRecordsTable } from "@/components/pc-factory/PcFactoryRecordsTable";
import { PcFactoryDetailsDrawer } from "@/components/pc-factory/PcFactoryDetailsDrawer";
import { PcFactoryImportModal } from "@/components/pc-factory/PcFactoryImportModal";
import { usePortalDataRefresh } from "@/hooks/usePortalDataRefresh";
import { PC_FACTORY_STATUS_LABELS } from "@/utils/pc-factory-normalizer";
import type { PcFactoryPageData, PcFactoryResourceDetails, PcFactoryStatus } from "@/types/pc-factory";

const PcFactoryStatusChart = dynamic(
  () => import("@/components/pc-factory/PcFactoryStatusChart").then((m) => m.PcFactoryStatusChart),
  { ssr: false, loading: () => <ChartSkeleton className="xl:col-span-5" /> }
);
const PcFactoryRankingChart = dynamic(
  () => import("@/components/pc-factory/PcFactoryRankingChart").then((m) => m.PcFactoryRankingChart),
  { ssr: false, loading: () => <ChartSkeleton className="xl:col-span-7" /> }
);
const PcFactoryLineSummaryChart = dynamic(
  () => import("@/components/pc-factory/PcFactoryLineSummaryChart").then((m) => m.PcFactoryLineSummaryChart),
  { ssr: false, loading: () => <ChartSkeleton className="xl:col-span-6" /> }
);
const PcFactoryTrendChart = dynamic(
  () => import("@/components/pc-factory/PcFactoryTrendChart").then((m) => m.PcFactoryTrendChart),
  { ssr: false, loading: () => <ChartSkeleton className="xl:col-span-12" /> }
);

export type AppliedPcFactoryFilters = {
  startDate: string;
  endDate: string;
  resources: string[];
  productionLines: string[];
  statuses: string[];
  sectors: string[];
  shifts: string[];
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
              MTBF, MTTR e MTTF dependem da qualidade dos registros de parada/manutenção importados.
            </span>
            <span className="flex items-center gap-1.5">
              <Activity className="h-3.5 w-3.5 text-gold" />
              Período: <strong className="font-semibold text-champagne">{data.reference.label}</strong>
            </span>
          </div>
        </div>
      </header>

      {/* Barra de ações */}
      <div className="flex flex-wrap items-center gap-2">
        <ActionButton onClick={() => setImportOpen(true)} primary>
          <Upload className="h-4 w-4" /> Importar Excel
        </ActionButton>
        <ActionButton onClick={() => refreshPortalData({ toastMessage: "Dados atualizados" })}>
          <RefreshCw className="h-4 w-4" /> Atualizar dados
        </ActionButton>
        <ActionButton onClick={clearFilters}>Limpar filtros</ActionButton>
      </div>

      {/* Filtros */}
      <PcFactoryFilters
        draft={draft}
        options={data.filterOptions}
        isPending={isPending || isRefreshing}
        onChange={updateDraft}
        onApply={applyFilters}
        onClear={clearFilters}
      />

      {/* Chips de filtros ativos */}
      {activeChips.length > 0 ? (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">Filtros ativos:</span>
          {activeChips.map((chip) => (
            <span
              key={chip.key}
              className="inline-flex items-center gap-1.5 rounded-full border border-gold/30 bg-gold/10 px-3 py-1 text-[11px] font-semibold text-champagne"
            >
              {chip.label}
              <button type="button" onClick={() => removeChip(chip, draft, navigate)} aria-label={`Remover ${chip.label}`}>
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

          <p className="text-[11px] text-zinc-500">
            <span className="font-semibold text-gold">Dica:</span> clique em uma máquina nos gráficos ou na tabela para
            ver disponibilidade, MTBF/MTTR, status e recomendações.
          </p>

          <section className="grid grid-cols-1 gap-3 xl:grid-cols-12">
            <PcFactoryStatusChart className="xl:col-span-5" slices={data.statusDistribution} />
            <PcFactoryRankingChart
              className="xl:col-span-7"
              title="Ranking de máquinas por tempo parado"
              subtitle="Top 10 recursos com maior tempo de parada no período."
              rows={data.topStopped}
              metric="stoppedHours"
              color="#a6192e"
              emptyDescription="Sem horas paradas no período."
              onSelect={openDetails}
            />
            <PcFactoryRankingChart
              className="xl:col-span-6"
              title="Ranking de máquinas por tempo em manutenção"
              subtitle="Top 10 recursos com maior tempo de manutenção."
              rows={data.topMaintenance}
              metric="maintenanceHours"
              color="#c49a45"
              emptyDescription="Sem horas de manutenção no período."
              onSelect={openDetails}
            />
            <PcFactoryRankingChart
              className="xl:col-span-6"
              title="Utilização por máquina"
              subtitle="Top 10 recursos por utilização produtiva (%)."
              rows={data.resourceRanking}
              metric="utilizationPercent"
              color="#3f8f6b"
              emptyDescription="Sem utilização calculável no período."
              onSelect={openDetails}
            />
            <PcFactoryLineSummaryChart className="xl:col-span-6" rows={data.productionLines} />
            <PcFactoryRankingChart
              className="xl:col-span-6"
              title="MTBF por máquina"
              subtitle="Top 10 recursos por tempo médio entre falhas/paradas (h)."
              rows={data.resourceRanking}
              metric="mtbf"
              color="#0f4d68"
              emptyDescription="Dados insuficientes para MTBF no período."
              onSelect={openDetails}
            />
            <PcFactoryTrendChart className="xl:col-span-12" points={data.trend} />
          </section>

          <PcFactoryRecordsTable
            initial={data.records}
            filters={{
              startDate: appliedFilters.startDate,
              endDate: appliedFilters.endDate,
              resources: appliedFilters.resources,
              productionLines: appliedFilters.productionLines,
              statuses: appliedFilters.statuses,
              sectors: appliedFilters.sectors,
              shifts: appliedFilters.shifts,
              search: appliedFilters.search
            }}
            onSelectResource={openDetails}
          />
        </>
      )}

      <PcFactoryDetailsDrawer
        open={selectedResource !== null}
        loading={detailsLoading}
        error={detailsError}
        details={details}
        onClose={closeDetails}
      />

      <PcFactoryImportModal
        open={importOpen}
        onClose={() => setImportOpen(false)}
        onImported={() => refreshPortalData({ toastMessage: null })}
      />
    </section>
  );
}

function ActionButton({
  children,
  onClick,
  primary = false
}: {
  children: React.ReactNode;
  onClick: () => void;
  primary?: boolean;
}) {
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

/* ------------------------------------------------------------------ */
/* Chips de filtros ativos                                            */
/* ------------------------------------------------------------------ */

type Chip = { key: string; label: string; kind: keyof AppliedPcFactoryFilters; value?: string };

function buildChips(filters: AppliedPcFactoryFilters): Chip[] {
  const chips: Chip[] = [];
  if (filters.startDate || filters.endDate) {
    chips.push({ key: "period", label: `Período: ${filters.startDate || "…"} → ${filters.endDate || "…"}`, kind: "startDate" });
  }
  filters.productionLines.forEach((value) => chips.push({ key: `line:${value}`, label: `Linha: ${value}`, kind: "productionLines", value }));
  filters.resources.forEach((value) => chips.push({ key: `res:${value}`, label: `Máquina: ${value}`, kind: "resources", value }));
  filters.statuses.forEach((value) =>
    chips.push({ key: `st:${value}`, label: `Status: ${PC_FACTORY_STATUS_LABELS[value as PcFactoryStatus] ?? value}`, kind: "statuses", value })
  );
  filters.sectors.forEach((value) => chips.push({ key: `sec:${value}`, label: `Setor: ${value}`, kind: "sectors", value }));
  filters.shifts.forEach((value) => chips.push({ key: `sh:${value}`, label: `Turno: ${value}`, kind: "shifts", value }));
  if (filters.search) {
    chips.push({ key: "search", label: `Busca: ${filters.search}`, kind: "search" });
  }
  return chips;
}

function removeChip(chip: Chip, draft: AppliedPcFactoryFilters, navigate: (filters: AppliedPcFactoryFilters) => void) {
  const next: AppliedPcFactoryFilters = { ...draft };
  if (chip.kind === "startDate") {
    next.startDate = "";
    next.endDate = "";
  } else if (chip.kind === "search") {
    next.search = "";
  } else if (chip.value) {
    const list = next[chip.kind] as string[];
    next[chip.kind] = list.filter((value) => value !== chip.value) as never;
  }
  navigate(next);
}

function filtersToParams(filters: AppliedPcFactoryFilters): URLSearchParams {
  const params = new URLSearchParams();
  if (filters.startDate) params.set("startDate", filters.startDate);
  if (filters.endDate) params.set("endDate", filters.endDate);
  filters.productionLines.forEach((value) => params.append("line", value));
  filters.resources.forEach((value) => params.append("resource", value));
  filters.statuses.forEach((value) => params.append("status", value));
  filters.sectors.forEach((value) => params.append("sector", value));
  filters.shifts.forEach((value) => params.append("shift", value));
  if (filters.search) params.set("q", filters.search);
  return params;
}
