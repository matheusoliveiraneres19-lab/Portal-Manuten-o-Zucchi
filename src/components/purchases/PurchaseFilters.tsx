"use client";

import { Check, FilterX, SlidersHorizontal } from "lucide-react";
import { DateRangeFilter } from "@/components/service-orders/filters/DateRangeFilter";
import { PURCHASE_TYPE_LABELS, ITEM_NATURE_LABELS } from "@/utils/purchases-normalizer";
import type { ItemNature, PurchaseFilterOptions, PurchaseType } from "@/types/purchases";
import type { AppliedPurchaseFilters } from "@/components/purchases/filters";

const PENDING_STATUS_OPTIONS: Array<{ value: string; label: string }> = [
  { value: "sem-pedido", label: "Sem pedido criado" },
  { value: "pendente-migo", label: "Pendente de MIGO" },
  { value: "pendente-miro", label: "Pendente de MIRO" },
  { value: "atrasado", label: "Atrasado (em aberto)" },
  { value: "recebido-atraso", label: "Recebido com atraso" }
];

type PurchaseFiltersProps = {
  draft: AppliedPurchaseFilters;
  options: PurchaseFilterOptions;
  isPending: boolean;
  showPendingStatus?: boolean;
  onChange: <Key extends keyof AppliedPurchaseFilters>(key: Key, value: AppliedPurchaseFilters[Key]) => void;
  onApply: () => void;
  onClear: () => void;
};

const selectClassName =
  "h-10 w-full rounded-lg border border-gold/15 bg-black/35 px-3 text-sm text-zinc-100 outline-none transition [color-scheme:dark] focus:border-gold/55 focus:bg-black/50";
const labelClassName = "mb-1.5 block text-[11px] font-semibold uppercase tracking-wide text-zinc-400";

export function PurchaseFilters({
  draft,
  options,
  isPending,
  showPendingStatus = false,
  onChange,
  onApply,
  onClear
}: PurchaseFiltersProps) {
  return (
    <div className="rounded-lg border border-gold/20 bg-[#080909] p-4 shadow-premium sm:p-5">
      <div className="mb-4 flex items-center gap-2 text-xs font-bold uppercase tracking-[0.22em] text-gold">
        <SlidersHorizontal className="h-4 w-4" />
        Filtros do módulo
      </div>

      <div className="grid gap-x-4 gap-y-4 md:grid-cols-2 xl:grid-cols-4">
        <div className="md:col-span-2 xl:col-span-1">
          <DateRangeFilter
            label="Período (data do pedido)"
            startDate={draft.startDate}
            endDate={draft.endDate}
            onChange={({ startDate, endDate }) => {
              onChange("startDate", startDate);
              onChange("endDate", endDate);
            }}
          />
        </div>

        <label className="block">
          <span className={labelClassName}>Fornecedor</span>
          <select value={draft.supplier} onChange={(event) => onChange("supplier", event.target.value)} className={selectClassName}>
            <option value="">Todos os fornecedores</option>
            {options.suppliers.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>

        <label className="block">
          <span className={labelClassName}>Categoria (Grupo Merc)</span>
          <select value={draft.category} onChange={(event) => onChange("category", event.target.value)} className={selectClassName}>
            <option value="">Todas as categorias</option>
            {options.categories.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>

        <label className="block">
          <span className={labelClassName}>Grupo Comp</span>
          <select value={draft.purchaseType} onChange={(event) => onChange("purchaseType", event.target.value)} className={selectClassName}>
            <option value="">Todos</option>
            {options.purchaseTypes.map((type) => (
              <option key={type} value={type}>
                {PURCHASE_TYPE_LABELS[type as PurchaseType]}
              </option>
            ))}
          </select>
        </label>

        <label className="block">
          <span className={labelClassName}>Natureza</span>
          <select value={draft.nature} onChange={(event) => onChange("nature", event.target.value)} className={selectClassName}>
            <option value="">Material e serviço</option>
            {options.natures.map((nature) => (
              <option key={nature} value={nature}>
                {ITEM_NATURE_LABELS[nature as ItemNature]}
              </option>
            ))}
          </select>
        </label>

        <label className="block">
          <span className={labelClassName}>Requisitante</span>
          <select value={draft.requester} onChange={(event) => onChange("requester", event.target.value)} className={selectClassName}>
            <option value="">Todos</option>
            {options.requesters.map((requester) => (
              <option key={requester} value={requester}>
                {requester}
              </option>
            ))}
          </select>
        </label>

        {showPendingStatus ? (
          <label className="block">
            <span className={labelClassName}>Status</span>
            <select value={draft.pendingStatus} onChange={(event) => onChange("pendingStatus", event.target.value)} className={selectClassName}>
              <option value="">Todas as pendências</option>
              {PENDING_STATUS_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
        ) : null}

        <label className="block">
          <span className={labelClassName}>Requisição</span>
          <input
            value={draft.requisition}
            onChange={(event) => onChange("requisition", event.target.value)}
            onKeyDown={(event) => event.key === "Enter" && onApply()}
            placeholder="Nº da requisição"
            className={selectClassName}
          />
        </label>

        <label className="block">
          <span className={labelClassName}>Pedido de compra</span>
          <input
            value={draft.purchaseOrder}
            onChange={(event) => onChange("purchaseOrder", event.target.value)}
            onKeyDown={(event) => event.key === "Enter" && onApply()}
            placeholder="Nº do pedido"
            className={selectClassName}
          />
        </label>

        <label className="block xl:col-span-2">
          <span className={labelClassName}>Busca livre (material, descrição, fornecedor)</span>
          <input
            value={draft.search}
            onChange={(event) => onChange("search", event.target.value)}
            onKeyDown={(event) => event.key === "Enter" && onApply()}
            placeholder="Ex.: rolamento, mangueira, motor..."
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
