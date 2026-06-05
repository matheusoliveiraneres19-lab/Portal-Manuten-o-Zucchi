"use client";

import { useEffect } from "react";
import { Clock, Loader2, X } from "lucide-react";
import type { EquipmentHoursByResponsible } from "@/types/critical-equipments";

type EquipmentHoursByResponsibleModalProps = {
  open: boolean;
  loading: boolean;
  error: string | null;
  data: EquipmentHoursByResponsible | null;
  onClose: () => void;
};

export function EquipmentHoursByResponsibleModal({
  open,
  loading,
  error,
  data,
  onClose
}: EquipmentHoursByResponsibleModalProps) {
  useEffect(() => {
    if (!open) {
      return;
    }
    function handleKey(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onClose();
      }
    }
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [open, onClose]);

  if (!open) {
    return null;
  }

  const hasHours = Boolean(data && data.totalWorkedHours > 0 && data.responsibles.length);

  return (
    <div className="fixed inset-0 z-[55] flex items-center justify-center p-4">
      <button
        type="button"
        aria-label="Fechar"
        onClick={onClose}
        className="absolute inset-0 bg-black/65 backdrop-blur-sm"
      />

      <div className="relative flex max-h-[80vh] w-full max-w-md flex-col overflow-hidden rounded-lg border border-gold/30 bg-[#0a0b0b] text-champagne shadow-[0_0_60px_rgba(0,0,0,0.7)]">
        <div className="flex items-start justify-between gap-3 border-b border-gold/20 bg-[#070808] px-5 py-4">
          <div className="min-w-0">
            <p className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.22em] text-gold">
              <Clock className="h-3.5 w-3.5" />
              Horas apontadas
            </p>
            <h2 className="mt-1 truncate font-serif text-lg text-white" title={data?.equipmentName}>
              {data?.equipmentName ?? "Carregando..."}
            </h2>
            {data && hasHours ? (
              <p className="mt-0.5 text-xs text-zinc-400">Total: {hours(data.totalWorkedHours)}</p>
            ) : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar"
            className="grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-gold/20 text-zinc-300 transition hover:border-gold/40 hover:text-white"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="overflow-y-auto px-5 py-4">
          {loading ? (
            <div className="flex h-32 items-center justify-center gap-2 text-sm text-zinc-400">
              <Loader2 className="h-4 w-4 animate-spin text-gold" />
              Carregando...
            </div>
          ) : error ? (
            <div className="flex h-32 items-center justify-center px-4 text-center text-sm text-zinc-400">
              {error}
            </div>
          ) : !hasHours ? (
            <div className="flex h-32 items-center justify-center px-4 text-center text-sm text-zinc-400">
              Não há horas apontadas para este equipamento no período.
            </div>
          ) : (
            <div className="space-y-2">
              {data!.responsibles.map((responsible) => (
                <div key={responsible.name} className="rounded-lg border border-gold/15 bg-black/30 px-3 py-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate text-sm font-semibold text-zinc-100" title={responsible.name}>
                      {responsible.name}
                    </span>
                    <span className="shrink-0 text-sm font-bold text-gold">{responsible.participationPercent}%</span>
                  </div>
                  <div className="mt-1 flex items-center justify-between text-[11px] text-zinc-400">
                    <span>
                      {hours(responsible.totalHours)} · {responsible.totalOrders.toLocaleString("pt-BR")} ordem(ns)
                    </span>
                  </div>
                  <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-black/50">
                    <div
                      className="h-full rounded-full bg-gold"
                      style={{ width: `${Math.min(100, responsible.participationPercent)}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function hours(value: number): string {
  return `${value.toLocaleString("pt-BR", { minimumFractionDigits: 3, maximumFractionDigits: 3 })} H`;
}
