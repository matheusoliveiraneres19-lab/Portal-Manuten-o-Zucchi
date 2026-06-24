"use client";

import { Layers } from "lucide-react";
import type { PcFactoryManagementGroupRow } from "@/types/pc-factory";

type Props = {
  className?: string;
  rows: PcFactoryManagementGroupRow[];
};

/** Formata horas decimais como HH:MM:SS (igual à coluna "Tempo Decorrido" do PC-Factory). */
function formatHours(hours: number): string {
  const totalSeconds = Math.round(hours * 3600);
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

const fmtPercent = (value: number) => `${value.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`;

/**
 * Tabela Gerencial — reproduz a "Management View" do PC-Factory: os 6 grupos de status
 * agregados por "Tempo Decorrido", com % do total e valores acumulados. Mesma lógica
 * (agrupamento por código RCODSTATUS) e mesma base de tempo da tela do PC-Factory.
 */
export function PcFactoryManagementTable({ className = "", rows }: Props) {
  const totalHours = rows.reduce((sum, row) => sum + row.totalHours, 0);

  return (
    <div className={`rounded-lg border border-gold/20 bg-[#070808] p-4 shadow-premium ${className}`}>
      <header className="mb-3 flex items-center gap-2">
        <Layers className="h-4 w-4 text-gold" />
        <h3 className="font-serif text-lg text-white">Tabela Gerencial</h3>
        <span className="ml-auto text-[11px] text-zinc-500">Base: Tempo Decorrido · espelha o PC-Factory</span>
      </header>

      {rows.length === 0 ? (
        <p className="py-8 text-center text-sm text-zinc-500">Sem dados no período.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-gold/15 text-left text-[11px] uppercase tracking-wide text-zinc-400">
                <th className="py-2 pr-3 font-semibold">Grupo de Status</th>
                <th className="py-2 px-3 text-right font-semibold">% Tempo Decorrido</th>
                <th className="py-2 px-3 text-right font-semibold">Tempo Decorrido</th>
                <th className="py-2 px-3 text-right font-semibold">% Acumulado</th>
                <th className="py-2 pl-3 text-right font-semibold">Tempo Acumulado</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.group} className="border-b border-white/5 last:border-0">
                  <td className="py-2 pr-3">
                    <span className="inline-flex items-center gap-2 font-semibold text-champagne">
                      <span className="h-3 w-3 rounded-sm" style={{ backgroundColor: row.color }} />
                      {row.label}
                    </span>
                  </td>
                  <td className="py-2 px-3 text-right tabular-nums text-zinc-300">{fmtPercent(row.percent)}</td>
                  <td className="py-2 px-3 text-right tabular-nums text-white">{formatHours(row.totalHours)}</td>
                  <td className="py-2 px-3 text-right tabular-nums text-zinc-300">{fmtPercent(row.cumulativePercent)}</td>
                  <td className="py-2 pl-3 text-right tabular-nums text-zinc-300">{formatHours(row.cumulativeHours)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t border-gold/20 text-[12px] font-bold text-gold">
                <td className="py-2 pr-3">Total</td>
                <td className="py-2 px-3 text-right tabular-nums">100,00%</td>
                <td className="py-2 px-3 text-right tabular-nums">{formatHours(totalHours)}</td>
                <td className="py-2 px-3" />
                <td className="py-2 pl-3" />
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  );
}
