"use client";

import { Bar, BarChart, CartesianGrid, Cell, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { EmptyState } from "@/components/EmptyState";
import { PC_FACTORY_COLORS } from "@/constants/pc-factory-colors";
import type { PcFactoryGroupRow } from "@/types/pc-factory";

type PcFactoryGroupChartProps = {
  rows: PcFactoryGroupRow[];
  className?: string;
};

/** Barras horizontais — horas de manutenção por Grupo Portal (ex.: Indústria Granito). */
export function PcFactoryGroupChart({ rows, className = "" }: PcFactoryGroupChartProps) {
  const data = rows
    .filter((row) => row.maintenanceHours > 0)
    .map((row) => ({ group: row.groupPortal, value: row.maintenanceHours, events: row.maintenanceEvents }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 12);

  const height = Math.max(200, data.length * 40 + 24);

  return (
    <article className={`panel rounded-lg p-4 ${className}`}>
      <h3 className="text-[11px] font-extrabold uppercase tracking-wide text-[#5a3d12]">Horas de manutenção por grupo</h3>
      <p className="mb-3 text-[11px] text-zinc-500">Total de horas de manutenção (Mecânica + Elétrica + Automação + Aguardando) por Grupo Portal.</p>

      {data.length === 0 ? (
        <EmptyState title="Sem dados no período" description="Nenhum grupo com horas de manutenção." />
      ) : (
        <div style={{ height }} className="w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} layout="vertical" margin={{ left: 8, right: 56, top: 4, bottom: 4 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" horizontal={false} />
              <XAxis type="number" tick={{ fontSize: 11 }} />
              <YAxis type="category" dataKey="group" width={150} tick={{ fontSize: 11 }} tickFormatter={truncate} />
              <Tooltip
                cursor={{ fill: "rgba(196,154,69,0.08)" }}
                formatter={(value: number, _name, item) => [
                  `${value.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} h · ${item?.payload?.events ?? 0} eventos`,
                  "Manutenção"
                ]}
              />
              <Bar dataKey="value" radius={[0, 4, 4, 0]} barSize={22}>
                {data.map((entry) => (
                  <Cell key={entry.group} fill={PC_FACTORY_COLORS.MANUTENCAO} />
                ))}
                <LabelList
                  dataKey="value"
                  position="right"
                  className="fill-zinc-700"
                  style={{ fontSize: 11 }}
                  formatter={(value: number) => `${value.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} h`}
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
