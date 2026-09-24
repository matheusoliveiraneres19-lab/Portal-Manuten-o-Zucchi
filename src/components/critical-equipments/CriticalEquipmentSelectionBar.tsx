"use client";

import { ChevronRight, Crosshair, Loader2, X } from "lucide-react";
import type { CriticalEquipmentSelectionContext } from "@/types/critical-equipments";

type Level = CriticalEquipmentSelectionContext["path"][number]["level"];

type Props = {
  context: CriticalEquipmentSelectionContext;
  loading: boolean;
  /** Alvo da seleção em carregamento (ex.: "MULTIFIO 04 BM"). */
  pendingLabel: string | null;
  /** Voltar para um nível do caminho (os níveis abaixo dele são descartados). */
  onNavigate: (level: Level) => void;
  onClear: () => void;
};

/**
 * Faixa "ANÁLISE ATUAL" acima dos dashboards recortados. Diz, sem ambiguidade, se o
 * que está abaixo é a frota inteira ou uma família/máquina/repartimento — pensada
 * para ser lida de longe numa reunião.
 */
export function CriticalEquipmentSelectionBar({ context, loading, pendingLabel, onNavigate, onClear }: Props) {
  const status = loading ? (
    <p className="flex items-center gap-1.5 text-[11px] font-semibold text-gold-deep" role="status" aria-live="polite">
      <Loader2 className="h-3.5 w-3.5 animate-spin" />
      {pendingLabel ? `Atualizando análise de ${pendingLabel}…` : "Atualizando análise…"}
    </p>
  ) : null;

  if (!context.active) {
    return (
      <section
        aria-label="Análise atual"
        className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-zinc-200 bg-surface px-4 py-2.5"
      >
        <p className="text-[11px] text-zinc-600">
          <span className="font-extrabold uppercase tracking-wide text-gold-deep">Análise atual</span> · recorte geral
          da página ·{" "}
          <strong className="tabular-nums text-zinc-900">{context.totalOrders.toLocaleString("pt-BR")}</strong> ordens
        </p>
        {status}
      </section>
    );
  }

  const subject = [...context.path].reverse().find((entry) => entry.level !== "month") ?? context.path[0];
  const month = context.path.find((entry) => entry.level === "month");

  return (
    <section
      aria-label="Análise atual"
      className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-gold/40 border-l-4 border-l-gold bg-surface px-4 py-3 shadow-sm"
    >
      <div className="min-w-0">
        <nav aria-label="Seleção da análise">
          <ol className="flex flex-wrap items-center gap-1 text-[11px] text-zinc-500">
            <li className="mr-1 font-extrabold uppercase tracking-wide text-gold-deep">Análise atual</li>
            {context.path.map((entry, index) => {
              const last = index === context.path.length - 1;
              return (
                <li key={`${entry.level}-${entry.label}`} className="flex items-center gap-1">
                  {index > 0 ? <ChevronRight className="h-3 w-3" aria-hidden /> : null}
                  {last ? (
                    <span aria-current="true" className="font-semibold text-zinc-800">
                      {entry.label}
                    </span>
                  ) : (
                    <button
                      type="button"
                      onClick={() => onNavigate(entry.level)}
                      className="font-semibold text-gold-deep underline-offset-2 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-gold"
                    >
                      {entry.label}
                    </button>
                  )}
                </li>
              );
            })}
          </ol>
        </nav>
        <p className="mt-1 flex flex-wrap items-baseline gap-x-2 text-zinc-900">
          <span className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.2em] text-zinc-500">
            <Crosshair className="h-3.5 w-3.5 text-gold" /> Analisando
          </span>
          <span className="text-base font-bold uppercase leading-tight">{subject.label}</span>
          <span className="text-[12px] text-zinc-600">
            <strong className="tabular-nums text-zinc-900">{context.totalOrders.toLocaleString("pt-BR")}</strong>{" "}
            {context.totalOrders === 1 ? "ordem" : "ordens"} {month ? `em ${month.label}` : "no período"}
          </span>
        </p>
        {status}
      </div>
      <button
        type="button"
        onClick={onClear}
        className="flex items-center gap-1.5 rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-[11px] font-semibold text-zinc-700 transition hover:border-gold hover:text-zinc-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-gold"
      >
        <X className="h-3.5 w-3.5" /> Limpar seleção da análise
      </button>
    </section>
  );
}
