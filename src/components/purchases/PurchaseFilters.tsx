"use client";

import { Check, FilterX, SlidersHorizontal } from "lucide-react";
import { DateRangeFilter } from "@/components/service-orders/filters/DateRangeFilter";
import { MultiSelectFilter } from "@/components/common/MultiSelectFilter";
import {
  ITEM_NATURE_LABELS,
  PURCHASE_DATE_FIELD_LABELS,
  PURCHASE_OPERATIONAL_STATUSES
} from "@/utils/purchases-normalizer";
import type { ItemNature, PurchaseFilterOptions } from "@/types/purchases";
import type { AppliedPurchaseFilters } from "@/components/purchases/filters";

type PurchaseFiltersProps = {
  draft: AppliedPurchaseFilters;
  options: PurchaseFilterOptions;
  isPending: boolean;
  onChange: <Key extends keyof AppliedPurchaseFilters>(key: Key, value: AppliedPurchaseFilters[Key]) => void;
  onApply: () => void;
  onClear: () => void;
};

const selectClassName =
  "h-10 w-full rounded-lg border border-gold/15 bg-black/35 px-3 text-sm text-zinc-100 outline-none transition [color-scheme:dark] focus:border-gold/55 focus:bg-black/50";
const labelClassName = "mb-1.5 block text-[11px] font-semibold uppercase tracking-wide text-zinc-400";

const NATURE_OPTIONS = (["MATERIAL", "SERVICO"] as ItemNature[]).map((value) => ({
  value,
  label: ITEM_NATURE_LABELS[value]
}));
const DATE_FIELD_OPTIONS = Object.entries(PURCHASE_DATE_FIELD_LABELS).map(([value, label]) => ({ value, label }));

export function PurchaseFilters({ draft, options, isPending, onChange, onApply, onClear }: PurchaseFiltersProps) {
  return (
    <div className="rounded-lg border border-gold/20 bg-[#080909] p-4 shadow-premium sm:p-5">
      <div className="mb-4 flex items-center gap-2 text-xs font-bold uppercase tracking-[0.22em] text-gold">
        <SlidersHorizontal className="h-4 w-4" />
        Filtros do módulo
      </div>

      <div className="grid gap-x-4 gap-y-4 md:grid-cols-2 xl:grid-cols-3">
        <MultiSelectFilter
          label="Fornecedor"
          options={options.suppliers}
          selectedValues={draft.suppliers}
          onChange={(values) => onChange("suppliers", values)}
          placeholder="Todos os fornecedores"
          searchPlaceholder="Buscar fornecedor..."
        />
        <MultiSelectFilter
          label="Categoria (Grupo Merc)"
          options={options.categories}
          selectedValues={draft.categories}
          onChange={(values) => onChange("categories", values)}
          placeholder="Todas as categorias"
          searchPlaceholder="Buscar categoria..."
        />
        <MultiSelectFilter
          label="Grupo Comp"
          options={options.purchasingGroups}
          selectedValues={draft.purchasingGroups}
          onChange={(values) => onChange("purchasingGroups", values)}
          placeholder="Todos os grupos"
          searchPlaceholder="Buscar grupo..."
        />
        <MultiSelectFilter
          label="Natureza"
          options={NATURE_OPTIONS}
          selectedValues={draft.itemNatures}
          onChange={(values) => onChange("itemNatures", values)}
          placeholder="Material e serviço"
        />
        <MultiSelectFilter
          label="Status operacional"
          options={PURCHASE_OPERATIONAL_STATUSES}
          selectedValues={draft.operationalStatuses}
          onChange={(values) => onChange("operationalStatuses", values)}
          placeholder="Todos os status"
          searchPlaceholder="Buscar status..."
        />
        <MultiSelectFilter
          label="Requisitante"
          options={options.requesters.map((requester) => ({ value: requester, label: requester }))}
          selectedValues={draft.requesters}
          onChange={(values) => onChange("requesters", values)}
          placeholder="Todos os requisitantes"
          searchPlaceholder="Buscar requisitante..."
        />

        <label className="block">
          <span className={labelClassName}>Filtrar período por</span>
          <select value={draft.dateField} onChange={(event) => onChange("dateField", event.target.value)} className={selectClassName}>
            <option value="">Data de referência (pedido → requisição)</option>
            {DATE_FIELD_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>

        <div className="md:col-span-2 xl:col-span-1">
          <DateRangeFilter
            label="Período"
            startDate={draft.startDate}
            endDate={draft.endDate}
            onChange={({ startDate, endDate }) => {
              onChange("startDate", startDate);
              onChange("endDate", endDate);
            }}
          />
        </div>

        <label className="block xl:col-span-3">
          <span className={labelClassName}>Busca livre (material, descrição, fornecedor, requisição, pedido)</span>
          <input
            value={draft.search}
            onChange={(event) => onChange("search", event.target.value)}
            onKeyDown={(event) => event.key === "Enter" && onApply()}
            placeholder="Ex.: rolamento, mangueira, motor, 4500123..."
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
