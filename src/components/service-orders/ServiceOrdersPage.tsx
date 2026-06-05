"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import type { KeyboardEvent, ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  Check,
  ChevronLeft,
  ChevronRight,
  Database,
  Download,
  FileSpreadsheet,
  FilterX,
  RefreshCw,
  Search,
  Upload,
  X
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type {
  AppliedServiceOrderFilters,
  ServiceOrderListItem,
  ServiceOrdersPageData,
  ServiceOrderStatusLabel
} from "@/types/service-orders";
import { formatPeriodRange } from "@/utils/period";
import { MultiSelectFilter } from "@/components/service-orders/filters/MultiSelectFilter";
import { DateRangeFilter } from "@/components/service-orders/filters/DateRangeFilter";
import { ActiveFilterChips, type ActiveFilterChip } from "@/components/service-orders/filters/ActiveFilterChips";

type ServiceOrdersPageProps = {
  data: ServiceOrdersPageData;
  appliedFilters: AppliedServiceOrderFilters;
};

const STATUS_OPTIONS: ServiceOrderStatusLabel[] = [
  "ABERTA",
  "LIBERADA",
  "EM_ANDAMENTO",
  "AGUARDANDO_MATERIAL",
  "FECHADA",
  "CANCELADA"
];

const AREA_LABELS: Record<string, string> = {
  MECANICA: "Mecânica",
  ELETRICA: "Elétrica",
  LUBRIFICACAO: "Lubrificação",
  PCM: "PCM",
  OPERACIONAL: "Operacional"
};

const AREA_OPTIONS = Object.entries(AREA_LABELS).map(([value, label]) => ({ value, label }));

function emptyFilters(): AppliedServiceOrderFilters {
  return {
    search: "",
    osNumber: "",
    statuses: [],
    equipment: "",
    areas: [],
    planningGroups: [],
    responsibles: [],
    startDate: "",
    endDate: ""
  };
}

