"use client";

import { Bar, BarChart, Cell, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { EmptyState } from "@/components/EmptyState";
import { formatCurrency } from "@/utils/formatters";
import type { PurchaseCategoryRow } from "@/types/purchases";

/** Valor por categoria (Grupo Merc) — top 10. */
export function PurchaseCategoryChart({ rows, className = "" }: { rows: PurchaseCategoryRow[]; className?: string }) {
  const data = rows.slice(0, 10).map((row) => ({
    code: row.code,
    name: row.description,
    value: row.totalValue,
    quantity: row.quantity
  }));
  const height = Math.max(220, data.length * 38 + 24);

  return (
    <article className={`panel rounded-lg p-4 ${className}`}>
      <h3 className="text-[11px] font-extrabold uppercase tracking-wide text-[#5a3d12]">Compras por categoria</h3>
      <p className="mb-3 text-[11px] text-zinc-500">Top 10 categorias por valor comprado.</p>

      {data.length === 0 ? (
        <EmptyState title="Sem dados no período" description="Nenhuma categoria com compras no intervalo." />
      ) : (
        <div style={{ height }} className="w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} layout="vertical" margin={{ left: 8, right: 64, top: 4, bottom: 4 }}>
              <XAxis type="number" tick={{ fontSize: 11 }} tickFormatter={(value: number) => `${(value / 1000).toLocaleString("pt-BR")}k`} />
              <YAxis type="category" dataKey="name" width={170} tick={{ fontSize: 11 }} tickFormatter={truncate} />
              <Tooltip
                cursor={{ fill: "rgba(196,154,69,0.08)" }}
                formatter={(value: number, _name, entry) => [
                  `${formatCurrency(value)} · ${entry?.payload?.quantity ?? 0} item(ns)`,
                  "Valor"
                ]}
              />
              <Bar dataKey="value" radius={[0, 4, 4, 0]} barSize={20}>
                {data.map((entry) => (
                  <Cell key={entry.code} fill="#0f4d68" />
                ))}
                <LabelList
                  dataKey="value"
                  position="right"
                  className="fill-zinc-700"
                  style={{ fontSize: 10 }}
                  formatter={(value: number) => `${(value / 1000).toLocaleString("pt-BR")}k`}
                />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </article>
  );
}

function truncate(value: string): string {
  return value.length > 24 ? `${value.slice(0, 23)}…` : value;
}
