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

export function PcFactoryFilters({ draft, options, isPending, onChange, onApply, onClear }: PcFactoryFiltersProps) {
  return (
    <div className="rounded-lg border border-gold/20 bg-[#080909] p-4 shadow-premium sm:p-5">
      <div className="mb-4 flex items-center gap-2 text-xs font-bold uppercase tracking-[0.22em] text-gold">
        <SlidersHorizontal className="h-4 w-4" />
        Filtros do módulo
      </div>

      <div className="grid gap-x-4 gap-y-4 md:grid-cols-2 xl:grid-cols-3">
        <MultiSelectFilter
          label="Linha de produção"
          options={options.productionLines}
          selectedValues={draft.productionLines}
          onChange={(values) => onChange("productionLines", values)}
          placeholder="Todas as linhas"
          searchPlaceholder="Buscar linha..."
        />

        <MultiSelectFilter
          label="Máquina / recurso"
          options={options.resources}
          selectedValues={draft.resources}
          onChange={(values) => onChange("resources", values)}
          placeholder="Todas as máquinas"
          searchPlaceholder="Buscar máquina..."
        />

        <MultiSelectFilter
          label="Status operacional"
          options={options.statuses.map((status) => ({ value: status.value, label: status.label }))}
          selectedValues={draft.statuses}
          onChange={(values) => onChange("statuses", values)}
          placeholder="Todos os status"
          searchPlaceholder="Buscar status..."
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

        <label className="block xl:col-span-3">
          <span className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wide text-zinc-400">
            Busca livre (máquina, linha, ordem, produto)
          </span>
          <input
            value={draft.search}
            onChange={(event) => onChange("search", event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                onApply();
              }
            }}
            placeholder="Ex.: Linha 02, Prensa, OP 12345..."
            className="h-10 w-full rounded-lg border border-gold/15 bg-black/35 px-3 text-sm text-zinc-100 outline-none transition [color-scheme:dark] focus:border-gold/55 focus:bg-black/50"
          />
        </label>
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
