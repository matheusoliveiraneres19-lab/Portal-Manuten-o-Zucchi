"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  LabelList,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from "recharts";
import { EmptyState } from "@/components/EmptyState";
import type { CollaboratorMonthPoint } from "@/types/collaborators";
import { CHART_SERIES, SEMANTIC } from "@/constants/theme";

type CollaboratorHoursChartProps = {
  data: CollaboratorMonthPoint[];
  meta: number;
};

/** Horas apontadas por mês; barras abaixo da meta em vermelho + linha de meta. */
export function CollaboratorHoursChart({ data, meta }: CollaboratorHoursChartProps) {
  if (data.length === 0) {
    return <EmptyState title="Sem horas no período" description="Ainda não há apontamentos para este colaborador." />;
  }

  return (
    <div style={{ height: 280 }} className="w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ left: 4, right: 48, top: 16, bottom: 4 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.06)" vertical={false} />
          <XAxis dataKey="label" tick={{ fontSize: 11 }} />
          <YAxis tick={{ fontSize: 11 }} />
          <Tooltip cursor={{ fill: "rgba(196,154,69,0.08)" }} content={<HoursTooltip meta={meta} />} />
          <ReferenceLine
            y={meta}
            stroke={CHART_SERIES.ordens}
            strokeDasharray="5 4"
            label={{ value: `Meta ${meta} h`, position: "right", fontSize: 11, fill: CHART_SERIES.ordens }}
          />
          <Bar dataKey="hours" radius={[4, 4, 0, 0]} barSize={30}>
            {data.map((point) => (
              <Cell key={point.ym} fill={point.hours > 0 && point.hours < meta ? SEMANTIC.danger.DEFAULT : CHART_SERIES.producao} />
            ))}
            <LabelList
              dataKey="hours"
              position="top"
              style={{ fontSize: 11 }}
              formatter={(value: number) => (value > 0 ? value.toLocaleString("pt-BR") : "")}
            />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

function HoursTooltip({ active, payload, label, meta }: any) {
  if (!active || !payload?.length) return null;
  const hours = Number(payload[0].value ?? 0);
  const diff = Math.round((hours - meta) * 10) / 10;
  return (
    <div className="rounded-md border border-zinc-200 bg-white px-3 py-2 text-xs shadow">
      <div className="font-semibold text-zinc-800">{label}</div>
      <div className="text-zinc-600">{hours.toLocaleString("pt-BR")} h apontadas</div>
      <div className={diff < 0 ? "text-danger" : "text-success-strong"}>
        {diff < 0 ? `Déficit de ${Math.abs(diff).toLocaleString("pt-BR")} h` : `+${diff.toLocaleString("pt-BR")} h vs meta`}
      </div>
    </div>
  );
}
