"use client";

import { Bar, BarChart, CartesianGrid, Cell, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { EmptyState } from "@/components/EmptyState";
import type { PcFactoryProductionLineRow } from "@/types/pc-factory";

type PcFactoryLineSummaryChartProps = {
  rows: PcFactoryProductionLineRow[];
  className?: string;
};

/** Barras verticais — disponibilidade por linha de produção (cor por faixa de desempenho). */
export function PcFactoryLineSummaryChart({ rows, className = "" }: PcFactoryLineSummaryChartProps) {
  const data = rows
    .filter((row) => row.availabilityPercent !== null)
    .map((row) => ({ line: row.productionLine, value: row.availabilityPercent as number }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 12);

  return (
    <article className={`panel rounded-lg p-4 ${className}`}>
      <h3 className="text-[11px] font-extrabold uppercase tracking-wide text-[#5a3d12]">Disponibilidade por linha</h3>
      <p className="mb-3 text-[11px] text-zinc-500">Percentual de tempo disponível por linha de produção.</p>

      {data.length === 0 ? (
        <EmptyState title="Sem dados no período" description="Nenhuma linha de produção com disponibilidade calculável." />
      ) : (
        <div className="h-[280px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} margin={{ left: 0, right: 12, top: 12, bottom: 4 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" vertical={false} />
              <XAxis dataKey="line" tick={{ fontSize: 11 }} tickFormatter={truncate} interval={0} angle={-12} textAnchor="end" height={50} />
              <YAxis type="number" domain={[0, 100]} tick={{ fontSize: 11 }} tickFormatter={(v: number) => `${v}%`} />
              <Tooltip
                cursor={{ fill: "rgba(196,154,69,0.08)" }}
                formatter={(value: number) => [`${value.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`, "Disponibilidade"]}
              />
              <Bar dataKey="value" radius={[4, 4, 0, 0]} barSize={34}>
                {data.map((entry) => (
                  <Cell key={entry.line} fill={colorFor(entry.value)} />
                ))}
                <LabelList
                  dataKey="value"
                  position="top"
                  className="fill-zinc-700"
                  style={{ fontSize: 11 }}
                  formatter={(value: number) => `${value.toLocaleString("pt-BR", { maximumFractionDigits: 0 })}%`}
                />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </article>
  );
}

function colorFor(value: number): string {
  if (value >= 85) return "#3f8f6b";
  if (value >= 70) return "#c49a45";
  return "#a6192e";
}

function truncate(value: string): string {
  return value.length > 14 ? `${value.slice(0, 13)}…` : value;
}
