"use client";

import { Bar, BarChart, Cell, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { EmptyState } from "@/components/EmptyState";
import type { PcFactoryResourceRow } from "@/types/pc-factory";

export type RankingMetric =
  | "maintenanceHours"
  | "mechanicalHours"
  | "electricalHours"
  | "waitingHours"
  | "availabilityPercent";

type PcFactoryRankingChartProps = {
  title: string;
  subtitle: string;
  rows: PcFactoryResourceRow[];
  metric: RankingMetric;
  color: string;
  className?: string;
  emptyDescription: string;
  onSelect?: (resourceName: string) => void;
};

const SUFFIX: Record<RankingMetric, string> = {
  maintenanceHours: " h",
  mechanicalHours: " h",
  electricalHours: " h",
  waitingHours: " h",
  availabilityPercent: "%"
};

/** Barras horizontais — top máquinas por uma métrica de manutenção/disponibilidade. */
export function PcFactoryRankingChart({
  title,
  subtitle,
  rows,
  metric,
  color,
  className = "",
  emptyDescription,
  onSelect
}: PcFactoryRankingChartProps) {
  const data = rows
    .map((row) => ({ resourceName: row.resourceName, value: row[metric] }))
    .filter((item): item is { resourceName: string; value: number } => item.value !== null && item.value > 0)
    .sort((a, b) => b.value - a.value)
    .slice(0, 10);

  const height = Math.max(200, data.length * 38 + 24);
  const suffix = SUFFIX[metric];

  return (
    <article className={`panel rounded-lg p-4 ${className}`}>
      <h3 className="text-[11px] font-extrabold uppercase tracking-wide text-[#5a3d12]">{title}</h3>
      <p className="mb-3 text-[11px] text-zinc-500">{subtitle}</p>

      {data.length === 0 ? (
        <EmptyState title="Sem dados no período" description={emptyDescription} />
      ) : (
        <div style={{ height }} className="w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} layout="vertical" margin={{ left: 8, right: 56, top: 4, bottom: 4 }}>
              <XAxis type="number" tick={{ fontSize: 11 }} />
              <YAxis type="category" dataKey="resourceName" width={170} tick={{ fontSize: 11 }} tickFormatter={truncate} />
              <Tooltip
                cursor={{ fill: "rgba(196,154,69,0.08)" }}
                formatter={(value: number) => [`${value.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}${suffix}`, "Valor"]}
              />
              <Bar
                dataKey="value"
                radius={[0, 4, 4, 0]}
                barSize={20}
                onClick={(entry: { resourceName?: string }) => entry?.resourceName && onSelect?.(entry.resourceName)}
                className={onSelect ? "cursor-pointer" : undefined}
              >
                {data.map((entry) => (
                  <Cell key={entry.resourceName} fill={color} />
                ))}
                <LabelList
                  dataKey="value"
                  position="right"
                  className="fill-zinc-700"
                  style={{ fontSize: 11 }}
                  formatter={(value: number) => `${value.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}${suffix}`}
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
