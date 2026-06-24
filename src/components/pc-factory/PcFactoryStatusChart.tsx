"use client";

import { useMemo } from "react";
import { Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { EmptyState } from "@/components/EmptyState";
import type { PcFactoryStatusSlice } from "@/types/pc-factory";

type PcFactoryStatusChartProps = {
  slices: PcFactoryStatusSlice[];
  className?: string;
  /** Quantos status mostrar individualmente na rosca antes de agrupar o resto em "Outros". */
  topN?: number;
};

const OUTROS_COLOR = "#9CA3AF";

const fmtHours = (h: number) => `${h.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })} h`;
const fmtPercent = (p: number) =>
  `${p.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`;

/** Rótulo de auditoria da origem da cor (TAREFA 11). */
const SOURCE_LABEL: Record<PcFactoryStatusSlice["colorSource"], string> = {
  planilha: "planilha",
  fallback: "padrão",
  neutro: "neutro"
};

const round1 = (n: number) => Math.round(n * 10) / 10;
const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Rosca — distribuição de horas pelos STATUS REAIS da planilha importada. A cor de cada
 * fatia vem da planilha (statusColorHex) quando disponível, com fallback por status.
 * Mostra os top N status; agrupa o restante em "Outros" para não poluir, mas a tabela
 * resumo abaixo lista TODOS os status com horas, % e a origem da cor.
 */
export function PcFactoryStatusChart({ slices, className = "", topN = 12 }: PcFactoryStatusChartProps) {
  const data = useMemo(() => slices.filter((s) => s.hours > 0), [slices]);

  const pieData = useMemo(() => {
    const toSlice = (s: PcFactoryStatusSlice) => ({ name: s.statusRaw, value: s.hours, percent: s.percent, color: s.colorHex });
    if (data.length <= topN) return data.map(toSlice);
    const top = data.slice(0, topN);
    const rest = data.slice(topN);
    return [
      ...top.map(toSlice),
      {
        name: `Outros (${rest.length})`,
        value: round1(rest.reduce((sum, s) => sum + s.hours, 0)),
        percent: round2(rest.reduce((sum, s) => sum + s.percent, 0)),
        color: OUTROS_COLOR
      }
    ];
  }, [data, topN]);

  // Cores da planilha não detectadas → todas vieram do fallback/neutro (TAREFA 14).
  const allFallback = data.length > 0 && data.every((s) => s.colorSource !== "planilha");

  return (
    <article className={`panel rounded-lg p-4 ${className}`}>
      <h3 className="text-[11px] font-extrabold uppercase tracking-wide text-[#5a3d12]">Distribuição de horas por classificação</h3>
      <p className="mb-3 text-[11px] text-zinc-500">Status reais da planilha importada — horas (Tempo Decorrido) e participação.</p>

      {data.length === 0 ? (
        <EmptyState title="Sem dados no período" description="Nenhum status encontrado para o período selecionado." />
      ) : (
        <>
          <div className="h-[240px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={pieData}
                  dataKey="value"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  innerRadius={52}
                  outerRadius={84}
                  paddingAngle={1.5}
                  stroke="none"
                >
                  {pieData.map((d, index) => (
                    <Cell key={`${d.name}-${index}`} fill={d.color} />
                  ))}
                </Pie>
                <Tooltip
                  formatter={(value: number, _name, entry) => [
                    `${fmtHours(value)} (${fmtPercent(entry?.payload?.percent ?? 0)})`,
                    entry?.payload?.name ?? ""
                  ]}
                />
                <Legend
                  formatter={(value) => <span style={{ fontSize: 11, color: "#52525b" }}>{value}</span>}
                  iconType="circle"
                  wrapperStyle={{ fontSize: 11 }}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>

          {/* Tabela resumo — todos os status, com origem da cor (auditoria — TAREFA 11). */}
          <div className="mt-3 max-h-[210px] overflow-y-auto">
            <table className="w-full text-[11px]">
              <thead className="text-left text-zinc-500">
                <tr className="border-b border-black/10">
                  <th className="py-1 pr-2 font-semibold">Status</th>
                  <th className="py-1 px-2 text-right font-semibold">Horas</th>
                  <th className="py-1 px-2 text-right font-semibold">%</th>
                  <th className="py-1 pl-2 font-semibold">Cor</th>
                </tr>
              </thead>
              <tbody>
                {data.map((s) => (
                  <tr key={s.statusKey} className="border-b border-black/5">
                    <td className="py-1 pr-2 text-zinc-700">
                      <span
                        className="mr-1.5 inline-block h-2.5 w-2.5 rounded-full align-middle"
                        style={{ backgroundColor: s.colorHex }}
                        aria-hidden
                      />
                      {s.statusRaw}
                    </td>
                    <td className="py-1 px-2 text-right tabular-nums text-zinc-600">{fmtHours(s.hours)}</td>
                    <td className="py-1 px-2 text-right tabular-nums text-zinc-600">{fmtPercent(s.percent)}</td>
                    <td className="py-1 pl-2 text-zinc-400">{SOURCE_LABEL[s.colorSource]}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {allFallback ? (
            <p className="mt-2 text-[10px] leading-snug text-amber-700/80">
              As cores da planilha não foram detectadas. O portal aplicou cores padrão de fallback.
            </p>
          ) : null}
        </>
      )}
    </article>
  );
}
