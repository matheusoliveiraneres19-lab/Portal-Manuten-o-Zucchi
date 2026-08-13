"use client";

import { Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { EmptyState } from "@/components/EmptyState";
import type { CriticalEquipmentStatusSlice } from "@/types/critical-equipments";

type CriticalEquipmentStatusChartProps = {
  slices: CriticalEquipmentStatusSlice[];
};

export function CriticalEquipmentStatusChart({ slices }: CriticalEquipmentStatusChartProps) {
  const total = slices.reduce((sum, slice) => sum + slice.value, 0);
  const data = slices.map((slice) => ({ name: slice.label, value: slice.value, color: slice.color }));

  return (
    <article className="panel rounded-lg p-4 xl:col-span-4">
      <h3 className="text-[11px] font-extrabold uppercase tracking-wide text-gold-deep">
        Distribuição das ordens por status
      </h3>
      <p className="mb-3 text-[11px] text-zinc-500">Participação de cada status no período.</p>

      {total === 0 ? (
        <EmptyState
          title="Sem ordens no período"
          description="Ajuste o filtro para visualizar a distribuição por status."
        />
      ) : (
        <div className="h-[220px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie data={data} dataKey="value" nameKey="name" innerRadius={48} outerRadius={74} paddingAngle={2}>
                {data.map((entry) => (
                  <Cell key={entry.name} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip formatter={(value: number) => [`${value.toLocaleString("pt-BR")} OS`, "Ordens"]} />
              <Legend layout="vertical" align="right" verticalAlign="middle" wrapperStyle={{ fontSize: 11 }} />
            </PieChart>
          </ResponsiveContainer>
        </div>
      )}
    </article>
  );
}
