"use client";

import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { EmptyState } from "@/components/EmptyState";
import { PC_FACTORY_COLORS } from "@/constants/pc-factory-colors";
import type { PcFactoryProductionLineRow } from "@/types/pc-factory";
import { CHART_CHROME } from "@/constants/theme";

type PcFactoryCompositionChartProps = {
  rows: PcFactoryProductionLineRow[];
  className?: string;
};

/** Barras empilhadas por linha — Produção × Manutenção × Perdas (dentro do tempo planejado). */
export function PcFactoryCompositionChart({ rows, className = "" }: PcFactoryCompositionChartProps) {
  const data = rows
    .filter((row) => row.plannedHours > 0)
    .sort((a, b) => b.plannedHours - a.plannedHours)
    .slice(0, 12)
    .map((row) => ({
      line: row.productionLine,
      Produção: round(row.productionHours),
      Manutenção: round(row.maintenanceHours),
      Perdas: round(row.lossHours)
    }));

  return (
    <article className={`panel rounded-lg p-4 ${className}`}>
      <h3 className="text-[11px] font-extrabold uppercase tracking-wide text-gold-deep">Tempo planejado: produção × manutenção × perdas</h3>
      <p className="mb-3 text-[11px] text-zinc-500">Composição do tempo planejado por linha de produção (horas).</p>

      {data.length === 0 ? (
        <EmptyState title="Sem dados no período" description="Nenhuma linha com tempo planejado para os filtros atuais." />
      ) : (
        <div className="h-[300px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} margin={{ left: 0, right: 12, top: 12, bottom: 4 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={CHART_CHROME.onLight.grid} vertical={false} />
              <XAxis dataKey="line" tick={{ fontSize: 11 }} tickFormatter={truncate} interval={0} angle={-12} textAnchor="end" height={50} />
              <YAxis tick={{ fontSize: 11 }} tickFormatter={(v: number) => `${v}h`} />
              <Tooltip formatter={(value: number, name) => [`${value.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} h`, name]} />
              <Legend wrapperStyle={{ fontSize: 11 }} iconType="circle" />
              <Bar dataKey="Produção" stackId="t" fill={PC_FACTORY_COLORS.PRODUCAO} />
              <Bar dataKey="Manutenção" stackId="t" fill={PC_FACTORY_COLORS.MANUTENCAO} />
              <Bar dataKey="Perdas" stackId="t" fill={PC_FACTORY_COLORS.PARADA_PERDA} radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </article>
  );
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}

function truncate(value: string): string {
  return value.length > 14 ? `${value.slice(0, 13)}…` : value;
}
