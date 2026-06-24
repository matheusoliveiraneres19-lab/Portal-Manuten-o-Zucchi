"use client";

import { Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { EmptyState } from "@/components/EmptyState";
import type { PcFactoryManagementGroupRow } from "@/types/pc-factory";

type Props = {
  rows: PcFactoryManagementGroupRow[];
  className?: string;
};

/** Rosca — distribuição por grupo da Tabela Gerencial (Management View do PC-Factory). */
export function PcFactoryManagementChart({ rows, className = "" }: Props) {
  const data = rows.filter((row) => row.totalHours > 0);

  return (
    <article className={`panel rounded-lg p-4 ${className}`}>
      <h3 className="text-[11px] font-extrabold uppercase tracking-wide text-[#5a3d12]">Distribuição por grupo (Tabela Gerencial)</h3>
      <p className="mb-3 text-[11px] text-zinc-500">Participação de cada grupo do PC-Factory no Tempo Decorrido total.</p>

      {data.length === 0 ? (
        <EmptyState title="Sem dados no período" description="Reimporte os dados do PC-Factory para preencher os grupos." />
      ) : (
        <div className="h-[280px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie data={data} dataKey="totalHours" nameKey="label" cx="50%" cy="50%" innerRadius={58} outerRadius={92} paddingAngle={1.5} stroke="none">
                {data.map((row) => (
                  <Cell key={row.group} fill={row.color} />
                ))}
              </Pie>
              <Tooltip
                formatter={(value: number, _name, entry) => [
                  `${value.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} h (${entry?.payload?.percent?.toLocaleString("pt-BR", { maximumFractionDigits: 2 })}%)`,
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
