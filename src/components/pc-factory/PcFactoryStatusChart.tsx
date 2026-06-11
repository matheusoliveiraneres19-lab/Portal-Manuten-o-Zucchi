"use client";

import { Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { EmptyState } from "@/components/EmptyState";
import type { PcFactoryCategorySlice } from "@/types/pc-factory";

type PcFactoryStatusChartProps = {
  slices: PcFactoryCategorySlice[];
  className?: string;
};

/** Rosca — distribuição de horas por classificação gerencial. */
export function PcFactoryStatusChart({ slices, className = "" }: PcFactoryStatusChartProps) {
  const data = slices.filter((slice) => slice.totalHours > 0);

  return (
    <article className={`panel rounded-lg p-4 ${className}`}>
      <h3 className="text-[11px] font-extrabold uppercase tracking-wide text-[#5a3d12]">Distribuição de horas por classificação</h3>
      <p className="mb-3 text-[11px] text-zinc-500">Participação de cada classificação no tempo total registrado.</p>

      {data.length === 0 ? (
        <EmptyState title="Sem dados no período" description="Nenhuma hora registrada para os filtros atuais." />
      ) : (
        <div className="h-[280px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie data={data} dataKey="totalHours" nameKey="label" cx="50%" cy="50%" innerRadius={58} outerRadius={92} paddingAngle={1.5} stroke="none">
                {data.map((slice) => (
                  <Cell key={slice.category} fill={slice.color} />
                ))}
              </Pie>
              <Tooltip
                formatter={(value: number, _name, entry) => [
                  `${value.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} h (${entry?.payload?.percent?.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%)`,
                  entry?.payload?.label ?? ""
                ]}
              />
              <Legend formatter={(value) => <span style={{ fontSize: 11, color: "#52525b" }}>{value}</span>} iconType="circle" wrapperStyle={{ fontSize: 11 }} />
            </PieChart>
          </ResponsiveContainer>
        </div>
      )}
    </article>
  );
}
