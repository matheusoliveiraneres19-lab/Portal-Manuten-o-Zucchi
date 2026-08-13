"use client";

import { Bar, BarChart, CartesianGrid, Cell, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { EmptyState } from "@/components/EmptyState";
import type { PurchaseClassificationSlice, PurchaseGroupCount, PurchaseMonthlyPoint, PurchaseRequesterCount, PurchaseStatusSlice, PurchaseSupplierSlice } from "@/types/purchases";
import { CHART_CHROME, CHART_SERIES, GOLD } from "@/constants/theme";

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
  return value.length > 24 ? `${value.slice(0, 23)}…` : value;
}

/** Contagem por mês (barras verticais). */
export function PurchaseMonthlyCountChart({
  points,
  color = CHART_SERIES.compras,
  ...card
}: CardProps & { points: PurchaseMonthlyPoint[]; color?: string }) {
  return (
    <ChartCard {...card}>
      {points.length === 0 ? (
        <EmptyState title="Sem dados no período" description="Nenhum registro com data no intervalo." />
      ) : (
        <div className="h-64 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={points} margin={{ left: 8, right: 12, top: 8, bottom: 4 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={CHART_CHROME.onLight.grid} vertical={false} />
              <XAxis dataKey="label" tick={{ fontSize: 11 }} />
              <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
              <Tooltip formatter={(value: number) => [`${value.toLocaleString("pt-BR")} item(ns)`, "Qtd"]} cursor={{ fill: "rgba(196,154,69,0.08)" }} />
              <Bar dataKey="count" fill={color} radius={[4, 4, 0, 0]} maxBarSize={44} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </ChartCard>
  );
}

type RankItem = { label: string; count: number; color?: string };

/** Ranking horizontal por contagem (fornecedores, grupos, requisitantes). */
export function PurchaseRankBarChart({
  items,
  color = GOLD.deep,
  emptyDescription = "Nenhum registro no intervalo.",
  ...card
}: CardProps & { items: RankItem[]; color?: string; emptyDescription?: string }) {
  const data = items.map((item) => ({ name: item.label, count: item.count, color: item.color ?? color }));
  const height = Math.max(200, data.length * 36 + 24);

  return (
    <ChartCard {...card}>
      {data.length === 0 ? (
        <EmptyState title="Sem dados no período" description={emptyDescription} />
      ) : (
        <div style={{ height }} className="w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} layout="vertical" margin={{ left: 8, right: 48, top: 4, bottom: 4 }}>
              <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11 }} />
              <YAxis type="category" dataKey="name" width={170} tick={{ fontSize: 11 }} tickFormatter={truncate} />
              <Tooltip cursor={{ fill: "rgba(196,154,69,0.08)" }} formatter={(value: number) => [`${value.toLocaleString("pt-BR")} item(ns)`, "Qtd"]} />
              <Bar dataKey="count" radius={[0, 4, 4, 0]} barSize={20}>
                {data.map((entry) => (
                  <Cell key={entry.name} fill={entry.color} />
                ))}
                <LabelList dataKey="count" position="right" className="fill-zinc-700" style={{ fontSize: 10 }} />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </ChartCard>
  );
}

/** Distribuição por status operacional (barras coloridas). */
export function PurchaseStatusChart({ slices, ...card }: CardProps & { slices: PurchaseStatusSlice[] }) {
  return (
    <PurchaseRankBarChart
      {...card}
      items={slices.map((slice) => ({ label: slice.label, count: slice.count, color: slice.color }))}
      emptyDescription="Nenhuma pendência no intervalo."
    />
  );
}

/* Adaptadores de tipos -> RankItem */
export function suppliersToRank(suppliers: PurchaseSupplierSlice[]): RankItem[] {
  return suppliers.map((supplier) => ({ label: supplier.supplierName, count: supplier.count }));
}

export function goodsGroupsToRank(groups: PurchaseGroupCount[]): RankItem[] {
  return groups.map((group) => ({ label: group.description || group.code, count: group.count }));
}

export function requestersToRank(requesters: PurchaseRequesterCount[]): RankItem[] {
  return requesters.map((item) => ({ label: item.requester, count: item.count }));
}

/** Fatias de um nível de classificação (N1/N2) -> ranking horizontal. */
export function classificationToRank(slices: PurchaseClassificationSlice[], limit = 12): RankItem[] {
  return slices.slice(0, limit).map((slice) => ({ label: slice.label, count: slice.count }));
}