export function ServiceOrdersPage({ data, appliedFilters }: ServiceOrdersPageProps) {
  const router = useRouter();
  const pathname = usePathname();
  const [isPending, startTransition] = useTransition();

  // Rascunho do painel: editado livremente; só vai para a URL ao "Aplicar filtros".
  const [draft, setDraft] = useState<AppliedServiceOrderFilters>(appliedFilters);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [showImportPanel, setShowImportPanel] = useState(false);

  const appliedSignature = JSON.stringify(appliedFilters);

  // Sincroniza o rascunho quando os filtros aplicados mudam (aplicar, remover chip, limpar).
  useEffect(() => {
    setDraft(appliedFilters);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [appliedSignature]);

  const planningGroupOptions = useMemo(
    () => data.filterOptions.planningGroups.map((value) => ({ value, label: value })),
    [data.filterOptions.planningGroups]
  );

  const responsibleOptions = useMemo(
    () => data.filterOptions.responsibles.map((value) => ({ value, label: value })),
    [data.filterOptions.responsibles]
  );

  const groupedOrders = useMemo(() => groupOrdersByResponsible(data.orders), [data.orders]);

  function navigate(filters: AppliedServiceOrderFilters, page = 1) {
    const params = filtersToSearchParams(filters, page);
    const query = params.toString();
    startTransition(() => router.push(query ? `${pathname}?${query}` : pathname));
  }

  function applyFilters() {
    navigate(draft, 1);
  }

  function clearFilters() {
    setDraft(emptyFilters());
    startTransition(() => router.push(pathname));
  }

  function goToPage(page: number) {
    navigate(appliedFilters, page);
  }

  function changePageSize(size: number) {
    const params = filtersToSearchParams(appliedFilters, 1);
    params.set("pageSize", String(size));
    const query = params.toString();
    startTransition(() => router.push(query ? `${pathname}?${query}` : pathname));
  }

  const chips = useMemo(
    () => buildChips(appliedFilters, (next) => navigate(next, 1)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [appliedSignature]
  );

  function updateDraft<Key extends keyof AppliedServiceOrderFilters>(
    key: Key,
    value: AppliedServiceOrderFilters[Key]
  ) {
    setDraft((current) => ({ ...current, [key]: value }));
  }

  function toggleOrder(id: string) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  function toggleAllVisible() {
    setSelected((current) => {
      const allVisibleSelected = data.orders.length > 0 && data.orders.every((order) => current.has(order.id));
      if (allVisibleSelected) {
        return new Set(Array.from(current).filter((id) => !data.orders.some((order) => order.id === id)));
      }
      return new Set(Array.from(current).concat(data.orders.map((order) => order.id)));
    });
  }

  return (
    <section className={`space-y-4 text-champagne transition ${isPending ? "opacity-70" : ""}`}>
      <header className="relative overflow-hidden rounded-lg border border-gold/20 bg-[#070808] p-5 shadow-premium sm:p-6">
        <div className="login-marble-bg absolute inset-0 opacity-80" />
        <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(0,0,0,0.78),rgba(0,0,0,0.44)),radial-gradient(circle_at_88%_8%,rgba(196,154,69,0.15),transparent_22rem)]" />
        <div className="relative z-10 flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <div className="mb-3 flex items-center gap-3 text-gold">
              <FileSpreadsheet className="h-5 w-5" />
              <span className="text-xs font-bold uppercase tracking-[0.28em] text-champagne/75">
                SAP/Fiori - Ordens de manutenção
              </span>
            </div>
            <h1 className="font-serif text-3xl leading-tight text-white sm:text-4xl">Ordens de Serviço</h1>
            <p className="mt-2 max-w-3xl text-sm leading-relaxed text-zinc-300 sm:text-base">
              Acompanhe solicitações, prioridades, execução e encerramento das ordens de manutenção.
            </p>
          </div>

          <div className="rounded-lg border border-gold/25 bg-black/40 px-4 py-3 text-sm backdrop-blur">
            <p className="text-xs uppercase tracking-[0.22em] text-zinc-400">Ordens de manutenção e operações</p>
            <p className="mt-1 font-serif text-2xl text-gold">({data.total.toLocaleString("pt-BR")})</p>
            <p className="mt-1 text-xs text-zinc-500">{buildTotalsLabel(data)}</p>
            <div className="mt-2 space-y-0.5 border-t border-gold/15 pt-2 text-[11px] text-zinc-500">
              <p className="flex items-center gap-1.5">
                <Database className="h-3 w-3 text-gold" />
                Fonte: {data.source === "database" ? "Banco SQLite/Prisma" : "Fallback mockado"}
              </p>
              <p>
                Última importação:{" "}
                <span className="text-zinc-300">
                  {data.lastImportAt ? formatDateTime(data.lastImportAt) : "nenhuma registrada"}
                </span>
              </p>
            </div>
          </div>
        </div>
      </header>

      <ServiceOrderActions
        selectedCount={selected.size}
        source={data.source}
        showImportPanel={showImportPanel}
        canClear={chips.length > 0}
        canExport={data.orders.length > 0}
        onToggleImport={() => setShowImportPanel((current) => !current)}
        onRefresh={() => startTransition(() => router.refresh())}
        onExport={() => exportOrdersToCsv(data.orders)}
        onClear={clearFilters}
      />

      {showImportPanel ? <ImportPreviewPanel onClose={() => setShowImportPanel(false)} /> : null}

      <ServiceOrderFilters
        draft={draft}
        statusOptions={STATUS_OPTIONS}
        areaOptions={AREA_OPTIONS}
        planningGroupOptions={planningGroupOptions}
        responsibleOptions={responsibleOptions}
        isPending={isPending}
        onChange={updateDraft}
        onApply={applyFilters}
        onClear={clearFilters}
      />

      <ActiveFilterChips chips={chips} onClearAll={clearFilters} />

      <ServiceOrdersTable
        groups={groupedOrders}
        selected={selected}
        displayedCount={data.orders.length}
        filteredTotal={data.total}
        allVisibleSelected={data.orders.length > 0 && data.orders.every((order) => selected.has(order.id))}
        onToggleAll={toggleAllVisible}
        onToggleOrder={toggleOrder}
      />

      <Pagination
        page={data.page}
        pageSize={data.pageSize}
        total={data.total}
        totalPages={data.totalPages}
        displayed={data.orders.length}
        disabled={isPending}
        onChange={goToPage}
        onPageSizeChange={changePageSize}
      />
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* URL <-> filtros                                                    */
/* ------------------------------------------------------------------ */

function filtersToSearchParams(filters: AppliedServiceOrderFilters, page: number): URLSearchParams {
  const params = new URLSearchParams();

  if (filters.search.trim()) params.set("search", filters.search.trim());
  if (filters.osNumber.trim()) params.set("ordem", filters.osNumber.trim());
  filters.statuses.forEach((status) => params.append("status", status));
  if (filters.equipment.trim()) params.set("objetoTecnico", filters.equipment.trim());
  filters.areas.forEach((area) => params.append("area", area));
  filters.planningGroups.forEach((group) => params.append("grupo", group));
  filters.responsibles.forEach((responsible) => params.append("responsavel", responsible));
  if (filters.startDate) params.set("startDate", filters.startDate);
  if (filters.endDate) params.set("endDate", filters.endDate);
  if (page > 1) params.set("page", String(page));

  return params;
}

function buildChips(
  filters: AppliedServiceOrderFilters,
  apply: (next: AppliedServiceOrderFilters) => void
): ActiveFilterChip[] {
  const chips: ActiveFilterChip[] = [];

  if (filters.search.trim()) {
    chips.push({
      id: "search",
      groupLabel: "Busca",
      valueLabel: filters.search.trim(),
      onRemove: () => apply({ ...filters, search: "" })
    });
  }

  if (filters.osNumber.trim()) {
    chips.push({
      id: "ordem",
      groupLabel: "Ordem",
      valueLabel: filters.osNumber.trim(),
      onRemove: () => apply({ ...filters, osNumber: "" })
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

  if (filters.equipment.trim()) {
    chips.push({
      id: "objetoTecnico",
      groupLabel: "Objeto técnico",
      valueLabel: filters.equipment.trim(),
      onRemove: () => apply({ ...filters, equipment: "" })
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

  for (const group of filters.planningGroups) {
    chips.push({
      id: `grupo:${group}`,
      groupLabel: "Grupo",
      valueLabel: group,
      onRemove: () => apply({ ...filters, planningGroups: filters.planningGroups.filter((value) => value !== group) })
    });
  }

  for (const responsible of filters.responsibles) {
    chips.push({
      id: `responsavel:${responsible}`,
      groupLabel: "Responsável",
      valueLabel: responsible,
      onRemove: () =>
        apply({ ...filters, responsibles: filters.responsibles.filter((value) => value !== responsible) })
    });
  }

  if (filters.startDate || filters.endDate) {
    chips.push({
      id: "periodo",
      groupLabel: "Período",
      valueLabel:
        filters.startDate && filters.endDate
          ? formatPeriodRange(filters.startDate, filters.endDate)
          : filters.startDate || filters.endDate,
      onRemove: () => apply({ ...filters, startDate: "", endDate: "" })
    });
  }

  return chips;
}

function buildTotalsLabel(data: ServiceOrdersPageData): string {
  const general = data.summary.total.toLocaleString("pt-BR");
  const filtered = data.total.toLocaleString("pt-BR");
  const displayed = data.orders.length.toLocaleString("pt-BR");

  if (data.total === data.summary.total) {
    return `Exibindo ${displayed} de ${general} ordens`;
  }

  return `Exibindo ${displayed} de ${filtered} filtradas (${general} no total)`;
}

/* ------------------------------------------------------------------ */
/* Ações                                                              */
/* ------------------------------------------------------------------ */

type ServiceOrderActionsProps = {
  selectedCount: number;
  source: ServiceOrdersPageData["source"];
  showImportPanel: boolean;
  canClear: boolean;
  canExport: boolean;
  onToggleImport: () => void;
  onRefresh: () => void;
  onExport: () => void;
  onClear: () => void;
};

function ServiceOrderActions({
  selectedCount,
  source,
  showImportPanel,
  canClear,
  canExport,
  onToggleImport,
  onRefresh,
  onExport,
  onClear
}: ServiceOrderActionsProps) {
  return (
    <div className="flex flex-col gap-3 rounded-lg border border-gold/15 bg-[#090a0a] p-3 shadow-premium sm:flex-row sm:items-center sm:justify-between">
      <div className="flex flex-wrap items-center gap-2">
        <ActionButton icon={Upload} label="Importar Excel" active={showImportPanel} onClick={onToggleImport} />
        <ActionButton icon={RefreshCw} label="Atualizar dados" onClick={onRefresh} />
        <ActionButton
          icon={Download}
          label="Exportar"
          onClick={onExport}
          disabled={!canExport}
          title={canExport ? "Exportar a página atual em CSV" : "Sem registros para exportar"}
        />
        <ActionButton icon={FilterX} label="Limpar filtros" onClick={onClear} disabled={!canClear} />
      </div>
      <div className="flex items-center gap-3 text-xs text-zinc-400">
        <span>{selectedCount ? `${selectedCount} ordens selecionadas` : "Nenhuma ordem selecionada"}</span>
        <span className="h-4 w-px bg-gold/20" />
        <span>Fonte: {source === "database" ? "Banco SQLite/Prisma" : "Fallback mockado"}</span>
      </div>
    </div>
  );
}

type ActionButtonProps = {
  icon: LucideIcon;
  label: string;
  active?: boolean;
  disabled?: boolean;
  title?: string;
  onClick?: () => void;
};

function ActionButton({ icon: Icon, label, active = false, disabled = false, title, onClick }: ActionButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={`inline-flex h-10 items-center gap-2 rounded-lg border px-3 text-xs font-semibold transition disabled:cursor-not-allowed disabled:opacity-40 ${
        active
          ? "border-gold/55 bg-gold/15 text-gold"
          : "border-gold/20 bg-white/[0.04] text-zinc-200 hover:border-gold/40 hover:bg-gold/10 hover:text-white disabled:hover:border-gold/20 disabled:hover:bg-white/[0.04] disabled:hover:text-zinc-200"
      }`}
    >
      <Icon className="h-4 w-4 text-gold" />
      {label}
    </button>
  );
}

function ImportPreviewPanel({ onClose }: { onClose: () => void }) {
  return (
    <div className="rounded-lg border border-gold/25 bg-[#090a0a] p-4 shadow-premium">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-sm font-semibold text-gold">Importação Excel SAP/Fiori</h2>
          <p className="mt-1 max-w-3xl text-sm leading-relaxed text-zinc-300">
            Área preparada para receber a planilha master de ordens. A próxima etapa irá validar colunas,
            normalizar campos técnicos e registrar o lote no histórico de importação.
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="grid h-9 w-9 place-items-center rounded-lg border border-gold/20 text-zinc-300 transition hover:border-gold/40 hover:text-white"
          aria-label="Fechar importação"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Painel de filtros                                                  */
/* ------------------------------------------------------------------ */

type ServiceOrderFiltersProps = {
  draft: AppliedServiceOrderFilters;
  statusOptions: ServiceOrderStatusLabel[];
  areaOptions: Array<{ value: string; label: string }>;
  planningGroupOptions: Array<{ value: string; label: string }>;
  responsibleOptions: Array<{ value: string; label: string }>;
  isPending: boolean;
  onChange: <Key extends keyof AppliedServiceOrderFilters>(key: Key, value: AppliedServiceOrderFilters[Key]) => void;
  onApply: () => void;
  onClear: () => void;
};

function ServiceOrderFilters({
  draft,
  statusOptions,
  areaOptions,
  planningGroupOptions,
  responsibleOptions,
  isPending,
  onChange,
  onApply,
  onClear
}: ServiceOrderFiltersProps) {
  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === "Enter" && (event.target as HTMLElement).tagName === "INPUT") {
      onApply();
    }
  }

  return (
    <div
      onKeyDown={handleKeyDown}
      className="rounded-lg border border-gold/20 bg-[#080909] p-4 shadow-premium sm:p-5"
    >
      <div className="mb-4 flex items-center gap-2 text-xs font-bold uppercase tracking-[0.22em] text-gold">
        <Search className="h-4 w-4" />
        Filtros avançados
      </div>

      <div className="grid gap-x-4 gap-y-4 md:grid-cols-2 xl:grid-cols-4">
        <FilterField label="Procurar">
          <input
            value={draft.search}
            onChange={(event) => onChange("search", event.target.value)}
            placeholder="OS, título, operação, equipamento, responsável..."
            className={inputClassName}
          />
        </FilterField>

        <FilterField label="Ordem">
          <input
            value={draft.osNumber}
            onChange={(event) => onChange("osNumber", event.target.value)}
            placeholder="Nº da OS ou título"
            className={inputClassName}
          />
        </FilterField>

        <MultiSelectFilter
          label="Status da ordem"
          options={statusOptions.map((status) => ({ value: status, label: status }))}
          selected={draft.statuses}
          onChange={(next) => onChange("statuses", next as ServiceOrderStatusLabel[])}
          placeholder="Todos os status"
          searchable={false}
        />

        <FilterField label="Objeto técnico">
          <input
            value={draft.equipment}
            onChange={(event) => onChange("equipment", event.target.value)}
            placeholder="Equipamento, código ou objeto técnico"
            className={inputClassName}
          />
        </FilterField>

        <MultiSelectFilter
          label="Centro / área de trabalho"
          options={areaOptions}
          selected={draft.areas}
          onChange={(next) => onChange("areas", next)}
          placeholder="Todas as áreas"
          searchable={false}
        />

        <MultiSelectFilter
          label="Grupo de planejamento"
          options={planningGroupOptions}
          selected={draft.planningGroups}
          onChange={(next) => onChange("planningGroups", next)}
          placeholder="Todos os grupos"
        />

        <MultiSelectFilter
          label="Responsável (ordem)"
          options={responsibleOptions}
          selected={draft.responsibles}
          onChange={(next) => onChange("responsibles", next)}
          placeholder="Todos os responsáveis"
        />

        <DateRangeFilter
          label="Data-base do início"
          startDate={draft.startDate}
          endDate={draft.endDate}
          onChange={({ startDate, endDate }) => {
            onChange("startDate", startDate);
            onChange("endDate", endDate);
          }}
        />
      </div>

      <div className="mt-5 flex flex-col gap-2 border-t border-gold/10 pt-4 sm:flex-row sm:items-center sm:justify-end">
        <button
          type="button"
          onClick={onClear}
          className="inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-gold/20 px-4 text-sm font-semibold text-zinc-300 transition hover:border-gold/40 hover:text-white"
        >
          <FilterX className="h-4 w-4" />
          Limpar filtros
        </button>
        <button
          type="button"
          onClick={onApply}
          disabled={isPending}
          className="inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-gold/55 bg-gold/15 px-5 text-sm font-bold text-gold transition hover:bg-gold/25 disabled:cursor-not-allowed disabled:opacity-60"
        >
          <Check className="h-4 w-4" />
          {isPending ? "Aplicando..." : "Aplicar filtros"}
        </button>
      </div>
    </div>
  );
}

function FilterField({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wide text-zinc-400">{label}</span>
      {children}
    </label>
  );
}

const inputClassName =
  "h-10 w-full rounded-lg border border-gold/15 bg-black/35 px-3 text-sm text-zinc-100 outline-none transition placeholder:text-zinc-600 focus:border-gold/55 focus:bg-black/50 focus:shadow-[0_0_0_3px_rgba(196,154,69,0.10)]";

/* ------------------------------------------------------------------ */
/* Paginação                                                          */
/* ------------------------------------------------------------------ */

type PaginationProps = {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  displayed: number;
  disabled: boolean;
  onChange: (page: number) => void;
  onPageSizeChange: (size: number) => void;
};

const PAGE_SIZE_OPTIONS = [25, 50, 100];

function Pagination({
  page,
  pageSize,
  total,
  totalPages,
  displayed,
  disabled,
  onChange,
  onPageSizeChange
}: PaginationProps) {
  if (total === 0) {
    return null;
  }

  const firstRow = (page - 1) * pageSize + 1;
  const lastRow = (page - 1) * pageSize + displayed;

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-gold/15 bg-[#090a0a] p-3 text-sm shadow-premium sm:flex-row sm:items-center sm:justify-between">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <span className="text-xs text-zinc-400">
          Registros {firstRow.toLocaleString("pt-BR")}–{lastRow.toLocaleString("pt-BR")} de{" "}
          <strong className="text-champagne">{total.toLocaleString("pt-BR")}</strong>
        </span>
        <label className="flex items-center gap-2 text-xs text-zinc-400">
          Por página:
          <select
            value={pageSize}
            disabled={disabled}
            onChange={(event) => onPageSizeChange(Number(event.target.value))}
            className="h-8 rounded-lg border border-gold/20 bg-black/40 px-2 text-xs text-zinc-100 outline-none transition [color-scheme:dark] focus:border-gold/55 disabled:opacity-50"
          >
            {PAGE_SIZE_OPTIONS.map((size) => (
              <option key={size} value={size}>
                {size}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => onChange(page - 1)}
          disabled={disabled || page <= 1}
          className={paginationButtonClassName}
        >
          <ChevronLeft className="h-4 w-4" />
          Anterior
        </button>
        <span className="px-2 text-xs text-zinc-300">
          Página <strong className="text-gold">{page}</strong> de {totalPages}
        </span>
        <button
          type="button"
          onClick={() => onChange(page + 1)}
          disabled={disabled || page >= totalPages}
          className={paginationButtonClassName}
        >
          Próxima
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

const paginationButtonClassName =
  "inline-flex h-9 items-center gap-1.5 rounded-lg border border-gold/20 bg-white/[0.04] px-3 text-xs font-semibold text-zinc-200 transition hover:border-gold/40 hover:bg-gold/10 hover:text-white disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:border-gold/20 disabled:hover:bg-white/[0.04] disabled:hover:text-zinc-200";

/* ------------------------------------------------------------------ */
/* Tabela                                                             */
/* ------------------------------------------------------------------ */

type ServiceOrderGroupData = { responsible: string; orders: ServiceOrderListItem[]; totalHours: number };

type ServiceOrdersTableProps = {
  groups: ServiceOrderGroupData[];
  selected: Set<string>;
  displayedCount: number;
  filteredTotal: number;
  allVisibleSelected: boolean;
  onToggleAll: () => void;
  onToggleOrder: (id: string) => void;
};

function ServiceOrdersTable({
  groups,
  selected,
  displayedCount,
  filteredTotal,
  allVisibleSelected,
  onToggleAll,
  onToggleOrder
}: ServiceOrdersTableProps) {
  return (
    <div className="overflow-hidden rounded-lg border border-gold/15 bg-[#070808] shadow-premium">
      <div className="flex items-center justify-between border-b border-gold/15 px-4 py-3">
        <div>
          <h2 className="text-sm font-semibold text-champagne">Lista de ordens</h2>
          <p className="mt-0.5 text-xs text-zinc-500">Agrupado por responsável da ordem</p>
        </div>
        <span className="rounded-lg border border-gold/20 bg-gold/10 px-3 py-1 text-xs font-semibold text-gold">
          {displayedCount.toLocaleString("pt-BR")} de {filteredTotal.toLocaleString("pt-BR")} registro(s)
        </span>
      </div>

      <div className="max-h-[65vh] overflow-auto">
        <table className="w-full min-w-[1280px] border-collapse text-left text-xs">
          <thead className="sticky top-0 z-10 bg-[#0c0d0d] text-[11px] uppercase tracking-wide text-zinc-300 shadow-[0_1px_0_rgba(196,154,69,0.25)]">
            <tr className="border-b border-gold/25">
              <th className="w-12 px-3 py-3">
                <input
                  type="checkbox"
                  checked={allVisibleSelected}
                  onChange={onToggleAll}
                  className="h-4 w-4 accent-gold"
                  aria-label="Selecionar ordens visíveis"
                />
              </th>
              <th className="px-3 py-3 font-semibold">Ordem</th>
              <th className="px-3 py-3 font-semibold">Data-base do início</th>
              <th className="px-3 py-3 font-semibold">Status da ordem</th>
              <th className="px-3 py-3 font-semibold">Objeto técnico</th>
              <th className="px-3 py-3 font-semibold">Responsável (ordem)</th>
              <th className="px-3 py-3 font-semibold">Grupo de planejamento</th>
              <th className="px-3 py-3 text-right font-semibold">Trabalho real</th>
              <th className="px-3 py-3 font-semibold">Operação</th>
            </tr>
          </thead>
          <tbody>
            {groups.length ? (
              groups.map((group) => (
                <ServiceOrderGroup
                  key={group.responsible}
                  group={group}
                  selected={selected}
                  onToggleOrder={onToggleOrder}
                />
              ))
            ) : (
              <tr>
                <td colSpan={9} className="px-4 py-14 text-center">
                  <p className="text-sm font-semibold text-zinc-200">
                    Não encontramos ordens para os filtros aplicados.
                  </p>
                  <p className="mt-1 text-xs text-zinc-500">
                    Revise os filtros ou limpe a busca para visualizar todos os registros.
                  </p>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ServiceOrderGroup({
  group,
  selected,
  onToggleOrder
}: {
  group: ServiceOrderGroupData;
  selected: Set<string>;
  onToggleOrder: (id: string) => void;
}) {
  return (
    <>
      <ServiceOrderGroupHeader
        responsible={group.responsible}
        count={group.orders.length}
        totalHours={group.totalHours}
      />
      {group.orders.map((order) => (
        <ServiceOrderRow
          key={order.id}
          order={order}
          checked={selected.has(order.id)}
          onToggle={() => onToggleOrder(order.id)}
        />
      ))}
    </>
  );
}

function ServiceOrderGroupHeader({
  responsible,
  count,
  totalHours
}: {
  responsible: string;
  count: number;
  totalHours: number;
}) {
  return (
    <tr className="border-y border-gold/20 bg-[#15130d]">
      <td colSpan={9} className="px-4 py-2.5">
        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
          <span className="text-xs font-semibold uppercase tracking-wide text-gold">
            Responsável (ordem): {responsible}
          </span>
          <span className="text-[11px] text-zinc-400">
            {count.toLocaleString("pt-BR")} ordem(ns) · {formatHours(totalHours)}
          </span>
        </div>
      </td>
    </tr>
  );
}

function ServiceOrderRow({
  order,
  checked,
  onToggle
}: {
  order: ServiceOrderListItem;
  checked: boolean;
  onToggle: () => void;
}) {
  return (
    <tr className="border-b border-white/[0.06] bg-black/20 transition hover:bg-gold/[0.07]">
      <td className="px-3 py-2.5 align-middle">
        <input
          type="checkbox"
          checked={checked}
          onChange={onToggle}
          className="h-4 w-4 accent-gold"
          aria-label={`Selecionar ordem ${order.osNumber}`}
        />
      </td>
      <td className="max-w-[280px] px-3 py-2.5 align-middle">
        <p className="truncate font-semibold text-zinc-100">{order.title}</p>
        <p className="mt-0.5 text-[11px] text-gold">OS {order.osNumber}</p>
      </td>
      <td className="whitespace-nowrap px-3 py-2.5 align-middle text-zinc-300">{formatDate(order.openedAt)}</td>
      <td className="whitespace-nowrap px-3 py-2.5 align-middle">
        <StatusBadge status={order.status} />
      </td>
      <td className="max-w-[290px] px-3 py-2.5 align-middle">
        <p className="truncate text-zinc-200">{order.technicalObject}</p>
        {order.equipmentCode ? <p className="mt-0.5 text-[11px] text-zinc-500">{order.equipmentCode}</p> : null}
      </td>
      <td className="max-w-[230px] px-3 py-2.5 align-middle">
        <p className="truncate text-zinc-200">{getResponsibleGroup(order)}</p>
      </td>
      <td className="max-w-[220px] px-3 py-2.5 align-middle">
        <p className="truncate text-zinc-200">{formatPlanningGroup(order)}</p>
      </td>
      <td className="whitespace-nowrap px-3 py-2.5 text-right align-middle font-medium text-champagne">
        {formatHours(order.workedHours)}
      </td>
      <td className="max-w-[260px] px-3 py-2.5 align-middle">
        <p className="truncate text-zinc-200">{order.operation ?? "-"}</p>
        {order.operationCode ? <p className="mt-0.5 text-[11px] text-zinc-500">{order.operationCode}</p> : null}
      </td>
    </tr>
  );
}

function StatusBadge({ status }: { status: ServiceOrderStatusLabel }) {
  const tone = {
    ABERTA: "border-gold/35 bg-gold/15 text-champagne",
    LIBERADA: "border-petroleum/45 bg-petroleum/25 text-sky-100",
    EM_ANDAMENTO: "border-blue-400/30 bg-blue-400/10 text-blue-100",
    AGUARDANDO_MATERIAL: "border-amber-300/35 bg-amber-300/[0.12] text-amber-100",
    FECHADA: "border-emerald-400/30 bg-emerald-400/10 text-emerald-100",
    CANCELADA: "border-rose-400/35 bg-rose-500/[0.12] text-rose-100"
  } satisfies Record<ServiceOrderStatusLabel, string>;

  return (
    <span className={`inline-flex h-7 items-center rounded-lg border px-2.5 text-[11px] font-bold ${tone[status]}`}>
      {status}
    </span>
  );
}

/* ------------------------------------------------------------------ */
/* Helpers                                                            */
/* ------------------------------------------------------------------ */

function groupOrdersByResponsible(orders: ServiceOrderListItem[]) {
  const groups = new Map<string, ServiceOrderListItem[]>();

  for (const order of orders) {
    const responsible = getResponsibleGroup(order);
    groups.set(responsible, [...(groups.get(responsible) ?? []), order]);
  }

  return Array.from(groups.entries())
    .map(([responsible, groupOrders]) => ({
      responsible,
      orders: groupOrders,
      totalHours: groupOrders.reduce((sum, order) => sum + (order.workedHours ?? 0), 0)
    }))
    .sort((a, b) => a.responsible.localeCompare(b.responsible, "pt-BR"));
}

function getResponsibleGroup(order: ServiceOrderListItem) {
  if (!order.responsibleName) {
    return "SEM RESPONSÁVEL";
  }

  return order.responsibleId ? `${order.responsibleName} (${order.responsibleId})` : order.responsibleName;
}

function formatPlanningGroup(order: ServiceOrderListItem) {
  if (order.planningGroup && order.planningGroupCode) {
    return `${order.planningGroup} (${order.planningGroupCode})`;
  }

  return order.planningGroup ?? order.planningGroupCode ?? "-";
}

function formatDate(value: string | null) {
  if (!value) {
    return "-";
  }

  return new Date(value).toLocaleDateString("pt-BR");
}

function formatHours(value: number | null) {
  if (value === null) {
    return "-";
  }

  return `${value.toLocaleString("pt-BR", {
    minimumFractionDigits: 3,
    maximumFractionDigits: 3
  })} H`;
}

function formatDateTime(value: string) {
  return new Date(value).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  });
}

/** Exporta as ordens da página atual para CSV (separador ';', compatível com Excel pt-BR). */
function exportOrdersToCsv(orders: ServiceOrderListItem[]) {
  if (!orders.length) {
    return;
  }

  const headers = [
    "OS",
    "Titulo",
    "Data-base do inicio",
    "Status",
    "Objeto tecnico",
    "Codigo equipamento",
    "Responsavel",
    "Grupo de planejamento",
    "Trabalho real (H)",
    "Operacao",
    "Codigo operacao"
  ];

  const lines = orders.map((order) => [
    order.osNumber,
    order.title,
    order.openedAt ? new Date(order.openedAt).toLocaleDateString("pt-BR") : "",
    order.status,
    order.technicalObject,
    order.equipmentCode ?? "",
    getResponsibleGroup(order),
    formatPlanningGroup(order),
    order.workedHours ?? "",
    order.operation ?? "",
    order.operationCode ?? ""
  ]);

  const csv = [headers, ...lines].map((line) => line.map(csvCell).join(";")).join("\r\n");
  const blob = new Blob([`﻿${csv}`], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "ordens-servico.csv";
  link.click();
  URL.revokeObjectURL(url);

  toast.success("Exportação concluída", {
    description: `${orders.length.toLocaleString("pt-BR")} ordem(ns) exportada(s) em CSV.`
  });
}

function csvCell(value: string | number) {
  const text = String(value ?? "");
  return /[";\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}
