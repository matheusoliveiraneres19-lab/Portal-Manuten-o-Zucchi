"use client";

import { Bar, CartesianGrid, ComposedChart, Legend, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { EmptyState } from "@/components/EmptyState";
import type { PcFactoryTrendPoint } from "@/types/pc-factory";

type PcFactoryTrendChartProps = {
  points: PcFactoryTrendPoint[];
  className?: string;
};

/** Evolução: horas de manutenção (barras) + disponibilidade estimada (linha). */
export function PcFactoryTrendChart({ points, className = "" }: PcFactoryTrendChartProps) {
  const data = points;

  return (
    <article className={`panel rounded-lg p-4 ${className}`}>
      <h3 className="text-[11px] font-extrabold uppercase tracking-wide text-[#5a3d12]">Evolução de manutenção e disponibilidade</h3>
      <p className="mb-3 text-[11px] text-zinc-500">Horas de manutenção e disponibilidade estimada por período (dia ou mês).</p>

      {data.length === 0 ? (
        <EmptyState title="Sem série temporal" description="Os registros importados não têm datas de início suficientes para a tendência." />
      ) : (
        <div className="h-[300px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={data} margin={{ left: 0, right: 8, top: 12, bottom: 4 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" vertical={false} />
              <XAxis dataKey="label" tick={{ fontSize: 11 }} />
              <YAxis yAxisId="hours" tick={{ fontSize: 11 }} tickFormatter={(v: number) => `${v}h`} />
              <YAxis yAxisId="pct" orientation="right" domain={[0, 100]} tick={{ fontSize: 11 }} tickFormatter={(v: number) => `${v}%`} />
              <Tooltip
                formatter={(value: number, name) => [
                  name === "Disponibilidade"
                    ? value === null
                      ? "Dados insuficientes"
                      : `${value.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`
                    : `${value.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} h`,
                  name
                ]}
              />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Bar yAxisId="hours" dataKey="maintenanceHours" name="Horas de manutenção" fill="#c49a45" radius={[4, 4, 0, 0]} barSize={26} />
              <Line yAxisId="pct" type="monotone" dataKey="availabilityPercent" name="Disponibilidade" stroke="#3f8f6b" strokeWidth={2.5} dot={{ r: 3 }} connectNulls />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      )}
    </article>
  );
}
