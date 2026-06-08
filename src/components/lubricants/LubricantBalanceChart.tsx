"use client";

import { Bar, BarChart, Cell, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { EmptyState } from "@/components/EmptyState";
import type { LubricantBalanceRow } from "@/types/lubricants";

type LubricantBalanceChartProps = {
  rows: LubricantBalanceRow[];
  className?: string;
  onSelect?: (code: string) => void;
};

/** Barras horizontais — códigos com menor saldo estimado (atenção a reposição). */
export function LubricantBalanceChart({ rows, className = "", onSelect }: LubricantBalanceChartProps) {
  const data = rows.slice(0, 10).map((row) => ({
    code: row.code,
    name: row.description,
    value: row.balance,
    unit: row.unit
  }));

  const height = Math.max(200, data.length * 38 + 24);

  return (
    <article className={`panel rounded-lg p-4 ${className}`}>
      <h3 className="text-[11px] font-extrabold uppercase tracking-wide text-[#5a3d12]">Saldo estimado por código</h3>
      <p className="mb-3 text-[11px] text-zinc-500">
        Saldo = entradas + estoque inicial − saídas. Menores saldos no topo.
      </p>

      {data.length === 0 ? (
        <EmptyState title="Sem saldo calculado" description="Importe movimentações para estimar o saldo." />
      ) : (
        <div style={{ height }} className="w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} layout="vertical" margin={{ left: 8, right: 48, top: 4, bottom: 4 }}>
              <XAxis type="number" tick={{ fontSize: 11 }} />
              <YAxis type="category" dataKey="name" width={170} tick={{ fontSize: 11 }} tickFormatter={truncate} />
              <Tooltip
                cursor={{ fill: "rgba(196,154,69,0.08)" }}
                formatter={(value: number, _name, entry) => [
                  `${value.toLocaleString("pt-BR")} ${entry?.payload?.unit ?? ""}`,
                  "Saldo"
                ]}
              />
              <Bar
                dataKey="value"
                radius={[0, 4, 4, 0]}
                barSize={20}
                onClick={(entry: { code?: string }) => entry?.code && onSelect?.(entry.code)}
                className={onSelect ? "cursor-pointer" : undefined}
              >
                {data.map((entry) => (
                  <Cell key={entry.code} fill={entry.value < 0 ? "#a6192e" : "#0f4d68"} />
                ))}
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
  return value.length > 24 ? `${value.slice(0, 23)}…` : value;
}
