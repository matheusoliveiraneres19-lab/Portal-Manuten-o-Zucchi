"use client";

import { AlarmClock } from "lucide-react";
import { EmptyState } from "@/components/EmptyState";
import { PurchasePriorityBadge } from "@/components/purchases/PurchasePriorityBadge";
import type { PurchaseCriticalItem } from "@/types/purchases";

/**
 * TAREFA 7 — "Top Compras Pendentes Críticas".
 *
 * A ordem já vem pronta do service (N1 → N2 → N3 → N4 e, dentro de cada
 * prioridade, a requisição mais antiga primeiro; empate pela maior quantidade
 * pendente). O componente NÃO reordena: se a regra mudar, muda num lugar só, e a
 * tabela nunca discorda dos cards e gráficos da mesma tela.
 */
export function PurchaseCriticalTable({ items }: { items: PurchaseCriticalItem[] }) {
  return (
    <section className="panel rounded-lg p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-[11px] font-extrabold uppercase tracking-wide text-gold-deep">
            Top Compras Pendentes Críticas
          </h3>
          <p className="mt-0.5 text-[11px] text-zinc-500">
            N1 primeiro, depois N2, N3 e N4 — dentro de cada prioridade, a requisição mais antiga na frente.
          </p>
        </div>
        <span className="text-[11px] text-zinc-500">{items.length.toLocaleString("pt-BR")} item(ns)</span>
      </div>

      {items.length === 0 ? (
        <EmptyState
          icon={AlarmClock}
          title="Nenhuma pendência crítica"
          description="Nenhuma requisição pendente no recorte atual. Ajuste os filtros ou o período."
        />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1180px] border-collapse text-left text-xs">
            <thead>
              <tr className="border-b border-zinc-200 text-[10px] uppercase tracking-wide text-zinc-500">
                <th className="px-2 py-2 font-bold">Prioridade</th>
                <th className="px-2 py-2 font-bold">Requisição</th>
                <th className="px-2 py-2 font-bold">Item / Material</th>
                <th className="px-2 py-2 font-bold">Texto breve</th>
                <th className="px-2 py-2 text-right font-bold">Qtd. solicitada</th>
                <th className="px-2 py-2 text-right font-bold">Qtd. pendente</th>
                <th className="px-2 py-2 font-bold">Data solicitação</th>
                <th className="px-2 py-2 text-right font-bold">Dias em aberto</th>
                <th className="px-2 py-2 font-bold">Criado por</th>
                <th className="px-2 py-2 font-bold">Grupo mercadoria</th>
                <th className="px-2 py-2 font-bold">Nº acompanhamento</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr
                  key={item.id}
                  className={`border-b border-zinc-100 text-zinc-700 transition hover:bg-gold/5 ${
                    item.priority === "N1" ? "bg-danger/5" : ""
                  }`}
                >
                  <td className="px-2 py-2">
                    <PurchasePriorityBadge priority={item.priority} trackingNumber={item.trackingNumberRaw} />
                  </td>
                  <td className="px-2 py-2 font-medium text-zinc-900">{item.requisition}</td>
                  <td className="px-2 py-2">{item.material}</td>
                  <td className="px-2 py-2 max-w-[240px] truncate" title={item.shortText}>
                    {item.shortText}
                  </td>
                  <td className="px-2 py-2 text-right tabular-nums">{qty(item.requestedQuantity, item.unit)}</td>
                  <td className="px-2 py-2 text-right tabular-nums">{qty(item.pendingQuantity, item.unit)}</td>
                  <td className="px-2 py-2">{formatIso(item.requestDate)}</td>
                  <td className="px-2 py-2 text-right tabular-nums">
                    {item.daysOpen === null ? (
                      "—"
                    ) : (
                      <span className={item.daysOpen >= 30 ? "font-semibold text-orange-600" : ""}>
                        {item.daysOpen.toLocaleString("pt-BR")}
                      </span>
                    )}
                  </td>
                  <td className="px-2 py-2 max-w-[120px] truncate" title={item.requester}>
                    {item.requester}
                  </td>
                  <td className="px-2 py-2 max-w-[160px] truncate" title={item.merchandiseGroup}>
                    {item.merchandiseGroup}
                  </td>
                  <td className="px-2 py-2 text-zinc-500">{item.trackingNumberRaw ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

/** Quantidade + unidade, ou "—". Nunca imprime NaN. */
function qty(value: number | null, unit: string | null): string {
  if (value === null || !Number.isFinite(value)) {
    return "—";
  }
  return `${value.toLocaleString("pt-BR")}${unit ? ` ${unit}` : ""}`;
}

function formatIso(iso: string | null): string {
  if (!iso) {
    return "—";
  }
  return new Date(iso).toLocaleDateString("pt-BR", { timeZone: "UTC" });
}
