"use client";

import { PURCHASE_PRIORITY_COLORS, PURCHASE_PRIORITY_LABELS } from "@/utils/purchases-normalizer";
import type { PurchasePriorityKey } from "@/types/purchases";

type PurchasePriorityBadgeProps = {
  priority: PurchasePriorityKey;
  /** Valor CRU que originou a prioridade ("Nível requisição") — vai no tooltip. */
  rawValue?: string | null;
  className?: string;
};

/**
 * Selo de prioridade da compra (TAREFA 9). A cor vem de
 * `PURCHASE_PRIORITY_COLORS`, a mesma fonte dos cards e dos gráficos — nunca de
 * um hex literal aqui, para N1 ser o mesmo vermelho na tela inteira.
 *
 * O selo é PINTADO (fundo sólido) em N1 e N2 e apenas contornado em N3/N4 e
 * "sem prioridade": a hierarquia visual da TAREFA 14 pede que o crítico salte
 * aos olhos e o resto fique neutro.
 */
export function PurchasePriorityBadge({ priority, rawValue, className = "" }: PurchasePriorityBadgeProps) {
  const color = PURCHASE_PRIORITY_COLORS[priority];
  const label = PURCHASE_PRIORITY_LABELS[priority];
  const filled = priority === "N1" || priority === "N2";
  const isNone = priority === "SEM_PRIORIDADE";

  return (
    <span
      className={`inline-flex items-center rounded-md border px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide ${className}`}
      style={
        filled
          ? { backgroundColor: color, borderColor: color, color: "#FFFFFF" }
          : { backgroundColor: `${color}14`, borderColor: `${color}66`, color }
      }
      title={isNone ? 'Sem "Nível requisição" na planilha' : `Nível requisição: ${rawValue ?? label}`}
    >
      {isNone ? "—" : label}
    </span>
  );
}
