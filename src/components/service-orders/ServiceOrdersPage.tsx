"use client";

import { useMemo, useState } from "react";
import type { ReactNode } from "react";
import {
  Download,
  FileSpreadsheet,
  FilterX,
  RefreshCw,
  Search,
  Upload,
  X
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { ServiceOrderListItem, ServiceOrdersPageData, ServiceOrderStatusLabel } from "@/types/service-orders";

type ServiceOrdersPageProps = {
  data: ServiceOrdersPageData;
};

type FiltersState = {
  search: string;
  order: string;
  status: "TODOS" | ServiceOrderStatusLabel;
  technicalObject: string;
  workCenter: string;
  startDate: string;
  endDate: string;
  planningGroup: string;
  responsible: string;
};

const emptyFilters: FiltersState = {
  search: "",
  order: "",
  status: "TODOS",
  technicalObject: "",
  workCenter: "",
  startDate: "",
  endDate: "",
  planningGroup: "",
  responsible: "TODOS"
};

const defaultStatusOptions: Array<"TODOS" | ServiceOrderStatusLabel> = [
  "TODOS",
  "ABERTA",
  "LIBERADA",
  "EM_ANDAMENTO",
  "AGUARDANDO_MATERIAL",
  "FECHADA",
  "CANCELADA"
];

export function ServiceOrdersPage({ data }: ServiceOrdersPageProps) {
  const [filters, setFilters] = useState<FiltersState>(emptyFilters);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [showImportPanel, setShowImportPanel] = useState(false);

  const statusOptions = useMemo<Array<"TODOS" | ServiceOrderStatusLabel>>(
    () => ["TODOS", ...(data.filterOptions.statuses.length ? data.filterOptions.statuses : defaultStatusOptions.slice(1))],
    [data.filterOptions.statuses]
  );

  const responsibleOptions = useMemo(() => {
    const values = new Set(
      data.filterOptions.responsibles.length
        ? data.filterOptions.responsibles
        : data.orders.map((order) => getResponsibleGroup(order))
    );
    return ["TODOS", ...Array.from(values).sort((a, b) => a.localeCompare(b, "pt-BR"))];
  }, [data.filterOptions.responsibles, data.orders]);

  const filteredOrders = useMemo(
    () => data.orders.filter((order) => matchesFilters(order, filters)),
    [data.orders, filters]
  );

  const groupedOrders = useMemo(() => groupOrdersByResponsible(filteredOrders), [filteredOrders]);

  function updateFilter<Key extends keyof FiltersState>(key: Key, value: FiltersState[Key]) {
    setFilters((current) => ({ ...current, [key]: value }));
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
      const allVisibleSelected = filteredOrders.length > 0 && filteredOrders.every((order) => current.has(order.id));
      if (allVisibleSelected) {
        return new Set(Array.from(current).filter((id) => !filteredOrders.some((order) => order.id === id)));
      }
      return new Set(Array.from(current).concat(filteredOrders.map((order) => order.id)));
    });
  }

  return (
    <section className="space-y-4 text-champagne">
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
            <p className="mt-1 text-xs text-zinc-500">
              Exibindo {filteredOrders.length.toLocaleString("pt-BR")} registros
            </p>
          </div>
        </div>
      </header>

      <ServiceOrderActions
        selectedCount={selected.size}
        source={data.source}
        showImportPanel={showImportPanel}
        onToggleImport={() => setShowImportPanel((current) => !current)}
        onClear={() => {
          setFilters(emptyFilters);
          setSelected(new Set());
        }}
      />

      {showImportPanel ? <ImportPreviewPanel onClose={() => setShowImportPanel(false)} /> : null}

      <ServiceOrderFilters
        filters={filters}
        statusOptions={statusOptions}
        responsibleOptions={responsibleOptions}
        onChange={updateFilter}
      />

      <ServiceOrdersTable
        groups={groupedOrders}
        selected={selected}
        visibleCount={filteredOrders.length}
        allVisibleSelected={filteredOrders.length > 0 && filteredOrders.every((order) => selected.has(order.id))}
        onToggleAll={toggleAllVisible}
        onToggleOrder={toggleOrder}
      />
    </section>
  );
}

