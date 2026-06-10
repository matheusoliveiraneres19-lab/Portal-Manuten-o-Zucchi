"use client";

import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { EmptyState } from "@/components/EmptyState";
import { formatCurrency, formatPercent } from "@/utils/formatters";
import type { RegularizationVsNormal } from "@/types/purchases";

const COLORS = { normal: "#3f8f6b", regularization: "#a6192e", other: "#9ca3af" };

/** Regularizações (Y04) x compras normais (Y01) — distribuição por quantidade e valor. */
export function PurchaseTypeChart({ data, className = "" }: { data: RegularizationVsNormal; className?: string }) {
  const slices = [
    { key: "normal", name: "Compra normal (Y01)", value: data.normalCount, amount: data.normalValue, color: COLORS.normal },
    { key: "regularization", name: "Regularização (Y04)", value: data.regularizationCount, amount: data.regularizationValue, color: COLORS.regularization },
    { key: "other", name: "Outros", value: data.otherCount, amount: data.otherValue, color: COLORS.other }
  ].filter((slice) => slice.value > 0);

  const total = slices.reduce((acc, slice) => acc + slice.value, 0);

  return (
    <article className={`panel rounded-lg p-4 ${className}`}>
      <h3 className="text-[11px] font-extrabold uppercase tracking-wide text-[#5a3d12]">Regularizações x compras normais</h3>
      <p className="mb-3 text-[11px] text-zinc-500">Distribuição por Grupo Comp (Y01/Y04).</p>

      {total === 0 ? (
        <EmptyState title="Sem dados no período" description="Nenhuma compra classificada no intervalo." />
      ) : (
        <div className="flex flex-col items-center gap-4 sm:flex-row">
          <div className="h-44 w-44 shrink-0">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={slices} dataKey="value" nameKey="name" innerRadius={42} outerRadius={70} paddingAngle={2}>
                  {slices.map((slice) => (
                    <Cell key={slice.key} fill={slice.color} />
                  ))}
                </Pie>
                <Tooltip formatter={(value: number, name) => [`${value} item(ns)`, name as string]} />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <ul className="flex-1 space-y-2 text-xs">
            {slices.map((slice) => (
              <li key={slice.key} className="flex items-center justify-between gap-2">
                <span className="flex items-center gap-2">
                  <span className="h-2.5 w-2.5 rounded-full" style={{ background: slice.color }} />
                  <span className="text-zinc-700">{slice.name}</span>
                </span>
                <span className="text-right">
                  <span className="font-semibold text-zinc-900">{slice.value}</span>
                  <span className="ml-1 text-zinc-500">({formatPercent((slice.value / total) * 100)})</span>
                  <span className="block text-[11px] text-zinc-500">{formatCurrency(slice.amount)}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </article>
  );
}
