"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronDown, Search, X } from "lucide-react";

export type MultiSelectOption = { value: string; label: string };

type MultiSelectFilterProps = {
  label: string;
  options: MultiSelectOption[];
  selected: string[];
  onChange: (values: string[]) => void;
  placeholder?: string;
  searchPlaceholder?: string;
  /**
   * Permite a busca interna. Mesmo com `true`, a caixa só aparece quando a lista
   * passa de SEARCH_THRESHOLD opções — um campo de busca sobre 4 itens é ruído.
   */
  searchable?: boolean;
  disabled?: boolean;
  /** Quantos rótulos selecionados mostrar antes de resumir como "+N". */
  maxVisibleTags?: number;
};

/**
 * Multi-seleção premium (escuro/dourado) dos painéis de filtro do portal: busca
 * interna, checkbox por opção, contador, limpar, fecha ao clicar fora e no
 * Escape. Controlado — o "Aplicar filtros" de cada página decide quando consultar.
 *
 * Unifica as DUAS implementações que existiam (`common/` e
 * `service-orders/filters/`), que divergiam na API: uma expunha `selectedValues`
 * + `searchPlaceholder` + `disabled`, a outra `selected` + `searchable`. Os quatro
 * painéis de filtro do portal (OS, Equipamentos Críticos, PC-Factory e Compras)
 * agora compartilham o mesmo comportamento.
 */
const SEARCH_THRESHOLD = 6;

export function MultiSelectFilter({
  label,
  options,
  selected,
  onChange,
  placeholder = "Todos",
  searchPlaceholder = "Buscar...",
  searchable = true,
  disabled = false,
  maxVisibleTags = 2
}: MultiSelectFilterProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);

  const showSearch = searchable && options.length > SEARCH_THRESHOLD;

  useEffect(() => {
    if (!open) {
      return;
    }
    function handleClick(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    function handleKey(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("mousedown", handleClick);
      document.removeEventListener("keydown", handleKey);
    };
  }, [open]);

  // Limpa a busca ao fechar, para o menu não reabrir já filtrado.
  useEffect(() => {
    if (!open) {
      setQuery("");
    }
  }, [open]);

  const selectedSet = useMemo(() => new Set(selected), [selected]);

  const filtered = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term) {
      return options;
    }
    return options.filter((option) => option.label.toLowerCase().includes(term));
  }, [options, query]);

  function toggle(value: string) {
    if (selectedSet.has(value)) {
      onChange(selected.filter((current) => current !== value));
    } else {
      onChange([...selected, value]);
    }
  }

  const summary = useMemo(() => {
    if (selected.length === 0) {
      return placeholder;
    }
    const labels = selected
      .map((value) => options.find((option) => option.value === value)?.label ?? value)
      .slice(0, maxVisibleTags);
    const extra = selected.length - labels.length;
    return extra > 0 ? `${labels.join(", ")} +${extra}` : labels.join(", ");
  }, [selected, options, placeholder, maxVisibleTags]);

  return (
    <div className="block" ref={containerRef}>
      <span className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wide text-parchment-dim">
        {label}
      </span>
      <div className="relative">
        <button
          type="button"
          disabled={disabled}
          aria-haspopup="listbox"
          aria-expanded={open}
          onClick={() => setOpen((value) => !value)}
          className={`flex h-10 w-full items-center gap-2 rounded-lg border bg-black/35 px-3 text-left text-sm outline-none transition focus-visible:border-gold/55 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold/60 ${
            open ? "border-gold/55 bg-black/50" : "border-gold/15"
          } ${disabled ? "cursor-not-allowed opacity-60" : "hover:border-gold/40"}`}
        >
          <span
            className={`flex-1 truncate ${selected.length ? "text-parchment" : "text-neutralized"}`}
            title={summary}
          >
            {summary}
          </span>
          {selected.length > 0 ? (
            <span className="grid h-5 min-w-5 place-items-center rounded-full bg-gold/20 px-1 text-[10px] font-bold text-gold">
              {selected.length}
            </span>
          ) : null}
          <ChevronDown className={`h-4 w-4 shrink-0 text-gold transition ${open ? "rotate-180" : ""}`} />
        </button>

        {open ? (
          <div
            role="listbox"
            className="absolute z-50 mt-1 w-full overflow-hidden rounded-lg border border-gold/30 bg-ink shadow-[0_18px_50px_rgba(0,0,0,0.6)]"
          >
            {showSearch || selected.length > 0 ? (
              <div className="flex items-center gap-2 border-b border-gold/15 px-3 py-2">
                {showSearch ? (
                  <>
                    <Search className="h-4 w-4 shrink-0 text-neutralized" />
                    <input
                      autoFocus
                      value={query}
                      onChange={(event) => setQuery(event.target.value)}
                      placeholder={searchPlaceholder}
                      aria-label={`Buscar em ${label}`}
                      className="h-7 w-full bg-transparent text-sm text-parchment outline-none placeholder:text-neutralized-strong"
                    />
                  </>
                ) : (
                  <span className="flex-1 text-[11px] uppercase tracking-wide text-neutralized">{label}</span>
                )}
                {selected.length > 0 ? (
                  <button
                    type="button"
                    onClick={() => onChange([])}
                    className="inline-flex shrink-0 items-center gap-1 text-[11px] font-semibold text-parchment-dim transition hover:text-gold"
                  >
                    <X className="h-3 w-3" /> Limpar
                  </button>
                ) : null}
              </div>
            ) : null}

            <ul className="max-h-60 overflow-y-auto py-1">
              {filtered.length === 0 ? (
                <li className="px-3 py-3 text-center text-xs text-neutralized">Nenhuma opção encontrada</li>
              ) : (
                filtered.map((option) => {
                  const checked = selectedSet.has(option.value);
                  return (
                    <li key={option.value}>
                      <button
                        type="button"
                        role="option"
                        aria-selected={checked}
                        onClick={() => toggle(option.value)}
                        className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm text-parchment transition hover:bg-gold/10"
                      >
                        <span
                          className={`grid h-4 w-4 shrink-0 place-items-center rounded border ${
                            checked ? "border-gold bg-gold/25 text-gold" : "border-neutralized/60"
                          }`}
                        >
                          {checked ? <Check className="h-3 w-3" /> : null}
                        </span>
                        <span className="truncate" title={option.label}>
                          {option.label}
                        </span>
                      </button>
                    </li>
                  );
                })
              )}
            </ul>
          </div>
        ) : null}
      </div>
    </div>
  );
}
