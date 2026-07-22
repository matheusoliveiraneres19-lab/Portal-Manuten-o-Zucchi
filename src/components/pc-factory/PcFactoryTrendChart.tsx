"use client";

import { Bar, CartesianGrid, ComposedChart, Legend, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { TooltipProps } from "recharts";
import { EmptyState } from "@/components/EmptyState";
import { PC_FACTORY_COLORS } from "@/constants/pc-factory-colors";
import type { PcFactoryTrendPoint } from "@/types/pc-factory";

type PcFactoryTrendChartProps = {
  points: PcFactoryTrendPoint[];
  /** Máquina selecionada no filtro (resourceName). Quando definida, a série é só dela. */
  selectedMachine?: string | null;
  className?: string;
};

const MONTHS_PT = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

/** "2026-05" -> "mai/2026" (mês abreviado + ano completo) para o tooltip. */
function monthTooltipLabel(period: string): string {
  const [year, month] = period.split("-").map(Number);
  if (!year || !month || month < 1 || month > 12) return period;
  return `${MONTHS_PT[month - 1]}/${year}`;
}

/** Horas em pt-BR com 1 casa decimal, sem NaN/Infinity. */
function formatHours(value: number): string {
  if (!Number.isFinite(value)) return "0,0 h";
  return `${value.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })} h`;
}

/** Percentual em pt-BR com 1 casa decimal; "—" quando null/indefinido, sem NaN/Infinity. */
function formatPercent(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—";
  return `${value.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;
}

/** Evolução MENSAL: horas de manutenção (barras) + disponibilidade estimada (linha). */
export function PcFactoryTrendChart({ points, selectedMachine = null, className = "" }: PcFactoryTrendChartProps) {
  const data = points;
  const machine = selectedMachine && selectedMachine.trim() ? selectedMachine.trim() : null;

  const subtitle = machine
    ? `Evolução mensal da máquina selecionada: ${machine}.`
    : "Horas de manutenção e disponibilidade estimada por mês.";

  // Muitos meses -> inclina os rótulos e preserva extremos para não poluir o eixo.
  const manyMonths = data.length > 12;

  return (
    <article className={`panel rounded-lg p-4 ${className}`}>
      <h3 className="text-[11px] font-extrabold uppercase tracking-wide text-[#5a3d12]">Evolução de manutenção e disponibilidade</h3>
      <p className="mb-3 text-[11px] text-zinc-500">{subtitle}</p>

      {data.length === 0 ? (
        <EmptyState title="Sem série mensal" description="Nenhum dado mensal encontrado para os filtros selecionados." />
      ) : (
        <div className="h-[300px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={data} margin={{ left: 0, right: 8, top: 12, bottom: manyMonths ? 8 : 4 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" vertical={false} />
              <XAxis
                dataKey="label"
                tick={{ fontSize: 11 }}
                interval={manyMonths ? "preserveStartEnd" : 0}
                angle={manyMonths ? -35 : 0}
                textAnchor={manyMonths ? "end" : "middle"}
                height={manyMonths ? 52 : 24}
                minTickGap={manyMonths ? 4 : 0}
              />
              <YAxis yAxisId="hours" tick={{ fontSize: 11 }} tickFormatter={(v: number) => `${v}h`} />
              <YAxis yAxisId="pct" orientation="right" domain={[0, 100]} tick={{ fontSize: 11 }} tickFormatter={(v: number) => `${v}%`} />
              <Tooltip content={<TrendTooltip selectedMachine={machine} />} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Bar yAxisId="hours" dataKey="maintenanceHours" name="Horas de manutenção" fill={PC_FACTORY_COLORS.MANUTENCAO} radius={[4, 4, 0, 0]} maxBarSize={44} />
              <Line
                yAxisId="pct"
                type="monotone"
                dataKey="availabilityPercent"
                name="Disponibilidade"
                stroke={PC_FACTORY_COLORS.PRODUCAO}
                strokeWidth={2.5}
                dot={{ r: 3 }}
                connectNulls
              />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      )}
    </article>
  );
}

/** Tooltip premium (tema claro, alinhado aos painéis) com mês, horas e disponibilidade. */
function TrendTooltip({ active, payload, selectedMachine }: TooltipProps<number, string> & { selectedMachine: string | null }) {
  if (!active || !payload || payload.length === 0) return null;
  const point = payload[0]?.payload as PcFactoryTrendPoint | undefined;
  if (!point) return null;

  return (
    <div className="rounded-md border border-zinc-200 bg-white px-3 py-2 text-[11px] leading-relaxed shadow-md">
      {selectedMachine ? (
        <p className="font-semibold text-[#5a3d12]">
          <span className="text-zinc-500">Máquina:</span> {selectedMachine}
        </p>
      ) : null}
      <p>
        <span className="text-zinc-500">Mês:</span> {monthTooltipLabel(point.period)}
      </p>
      <p>
        <span className="text-zinc-500">Horas de manutenção:</span> {formatHours(point.maintenanceHours)}
      </p>
      <p>
        <span className="text-zinc-500">Disponibilidade estimada:</span> {formatPercent(point.availabilityPercent)}
      </p>
    </div>
  );
}
