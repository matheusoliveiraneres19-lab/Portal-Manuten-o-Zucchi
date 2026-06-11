"use client";

import { Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { EmptyState } from "@/components/EmptyState";
import type { PcFactoryMaintenanceSplit } from "@/types/pc-factory";

type PcFactoryMaintenanceSplitChartProps = {
  split: PcFactoryMaintenanceSplit[];
  className?: string;
};

/** Rosca — Manutenção Mecânica × Elétrica × Aguardando (somente os 3 status de manutenção). */
export function PcFactoryMaintenanceSplitChart({ split, className = "" }: PcFactoryMaintenanceSplitChartProps) {
  const data = split.filter((item) => item.hours > 0);

  return (
    <article className={`panel rounded-lg p-4 ${className}`}>
      <h3 className="text-[11px] font-extrabold uppercase tracking-wide text-[#5a3d12]">Manutenção: Mecânica × Elétrica × Aguardando</h3>
      <p className="mb-3 text-[11px] text-zinc-500">Horas dos três status que entram como manutenção.</p>

      {data.length === 0 ? (
        <EmptyState title="Sem manutenção no período" description="Nenhum dos 3 status de manutenção foi registrado." />
      ) : (
        <div className="h-[280px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie data={data} dataKey="hours" nameKey="label" cx="50%" cy="50%" innerRadius={58} outerRadius={92} paddingAngle={1.5} stroke="none">
                {data.map((item) => (
                  <Cell key={item.key} fill={item.color} />
                ))}
              </Pie>
              <Tooltip
                formatter={(value: number, _name, entry) => [
                  `${value.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} h · ${entry?.payload?.events ?? 0} eventos`,
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
