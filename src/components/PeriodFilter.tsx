"use client";

import { useEffect, useRef, useState } from "react";
import { CalendarDays, Check, ChevronDown, RotateCcw } from "lucide-react";
import { useDashboardPeriod } from "@/hooks/useDashboardPeriod";
import { formatPeriodRange } from "@/utils/period";

type PeriodFilterProps = {
  /** Período padrão (yyyy-mm-dd) derivado dos dados, usado quando a URL não traz período. */
  defaultStartDate: string;
  defaultEndDate: string;
};

export function PeriodFilter({ defaultStartDate, defaultEndDate }: PeriodFilterProps) {
  const { startDate, endDate, isCustom, setPeriod, clearPeriod } = useDashboardPeriod({
    startDate: defaultStartDate,
    endDate: defaultEndDate
  });

  const [open, setOpen] = useState(false);
  const [draftStart, setDraftStart] = useState(startDate);
  const [draftEnd, setDraftEnd] = useState(endDate);
  const containerRef = useRef<HTMLDivElement>(null);

  // Sincroniza o rascunho sempre que o período efetivo mudar (navegação/aplicação).
  useEffect(() => {
    setDraftStart(startDate);
    setDraftEnd(endDate);
  }, [startDate, endDate]);

  // Fecha o popover ao clicar fora.
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

  function applyPeriod() {
    if (!draftStart || !draftEnd) {
      return;
    }

    // Garante ordem cronológica mesmo se o usuário inverter as datas.
    const [start, end] = draftStart <= draftEnd ? [draftStart, draftEnd] : [draftEnd, draftStart];
    setPeriod(start, end);
    setOpen(false);
  }

  function resetPeriod() {
    clearPeriod();
    setOpen(false);
  }

  return (
    <div ref={containerRef} className="relative hidden xl:block">
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        aria-expanded={open}
        aria-haspopup="dialog"
        className="flex h-11 items-center gap-2 rounded-lg border border-gold/20 bg-black/45 px-4 text-sm text-champagne transition hover:border-gold/45"
      >
        <span className="text-[11px] text-zinc-400">Período</span>
        <strong className="font-semibold text-white">{formatPeriodRange(startDate, endDate)}</strong>
        <CalendarDays className="h-4 w-4 text-gold" />
        <ChevronDown className={`h-4 w-4 transition ${open ? "rotate-180" : ""}`} />
      </button>

      {open ? (
        <div
          role="dialog"
          aria-label="Selecionar período"
          className="absolute right-0 z-40 mt-2 w-[320px] rounded-lg border border-gold/25 bg-[#0a0b0b]/98 p-4 shadow-[0_18px_44px_rgba(0,0,0,0.55)] backdrop-blur"
        >
          <p className="mb-3 text-[11px] font-bold uppercase tracking-[0.22em] text-gold">Filtrar por período</p>

          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-zinc-400">
                Início
              </span>
              <input
                type="date"
                value={draftStart}
                max={draftEnd || undefined}
                onChange={(event) => setDraftStart(event.target.value)}
                className={inputClassName}
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-zinc-400">
                Fim
              </span>
              <input
                type="date"
                value={draftEnd}
                min={draftStart || undefined}
                onChange={(event) => setDraftEnd(event.target.value)}
                className={inputClassName}
              />
            </label>
          </div>

          <div className="mt-4 flex items-center justify-between gap-2">
            <button
              type="button"
              onClick={resetPeriod}
              disabled={!isCustom}
              className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-gold/20 px-3 text-xs font-semibold text-zinc-300 transition hover:border-gold/40 hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              Padrão
            </button>
            <button
              type="button"
              onClick={applyPeriod}
              className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-gold/55 bg-gold/15 px-4 text-xs font-bold text-gold transition hover:bg-gold/25"
            >
              <Check className="h-3.5 w-3.5" />
              Aplicar
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

const inputClassName =
  "h-10 w-full rounded-lg border border-gold/15 bg-black/40 px-2.5 text-sm text-zinc-100 outline-none transition [color-scheme:dark] focus:border-gold/55 focus:bg-black/55";
