"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import dynamic from "next/dynamic";
import { usePathname, useRouter } from "next/navigation";
import { toast } from "sonner";
import { Activity, Factory, Info, RefreshCw, Upload, X } from "lucide-react";
import { ChartSkeleton } from "@/components/ChartSkeleton";
import { PcFactoryKpiCards } from "@/components/pc-factory/PcFactoryKpiCards";
import { PcFactoryFilters } from "@/components/pc-factory/PcFactoryFilters";
import { ModuleEmptyState } from "@/components/ui/ModuleEmptyState";
import { PcFactoryRecordsTable } from "@/components/pc-factory/PcFactoryRecordsTable";
import { PcFactoryReliabilityTable } from "@/components/pc-factory/PcFactoryReliabilityTable";
import { PcFactoryDetailsDrawer } from "@/components/pc-factory/PcFactoryDetailsDrawer";
import { PcFactoryImportModal } from "@/components/pc-factory/PcFactoryImportModal";
import { PcFactoryQualityPanel } from "@/components/pc-factory/PcFactoryQualityPanel";
import { UnavailableIndicator } from "@/components/ui/FieldNotice";
import { usePortalDataRefresh } from "@/hooks/usePortalDataRefresh";
import { PC_FACTORY_CATEGORY_LABELS } from "@/utils/pc-factory-normalizer";
import { PC_FACTORY_DEFAULT_MODE } from "@/types/pc-factory";
import { BTN_GOLD_ON_LIGHT, BTN_NEUTRAL_ON_LIGHT, DISABLED_ON_LIGHT, FOCUS_RING } from "@/constants/interactive";
import type {
  PcFactoryCalculationMode,
  PcFactoryPageData,
  PcFactoryResourceDetails,
  PcFactoryStatusCategory
} from "@/types/pc-factory";

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
  /** Modo de apuração ativo — ver PcFactoryCalculationMode. */
  mode: PcFactoryCalculationMode;
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

  // Filtro mudou com o painel aberto → recarrega o detalhe no novo recorte. Sem isto o
  // painel continuaria exibindo os números do filtro anterior enquanto a tabela atrás
  // dele já teria mudado.
  useEffect(() => {
    if (!selectedResource) return;
    fetchDetails(selectedResource);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [appliedSignature, selectedResource]);

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
    // O modo de apuração não é um filtro: limpar os filtros não deve devolver o
    // usuário ao modo oficial se ele escolheu analisar por intervalo real.
    const params = new URLSearchParams();
    if (appliedFilters.mode !== PC_FACTORY_DEFAULT_MODE) params.set("mode", appliedFilters.mode);
    const query = params.toString();
    startTransition(() => router.push(query ? `${pathname}?${query}` : pathname));
    toast("Filtros limpos");
  }

  /** Troca de modo aplica na hora — não passa pelo rascunho de filtros. */
  function changeMode(mode: PcFactoryCalculationMode) {
    if (mode === appliedFilters.mode) return;
    navigate({ ...appliedFilters, mode });
  }

  function fetchDetails(resource: string) {
    const requestId = requestRef.current + 1;
    requestRef.current = requestId;
    setDetailsLoading(true);
    setDetailsError(null);

    // Os MESMOS filtros da tela vão junto: sem isso o painel respondia com o histórico
    // completo da máquina e mostrava outro período que a linha da tabela clicada.
    // A máquina clicada viaja em `machine` para não colidir com `resource`, que é o
    // filtro de máquina (multi-seleção) montado por filtersToParams.
    const query = filtersToParams(appliedFilters);
    query.set("machine", resource);

    fetch(`/api/pc-factory/details?${query.toString()}`)
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
    // A busca em si fica com o efeito acima, que também reage a troca de filtro.
  }

  function closeDetails() {
    requestRef.current += 1;
    setSelectedResource(null);
  }

  const activeChips = useMemo(() => buildChips(appliedFilters), [appliedFilters]);
  // Sem dados por AUSENCIA de importacao ou por FALHA de consulta: a tela e a
  // mesma, mas a mensagem e a acao mudam (ver PageDataSource).
  const isUnavailable = data.source === "unavailable";
  const isEmpty = data.source !== "database";

  return (
    // A página é CLARA: o texto padrão precisa ser escuro. `text-champagne` só vale
    // dentro dos blocos escuros (hero, drawer), que já o declaram por conta própria.
    // A opacidade de "carregando" saiu do container: aplicada no pai ela apagava
    // texto, ícone, borda e fundo de tudo — e era o que deixava a barra ilegível
    // durante a navegação. Em vez dela, só o cursor indica o estado.
    <section
      className={`space-y-4 text-ink transition ${isPending || isRefreshing ? "cursor-progress" : ""}`}
      aria-busy={isPending || isRefreshing}
    >
      {/* Hero */}
      <header className="relative overflow-hidden rounded-lg border border-gold/20 bg-ink p-5 shadow-premium sm:p-6">
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

      {/*
        Esta barra fica sobre a PÁGINA CLARA. Antes usava `bg-black/25` (que sobre o
        bege vira um cinza médio) com `text-gold` e `text-zinc-400` — claro sobre
        claro, ~1,9:1. Agora é superfície branca com borda dourada e texto escuro.
      */}
      <div className="flex flex-wrap items-center gap-2 rounded-lg border border-gold/35 bg-white/75 px-3 py-2 shadow-sm">
        <span className="text-[11px] font-bold uppercase tracking-wide text-gold-deep">Modo de cálculo</span>
        <div className="flex gap-1">
          <ModeButton
            active={appliedFilters.mode === "G0134_OFICIAL"}
            disabled={isPending || isRefreshing}
            onClick={() => changeMode("G0134_OFICIAL")}
            label="Oficial G0134"
          />
          <ModeButton
            active={appliedFilters.mode === "INTERVALO_REAL"}
            disabled={isPending || isRefreshing}
            onClick={() => changeMode("INTERVALO_REAL")}
            label="Intervalo real"
          />
        </div>
        <p className="text-[11px] leading-snug text-neutralized-strong">
          {appliedFilters.mode === "G0134_OFICIAL"
            ? "Replica o relatório nativo do PC-Factory: o registro conta inteiro no período em que começou."
            : "Distribui eventos longos entre os meses reais — pode divergir do G0134 de propósito."}
        </p>
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
          <span className="text-[11px] font-semibold uppercase tracking-wide text-neutralized-strong">Filtros ativos:</span>
          {activeChips.map((chip) => (
            <span key={chip.key} className="inline-flex items-center gap-1.5 rounded-full border border-gold/45 bg-gold/15 px-3 py-1 text-[11px] font-semibold text-gold-deep">
              {chip.label}
              <button
                type="button"
                onClick={() => navigate(removeChip(chip, appliedFilters))}
                aria-label={`Remover ${chip.label}`}
                className={`rounded-full ${FOCUS_RING}`}
              >
                <X className="h-3 w-3 text-gold-deep transition hover:text-danger-strong" />
              </button>
            </span>
          ))}
          <span className="text-[11px] text-neutralized-strong">· {data.records.total.toLocaleString("pt-BR")} registros</span>
        </div>
      ) : null}

      {isEmpty ? (
        <ModuleEmptyState
          icon={Factory}
          title="Nenhum dado do PC-Factory importado ainda"
          description="Importe um relatório do PC-Factory para visualizar disponibilidade, utilização, MTBF, MTTR e status das máquinas."
          action={{ label: "Importar Excel", onClick: () => setImportOpen(true) }}
          unavailable={isUnavailable}
          unavailableTitle="Dados do PC-Factory indisponíveis"
        />
      ) : (
        <>
          <PcFactoryKpiCards kpis={data.kpis} />

          <PcFactoryQualityPanel quality={data.dataQuality} filterAudit={data.filterAudit} />

          <p className="text-[11px] text-neutralized-strong">
            <span className="font-semibold text-gold-deep">Dica:</span> clique em uma máquina nos gráficos ou na tabela para ver
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
            {/* Composição por linha/área depende de `productionLine`, que está 100% nula
                nos 71.638 registros importados. Em vez de um gráfico vazio (que passa
                impressão de erro), a tela explica que o campo não veio na base. */}
            {data.productionLines.length > 0 ? (
              <PcFactoryCompositionChart className="xl:col-span-6" rows={data.productionLines} />
            ) : (
              <UnavailableIndicator
                className="xl:col-span-6"
                title="Composição por linha / área"
                message="Indicador indisponível: a base importada não possui o campo Linha / Área."
                detail="Reimporte a planilha do PC-Factory com a coluna de linha/área preenchida para habilitar esta análise. Os demais indicadores da aba não dependem dela."
              />
            )}

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
    // Botões sobre a página CLARA: `text-gold` e `text-zinc-300` davam ~2:1 e ~1,7:1.
    // Passam a usar os tons escuros da mesma família (ver constants/interactive).
    <button
      type="button"
      onClick={onClick}
      className={
        primary
          ? BTN_GOLD_ON_LIGHT
          : BTN_NEUTRAL_ON_LIGHT
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

function ModeButton({
  active,
  disabled,
  onClick,
  label
}: {
  active: boolean;
  disabled: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={active}
      className={`rounded-md border px-2.5 py-1 text-[11px] font-bold transition duration-200 ease-premium ${FOCUS_RING} ${DISABLED_ON_LIGHT} ${
        active
          ? // ATIVO: dourado sólido com texto quase preto — o estado precisa saltar.
            "border-gold bg-gold text-ink shadow-sm"
          : // DISPONÍVEL: borda dourada e texto dourado escuro sobre claro (~5,9:1).
            "border-gold/45 bg-white/60 text-gold-deep hover:border-gold hover:bg-gold/15"
      }`}
    >
      {label}
    </button>
  );
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
  // Só vai para a URL quando NÃO é o padrão: link limpo para o caso normal.
  if (filters.mode !== PC_FACTORY_DEFAULT_MODE) params.set("mode", filters.mode);
  if (filters.search) params.set("q", filters.search);
  return params;
}
