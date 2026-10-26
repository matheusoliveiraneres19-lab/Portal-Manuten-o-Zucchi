"use client";

import { useEffect, useState } from "react";
import { Bar, CartesianGrid, ComposedChart, LabelList, Legend, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { TooltipProps } from "recharts";
import { EmptyState } from "@/components/EmptyState";
import { PC_FACTORY_COLORS } from "@/constants/pc-factory-colors";
import type { PcFactoryTrendPoint } from "@/types/pc-factory";
import { CHART_CHROME } from "@/constants/theme";

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

  // Rótulos de valor sobre o gráfico: todos no desktop; em tela estreita, fonte menor
  // e um a cada `labelStep` meses (o tooltip continua com todos).
  const compact = useCompactLayout();
  const labelStep = Math.max(1, Math.ceil(data.length / (compact ? 6 : 14)));
  const labelFont = compact ? 9 : 10;
  // Topo de cada barra (px), preenchido pelos rótulos de horas e lido pelos de
  // disponibilidade para desviar quando os dois ficariam sobrepostos. A Bar é
  // declarada antes da Line, então seus rótulos são desenhados primeiro.
  const barTops = new Map<number, number>();
  const showLabel = (index: number) => index % labelStep === 0 || index === data.length - 1;

  return (
    <article className={`panel rounded-lg p-4 ${className}`}>
      <h3 className="text-[11px] font-extrabold uppercase tracking-wide text-gold-deep">Evolução de manutenção e disponibilidade</h3>
      <p className="mb-3 text-[11px] text-zinc-500">{subtitle}</p>

      {data.length === 0 ? (
        <EmptyState title="Sem série mensal" description="Nenhum dado mensal encontrado para os filtros selecionados." />
      ) : (
        <div className="h-[300px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={data} margin={{ left: 0, right: 8, top: 26, bottom: manyMonths ? 8 : 4 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={CHART_CHROME.onLight.grid} vertical={false} />
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
              <Bar yAxisId="hours" dataKey="maintenanceHours" name="Horas de manutenção" fill={PC_FACTORY_COLORS.MANUTENCAO} radius={[4, 4, 0, 0]} maxBarSize={44} isAnimationActive={false}>
                <LabelList
                  dataKey="maintenanceHours"
                  content={<HoursLabel barTops={barTops} show={showLabel} fontSize={labelFont} />}
                />
              </Bar>
              <Line
                yAxisId="pct"
                type="monotone"
                dataKey="availabilityPercent"
                name="Disponibilidade"
                stroke={PC_FACTORY_COLORS.PRODUCAO}
                strokeWidth={2.5}
                dot={{ r: 3 }}
                connectNulls
                isAnimationActive={false}
              >
                <LabelList
                  dataKey="availabilityPercent"
                  content={<AvailabilityLabel barTops={barTops} show={showLabel} fontSize={labelFont} />}
                />
              </Line>
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      )}
    </article>
  );
}

type ValueLabelProps = {
  barTops: Map<number, number>;
  show: (index: number) => boolean;
  fontSize: number;
  x?: number | string;
  y?: number | string;
  width?: number | string;
  value?: number | string | null;
  index?: number;
};

/** Valor numérico real do rótulo; null/indefinido/NaN = sem dado → nada é desenhado. */
function labelValue(value: ValueLabelProps["value"]): number | null {
  if (value === null || value === undefined || value === "") return null;
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

/** "620,0 h" centralizado acima da barra de horas de manutenção. */
function HoursLabel({ barTops, show, fontSize, x, y, width, value, index }: ValueLabelProps) {
  const hours = labelValue(value);
  const left = Number(x);
  const top = Number(y);
  const barWidth = Number(width);
  if (hours === null || index === undefined || ![left, top, barWidth].every(Number.isFinite)) return null;
  barTops.set(index, top);
  if (!show(index)) return null;
  return (
    <text x={left + barWidth / 2} y={top - 5} textAnchor="middle" fontSize={fontSize} fontWeight={700} fill="#8E1728">
      {formatHours(hours)}
    </text>
  );
}

/** Distância mínima (px) entre o rótulo de % e o de horas antes de desviar. */
const LABEL_COLLISION_PX = 16;

/**
 * "13,9%" acima do ponto verde. Quando ficaria em cima do rótulo de horas daquele mês
 * (ponto perto do topo da barra), desce para logo abaixo do ponto.
 */
function AvailabilityLabel({ barTops, show, fontSize, x, y, value, index }: ValueLabelProps) {
  const percent = labelValue(value);
  const cx = Number(x);
  const cy = Number(y);
  if (percent === null || index === undefined || !show(index) || ![cx, cy].every(Number.isFinite)) return null;

  let labelY = cy - 9;
  const barTop = barTops.get(index);
  // O rótulo de horas ocupa a faixa [barTop − 5 − fonte, barTop − 5].
  if (barTop !== undefined && Math.abs(labelY - (barTop - 5)) < LABEL_COLLISION_PX) labelY = cy + fontSize + 7;

  return (
    <text
      x={cx}
      y={labelY}
      textAnchor="middle"
      fontSize={fontSize}
      fontWeight={700}
      fill="#1F6B41"
      stroke="#ffffff"
      strokeWidth={3}
      paintOrder="stroke"
    >
      {formatPercent(percent)}
    </text>
  );
}

/** Tela estreita (≤ 640 px): rótulos menores e espaçados. */
function useCompactLayout(): boolean {
  const [compact, setCompact] = useState(false);
  useEffect(() => {
    const query = window.matchMedia("(max-width: 640px)");
    const update = () => setCompact(query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);
  return compact;
}

/** Tooltip premium (tema claro, alinhado aos painéis) com mês, horas e disponibilidade. */
function TrendTooltip({ active, payload, selectedMachine }: TooltipProps<number, string> & { selectedMachine: string | null }) {
  if (!active || !payload || payload.length === 0) return null;
  const point = payload[0]?.payload as PcFactoryTrendPoint | undefined;
  if (!point) return null;

  return (
    // Tooltip sobre fundo BRANCO: os rótulos usavam zinc-500 (~4,0:1 em texto de
    // 11px) e o valor herdava a cor do container. Rótulo em grafite quente forte e
    // valor em preto — o número é o que se lê primeiro.
    <div className="rounded-md border border-zinc-300 bg-white px-3 py-2 text-[11px] font-medium leading-relaxed text-ink shadow-lg">
      {selectedMachine ? (
        <p className="font-bold text-gold-deep">
          <span className="font-semibold text-neutralized-strong">Máquina:</span> {selectedMachine}
        </p>
      ) : null}
      <p>
        <span className="text-neutralized-strong">Mês:</span> <strong className="font-bold">{monthTooltipLabel(point.period)}</strong>
      </p>
      <p>
        <span className="text-neutralized-strong">Horas de manutenção:</span>{" "}
        <strong className="font-bold text-danger-strong">{formatHours(point.maintenanceHours)}</strong>
      </p>
      <p>
        <span className="text-neutralized-strong">Disponibilidade estimada:</span>{" "}
        <strong
          className={`font-bold ${
            point.availabilityPercent === null
              ? "text-neutralized-strong"
              : point.availabilityPercent >= 90
                ? "text-success-strong"
                : point.availabilityPercent >= 70
                  ? "text-warning-strong"
                  : "text-danger-strong"
          }`}
        >
          {formatPercent(point.availabilityPercent)}
        </strong>
      </p>
    </div>
  );
}
