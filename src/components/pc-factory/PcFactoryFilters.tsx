"use client";

import { Check, FilterX, SlidersHorizontal } from "lucide-react";
import { DateRangeFilter } from "@/components/service-orders/filters/DateRangeFilter";
import { MultiSelectFilter } from "@/components/common/MultiSelectFilter";
import type { PcFactoryFilterOptions } from "@/types/pc-factory";
import type { AppliedPcFactoryFilters } from "@/components/pc-factory/PcFactoryPage";

type PcFactoryFiltersProps = {
  draft: AppliedPcFactoryFilters;
  options: PcFactoryFilterOptions;
  isPending: boolean;
  onChange: <Key extends keyof AppliedPcFactoryFilters>(key: Key, value: AppliedPcFactoryFilters[Key]) => void;
  onApply: () => void;
  onClear: () => void;
};

const TOGGLES: Array<{ key: keyof AppliedPcFactoryFilters; label: string }> = [
  { key: "onlyMaintenance", label: "Somente manutenção" },
  { key: "onlyMechanical", label: "Só mecânica" },
  { key: "onlyElectrical", label: "Só elétrica" },
  { key: "onlyAutomation", label: "Só automação" },
  { key: "onlyWaiting", label: "Só aguardando" },
  { key: "excludeOutOfPlanned", label: "Excluir fora de turno / não programado" }
];

export function PcFactoryFilters({ draft, options, isPending, onChange, onApply, onClear }: PcFactoryFiltersProps) {
  return (
    <div className="rounded-lg border border-gold/20 bg-ink p-4 shadow-premium sm:p-5">
      <div className="mb-4 flex items-center gap-2 text-xs font-bold uppercase tracking-[0.22em] text-gold">
        <SlidersHorizontal className="h-4 w-4" />
        Filtros do módulo
      </div>

      <div className="grid gap-x-4 gap-y-4 md:grid-cols-2 xl:grid-cols-3">
        <MultiSelectFilter
          label="Grupo Portal"
          options={options.groupPortals}
          selectedValues={draft.groupPortals}
          onChange={(values) => onChange("groupPortals", values)}
          placeholder="Todos os grupos"
          searchPlaceholder="Buscar grupo..."
          disabled={options.groupPortals.length === 0}
        />
        <MultiSelectFilter
          label="Linha / Área"
          options={options.productionLines}
          selectedValues={draft.productionLines}
          onChange={(values) => onChange("productionLines", values)}
          placeholder="Todas as linhas"
          searchPlaceholder="Buscar linha..."
          disabled={options.productionLines.length === 0}
        />
        <MultiSelectFilter
          label="Máquina / recurso"
          options={options.resources}
          selectedValues={draft.resources}
          onChange={(values) => onChange("resources", values)}
          placeholder="Todas as máquinas"
          searchPlaceholder="Buscar máquina..."
          disabled={options.resources.length === 0}
        />
        <MultiSelectFilter
          label="Nome Status Recurso"
          options={options.statusNames}
          selectedValues={draft.statusNames}
          onChange={(values) => onChange("statusNames", values)}
          placeholder="Todos os status"
          searchPlaceholder="Buscar status..."
          disabled={options.statusNames.length === 0}
        />
        <MultiSelectFilter
          label="Classificação"
          options={options.categories.map((c) => ({ value: c.value, label: c.label }))}
          selectedValues={draft.categories}
          onChange={(values) => onChange("categories", values)}
          placeholder="Todas as classificações"
          searchPlaceholder="Buscar classificação..."
        />
        <MultiSelectFilter
          label="Setor"
          options={options.sectors}
          selectedValues={draft.sectors}
          onChange={(values) => onChange("sectors", values)}
          placeholder="Todos os setores"
          searchPlaceholder="Buscar setor..."
          disabled={options.sectors.length === 0}
        />
        <MultiSelectFilter
          label="Turno"
          options={options.shifts}
          selectedValues={draft.shifts}
          onChange={(values) => onChange("shifts", values)}
          placeholder="Todos os turnos"
          searchPlaceholder="Buscar turno..."
          disabled={options.shifts.length === 0}
        />
        <DateRangeFilter
          label="Período (início do evento)"
          startDate={draft.startDate}
          endDate={draft.endDate}
          onChange={({ startDate, endDate }) => {
            onChange("startDate", startDate);
            onChange("endDate", endDate);
          }}
        />
        <label className="block xl:col-span-2">
          <span className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wide text-zinc-400">
            Busca livre (máquina, linha, status, ordem, produto)
          </span>
          <input
            value={draft.search}
            onChange={(event) => onChange("search", event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") onApply();
            }}
            placeholder="Ex.: Linha 02, Prensa, Manutenção Mecânica..."
            className="h-10 w-full rounded-lg border border-gold/15 bg-black/35 px-3 text-sm text-zinc-100 outline-none transition [color-scheme:dark] focus:border-gold/55 focus:bg-black/50"
          />
        </label>
      </div>

      {/* Toggles de manutenção */}
      <div className="mt-4 flex flex-wrap gap-2">
        {TOGGLES.map((toggle) => {
          const active = Boolean(draft[toggle.key]);
          return (
            <button
              key={toggle.key}
              type="button"
              onClick={() => onChange(toggle.key, (!active) as never)}
              className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[11px] font-semibold transition ${
                active
                  ? "border-gold/55 bg-gold/15 text-gold"
                  : "border-gold/20 text-zinc-400 hover:border-gold/40 hover:text-zinc-200"
              }`}
            >
              <span className={`grid h-3.5 w-3.5 place-items-center rounded border ${active ? "border-gold bg-gold/25" : "border-zinc-600"}`}>
                {active ? <Check className="h-2.5 w-2.5 text-gold" /> : null}
              </span>
              {toggle.label}
            </button>
          );
        })}
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
