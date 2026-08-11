"use client";

import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { EmptyState } from "@/components/EmptyState";
import type { CriticalEquipmentCorrectivePlannedData } from "@/types/critical-equipments";

type CriticalEquipmentCorrectivePlannedChartProps = {
  data: CriticalEquipmentCorrectivePlannedData;
  /** Aplica o layout compacto usado dentro do drawer de drill-down. */
  compact?: boolean;
};

const CORRECTIVE_COLOR = "#b51f32";
const PLANNED_COLOR = "#3f8f6b";

/**
 * Dashboard "Ordens Corretivas x Planejadas" (TAREFA 6): cards no topo + rosca.
 * Percentuais vêm prontos do service (blindados contra divisão por zero).
 */
export function CriticalEquipmentCorrectivePlannedChart({
  data,
  compact = false
}: CriticalEquipmentCorrectivePlannedChartProps) {
  const slices = [
    { name: "Corretivas", value: data.correctiveOrders, color: CORRECTIVE_COLOR, percent: data.correctivePercent },
    { name: "Planejadas", value: data.plannedOrders, color: PLANNED_COLOR, percent: data.plannedPercent }
  ].filter((slice) => slice.value > 0);

  const body = (
    <>
      <div className="mb-3 grid grid-cols-3 gap-2">
        <MiniCard label="Total de ordens" value={fmt(data.totalOrders)} />
        <MiniCard
          label="Corretivas"
          value={fmt(data.correctiveOrders)}
          hint={`${pct(data.correctivePercent)}`}
          color={CORRECTIVE_COLOR}
        />
        <MiniCard
          label="Planejadas"
          value={fmt(data.plannedOrders)}
          hint={`${pct(data.plannedPercent)}`}
          color={PLANNED_COLOR}
        />
      </div>

      {slices.length === 0 ? (
        <EmptyState
          title="Sem ordens classificadas"
          description="Ajuste os filtros para comparar corretivas e planejadas."
        />
      ) : (
        <div className={compact ? "h-[180px] w-full" : "h-[220px] w-full"}>
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={slices}
                dataKey="value"
                nameKey="name"
                innerRadius="58%"
                outerRadius="86%"
                paddingAngle={2}
                stroke="none"
              >
                {slices.map((slice) => (
                  <Cell key={slice.name} fill={slice.color} />
                ))}
              </Pie>
              <Tooltip
                content={({ active, payload }) => {
                  if (!active || !payload?.length) {
                    return null;
                  }
                  const slice = payload[0].payload as (typeof slices)[number];
                  return (
                    <div className="rounded-md border border-zinc-300 bg-white/95 px-3 py-2 text-[11px] shadow-lg">
                      <p className="font-bold text-zinc-900">{slice.name}</p>
                      <p className="text-zinc-600">
                        {fmt(slice.value)} OS · {pct(slice.percent)}
                      </p>
                    </div>
                  );
                }}
              />
            </PieChart>
          </ResponsiveContainer>
        </div>
      )}

      <div className="mt-2 flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-[11px]">
        <Legend color={CORRECTIVE_COLOR} label="Corretivas" />
        <Legend color={PLANNED_COLOR} label="Planejadas" />
      </div>

      {data.unclassifiedOrders > 0 ? (
        <p className="mt-2 text-center text-[10px] text-zinc-500">
          {fmt(data.unclassifiedOrders)} ordem(ns) com tipo de atividade não reconhecido ficaram fora do rateio.
        </p>
      ) : null}
    </>
  );

  if (compact) {
    return <div>{body}</div>;
  }

  return (
    <article className="panel rounded-lg p-4 xl:col-span-4">
      <h3 className="text-[11px] font-extrabold uppercase tracking-wide text-[#5a3d12]">
        Ordens Corretivas x Planejadas
      </h3>
      <p className="mb-3 text-[11px] text-zinc-500">
        Planejadas = preventiva, melhoria, inspeção, lubrificação, preditiva e planejada.
      </p>
      {body}
    </article>
  );
}

function MiniCard({
  label,
  value,
  hint,
  color
}: {
  label: string;
  value: string;
  hint?: string;
  color?: string;
}) {
  return (
    <div className="rounded-lg border border-zinc-200 bg-white/60 px-2.5 py-2">
      <p className="truncate text-[10px] font-semibold uppercase tracking-wide text-zinc-500" title={label}>
        {label}
      </p>
      <p className="mt-0.5 text-lg font-light leading-tight text-zinc-950" style={color ? { color } : undefined}>
        {value}
      </p>
      {hint ? <p className="text-[10px] font-semibold text-zinc-500">{hint}</p> : null}
    </div>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5 text-zinc-600">
      <span className="h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: color }} />
      {label}
    </span>
  );
}

function fmt(value: number): string {
  return Number.isFinite(value) ? value.toLocaleString("pt-BR") : "0";
}

/** Percentual pt-BR com 1 casa; nunca exibe NaN/Infinity. */
function pct(value: number): string {
  const safe = Number.isFinite(value) ? value : 0;
  return `${safe.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;
}
