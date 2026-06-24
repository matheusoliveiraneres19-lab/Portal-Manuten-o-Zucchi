"use client";

import {
  Bar,
  CartesianGrid,
  Cell,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from "recharts";
import { EmptyState } from "@/components/EmptyState";
import { PC_FACTORY_COLORS } from "@/constants/pc-factory-colors";
import type { PcFactoryRootCauseSlice } from "@/types/pc-factory";

type PcFactoryRootCauseChartProps = {
  rows: PcFactoryRootCauseSlice[];
  className?: string;
};

/**
 * Pareto das causas raiz de manutenção: barras = horas paradas por causa;
 * linha = % acumulado (regra 80/20 para priorizar os "poucos vitais").
 */
export function PcFactoryRootCauseChart({ rows, className = "" }: PcFactoryRootCauseChartProps) {
  return (
    <article className={`panel rounded-lg p-4 ${className}`}>
      <h3 className="text-[11px] font-extrabold uppercase tracking-wide text-[#5a3d12]">Pareto de causas raiz</h3>
      <p className="mb-3 text-[11px] text-zinc-500">
        Horas de manutenção por causa raiz e % acumulado. Concentre a ação nas primeiras barras (regra 80/20).
      </p>

      {rows.length === 0 ? (
        <EmptyState
          title="Sem causa raiz no período"
          description="Os eventos de manutenção não têm causa raiz preenchida na planilha (coluna 'Causa Raiz')."
        />
      ) : (
        <div style={{ height: Math.max(260, rows.length * 16 + 180) }} className="w-full">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={rows} margin={{ left: 4, right: 8, top: 8, bottom: 56 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.06)" vertical={false} />
              <XAxis
                dataKey="cause"
                tick={{ fontSize: 10 }}
                interval={0}
                angle={-32}
                textAnchor="end"
                height={64}
                tickFormatter={truncate}
              />
              <YAxis yAxisId="hours" tick={{ fontSize: 11 }} />
              <YAxis
                yAxisId="cum"
                orientation="right"
                domain={[0, 100]}
                tickFormatter={(v: number) => `${v}%`}
                tick={{ fontSize: 11 }}
              />
              <Tooltip
                cursor={{ fill: "rgba(196,154,69,0.08)" }}
                formatter={(value: number, name: string) =>
                  name === "% acumulado"
                    ? [`${value.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`, name]
                    : [`${value.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} h`, "Horas"]
                }
              />
              <Bar yAxisId="hours" dataKey="hours" name="Horas" radius={[4, 4, 0, 0]} barSize={26}>
                {rows.map((row) => (
                  <Cell key={row.cause} fill={PC_FACTORY_COLORS.MANUTENCAO} />
                ))}
              </Bar>
              <Line
                yAxisId="cum"
                type="monotone"
                dataKey="cumulativePercent"
                name="% acumulado"
                stroke={PC_FACTORY_COLORS.OPERACIONAL}
                strokeWidth={2}
                dot={{ r: 3 }}
              />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      )}
    </article>
  );
}

function truncate(value: string): string {
  return value.length > 18 ? `${value.slice(0, 17)}…` : value;
}
