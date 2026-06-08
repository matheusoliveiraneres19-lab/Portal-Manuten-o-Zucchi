"use client";

import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { EmptyState } from "@/components/EmptyState";
import type { LubricantMonthlyFlowPoint } from "@/types/lubricants";

type LubricantFlowChartProps = {
  points: LubricantMonthlyFlowPoint[];
  className?: string;
};

/** Barras agrupadas — entradas x saídas mês a mês no ano de referência. */
export function LubricantFlowChart({ points, className = "" }: LubricantFlowChartProps) {
  const hasData = points.some((point) => point.inputs > 0 || point.outputs > 0);

  return (
    <article className={`panel rounded-lg p-4 ${className}`}>
      <h3 className="text-[11px] font-extrabold uppercase tracking-wide text-[#5a3d12]">Entradas x Saídas por mês</h3>
      <p className="mb-3 text-[11px] text-zinc-500">Fluxo mensal de entradas e consumo no ano de referência.</p>

      {!hasData ? (
        <EmptyState title="Sem movimentações no ano" description="Importe a planilha ou ajuste o ano de referência." />
      ) : (
        <div className="h-[260px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={points} margin={{ left: 4, right: 8, top: 4, bottom: 4 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(90,61,18,0.12)" vertical={false} />
              <XAxis dataKey="label" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} width={48} />
              <Tooltip
                cursor={{ fill: "rgba(196,154,69,0.08)" }}
                formatter={(value: number, name) => [value.toLocaleString("pt-BR"), name]}
              />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Bar dataKey="inputs" name="Entradas" fill="#3f8f6b" radius={[3, 3, 0, 0]} barSize={14} />
              <Bar dataKey="outputs" name="Saídas" fill="#a6192e" radius={[3, 3, 0, 0]} barSize={14} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </article>
  );
}
