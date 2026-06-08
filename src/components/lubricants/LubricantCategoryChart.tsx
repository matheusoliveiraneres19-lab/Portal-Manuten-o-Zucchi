"use client";

import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { EmptyState } from "@/components/EmptyState";
import type { LubricantMovementTypeSlice } from "@/types/lubricants";

type LubricantCategoryChartProps = {
  slices: LubricantMovementTypeSlice[];
  className?: string;
};

/** Rosca — distribuição das movimentações por tipo (ENTRADA, SAIDA, etc.). */
export function LubricantCategoryChart({ slices, className = "" }: LubricantCategoryChartProps) {
  const total = slices.reduce((acc, slice) => acc + slice.value, 0);

  return (
    <article className={`panel rounded-lg p-4 ${className}`}>
      <h3 className="text-[11px] font-extrabold uppercase tracking-wide text-[#5a3d12]">Distribuição por tipo de movimento</h3>
      <p className="mb-3 text-[11px] text-zinc-500">Quantidade de movimentações por categoria no ano.</p>

      {total === 0 ? (
        <EmptyState title="Sem movimentações" description="Importe a planilha para ver a distribuição." />
      ) : (
        <div className="flex flex-col items-center gap-3 sm:flex-row">
          <div className="h-[200px] w-full sm:w-1/2">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={slices} dataKey="value" nameKey="label" innerRadius={48} outerRadius={78} paddingAngle={2}>
                  {slices.map((slice) => (
                    <Cell key={slice.category} fill={slice.color} />
                  ))}
                </Pie>
                <Tooltip formatter={(value: number, name) => [`${value.toLocaleString("pt-BR")} mov.`, name]} />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <ul className="w-full space-y-2 sm:w-1/2">
            {slices.map((slice) => (
              <li key={slice.category} className="flex items-center gap-2 text-xs">
                <span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ backgroundColor: slice.color }} />
                <span className="flex-1 text-zinc-700">{slice.label}</span>
                <span className="font-semibold text-zinc-900">{slice.value.toLocaleString("pt-BR")}</span>
                <span className="w-10 text-right text-zinc-500">{percent(slice.value, total)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </article>
  );
}

function percent(value: number, total: number): string {
  if (total === 0) {
    return "0%";
  }
  return `${Math.round((value / total) * 100)}%`;
}
