"use client";

import { FilterX, X } from "lucide-react";

export type ActiveFilterChip = {
  /** Identificador único do chip (grupo + valor). */
  id: string;
  /** Rótulo do grupo, ex.: "Status". */
  groupLabel: string;
  /** Valor exibido, ex.: "EM_ANDAMENTO". */
  valueLabel: string;
  /** Remove apenas este filtro (atualiza a URL/tabela). */
  onRemove: () => void;
};

type ActiveFilterChipsProps = {
  chips: ActiveFilterChip[];
  onClearAll: () => void;
};

export function ActiveFilterChips({ chips, onClearAll }: ActiveFilterChipsProps) {
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-lg border border-gold/15 bg-[#080909] p-3 shadow-premium">
      <span className="inline-flex items-center gap-2 rounded-md border border-gold/25 bg-gold/10 px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide text-gold">
        Filtros ativos: {chips.length}
      </span>

      {chips.length ? (
        <>
          {chips.map((chip) => (
            <span
              key={chip.id}
              className="inline-flex items-center gap-1.5 rounded-md border border-gold/20 bg-black/40 py-1 pl-2.5 pr-1.5 text-xs text-champagne"
            >
              <span className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500">{chip.groupLabel}:</span>
              <span className="font-medium text-zinc-100">{chip.valueLabel}</span>
              <button
                type="button"
                onClick={chip.onRemove}
                aria-label={`Remover filtro ${chip.groupLabel}: ${chip.valueLabel}`}
                className="grid h-4 w-4 place-items-center rounded-full text-zinc-400 transition hover:bg-danger/80 hover:text-white"
              >
                <X className="h-3 w-3" strokeWidth={2.5} />
              </button>
            </span>
          ))}

          <button
            type="button"
            onClick={onClearAll}
            className="ml-auto inline-flex h-8 items-center gap-1.5 rounded-lg border border-gold/20 px-2.5 text-xs font-semibold text-zinc-300 transition hover:border-gold/40 hover:text-white"
          >
            <FilterX className="h-3.5 w-3.5" />
            Limpar todos
          </button>
        </>
      ) : (
        <span className="text-xs text-zinc-500">Nenhum filtro aplicado — exibindo todas as ordens.</span>
      )}
    </div>
  );
}
