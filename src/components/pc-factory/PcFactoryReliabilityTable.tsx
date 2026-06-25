"use client";

import { AlertTriangle } from "lucide-react";
import { EmptyState } from "@/components/EmptyState";
import type { PcFactoryReliabilityRow } from "@/types/pc-factory";

type PcFactoryReliabilityTableProps = {
  rows: PcFactoryReliabilityRow[];
  className?: string;
  onSelect?: (resourceName: string) => void;
};

/** Quantas máquinas listar (mais críticas primeiro, por horas de parada de manutenção). */
const MAX_ROWS = 12;

/** Fórmulas oficiais (tooltip do cabeçalho — base: Tempo Decorrido / durationHours). */
const HEADER_HINTS = {
  failures: "Quebras = eventos de manutenção (Mecânica + Elétrica + Automação + Terceiros + Aguardando).",
  mtbf: "MTBF = Tempo operacional / Quebras  (operacional = planejado − paradas de manutenção).",
  mttr: "MTTR = Tempo de reparo / Quebras  (reparo = Mecânica + Elétrica + Automação + Terceiros).",
  mtta: "MTTA = Tempo aguardando manutenção / Quebras.",
  downtime: "Paradas = Tempo de reparo + Tempo aguardando manutenção.",
  availability: "Disponibilidade = (Tempo planejado − Paradas) / Tempo planejado."
} as const;

/**
 * Tabela de confiabilidade por máquina: nº de quebras, MTBF, MTTR, MTTA, paradas e
 * disponibilidade. Os valores vêm prontos do service central (regras oficiais do
 * PC-Factory, base Tempo Decorrido); indicadores não aplicáveis chegam como null e
 * são exibidos como "—" (nunca 0 h / 0% indevido). Clique numa linha para detalhar.
 */
export function PcFactoryReliabilityTable({ rows, className = "", onSelect }: PcFactoryReliabilityTableProps) {
  const data = rows.slice(0, MAX_ROWS);

  return (
    <article className={`panel rounded-lg p-4 ${className}`}>
      <h3 className="text-[11px] font-extrabold uppercase tracking-wide text-[#5a3d12]">Confiabilidade por máquina</h3>
      <p className="mb-3 text-[11px] text-zinc-500">
        Quebras, MTBF (tempo médio entre falhas), MTTR (reparo), MTTA (aguardando) e disponibilidade. Base: Tempo
        Decorrido. Passe o mouse nos títulos para ver as fórmulas. Clique para detalhar.
      </p>

      {data.length === 0 ? (
        <EmptyState title="Sem manutenção no período" description="Nenhuma máquina registrou eventos de manutenção." />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-zinc-200 text-left text-[11px] font-extrabold uppercase tracking-wide text-zinc-500">
                <th className="py-2 pr-3">Máquina</th>
                <th className="px-3 py-2 text-right" title={HEADER_HINTS.failures}>Quebras</th>
                <th className="px-3 py-2 text-right" title={HEADER_HINTS.mtbf}>MTBF</th>
                <th className="px-3 py-2 text-right" title={HEADER_HINTS.mttr}>MTTR</th>
                <th className="px-3 py-2 text-right" title={HEADER_HINTS.mtta}>MTTA</th>
                <th className="px-3 py-2 text-right" title={HEADER_HINTS.downtime}>Paradas</th>
                <th className="py-2 pl-3 text-right" title={HEADER_HINTS.availability}>Disponib.</th>
              </tr>
            </thead>
            <tbody>
              {data.map((row) => (
                <tr
                  key={row.machineName}
                  onClick={() => onSelect?.(row.machineName)}
                  className={`border-b border-zinc-100 text-zinc-800 transition last:border-0 ${
                    onSelect ? "cursor-pointer hover:bg-gold/10" : ""
                  }`}
                >
                  <td className="max-w-[220px] truncate py-2 pr-3 font-semibold" title={row.dataQualityIssue ?? row.machineName}>
                    <span className="inline-flex items-center gap-1.5">
                      {row.dataQualityIssue ? (
                        <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-gold" aria-label={row.dataQualityIssue} />
                      ) : null}
                      <span className="truncate">{row.machineName}</span>
                    </span>
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">{row.failureEvents.toLocaleString("pt-BR")}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{formatHours(row.mtbf)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{formatHours(row.mttr)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{formatHours(row.mtta)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{formatHours(row.downtimeHours)}</td>
                  <td className="py-2 pl-3 text-right">
                    <span className={`inline-block rounded-md px-2 py-0.5 text-xs font-bold ${availabilityClass(row.availability)}`}>
                      {formatPercent(row.availability)}
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

/** Horas em pt-BR (1 casa). null/NaN/Infinity → "—" (nunca exibe 0 h indevido). */
function formatHours(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return "—";
  return `${value.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} h`;
}

/** Percentual em pt-BR (1 casa). null/NaN/Infinity → "—" (nunca exibe 0% indevido). */
function formatPercent(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return "—";
  return `${value.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`;
}

/** Verde ≥ 90%, âmbar 70-90%, vermelho < 70% (metas usuais de disponibilidade). */
function availabilityClass(value: number | null): string {
  if (value === null) return "bg-zinc-200 text-zinc-600";
  if (value >= 90) return "bg-[#3f8f6b]/15 text-[#2f6e51]";
  if (value >= 70) return "bg-gold/20 text-[#7a5a16]";
  return "bg-danger/15 text-danger";
}
