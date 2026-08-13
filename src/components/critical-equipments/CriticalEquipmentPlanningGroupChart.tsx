"use client";

import { Bar, BarChart, CartesianGrid, Cell, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { EmptyState } from "@/components/EmptyState";
import type { CriticalEquipmentPlanningGroupSlice } from "@/types/critical-equipments";

type CriticalEquipmentPlanningGroupChartProps = {
  slices: CriticalEquipmentPlanningGroupSlice[];
};

/**
 * Dashboard "Ordens por Grupo de Planejamento" (TAREFA 3) — Mecânica, Elétrica,
 * Serviço Terceiro, Lubrificação, Usinagem e Outros. Os grupos chegam do service
 * já normalizados e na ordem oficial; aqui só há apresentação.
 */
export function CriticalEquipmentPlanningGroupChart({ slices }: CriticalEquipmentPlanningGroupChartProps) {
  const data = slices.map((slice) => ({
    name: slice.label,
    value: slice.totalOrders,
    color: slice.color,
    openOrders: slice.openOrders,
    closedOrders: slice.closedOrders,
    correctiveOrders: slice.correctiveOrders,
    plannedOrders: slice.plannedOrders
  }));

  return (
    <article className="panel rounded-lg p-4 xl:col-span-8">
      <h3 className="text-[11px] font-extrabold uppercase tracking-wide text-gold-deep">
        Ordens por Grupo de Planejamento
      </h3>
      <p className="mb-3 text-[11px] text-zinc-500">
        Volume de ordens por equipe responsável pelo planejamento da manutenção.
      </p>

      {data.length === 0 ? (
        <EmptyState
          title="Sem grupos de planejamento no período"
          description="Ajuste os filtros para visualizar a distribuição por grupo."
        />
      ) : (
        <div className="h-[280px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} margin={{ left: 8, right: 12, top: 12, bottom: 4 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.06)" vertical={false} />
              <XAxis dataKey="name" tick={{ fontSize: 11 }} interval={0} height={40} />
              <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
              <Tooltip
                cursor={{ fill: "rgba(196,154,69,0.08)" }}
                content={({ active, payload }) => {
                  if (!active || !payload?.length) {
                    return null;
                  }
                  const item = payload[0].payload as (typeof data)[number];
                  return (
                    <div className="rounded-md border border-zinc-300 bg-white/95 px-3 py-2 text-[11px] shadow-lg">
                      <p className="mb-1 font-bold text-zinc-900">{item.name}</p>
                      <Row label="Total de ordens" value={item.value} bold />
                      <Row label="Corretivas" value={item.correctiveOrders} />
                      <Row label="Planejadas" value={item.plannedOrders} />
                      <Row label="Em aberto" value={item.openOrders} />
                      <Row label="Fechadas" value={item.closedOrders} />
                    </div>
                  );
                }}
              />
              <Bar dataKey="value" radius={[4, 4, 0, 0]} maxBarSize={72}>
                {data.map((entry) => (
                  <Cell key={entry.name} fill={entry.color} />
                ))}
                <LabelList dataKey="value" position="top" className="fill-zinc-700" style={{ fontSize: 11 }} />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </article>
  );
}

function Row({ label, value, bold = false }: { label: string; value: number; bold?: boolean }) {
  return (
    <p className={`flex items-center justify-between gap-4 ${bold ? "text-zinc-900" : "text-zinc-600"}`}>
      <span>{label}</span>
      <span className={bold ? "font-bold" : "font-semibold"}>{value.toLocaleString("pt-BR")}</span>
    </p>
  );
}
