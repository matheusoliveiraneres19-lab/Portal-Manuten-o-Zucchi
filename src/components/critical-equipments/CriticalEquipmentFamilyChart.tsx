"use client";

import { Bar, BarChart, CartesianGrid, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { EmptyState } from "@/components/EmptyState";
import type { CriticalEquipmentFamilySlice } from "@/types/critical-equipments";

type CriticalEquipmentFamilyChartProps = {
  slices: CriticalEquipmentFamilySlice[];
};

export function CriticalEquipmentFamilyChart({ slices }: CriticalEquipmentFamilyChartProps) {
  const data = slices.map((slice) => ({
    name: slice.familyLabel,
    value: slice.totalOrders,
    equipments: slice.totalEquipments
  }));

  return (
    <article className="panel rounded-lg p-4 xl:col-span-12">
      <h3 className="text-[11px] font-extrabold uppercase tracking-wide text-[#5a3d12]">
        Distribuição por família de equipamento
      </h3>
      <p className="mb-3 text-[11px] text-zinc-500">
        Ordens de manutenção por família (Multifio, Politriz, Ponte Rolante, etc.).
      </p>

      {data.length === 0 ? (
        <EmptyState
          title="Sem famílias no período"
          description="Ajuste os filtros para visualizar a distribuição por família."
        />
      ) : (
        <div className="h-[260px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} margin={{ left: 8, right: 12, top: 8, bottom: 4 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.06)" vertical={false} />
              <XAxis dataKey="name" tick={{ fontSize: 11 }} interval={0} angle={-18} textAnchor="end" height={54} />
              <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
              <Tooltip
                cursor={{ fill: "rgba(196,154,69,0.08)" }}
                formatter={(value: number, _name, entry) => [
                  `${value.toLocaleString("pt-BR")} OS · ${entry?.payload?.equipments} equipamento(s)`,
                  "Ordens"
                ]}
              />
              <Bar dataKey="value" fill="#2f6384" radius={[4, 4, 0, 0]} maxBarSize={64}>
                <LabelList dataKey="value" position="top" className="fill-zinc-700" style={{ fontSize: 11 }} />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </article>
  );
}
