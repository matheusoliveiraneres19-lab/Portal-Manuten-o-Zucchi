"use client";

import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { EmptyState } from "@/components/EmptyState";
import { formatCurrency } from "@/utils/formatters";
import type { PurchaseNatureSlice } from "@/types/purchases";

/** Materiais x serviços — por valor. */
export function PurchaseNatureChart({ slices, className = "" }: { slices: PurchaseNatureSlice[]; className?: string }) {
  const total = slices.reduce((acc, slice) => acc + slice.count, 0);

  return (
    <article className={`panel rounded-lg p-4 ${className}`}>
      <h3 className="text-[11px] font-extrabold uppercase tracking-wide text-[#5a3d12]">Materiais x serviços</h3>
      <p className="mb-3 text-[11px] text-zinc-500">Distribuição por natureza do item.</p>

      {total === 0 ? (
        <EmptyState title="Sem dados no período" description="Nenhum item classificado no intervalo." />
      ) : (
        <div className="flex flex-col items-center gap-4 sm:flex-row">
          <div className="h-44 w-44 shrink-0">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={slices} dataKey="count" nameKey="label" innerRadius={42} outerRadius={70} paddingAngle={2}>
                  {slices.map((slice) => (
                    <Cell key={slice.nature} fill={slice.color} />
                  ))}
                </Pie>
                <Tooltip formatter={(value: number, name) => [`${value} item(ns)`, name as string]} />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <ul className="flex-1 space-y-2 text-xs">
            {slices.map((slice) => (
              <li key={slice.nature} className="flex items-center justify-between gap-2">
                <span className="flex items-center gap-2">
                  <span className="h-2.5 w-2.5 rounded-full" style={{ background: slice.color }} />
                  <span className="text-zinc-700">{slice.label}</span>
                </span>
                <span className="text-right">
                  <span className="font-semibold text-zinc-900">{slice.count}</span>
                  <span className="block text-[11px] text-zinc-500">{formatCurrency(slice.value)}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </article>
  );
}
