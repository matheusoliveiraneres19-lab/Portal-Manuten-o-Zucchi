"use client";

import { Bar, BarChart, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { EmptyState } from "@/components/EmptyState";
import type { CriticalEquipmentHoursPoint } from "@/types/critical-equipments";

type CriticalEquipmentHoursChartProps = {
  items: CriticalEquipmentHoursPoint[];
  onSelect?: (id: string) => void;
};

export function CriticalEquipmentHoursChart({ items, onSelect }: CriticalEquipmentHoursChartProps) {
  const data = items.map((item) => ({
    id: item.id,
    name: item.equipmentName,
    value: Number(item.totalWorkedHours.toFixed(1))
  }));

  const height = Math.max(220, data.length * 40 + 24);

  function handleSelect(payload: { id?: string } | undefined) {
    if (onSelect && payload?.id) {
      onSelect(payload.id);
    }
  }

  return (
    <article className="panel rounded-lg p-4 xl:col-span-5">
      <h3 className="text-[11px] font-extrabold uppercase tracking-wide text-[#5a3d12]">
        Esforço de manutenção por equipamento
      </h3>
      <p className="mb-3 text-[11px] text-zinc-500">
        Horas apontadas no período (H). Clique para ver os responsáveis pelas horas.
      </p>

      {data.length === 0 ? (
        <EmptyState
          title="Sem horas apontadas no período"
          description="Os equipamentos ainda não possuem horas registradas no período."
        />
      ) : (
        <div style={{ height }} className="w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} layout="vertical" margin={{ left: 8, right: 44, top: 4, bottom: 4 }}>
              <XAxis type="number" tick={{ fontSize: 11 }} />
              <YAxis type="category" dataKey="name" width={150} tick={{ fontSize: 11 }} tickFormatter={truncate} />
              <Tooltip
                cursor={{ fill: "rgba(196,154,69,0.08)" }}
                formatter={(value: number) => [`${value.toLocaleString("pt-BR")} H`, "Horas"]}
              />
              <Bar
                dataKey="value"
                fill="#c49a45"
                radius={[0, 4, 4, 0]}
                barSize={20}
                onClick={(entry: { id?: string }) => handleSelect(entry)}
                className={onSelect ? "cursor-pointer" : undefined}
              >
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
  return value.length > 22 ? `${value.slice(0, 21)}…` : value;
}
