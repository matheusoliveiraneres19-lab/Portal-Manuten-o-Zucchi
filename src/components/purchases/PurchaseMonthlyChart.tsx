"use client";

import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { EmptyState } from "@/components/EmptyState";
import { formatCurrency } from "@/utils/formatters";
import type { PurchaseMonthlyPoint } from "@/types/purchases";

/** Valor comprado por mês (R$). */
export function PurchaseMonthlyChart({ points, className = "" }: { points: PurchaseMonthlyPoint[]; className?: string }) {
  return (
    <article className={`panel rounded-lg p-4 ${className}`}>
      <h3 className="text-[11px] font-extrabold uppercase tracking-wide text-[#5a3d12]">Valor comprado por mês</h3>
      <p className="mb-3 text-[11px] text-zinc-500">Soma do valor (Total líq., com fallback no bruto) por mês.</p>

      {points.length === 0 ? (
        <EmptyState title="Sem dados no período" description="Nenhuma compra com data no intervalo." />
      ) : (
        <div className="h-64 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={points} margin={{ left: 8, right: 12, top: 8, bottom: 4 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e7e5e4" vertical={false} />
              <XAxis dataKey="label" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} tickFormatter={(value: number) => `${(value / 1000).toLocaleString("pt-BR")}k`} />
              <Tooltip formatter={(value: number) => [formatCurrency(value), "Valor"]} cursor={{ fill: "rgba(196,154,69,0.08)" }} />
              <Bar dataKey="value" fill="#c49a45" radius={[4, 4, 0, 0]} maxBarSize={44} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </article>
  );
}
