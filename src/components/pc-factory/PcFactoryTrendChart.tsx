"use client";

import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { EmptyState } from "@/components/EmptyState";
import type { PcFactoryTrendPoint } from "@/types/pc-factory";

type PcFactoryTrendChartProps = {
  points: PcFactoryTrendPoint[];
  className?: string;
};

/** Linha — evolução de disponibilidade e utilização por mês. */
export function PcFactoryTrendChart({ points, className = "" }: PcFactoryTrendChartProps) {
  const data = points.filter((point) => point.availabilityPercent !== null || point.utilizationPercent !== null);

  return (
    <article className={`panel rounded-lg p-4 ${className}`}>
      <h3 className="text-[11px] font-extrabold uppercase tracking-wide text-[#5a3d12]">
        Evolução de disponibilidade e utilização
      </h3>
      <p className="mb-3 text-[11px] text-zinc-500">Tendência mensal (requer datas de início nos registros importados).</p>

      {data.length === 0 ? (
        <EmptyState
          title="Sem série temporal"
          description="Os registros importados não têm datas de início suficientes para a tendência."
        />
      ) : (
        <div className="h-[300px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data} margin={{ left: 0, right: 12, top: 12, bottom: 4 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" vertical={false} />
              <XAxis dataKey="label" tick={{ fontSize: 11 }} />
              <YAxis domain={[0, 100]} tick={{ fontSize: 11 }} tickFormatter={(v: number) => `${v}%`} />
              <Tooltip
                formatter={(value: number, name) => [
                  value === null ? "Dados insuficientes" : `${value.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`,
                  name
                ]}
              />
              <Legend wrapperStyle={{ fontSize: 11 }} iconType="plainline" />
              <Line
                type="monotone"
                dataKey="availabilityPercent"
                name="Disponibilidade"
                stroke="#3f8f6b"
                strokeWidth={2.5}
                dot={{ r: 3 }}
                connectNulls
              />
              <Line
                type="monotone"
                dataKey="utilizationPercent"
                name="Utilização"
                stroke="#c49a45"
                strokeWidth={2.5}
                dot={{ r: 3 }}
                connectNulls
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </article>
  );
}
