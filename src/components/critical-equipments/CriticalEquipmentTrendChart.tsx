"use client";

import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { EmptyState } from "@/components/EmptyState";
import type { CriticalEquipmentTrendPoint } from "@/types/critical-equipments";

type CriticalEquipmentTrendChartProps = {
  points: CriticalEquipmentTrendPoint[];
};

export function CriticalEquipmentTrendChart({ points }: CriticalEquipmentTrendChartProps) {
  const data = points.map((point) => ({ name: point.label, value: point.totalOrders }));

  return (
    <article className="panel rounded-lg p-4 xl:col-span-8">
      <h3 className="text-[11px] font-extrabold uppercase tracking-wide text-[#5a3d12]">
        Evolução de ordens dos equipamentos críticos
      </h3>
      <p className="mb-3 text-[11px] text-zinc-500">Total mensal de ordens dos equipamentos do ranking.</p>

      {data.length === 0 ? (
        <EmptyState
          title="Sem histórico no período"
          description="Selecione um período maior para visualizar a evolução."
        />
      ) : (
        <div className="h-[220px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data} margin={{ left: 4, right: 12, top: 4, bottom: 4 }}>
              <defs>
                <linearGradient id="critical-trend" x1="0" x2="0" y1="0" y2="1">
                  <stop offset="5%" stopColor="#c49a45" stopOpacity={0.35} />
                  <stop offset="95%" stopColor="#c49a45" stopOpacity={0.03} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke="#eee4d6" strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="name" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
              <Tooltip formatter={(value: number) => [`${value.toLocaleString("pt-BR")} OS`, "Ordens"]} />
              <Area dataKey="value" stroke="#a87c2c" strokeWidth={3} fill="url(#critical-trend)" />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}
    </article>
  );
}
