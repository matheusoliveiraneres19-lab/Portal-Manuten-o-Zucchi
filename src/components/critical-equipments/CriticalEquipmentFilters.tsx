"use client";

import { Check, FilterX, SlidersHorizontal } from "lucide-react";
import { MultiSelectFilter } from "@/components/service-orders/filters/MultiSelectFilter";
import { DateRangeFilter } from "@/components/service-orders/filters/DateRangeFilter";
import type { AppliedCriticalEquipmentFilters } from "@/components/critical-equipments/CriticalEquipmentsPage";
import type { CriticalEquipmentFilterOptions } from "@/types/critical-equipments";
import {
  ORDER_CLASS_LABELS,
  PLANNING_ACTIVITY_LABELS,
  PLANNING_ACTIVITY_ORDER,
  PLANNING_GROUP_LABELS,
  PLANNING_GROUP_ORDER,
  type OrderClassFilter,
  type PlanningActivityTypeKey,
  type PlanningGroupKey
} from "@/utils/service-order-planning";
import type { ServiceOrderStatusLabel } from "@/types/service-orders";

const STATUS_OPTIONS: ServiceOrderStatusLabel[] = [
  "ABERTA",
  "LIBERADA",
  "EM_ANDAMENTO",
  "AGUARDANDO_MATERIAL",
  "FECHADA",
  "CANCELADA"
];

export const AREA_LABELS: Record<string, string> = {
  MECANICA: "Mecânica",
  ELETRICA: "Elétrica",
  LUBRIFICACAO: "Lubrificação",
  PCM: "PCM",
  OPERACIONAL: "Operacional"
};

const AREA_OPTIONS = Object.entries(AREA_LABELS).map(([value, label]) => ({ value, label }));
const TOP_OPTIONS = [5, 10, 20, 50];

/** Grupos normalizados (TAREFA 2) na ordem oficial do dashboard. */
const PLANNING_GROUP_OPTIONS = PLANNING_GROUP_ORDER.map((value) => ({
  value,
  label: PLANNING_GROUP_LABELS[value]
}));

/** Tipos de atividade normalizados (TAREFA 4) na ordem oficial do dashboard. */
const ACTIVITY_OPTIONS = PLANNING_ACTIVITY_ORDER.map((value) => ({
  value,
  label: PLANNING_ACTIVITY_LABELS[value]
}));

const ORDER_CLASS_OPTIONS: OrderClassFilter[] = ["TODAS", "CORRETIVA", "PLANEJADA"];

type CriticalEquipmentFiltersProps = {
  draft: AppliedCriticalEquipmentFilters;
  options: CriticalEquipmentFilterOptions;
  isPending: boolean;
  onChange: <Key extends keyof AppliedCriticalEquipmentFilters>(
    key: Key,
    value: AppliedCriticalEquipmentFilters[Key]
  ) => void;
  onApply: () => void;
  onClear: () => void;
};

