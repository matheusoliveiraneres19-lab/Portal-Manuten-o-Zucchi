"use client";

import { Check, FilterX, SlidersHorizontal } from "lucide-react";
import { DateRangeFilter } from "@/components/service-orders/filters/DateRangeFilter";
import { LUBRICANT_CATEGORY_LABELS } from "@/utils/lubricants-normalizer";
import type { LubricantFilterOptions } from "@/types/lubricants";
import type { AppliedLubricantFilters } from "@/components/lubricants/LubricantsPage";

const MONTHS = [
  "Janeiro",
  "Fevereiro",
  "Março",
  "Abril",
  "Maio",
  "Junho",
  "Julho",
  "Agosto",
  "Setembro",
  "Outubro",
  "Novembro",
  "Dezembro"
];

type LubricantFiltersProps = {
  draft: AppliedLubricantFilters;
  options: LubricantFilterOptions;
  isPending: boolean;
  onChange: <Key extends keyof AppliedLubricantFilters>(key: Key, value: AppliedLubricantFilters[Key]) => void;
  onApply: () => void;
  onClear: () => void;
};

const selectClassName =
  "h-10 w-full rounded-lg border border-gold/15 bg-black/35 px-3 text-sm text-zinc-100 outline-none transition [color-scheme:dark] focus:border-gold/55 focus:bg-black/50";
const labelClassName = "mb-1.5 block text-[11px] font-semibold uppercase tracking-wide text-zinc-400";

export function LubricantFilters({ draft, options, isPending, onChange, onApply, onClear }: LubricantFiltersProps) {
  const years = options.years.length ? options.years : [draft.year];

  return (
    <div className="rounded-lg border border-gold/20 bg-[#080909] p-4 shadow-premium sm:p-5">
      <div className="mb-4 flex items-center gap-2 text-xs font-bold uppercase tracking-[0.22em] text-gold">
        <SlidersHorizontal className="h-4 w-4" />
        Filtros do módulo
      </div>

      <div className="grid gap-x-4 gap-y-4 md:grid-cols-2 xl:grid-cols-4">
        <label className="block">
          <span className={labelClassName}>Ano de referência</span>
          <select
            value={draft.year}
            onChange={(event) => onChange("year", Number(event.target.value))}
            className={selectClassName}
          >
            {years.map((year) => (
              <option key={year} value={year}>
                {year}
              </option>
            ))}
          </select>
        </label>

        <label className="block">
          <span className={labelClassName}>Mês de referência</span>
          <select
            value={draft.month}
            onChange={(event) => onChange("month", Number(event.target.value))}
            className={selectClassName}
          >
            {MONTHS.map((label, index) => (
              <option key={label} value={index + 1}>
                {label}
              </option>
            ))}
          </select>
        </label>

        <label className="block">
          <span className={labelClassName}>Código / material</span>
          <select
            value={draft.code}
            onChange={(event) => onChange("code", event.target.value)}
            className={selectClassName}
          >
            <option value="">Todos os materiais</option>
            {options.codes.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>

        <label className="block">
          <span className={labelClassName}>Tipo de movimento</span>
          <select
            value={draft.category}
            onChange={(event) => onChange("category", event.target.value)}
            className={selectClassName}
          >
            <option value="">Todos os tipos</option>
            {options.movementCategories.map((category) => (
              <option key={category} value={category}>
                {LUBRICANT_CATEGORY_LABELS[category]}
              </option>
            ))}
          </select>
        </label>

        <label className="block">
          <span className={labelClassName}>Unidade</span>
          <select
            value={draft.unit}
            onChange={(event) => onChange("unit", event.target.value)}
            className={selectClassName}
          >
            <option value="">Todas</option>
            {options.units.map((unit) => (
              <option key={unit} value={unit}>
                {unit}
              </option>
            ))}
          </select>
        </label>

        <div className="md:col-span-1">
          <DateRangeFilter
            label="Período (histórico)"
            startDate={draft.startDate}
            endDate={draft.endDate}
            onChange={({ startDate, endDate }) => {
              onChange("startDate", startDate);
              onChange("endDate", endDate);
            }}
          />
        </div>

        <label className="block xl:col-span-2">
          <span className={labelClassName}>Busca livre (código, descrição, movimento)</span>
          <input
            value={draft.search}
            onChange={(event) => onChange("search", event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                onApply();
              }
            }}
            placeholder="Ex.: ISO 68, graxa, SM para ordem..."
            className={selectClassName}
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
