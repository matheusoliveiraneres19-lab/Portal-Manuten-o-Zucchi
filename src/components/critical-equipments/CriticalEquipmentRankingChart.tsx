"use client";

import { Bar, BarChart, Cell, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { EmptyState } from "@/components/EmptyState";
import { CRITICALITY_COLORS } from "@/components/critical-equipments/criticality";
import type { CriticalEquipmentItem } from "@/types/critical-equipments";

type CriticalEquipmentRankingChartProps = {
  items: CriticalEquipmentItem[];
  selectedId?: string | null;
  onSelect?: (id: string) => void;
};

export function CriticalEquipmentRankingChart({ items, selectedId, onSelect }: CriticalEquipmentRankingChartProps) {
  const data = items.map((item) => ({
    id: item.id,
    name: item.equipmentName,
    value: item.totalOrders,
    score: item.criticalityScore,
    label: item.criticalityLabel,
    color: CRITICALITY_COLORS[item.criticalityLabel]
  }));

  const height = Math.max(220, data.length * 40 + 24);

  function handleSelect(payload: { id?: string } | undefined) {
    if (onSelect && payload?.id) {
      onSelect(payload.id);
    }
  }

  return (
    <article className="panel rounded-lg p-4 xl:col-span-7">
      <div className="mb-1 flex items-center justify-between gap-3">
        <h3 className="text-[11px] font-extrabold uppercase tracking-wide text-[#5a3d12]">
          Equipamentos com maior volume de ordens
        </h3>
        <Legend />
      </div>
      <p className="mb-3 text-[11px] text-zinc-500">
        Quantidade de ordens no período (cor = criticidade). Clique para ver as ordens deste equipamento.
      </p>

      {data.length === 0 ? (
        <EmptyState
          title="Sem equipamentos no período"
          description="Importe ordens ou ajuste o filtro para visualizar o ranking."
        />
      ) : (
        <div style={{ height }} className="w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} layout="vertical" margin={{ left: 8, right: 40, top: 4, bottom: 4 }}>
              <XAxis type="number" tick={{ fontSize: 11 }} allowDecimals={false} />
              <YAxis
                type="category"
                dataKey="name"
                width={170}
                tick={{ fontSize: 11 }}
                tickFormatter={truncate}
              />
              <Tooltip
                cursor={{ fill: "rgba(196,154,69,0.08)" }}
                formatter={(value: number, _name, entry) => [
                  `${value} OS · Score ${entry?.payload?.score} (${entry?.payload?.label})`,
                  "Ordens"
                ]}
              />
              <Bar
                dataKey="value"
                radius={[0, 4, 4, 0]}
                barSize={20}
                onClick={(entry: { id?: string }) => handleSelect(entry)}
                className={onSelect ? "cursor-pointer" : undefined}
              >
                {data.map((entry) => (
                  <Cell
                    key={entry.name}
                    fill={entry.color}
                    stroke={selectedId === entry.id ? "#0a0b0b" : undefined}
                    strokeWidth={selectedId === entry.id ? 2 : 0}
                    fillOpacity={selectedId && selectedId !== entry.id ? 0.55 : 1}
                  />
                ))}
                <LabelList dataKey="value" position="right" className="fill-zinc-700" style={{ fontSize: 11 }} />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </article>
  );
}

function Legend() {
  const items: Array<{ label: string; color: string }> = [
    { label: "Crítico", color: CRITICALITY_COLORS["Crítico"] },
    { label: "Atenção", color: CRITICALITY_COLORS["Atenção"] },
    { label: "Monitorado", color: CRITICALITY_COLORS["Monitorado"] }
  ];

  return (
    <div className="flex items-center gap-3">
      {items.map((item) => (
        <span key={item.label} className="flex items-center gap-1 text-[10px] font-semibold uppercase text-zinc-500">
          <span className="h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: item.color }} />
          {item.label}
        </span>
      ))}
    </div>
  );
}

function truncate(value: string): string {
  return value.length > 24 ? `${value.slice(0, 23)}…` : value;
}
