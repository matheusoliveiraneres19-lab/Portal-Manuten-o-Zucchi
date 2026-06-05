"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronDown, Search } from "lucide-react";

export type MultiSelectOption = {
  value: string;
  label: string;
};

type MultiSelectFilterProps = {
  label: string;
  options: MultiSelectOption[];
  selected: string[];
  onChange: (next: string[]) => void;
  placeholder?: string;
  searchable?: boolean;
};

export function MultiSelectFilter({
  label,
  options,
  selected,
  onChange,
  placeholder = "Selecione...",
  searchable = true
}: MultiSelectFilterProps) {
  const [open, setOpen] = useState(false);
  const [term, setTerm] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) {
      return;
    }

    function handlePointerDown(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }

    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, [open]);

  const filteredOptions = useMemo(() => {
    const normalized = term.trim().toLowerCase();
    if (!normalized) {
      return options;
    }
    return options.filter((option) => option.label.toLowerCase().includes(normalized));
  }, [options, term]);

  const selectedSet = useMemo(() => new Set(selected), [selected]);

  function toggleValue(value: string) {
    if (selectedSet.has(value)) {
      onChange(selected.filter((item) => item !== value));
    } else {
      onChange([...selected, value]);
    }
  }

  const triggerText = selected.length ? `${selected.length} selecionado(s)` : placeholder;

  return (
    <div ref={containerRef} className="relative">
      <span className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wide text-zinc-400">{label}</span>
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        aria-expanded={open}
        aria-haspopup="listbox"
        className={`flex h-10 w-full items-center justify-between gap-2 rounded-lg border bg-black/35 px-3 text-sm outline-none transition focus:border-gold/55 focus:bg-black/50 focus:shadow-[0_0_0_3px_rgba(196,154,69,0.10)] ${
          selected.length ? "border-gold/45 text-zinc-100" : "border-gold/15 text-zinc-400"
        }`}
    >
        <span className="truncate">{triggerText}</span>
        <ChevronDown className={`h-4 w-4 shrink-0 text-gold transition ${open ? "rotate-180" : ""}`} />
      </button>

      {open ? (
        <div
          role="listbox"
          className="absolute z-50 mt-1.5 max-h-72 w-full min-w-[220px] overflow-hidden rounded-lg border border-gold/25 bg-[#0a0b0b]/98 shadow-[0_18px_44px_rgba(0,0,0,0.55)] backdrop-blur"
        >
          {searchable && options.length > 6 ? (
            <div className="border-b border-gold/10 p-2">
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-zinc-500" />
                <input
                  value={term}
                  onChange={(event) => setTerm(event.target.value)}
                  placeholder="Filtrar opções..."
                  className="h-9 w-full rounded-md border border-gold/15 bg-black/40 pl-8 pr-2 text-xs text-zinc-100 outline-none focus:border-gold/45"
                />
              </div>
            </div>
          ) : null}

          <ul className="max-h-56 overflow-y-auto py-1">
            {filteredOptions.length ? (
              filteredOptions.map((option) => {
                const isSelected = selectedSet.has(option.value);
                return (
                  <li key={option.value}>
                    <button
                      type="button"
                      onClick={() => toggleValue(option.value)}
                      className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm text-zinc-200 transition hover:bg-gold/10"
                    >
                      <span
                        className={`grid h-4 w-4 shrink-0 place-items-center rounded border transition ${
                          isSelected ? "border-gold bg-gold text-black" : "border-zinc-500 bg-transparent"
                        }`}
                      >
                        {isSelected ? <Check className="h-3 w-3" strokeWidth={3} /> : null}
                      </span>
                      <span className="truncate">{option.label}</span>
                    </button>
                  </li>
                );
              })
            ) : (
              <li className="px-3 py-3 text-center text-xs text-zinc-500">Nenhuma opção</li>
            )}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
