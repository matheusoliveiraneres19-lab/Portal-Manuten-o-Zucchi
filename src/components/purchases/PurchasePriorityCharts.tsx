"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  LabelList,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from "recharts";
import { EmptyState } from "@/components/EmptyState";
import { PURCHASE_PRIORITY_COLORS, PURCHASE_PRIORITY_LABELS } from "@/utils/purchases-normalizer";
import type { PurchasePriorityBreakdown, PurchasePrioritySlice } from "@/types/purchases";
import { CHART_CHROME } from "@/constants/theme";

type CardProps = { title: string; subtitle?: string; className?: string };

function ChartCard({ title, subtitle, className = "", children }: CardProps & { children: React.ReactNode }) {
  return (
    <article className={`panel rounded-lg p-4 ${className}`}>
      <h3 className="text-[11px] font-extrabold uppercase tracking-wide text-gold-deep">{title}</h3>
      {subtitle ? <p className="mb-3 text-[11px] text-zinc-500">{subtitle}</p> : <div className="mb-3" />}
      {children}
    </article>
  );
}

function truncate(value: string): string {
  return value.length > 22 ? `${value.slice(0, 21)}…` : value;
}

/**
 * TAREFA 4 — "Compras Pendentes por Prioridade".
 *
 * Barras verticais na ordem N1 → N4 → Sem prioridade (a ordem é a informação:
 * é uma escala de criticidade, não um ranking por volume, então NÃO se ordena
 * por contagem). Clicar numa barra liga/desliga aquela prioridade no filtro.
 */
export function PurchasePriorityChart({
  slices,
  selected,
  onSelect,
  ...card
}: CardProps & {
  slices: PurchasePrioritySlice[];
  selected: string[];
  onSelect: (priority: string) => void;
}) {
  const hasData = slices.some((slice) => slice.count > 0);
  const data = slices.map((slice) => ({
    name: slice.label,
    priority: slice.priority,
    count: slice.count,
    percentage: slice.percentage,
    color: slice.color
  }));

  return (
    <ChartCard {...card}>
      {!hasData ? (
        <EmptyState
          title="Sem prioridades no recorte"
          description="Nenhuma requisição pendente no filtro atual. Ajuste o período ou os filtros."
        />
      ) : (
        <div className="h-64 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} margin={{ left: 8, right: 12, top: 8, bottom: 4 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={CHART_CHROME.onLight.grid} vertical={false} />
              <XAxis dataKey="name" tick={{ fontSize: 11 }} />
              <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
              <Tooltip
                cursor={{ fill: "rgba(196,154,69,0.08)" }}
                formatter={(value: number, _name, item) => [
                  `${value.toLocaleString("pt-BR")} requisição(ões) — ${formatPercent(
                    (item?.payload as { percentage?: number } | undefined)?.percentage
                  )}`,
                  "Pendentes"
                ]}
              />
              <Bar
                dataKey="count"
                radius={[4, 4, 0, 0]}
                maxBarSize={56}
                onClick={(entry) => onSelect((entry as unknown as { priority: string }).priority)}
                className="cursor-pointer"
              >
                {data.map((entry) => (
                  <Cell
                    key={entry.priority}
                    fill={entry.color}
                    // Prioridade fora do filtro ativo fica translúcida: o recorte
                    // selecionado precisa ser óbvio no próprio gráfico.
                    fillOpacity={selected.length === 0 || selected.includes(entry.priority) ? 1 : 0.28}
                  />
                ))}
                <LabelList dataKey="count" position="top" className="fill-zinc-700" style={{ fontSize: 11 }} />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
      <p className="mt-2 text-[10px] text-zinc-500">Clique numa barra para filtrar a aba por aquela prioridade.</p>
    </ChartCard>
  );
}

/** Séries empilhadas, sempre na mesma ordem de criticidade. */
const STACK_SERIES = [
  { key: "n1", label: PURCHASE_PRIORITY_LABELS.N1, color: PURCHASE_PRIORITY_COLORS.N1 },
  { key: "n2", label: PURCHASE_PRIORITY_LABELS.N2, color: PURCHASE_PRIORITY_COLORS.N2 },
  { key: "n3", label: PURCHASE_PRIORITY_LABELS.N3, color: PURCHASE_PRIORITY_COLORS.N3 },
  { key: "n4", label: PURCHASE_PRIORITY_LABELS.N4, color: PURCHASE_PRIORITY_COLORS.N4 },
  {
    key: "withoutPriority",
    label: PURCHASE_PRIORITY_LABELS.SEM_PRIORIDADE,
    color: PURCHASE_PRIORITY_COLORS.SEM_PRIORIDADE
  }
] as const;

/**
 * TAREFAS 5 e 6 — barras HORIZONTAIS empilhadas por prioridade, agrupadas por
 * requisitante ou por grupo de mercadoria.
 *
 * A ordem das linhas vem do service (mais N1, depois mais N2, depois total):
 * responde "quem concentra o crítico?", que é a pergunta das duas tarefas — e é
 * diferente de "quem tem mais pendências", que os gráficos de volume já mostram.
 */
export function PurchasePriorityStackChart({
  rows,
  emptyDescription = "Nenhuma requisição pendente no recorte.",
  ...card
}: CardProps & { rows: PurchasePriorityBreakdown[]; emptyDescription?: string }) {
  const height = Math.max(220, rows.length * 34 + 48);

  return (
    <ChartCard {...card}>
      {rows.length === 0 ? (
        <EmptyState title="Sem dados no recorte" description={emptyDescription} />
      ) : (
        <div style={{ height }} className="w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={rows} layout="vertical" margin={{ left: 8, right: 40, top: 4, bottom: 4 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={CHART_CHROME.onLight.grid} horizontal={false} />
              <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11 }} />
              <YAxis type="category" dataKey="label" width={150} tick={{ fontSize: 11 }} tickFormatter={truncate} />
              <Tooltip
                cursor={{ fill: "rgba(196,154,69,0.08)" }}
                formatter={(value: number, name) => [`${value.toLocaleString("pt-BR")} item(ns)`, String(name)]}
              />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              {STACK_SERIES.map((series, index) => (
                <Bar
                  key={series.key}
                  dataKey={series.key}
                  name={series.label}
                  stackId="prioridade"
                  fill={series.color}
                  barSize={20}
                  // Só a última série arredonda a ponta da pilha.
                  radius={index === STACK_SERIES.length - 1 ? [0, 4, 4, 0] : undefined}
                >
                  {index === STACK_SERIES.length - 1 ? (
                    <LabelList dataKey="total" position="right" className="fill-zinc-700" style={{ fontSize: 10 }} />
                  ) : null}
                </Bar>
              ))}
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </ChartCard>
  );
}

/** Percentual do tooltip — nunca NaN/Infinity. */
function formatPercent(value: number | undefined): string {
  const safe = typeof value === "number" && Number.isFinite(value) ? value : 0;
  return `${safe.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;
}