export function CriticalEquipmentFilters({
  draft,
  options,
  isPending,
  onChange,
  onApply,
  onClear
}: CriticalEquipmentFiltersProps) {
  return (
    <div className="rounded-lg border border-gold/20 bg-ink p-4 shadow-premium sm:p-5">
      <div className="mb-4 flex items-center gap-2 text-xs font-bold uppercase tracking-[0.22em] text-gold">
        <SlidersHorizontal className="h-4 w-4" />
        Filtros da análise
      </div>

      <div className="grid gap-x-4 gap-y-4 md:grid-cols-2 xl:grid-cols-4">
        <DateRangeFilter
          label="Período"
          startDate={draft.startDate}
          endDate={draft.endDate}
          onChange={({ startDate, endDate }) => {
            onChange("startDate", startDate);
            onChange("endDate", endDate);
          }}
        />

        <MultiSelectFilter
          label="Status da OS"
          options={STATUS_OPTIONS.map((status) => ({ value: status, label: status }))}
          selected={draft.statuses}
          onChange={(next) => onChange("statuses", next as ServiceOrderStatusLabel[])}
          placeholder="Todos os status"
          searchable={false}
        />

        <MultiSelectFilter
          label="Grupo de planejamento"
          options={PLANNING_GROUP_OPTIONS}
          selected={draft.planningGroupKeys}
          onChange={(next) => onChange("planningGroupKeys", next as PlanningGroupKey[])}
          placeholder="Todos os grupos"
          searchable={false}
        />

        <MultiSelectFilter
          label="Tipo de atividade"
          options={ACTIVITY_OPTIONS}
          selected={draft.activityTypes}
          onChange={(next) => onChange("activityTypes", next as PlanningActivityTypeKey[])}
          placeholder="Todos os tipos"
          searchable={false}
        />

        <label className="block">
          <span className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wide text-zinc-400">
            Corretiva / Planejada
          </span>
          <select
            value={draft.orderClass}
            onChange={(event) => onChange("orderClass", event.target.value as OrderClassFilter)}
            className="h-10 w-full rounded-lg border border-gold/15 bg-black/35 px-3 text-sm text-zinc-100 outline-none transition [color-scheme:dark] focus:border-gold/55 focus:bg-black/50"
          >
            {ORDER_CLASS_OPTIONS.map((value) => (
              <option key={value} value={value}>
                {ORDER_CLASS_LABELS[value]}
              </option>
            ))}
          </select>
        </label>

        <MultiSelectFilter
          label="Grupo (rótulo SAP)"
          options={options.planningGroups.map((value) => ({ value, label: value }))}
          selected={draft.planningGroups}
          onChange={(next) => onChange("planningGroups", next)}
          placeholder="Todos os rótulos"
        />

        <MultiSelectFilter
          label="Responsável"
          options={options.responsibles.map((value) => ({ value, label: value }))}
          selected={draft.responsibleNames}
          onChange={(next) => onChange("responsibleNames", next)}
          placeholder="Todos os responsáveis"
        />

        <MultiSelectFilter
          label="Área / Centro de trabalho"
          options={AREA_OPTIONS}
          selected={draft.areas}
          onChange={(next) => onChange("areas", next)}
          placeholder="Todas as áreas"
          searchable={false}
        />

        <MultiSelectFilter
          label="Família"
          options={options.families}
          selected={draft.families}
          onChange={(next) => onChange("families", next)}
          placeholder="Todas as famílias"
        />

        <MultiSelectFilter
          label="Centro de custo"
          options={options.costCenters.map((value) => ({ value, label: value }))}
          selected={draft.costCenters}
          onChange={(next) => onChange("costCenters", next)}
          placeholder="Todos os centros de custo"
        />

        <MultiSelectFilter
          label="Setor / Galpão"
          options={options.sectors.map((value) => ({ value, label: value }))}
          selected={draft.sectors}
          onChange={(next) => onChange("sectors", next)}
          placeholder="Todos os setores"
        />

        <label className="block">
          <span className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wide text-zinc-400">
            Top N equipamentos
          </span>
          <select
            value={draft.limit}
            onChange={(event) => onChange("limit", Number(event.target.value))}
            className="h-10 w-full rounded-lg border border-gold/15 bg-black/35 px-3 text-sm text-zinc-100 outline-none transition [color-scheme:dark] focus:border-gold/55 focus:bg-black/50"
          >
            {TOP_OPTIONS.map((value) => (
              <option key={value} value={value}>
                Top {value}
              </option>
            ))}
          </select>
        </label>

        <Toggle
          label="Somente com OS abertas"
          checked={draft.onlyOpenOrders}
          onChange={(checked) => onChange("onlyOpenOrders", checked)}
        />

        <Toggle
          label="Somente com horas apontadas"
          checked={draft.onlyWithWorkedHours}
          onChange={(checked) => onChange("onlyWithWorkedHours", checked)}
        />

        <Toggle
          label="Somente reincidentes"
          checked={draft.onlyRecurrent}
          onChange={(checked) => onChange("onlyRecurrent", checked)}
        />

        <Toggle
          label="Somente críticos"
          checked={draft.onlyCritical}
          onChange={(checked) => onChange("onlyCritical", checked)}
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

function Toggle({
  label,
  checked,
  onChange
}: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="flex cursor-pointer items-end gap-2.5 pb-0.5">
      <span className="flex-1">
        <span className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wide text-zinc-400">Filtro</span>
        <span className="flex h-10 items-center gap-2.5 rounded-lg border border-gold/15 bg-black/35 px-3">
          <button
            type="button"
            role="switch"
            aria-checked={checked}
            onClick={() => onChange(!checked)}
            className={`relative h-5 w-9 shrink-0 rounded-full transition ${checked ? "bg-gold" : "bg-zinc-600"}`}
          >
            <span
              className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition-all ${checked ? "left-[18px]" : "left-0.5"}`}
            />
          </button>
          <span className="truncate text-xs text-zinc-200">{label}</span>
        </span>
      </span>
    </label>
  );
}
