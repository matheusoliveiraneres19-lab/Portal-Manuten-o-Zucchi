"use client";

import { ChevronRight, Minus, TrendingDown, TrendingUp } from "lucide-react";
import { CriticalityScoreBadge } from "@/components/critical-equipments/CriticalityScoreBadge";
import type { CriticalEquipmentItem, TrendDirection } from "@/types/critical-equipments";

type CriticalEquipmentTableProps = {
  items: CriticalEquipmentItem[];
  onSelect: (id: string) => void;
};

export function CriticalEquipmentTable({ items, onSelect }: CriticalEquipmentTableProps) {
  return (
    <article className="panel overflow-hidden rounded-lg">
      <div className="flex items-center justify-between gap-3 border-b border-zinc-200 px-4 py-3">
        <div>
          <h3 className="text-sm font-semibold text-zinc-900">Ranking de equipamentos críticos</h3>
          <p className="mt-0.5 text-xs text-zinc-500">
            Ordens somadas por equipamento raiz (ramificações incluídas). Clique para o detalhe.
          </p>
        </div>
        <span className="rounded-md border border-gold/40 bg-gold/15 px-2.5 py-1 text-[11px] font-bold text-[#7a5a16]">
          {items.length} equipamento(s)
        </span>
      </div>

      <div className="max-h-[60vh] overflow-auto">
        <table className="w-full min-w-[1320px] border-collapse text-left text-xs">
          <thead className="sticky top-0 z-10 bg-[#efe7d8] text-[10px] uppercase tracking-wide text-[#5a3d12]">
            <tr className="border-b border-zinc-300">
              <th className="px-3 py-2.5 font-bold">#</th>
              <th className="px-3 py-2.5 font-bold">Equipamento raiz</th>
              <th className="px-3 py-2.5 font-bold">Local de instalação</th>
              <th className="px-3 py-2.5 font-bold">Família</th>
              <th className="px-3 py-2.5 font-bold">Centro de custo</th>
              <th className="px-3 py-2.5 text-right font-bold">Total OS</th>
              <th className="px-3 py-2.5 text-right font-bold">Abertas</th>
              <th className="px-3 py-2.5 text-right font-bold">Fechadas</th>
              <th className="px-3 py-2.5 text-right font-bold">Horas</th>
              <th className="px-3 py-2.5 text-right font-bold">Média h/OS</th>
              <th className="px-3 py-2.5 text-center font-bold">Reincidência</th>
              <th className="px-3 py-2.5 text-center font-bold">Tendência</th>
              <th className="px-3 py-2.5 font-bold">Score / Situação</th>
              <th className="px-3 py-2.5" aria-label="Detalhes" />
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr
                key={`${item.id}-${item.position}`}
                onClick={() => onSelect(item.id)}
                title="Ver detalhes do equipamento"
                className="cursor-pointer border-b border-zinc-100 transition hover:bg-gold/[0.06]"
              >
                <td className="px-3 py-2.5 font-bold text-zinc-500">{String(item.position).padStart(2, "0")}</td>
                <td className="max-w-[220px] px-3 py-2.5">
                  <p className="truncate font-semibold text-zinc-900" title={item.equipmentName}>
                    {item.equipmentName}
                  </p>
                  {item.componentCount > 0 ? (
                    <p className="text-[10px] text-zinc-400">{item.componentCount} componente(s)</p>
                  ) : null}
                </td>
                <td className="px-3 py-2.5 font-mono text-[11px] text-zinc-600">{display(item.equipmentCode)}</td>
                <td className="px-3 py-2.5 text-zinc-700">{text(item.familyLabel)}</td>
                <td className="px-3 py-2.5 text-zinc-600">{text(item.costCenter)}</td>
                <td className="px-3 py-2.5 text-right font-semibold text-zinc-900">{int(item.totalOrders)}</td>
                <td className="px-3 py-2.5 text-right text-zinc-700">{int(item.backlogOrders)}</td>
                <td className="px-3 py-2.5 text-right text-zinc-700">{int(item.closedOrders)}</td>
                <td className="px-3 py-2.5 text-right font-medium text-zinc-900">{hours(item.totalWorkedHours)}</td>
                <td className="px-3 py-2.5 text-right text-zinc-700">{hours(item.averageHoursPerOrder)}</td>
                <td className="px-3 py-2.5 text-center">
                  {item.isRecurrent ? (
                    <span className="rounded border border-danger/30 bg-danger/10 px-1.5 py-0.5 text-[10px] font-bold text-danger">
                      Reincidente
                    </span>
                  ) : (
                    <span className="text-zinc-400">—</span>
                  )}
                </td>
                <td className="px-3 py-2.5">
                  <TrendCell direction={item.trendDirection} delta={item.trendDelta} />
                </td>
                <td className="px-3 py-2.5">
                  <CriticalityScoreBadge score={item.criticalityScore} label={item.criticalityLabel} />
                </td>
                <td className="px-3 py-2.5 text-right">
                  <ChevronRight className="ml-auto h-4 w-4 text-zinc-400" />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </article>
  );
}

function TrendCell({ direction, delta }: { direction: TrendDirection; delta: number }) {
  const meta = {
    up: { Icon: TrendingUp, className: "text-danger", label: "Piora" },
    down: { Icon: TrendingDown, className: "text-emerald-600", label: "Melhora" },
    stable: { Icon: Minus, className: "text-zinc-400", label: "Estável" }
  }[direction];
  const Icon = meta.Icon;

  return (
    <span className={`flex items-center justify-center gap-1 text-[11px] font-semibold ${meta.className}`} title={meta.label}>
      <Icon className="h-3.5 w-3.5" />
      {direction === "stable" ? "—" : `${delta > 0 ? "+" : ""}${delta}%`}
    </span>
  );
}

function int(value: number): string {
  return value.toLocaleString("pt-BR");
}

function hours(value: number): string {
  return `${value.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })} H`;
}

function display(value: string): string {
  return value && value !== "SEM CÓDIGO" ? value : "Não informado";
}

function text(value: string): string {
  return value && value.trim() ? value : "—";
}
