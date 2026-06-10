"use client";

import { Bar, BarChart, CartesianGrid, Cell, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { EmptyState } from "@/components/EmptyState";
import type { PurchaseProcessTimes } from "@/types/purchases";

const STAGES = [
  { key: "averageRequisitionToOrderDays", label: "Req. → Pedido", color: "#0f4d68" },
  { key: "averageOrderToReceiptDays", label: "Pedido → Receb.", color: "#3f8f6b" },
  { key: "averageMigoToMiroDays", label: "MIGO → MIRO", color: "#c49a45" },
  { key: "averageTotalProcessDays", label: "Total", color: "#7b551f" }
] as const;

/** Tempo médio de lançamento no sistema (dias) por etapa. */
export function PurchaseProcessTimeChart({ times, className = "" }: { times: PurchaseProcessTimes; className?: string }) {
  const data = STAGES.map((stage) => ({
    name: stage.label,
    value: times[stage.key] ?? 0,
    color: stage.color
  }));
  const hasData = data.some((item) => item.value > 0);

  return (
    <article className={`panel rounded-lg p-4 ${className}`}>
      <h3 className="text-[11px] font-extrabold uppercase tracking-wide text-[#5a3d12]">Tempo médio do processo (dias)</h3>
      <p className="mb-3 text-[11px] text-zinc-500">Média de dias entre as etapas de requisição, pedido, recebimento e MIRO.</p>

      {!hasData ? (
        <EmptyState title="Sem dados no período" description="Datas insuficientes para calcular tempos médios." />
      ) : (
        <div className="h-56 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} margin={{ left: 8, right: 12, top: 12, bottom: 4 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e7e5e4" vertical={false} />
              <XAxis dataKey="name" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip formatter={(value: number) => [`${value.toLocaleString("pt-BR")} dias`, "Média"]} cursor={{ fill: "rgba(196,154,69,0.08)" }} />
              <Bar dataKey="value" radius={[4, 4, 0, 0]} maxBarSize={56}>
                {data.map((entry) => (
                  <Cell key={entry.name} fill={entry.color} />
                ))}
                <LabelList dataKey="value" position="top" className="fill-zinc-700" style={{ fontSize: 11 }} formatter={(value: number) => value.toLocaleString("pt-BR")} />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </article>
  );
}
