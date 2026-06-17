"use client";

import { EmptyState } from "@/components/EmptyState";
import type { PcFactoryResourceRow } from "@/types/pc-factory";

type PcFactoryReliabilityTableProps = {
  rows: PcFactoryResourceRow[];
  className?: string;
  onSelect?: (resourceName: string) => void;
};

/**
 * Tabela de confiabilidade por máquina: consolida nº de quebras, MTBF, MTTR e
 * disponibilidade lado a lado (top máquinas por horas de manutenção).
 */
export function PcFactoryReliabilityTable({ rows, className = "", onSelect }: PcFactoryReliabilityTableProps) {
  const data = rows.filter((row) => row.maintenanceEvents > 0);

  return (
    <article className={`panel rounded-lg p-4 ${className}`}>
      <h3 className="text-[11px] font-extrabold uppercase tracking-wide text-[#5a3d12]">Confiabilidade por máquina</h3>
      <p className="mb-3 text-[11px] text-zinc-500">
        Nº de quebras, MTBF (tempo médio entre falhas), MTTR (tempo médio de reparo) e disponibilidade. Clique para detalhar.
      </p>

      {data.length === 0 ? (
        <EmptyState title="Sem manutenção no período" description="Nenhuma máquina registrou eventos de manutenção." />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-zinc-200 text-left text-[11px] font-extrabold uppercase tracking-wide text-zinc-500">
                <th className="py-2 pr-3">Máquina</th>
                <th className="px-3 py-2 text-right">Quebras</th>
                <th className="px-3 py-2 text-right">MTBF</th>
                <th className="px-3 py-2 text-right">MTTR</th>
                <th className="px-3 py-2 text-right">Paradas</th>
                <th className="py-2 pl-3 text-right">Disponib.</th>
              </tr>
            </thead>
            <tbody>
              {data.map((row) => (
                <tr
                  key={row.resourceName}
                  onClick={() => onSelect?.(row.resourceName)}
                  className={`border-b border-zinc-100 text-zinc-800 transition last:border-0 ${
                    onSelect ? "cursor-pointer hover:bg-gold/10" : ""
                  }`}
                >
                  <td className="max-w-[220px] truncate py-2 pr-3 font-semibold" title={row.resourceName}>
                    {row.resourceName}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">{row.maintenanceEvents.toLocaleString("pt-BR")}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{formatHours(row.mtbf)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{formatHours(row.mttr)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{formatHours(row.stoppedHours)}</td>
                  <td className="py-2 pl-3 text-right">
                    <span className={`inline-block rounded-md px-2 py-0.5 text-xs font-bold ${availabilityClass(row.availabilityPercent)}`}>
                      {formatPercent(row.availabilityPercent)}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </article>
  );
}

function formatHours(value: number | null): string {
  return value === null ? "—" : `${value.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} h`;
}

function formatPercent(value: number | null): string {
  return value === null ? "—" : `${value.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`;
}

/** Verde ≥ 90%, âmbar 70-90%, vermelho < 70% (metas usuais de disponibilidade). */
function availabilityClass(value: number | null): string {
  if (value === null) return "bg-zinc-200 text-zinc-600";
  if (value >= 90) return "bg-[#3f8f6b]/15 text-[#2f6e51]";
  if (value >= 70) return "bg-gold/20 text-[#7a5a16]";
  return "bg-danger/15 text-danger";
}
