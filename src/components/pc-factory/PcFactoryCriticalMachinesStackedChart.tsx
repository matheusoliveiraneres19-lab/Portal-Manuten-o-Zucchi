"use client";

import { Bar, BarChart, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { EmptyState } from "@/components/EmptyState";
import { PC_FACTORY_COLORS } from "@/constants/pc-factory-colors";
import { formatPercent } from "@/utils/formatters";
import type { PcFactoryResourceRow } from "@/types/pc-factory";

type PcFactoryCriticalMachinesStackedChartProps = {
  rows: PcFactoryResourceRow[];
  className?: string;
  onSelect?: (resourceName: string) => void;
};

type StackedRow = {
  name: string;
  mechanicalHours: number;
  electricalHours: number;
  automationHours: number;
  planejadaHours: number;
  terceirosHours: number;
  waitingHours: number;
  total: number;
  mechanicalPct: number;
  electricalPct: number;
  automationPct: number;
  planejadaPct: number;
  terceirosPct: number;
  waitingPct: number;
};

// Os SEIS tipos de manutenção do grupo "Manutenção" do PC-Factory (Management View).
// O total da barra soma os 6 → bate com a manutenção por máquina da Tabela Gerencial.
const SEGMENTS = [
  { key: "mechanicalHours", pctKey: "mechanicalPct", label: "Mecânica", color: PC_FACTORY_COLORS.MANUTENCAO_MECANICA, dark: false },
  { key: "electricalHours", pctKey: "electricalPct", label: "Elétrica", color: PC_FACTORY_COLORS.MANUTENCAO_ELETRICA, dark: false },
  { key: "automationHours", pctKey: "automationPct", label: "Automação", color: PC_FACTORY_COLORS.MANUTENCAO_AUTOMACAO, dark: true },
  { key: "planejadaHours", pctKey: "planejadaPct", label: "Planejada", color: PC_FACTORY_COLORS.MANUTENCAO_PLANEJADA, dark: false },
  { key: "terceirosHours", pctKey: "terceirosPct", label: "Terceiros", color: PC_FACTORY_COLORS.MANUTENCAO_TERCEIROS, dark: false },
  { key: "waitingHours", pctKey: "waitingPct", label: "Aguardando Manutenção", color: PC_FACTORY_COLORS.AGUARDANDO_MANUTENCAO, dark: true }
] as const;

/** Percentual mínimo para exibir o rótulo dentro do segmento (evita poluição visual). */
const MIN_PCT_FOR_LABEL = 8;
/** Largura mínima do segmento (px) para caber o texto sem estourar a barra. */
const MIN_WIDTH_FOR_LABEL = 24;

/**
 * Ranking de máquinas críticas como barras horizontais EMPILHADAS, decompondo as horas
 * de manutenção por área: Mecânica × Elétrica × Aguardando. Percentual dentro de cada
 * segmento (quando couber), total de horas no fim da barra e tooltip detalhado.
 *
 * Consome `data.criticalResources` (já recalculado pelo service a cada filtro) — sem mock.
 */
export function PcFactoryCriticalMachinesStackedChart({ rows, className = "", onSelect }: PcFactoryCriticalMachinesStackedChartProps) {
  const data: StackedRow[] = rows
    .map((row) => {
      const mechanicalHours = round(Math.max(0, row.mechanicalHours ?? 0));
      const electricalHours = round(Math.max(0, row.electricalHours ?? 0));
      const automationHours = round(Math.max(0, row.automationHours ?? 0));
      const planejadaHours = round(Math.max(0, row.planejadaHours ?? 0));
      const terceirosHours = round(Math.max(0, row.terceirosHours ?? 0));
      const waitingHours = round(Math.max(0, row.waitingHours ?? 0));
      const total = round(mechanicalHours + electricalHours + automationHours + planejadaHours + terceirosHours + waitingHours);
      const pct = (value: number) => (total > 0 ? (value / total) * 100 : 0);
      return {
        name: row.resourceName,
        mechanicalHours,
        electricalHours,
        automationHours,
        planejadaHours,
        terceirosHours,
        waitingHours,
        total,
        mechanicalPct: pct(mechanicalHours),
        electricalPct: pct(electricalHours),
        automationPct: pct(automationHours),
        planejadaPct: pct(planejadaHours),
        terceirosPct: pct(terceirosHours),
        waitingPct: pct(waitingHours)
      };
    })
    .filter((row) => row.total > 0)
    .sort((a, b) => b.total - a.total)
    .slice(0, 10);

  const height = Math.max(240, data.length * 46 + 36);

  return (
    <article className={`panel rounded-lg p-4 ${className}`}>
      <h3 className="text-[11px] font-extrabold uppercase tracking-wide text-[#5a3d12]">Ranking de máquinas críticas</h3>
      <p className="mb-3 text-[11px] text-zinc-500">
        Top 10 por horas de manutenção (grupo Manutenção do PC-Factory): Mecânica, Elétrica, Automação, Planejada, Terceiros e Aguardando.
      </p>

      {data.length === 0 ? (
        <EmptyState title="Sem máquinas críticas" description="Nenhuma máquina crítica encontrada no período selecionado." />
      ) : (
        <>
          {/* Legenda premium */}
          <div className="mb-2 flex flex-wrap items-center gap-x-4 gap-y-1.5">
            {SEGMENTS.map((segment) => (
              <span key={segment.key} className="inline-flex items-center gap-1.5 text-[11px] text-zinc-600">
                <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: segment.color }} />
                {segment.label}
              </span>
            ))}
          </div>

          <div style={{ height }} className="w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data} layout="vertical" margin={{ left: 8, right: 64, top: 4, bottom: 4 }} barCategoryGap="22%">
                <XAxis type="number" hide domain={[0, "dataMax"]} />
                <YAxis type="category" dataKey="name" width={168} tick={{ fontSize: 11 }} tickFormatter={truncate} interval={0} />
                <Tooltip cursor={{ fill: "rgba(196,154,69,0.08)" }} content={<CriticalMachineTooltip />} />

                {SEGMENTS.map((segment, index) => (
                  <Bar
                    key={segment.key}
                    dataKey={segment.key}
                    name={segment.label}
                    stackId="maintenance"
                    fill={segment.color}
                    barSize={24}
                    radius={index === SEGMENTS.length - 1 ? [0, 4, 4, 0] : index === 0 ? [4, 0, 0, 4] : [0, 0, 0, 0]}
                    onClick={(entry: { name?: string }) => entry?.name && onSelect?.(entry.name)}
                    className={onSelect ? "cursor-pointer" : undefined}
                    isAnimationActive={false}
                  >
                    <LabelList dataKey={segment.pctKey} content={<PercentLabel dark={segment.dark} />} />
                    {index === SEGMENTS.length - 1 ? (
                      <LabelList
                        dataKey="total"
                        position="right"
                        offset={8}
                        className="fill-zinc-700"
                        style={{ fontSize: 11, fontWeight: 600 }}
                        formatter={(value: number) => formatHours(value)}
                      />
                    ) : null}
                  </Bar>
                ))}
              </BarChart>
            </ResponsiveContainer>
          </div>
        </>
      )}
    </article>
  );
}

