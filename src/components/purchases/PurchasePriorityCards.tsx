"use client";

import { m } from "framer-motion";
import { FileX2 } from "lucide-react";
import { PURCHASE_PRIORITY_COLORS } from "@/utils/purchases-normalizer";
import type { PurchasePrioritySlice } from "@/types/purchases";

type PurchasePriorityCardsProps = {
  /** Total pendente do recorte — o primeiro card da linha. */
  totalPending: number;
  slices: PurchasePrioritySlice[];
  /** Prioridades atualmente filtradas (destaca o card selecionado). */
  selected: string[];
  /** Clique no card liga/desliga aquela prioridade no filtro. */
  onSelect: (priority: string) => void;
};

/**
 * Linha 1 do layout da TAREFA 14: "Requisições Pendentes" + um card por
 * prioridade (N1, N2, N3, N4, Sem Prioridade).
 *
 * Cada card de prioridade mostra QUANTIDADE e PERCENTUAL sobre o total pendente
 * do recorte, e é clicável — vira atalho do filtro de prioridade (TAREFA 8).
 *
 * A hierarquia visual da TAREFA 14 está na intensidade, não no tamanho: N1 e N2
 * ganham barra e número na cor da criticidade; N3, N4 e "sem prioridade" ficam
 * neutros. Todos têm a mesma caixa, para a linha não parecer desalinhada.
 */
export function PurchasePriorityCards({
  totalPending,
  slices,
  selected,
  onSelect
}: PurchasePriorityCardsProps) {
  return (
    <section className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
      <m.article
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, ease: "easeOut" }}
        className="panel flex min-h-[112px] flex-col justify-between rounded-lg p-4"
      >
        <div className="flex items-center gap-2">
          <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-gold text-white">
            <FileX2 className="h-4 w-4" strokeWidth={1.9} />
          </span>
          <h3 className="text-[11px] font-extrabold uppercase leading-tight tracking-wide text-zinc-800">
            Requisições
            <br />
            Pendentes
          </h3>
        </div>
        <div>
          <div className="text-2xl font-light tracking-normal text-zinc-950">{int(totalPending)}</div>
          <p className="text-[11px] text-zinc-500">Total do recorte filtrado</p>
        </div>
      </m.article>

      {slices.map((slice, index) => {
        const isSelected = selected.includes(slice.priority);
        const isCritical = slice.priority === "N1" || slice.priority === "N2";
        const color = PURCHASE_PRIORITY_COLORS[slice.priority];
        return (
          <m.button
            key={slice.priority}
            type="button"
            onClick={() => onSelect(slice.priority)}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, delay: (index + 1) * 0.04, ease: "easeOut" }}
            aria-pressed={isSelected}
            title={`${slice.label}: ${int(slice.count)} requisição(ões) — clique para filtrar`}
            className="panel flex min-h-[112px] flex-col justify-between rounded-lg p-4 text-left transition hover:-translate-y-0.5 hover:shadow-premium"
            // Card selecionado ganha uma borda interna NA COR da prioridade (e
            // não um `ring` genérico do Tailwind): o destaque tem de dizer QUAL
            // prioridade está filtrada, não apenas que algo está selecionado.
            style={isSelected ? { boxShadow: `inset 0 0 0 2px ${color}` } : undefined}
          >
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-[11px] font-extrabold uppercase tracking-wide text-zinc-800">
                {slice.priority === "SEM_PRIORIDADE" ? "Sem prioridade" : `Pendentes ${slice.label}`}
              </h3>
              <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: color }} />
            </div>
            <div>
              <div
                className={`text-2xl tracking-normal ${isCritical ? "font-semibold" : "font-light text-zinc-950"}`}
                style={isCritical ? { color } : undefined}
              >
                {int(slice.count)}
              </div>
              <p className="text-[11px] text-zinc-500">{percent(slice.percentage)} do total pendente</p>
            </div>
            {/* Barra de proporção: a leitura relativa fica óbvia sem um gráfico. */}
            <div className="mt-2 h-1 w-full overflow-hidden rounded-full bg-zinc-200">
              <span
                className="block h-full rounded-full"
                style={{ width: `${clampPercent(slice.percentage)}%`, backgroundColor: color }}
              />
            </div>
          </m.button>
        );
      })}
    </section>
  );
}

function int(value: number): string {
  return Number.isFinite(value) ? value.toLocaleString("pt-BR") : "0";
}

/** Percentual formatado — nunca NaN/Infinity (TAREFA 16). */
function percent(value: number): string {
  const safe = Number.isFinite(value) ? value : 0;
  return `${safe.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;
}

/** Largura da barra em [0, 100] — protege o CSS de valor fora de faixa. */
function clampPercent(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.min(100, Math.max(0, value));
}
