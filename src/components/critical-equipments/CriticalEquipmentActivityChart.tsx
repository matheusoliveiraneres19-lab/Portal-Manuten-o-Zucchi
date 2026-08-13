"use client";

import { Bar, BarChart, CartesianGrid, Cell, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { EmptyState } from "@/components/EmptyState";
import type { CriticalEquipmentActivitySlice } from "@/types/critical-equipments";

type CriticalEquipmentActivityChartProps = {
  slices: CriticalEquipmentActivitySlice[];
  /** true quando o campo veio da planilha; false quando a classificação é derivada. */
  fieldAvailable: boolean;
};

/**
 * Dashboard "Ordens por Tipo de Atividade" (TAREFA 5) — responde qual tipo de
 * serviço está sendo mais executado pelas ordens no recorte atual.
 */
export function CriticalEquipmentActivityChart({ slices, fieldAvailable }: CriticalEquipmentActivityChartProps) {
  const data = slices.map((slice) => ({
    name: slice.label,
    value: slice.totalOrders,
    color: slice.color,
    openOrders: slice.openOrders,
    closedOrders: slice.closedOrders
  }));

  return (
    <article className="panel rounded-lg p-4 xl:col-span-12">
      <h3 className="text-[11px] font-extrabold uppercase tracking-wide text-gold-deep">
        Ordens por Tipo de Atividade
      </h3>
      <p className="mb-3 text-[11px] text-zinc-500">
        Corretiva, Preventiva, Melhoria, Inspeção, Lubrificação, Preditiva e Planejada.
        {fieldAvailable ? null : (
          <span className="text-gold-deep"> Classificação derivada do plano (PL/PV) e do texto da ordem.</span>
        )}
      </p>

      {data.length === 0 ? (
        <EmptyState
          title="Sem tipos de atividade no período"
          description="Ajuste os filtros para visualizar a distribuição por tipo de atividade."
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
                      <p className="flex items-center justify-between gap-4 text-zinc-900">
                        <span>Total de ordens</span>
                        <span className="font-bold">{item.value.toLocaleString("pt-BR")}</span>
                      </p>
                      <p className="flex items-center justify-between gap-4 text-zinc-600">
                        <span>Em aberto</span>
                        <span className="font-semibold">{item.openOrders.toLocaleString("pt-BR")}</span>
                      </p>
                      <p className="flex items-center justify-between gap-4 text-zinc-600">
                        <span>Fechadas</span>
                        <span className="font-semibold">{item.closedOrders.toLocaleString("pt-BR")}</span>
                      </p>
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
