"use client";

import { Bar, BarChart, Cell, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { EmptyState } from "@/components/EmptyState";
import type { LubricantMaterialAggregate } from "@/types/lubricants";

type LubricantOutputChartProps = {
  title: string;
  subtitle: string;
  items: LubricantMaterialAggregate[];
  color: string;
  className?: string;
  emptyDescription: string;
  onSelect?: (code: string) => void;
};

/** Barras horizontais — top 10 materiais por quantidade (saída ou entrada). */
export function LubricantOutputChart({
  title,
  subtitle,
  items,
  color,
  className = "",
  emptyDescription,
  onSelect
}: LubricantOutputChartProps) {
  const data = items.slice(0, 10).map((item) => ({
    code: item.code,
    name: item.description,
    value: item.quantity,
    unit: item.unit
  }));

  const height = Math.max(200, data.length * 38 + 24);

  return (
    <article className={`panel rounded-lg p-4 ${className}`}>
      <h3 className="text-[11px] font-extrabold uppercase tracking-wide text-gold-deep">{title}</h3>
      <p className="mb-3 text-[11px] text-zinc-500">{subtitle}</p>

      {data.length === 0 ? (
        <EmptyState title="Sem dados no período" description={emptyDescription} />
      ) : (
        <div style={{ height }} className="w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} layout="vertical" margin={{ left: 8, right: 48, top: 4, bottom: 4 }}>
              <XAxis type="number" tick={{ fontSize: 11 }} />
              <YAxis type="category" dataKey="name" width={170} tick={{ fontSize: 11 }} tickFormatter={truncate} />
              <Tooltip
                cursor={{ fill: "rgba(196,154,69,0.08)" }}
                formatter={(value: number, _name, entry) => [
                  `${value.toLocaleString("pt-BR")} ${entry?.payload?.unit ?? ""}`,
                  "Quantidade"
                ]}
              />
              <Bar
                dataKey="value"
                radius={[0, 4, 4, 0]}
                barSize={20}
                onClick={(entry: { code?: string }) => entry?.code && onSelect?.(entry.code)}
                className={onSelect ? "cursor-pointer" : undefined}
              >
                {data.map((entry) => (
                  <Cell key={entry.code} fill={color} />
                ))}
                <LabelList
                  dataKey="value"
                  position="right"
                  className="fill-zinc-700"
                  style={{ fontSize: 11 }}
                  formatter={(value: number) => value.toLocaleString("pt-BR")}
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