/** Rótulo de percentual centralizado no segmento — só renderiza se couber. */
function PercentLabel(props: { dark?: boolean; x?: number; y?: number; width?: number; height?: number; value?: number }) {
  const { x, y, width, height, value, dark } = props;
  if (x === undefined || y === undefined || width === undefined || height === undefined || value === undefined) return null;
  if (value < MIN_PCT_FOR_LABEL || width < MIN_WIDTH_FOR_LABEL) return null;
  return (
    <text
      x={x + width / 2}
      y={y + height / 2}
      textAnchor="middle"
      dominantBaseline="central"
      fontSize={11}
      fontWeight={700}
      fill={dark ? "#1f2937" : "#ffffff"}
    >
      {formatPercent(value)}
    </text>
  );
}

type TooltipProps = {
  active?: boolean;
  payload?: Array<{ payload: StackedRow }>;
};

/** Tooltip escuro premium: total + horas e % por área (Mecânica, Elétrica, Aguardando). */
function CriticalMachineTooltip({ active, payload }: TooltipProps) {
  if (!active || !payload || payload.length === 0) return null;
  const row = payload[0]?.payload;
  if (!row) return null;

  return (
    <div className="rounded-lg border border-gold/30 bg-[#0a0b0b]/95 px-3 py-2.5 shadow-premium backdrop-blur-sm">
      <p className="mb-1.5 max-w-[220px] truncate text-[12px] font-bold text-champagne">{row.name}</p>
      <p className="mb-2 text-[11px] text-zinc-400">
        Total: <span className="font-semibold text-champagne">{formatHours(row.total)}</span>
      </p>
      <div className="space-y-1">
        {SEGMENTS.map((segment) => {
          const hours = row[segment.key] as number;
          const pct = row[segment.pctKey] as number;
          return (
            <div key={segment.key} className="flex items-center gap-2 text-[11px]">
              <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: segment.color }} />
              <span className="text-zinc-300">{segment.label}:</span>
              <span className="ml-auto pl-3 font-semibold tabular-nums text-champagne">
                {formatHours(hours)} ({formatPercent(pct)})
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function formatHours(value: number): string {
  return `${value.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })} h`;
}

function truncate(value: string): string {
  return value.length > 22 ? `${value.slice(0, 21)}…` : value;
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}