type ServiceOrderActionsProps = {
  selectedCount: number;
  source: ServiceOrdersPageData["source"];
  showImportPanel: boolean;
  onToggleImport: () => void;
  onClear: () => void;
};

function ServiceOrderActions({
  selectedCount,
  source,
  showImportPanel,
  onToggleImport,
  onClear
}: ServiceOrderActionsProps) {
  return (
    <div className="flex flex-col gap-3 rounded-lg border border-gold/15 bg-[#090a0a] p-3 shadow-premium sm:flex-row sm:items-center sm:justify-between">
      <div className="flex flex-wrap items-center gap-2">
        <ActionButton icon={Upload} label="Importar Excel" active={showImportPanel} onClick={onToggleImport} />
        <ActionButton icon={RefreshCw} label="Atualizar dados" />
        <ActionButton icon={Download} label="Exportar" />
        <ActionButton icon={FilterX} label="Limpar filtros" onClick={onClear} />
      </div>
      <div className="flex items-center gap-3 text-xs text-zinc-400">
        <span>{selectedCount ? `${selectedCount} selecionada(s)` : "Nenhuma ordem selecionada"}</span>
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
  onClick?: () => void;
};

function ActionButton({ icon: Icon, label, active = false, onClick }: ActionButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex h-10 items-center gap-2 rounded-lg border px-3 text-xs font-semibold transition ${
        active
          ? "border-gold/55 bg-gold/15 text-gold"
          : "border-gold/20 bg-white/[0.04] text-zinc-200 hover:border-gold/40 hover:bg-gold/10 hover:text-white"
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

type ServiceOrderFiltersProps = {
  filters: FiltersState;
  statusOptions: Array<"TODOS" | ServiceOrderStatusLabel>;
  responsibleOptions: string[];
  onChange: <Key extends keyof FiltersState>(key: Key, value: FiltersState[Key]) => void;
};

function ServiceOrderFilters({ filters, statusOptions, responsibleOptions, onChange }: ServiceOrderFiltersProps) {
  return (
    <div className="rounded-lg border border-gold/15 bg-[#080909] p-4 shadow-premium">
      <div className="mb-3 flex items-center gap-2 text-xs font-bold uppercase tracking-[0.22em] text-gold">
        <Search className="h-4 w-4" />
        Filtros
      </div>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <FilterField label="Procurar">
          <input
            value={filters.search}
            onChange={(event) => onChange("search", event.target.value)}
            placeholder="Título, OS, equipamento, operação..."
            className={inputClassName}
          />
        </FilterField>

        <FilterField label="Ordem">
          <input
            value={filters.order}
            onChange={(event) => onChange("order", event.target.value)}
            placeholder="Ex.: 4005060"
            className={inputClassName}
          />
        </FilterField>

        <FilterField label="Status da ordem">
          <select
            value={filters.status}
            onChange={(event) => onChange("status", event.target.value as FiltersState["status"])}
            className={inputClassName}
          >
            {statusOptions.map((status) => (
              <option key={status} value={status}>
                {status === "TODOS" ? "Todos os status" : status}
              </option>
            ))}
          </select>
        </FilterField>

        <FilterField label="Objeto técnico">
          <input
            value={filters.technicalObject}
            onChange={(event) => onChange("technicalObject", event.target.value)}
            placeholder="Equipamento ou código técnico"
            className={inputClassName}
          />
        </FilterField>

        <FilterField label="Centro para centro de trabalho">
          <input
            value={filters.workCenter}
            onChange={(event) => onChange("workCenter", event.target.value)}
            placeholder="Centro, área ou planejamento"
            className={inputClassName}
          />
        </FilterField>

        <FilterField label="Data-base do início">
          <div className="grid grid-cols-2 gap-2">
            <input
              type="date"
              value={filters.startDate}
              onChange={(event) => onChange("startDate", event.target.value)}
              className={inputClassName}
            />
            <input
              type="date"
              value={filters.endDate}
              onChange={(event) => onChange("endDate", event.target.value)}
              className={inputClassName}
            />
          </div>
        </FilterField>

        <FilterField label="Grupo de planejamento">
          <input
            value={filters.planningGroup}
            onChange={(event) => onChange("planningGroup", event.target.value)}
            placeholder="Ex.: Manut. Mecanica"
            className={inputClassName}
          />
        </FilterField>

        <FilterField label="Responsável (ordem)">
          <select
            value={filters.responsible}
            onChange={(event) => onChange("responsible", event.target.value)}
            className={inputClassName}
          >
            {responsibleOptions.map((responsible) => (
              <option key={responsible} value={responsible}>
                {responsible === "TODOS" ? "Todos os responsáveis" : responsible}
              </option>
            ))}
          </select>
        </FilterField>
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

type ServiceOrdersTableProps = {
  groups: Array<{ responsible: string; orders: ServiceOrderListItem[] }>;
  selected: Set<string>;
  visibleCount: number;
  allVisibleSelected: boolean;
  onToggleAll: () => void;
  onToggleOrder: (id: string) => void;
};

function ServiceOrdersTable({
  groups,
  selected,
  visibleCount,
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
          {visibleCount.toLocaleString("pt-BR")} registro(s)
        </span>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[1280px] border-collapse text-left text-xs">
          <thead className="bg-black/50 text-[11px] uppercase tracking-wide text-zinc-400">
            <tr className="border-b border-gold/15">
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
                <td colSpan={9} className="px-4 py-12 text-center text-sm text-zinc-400">
                  Nenhuma ordem encontrada para os filtros aplicados.
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
  group: { responsible: string; orders: ServiceOrderListItem[] };
  selected: Set<string>;
  onToggleOrder: (id: string) => void;
}) {
  return (
    <>
      <ServiceOrderGroupHeader responsible={group.responsible} count={group.orders.length} />
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

function ServiceOrderGroupHeader({ responsible, count }: { responsible: string; count: number }) {
  return (
    <tr className="border-y border-gold/15 bg-[#11100d]">
      <td colSpan={9} className="px-4 py-2">
        <div className="flex items-center justify-between gap-3">
          <span className="text-xs font-semibold uppercase tracking-wide text-gold">
            Responsável (ordem): {responsible}
          </span>
          <span className="text-[11px] text-zinc-500">{count.toLocaleString("pt-BR")} ordem(ns)</span>
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

function matchesFilters(order: ServiceOrderListItem, filters: FiltersState) {
  const haystack = [
    order.title,
    order.osNumber,
    order.technicalObject,
    order.equipmentName,
    order.equipmentCode,
    order.operation,
    order.operationCode,
    order.responsibleName,
    order.responsibleId,
    order.planningGroup,
    order.planningGroupCode
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  const openedDate = order.openedAt ? order.openedAt.slice(0, 10) : "";
  const responsible = getResponsibleGroup(order);

  return (
    includes(haystack, filters.search) &&
    includes(order.osNumber, filters.order) &&
    (filters.status === "TODOS" || order.status === filters.status) &&
    includes(order.technicalObject, filters.technicalObject) &&
    includes(order.workCenter ?? "", filters.workCenter) &&
    includes(formatPlanningGroup(order), filters.planningGroup) &&
    (filters.responsible === "TODOS" || responsible === filters.responsible) &&
    (!filters.startDate || (openedDate && openedDate >= filters.startDate)) &&
    (!filters.endDate || (openedDate && openedDate <= filters.endDate))
  );
}

function groupOrdersByResponsible(orders: ServiceOrderListItem[]) {
  const groups = new Map<string, ServiceOrderListItem[]>();

  for (const order of orders) {
    const responsible = getResponsibleGroup(order);
    groups.set(responsible, [...(groups.get(responsible) ?? []), order]);
  }

  return Array.from(groups.entries())
    .map(([responsible, groupOrders]) => ({ responsible, orders: groupOrders }))
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

function includes(value: string, term: string) {
  if (!term.trim()) {
    return true;
  }

  return value.toLowerCase().includes(term.trim().toLowerCase());
}
