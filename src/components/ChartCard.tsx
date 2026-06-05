"use client";

import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from "recharts";
import { LineChart as LineChartIcon } from "lucide-react";
import { EmptyState } from "@/components/EmptyState";

type ChartCardProps = {
  title: string;
  kind: "line" | "donut" | "bar-horizontal" | "bar" | "area";
  data: Array<Record<string, string | number>>;
  className?: string;
  emptyTitle?: string;
  emptyDescription?: string;
};

export function ChartCard({
  title,
  kind,
  data,
  className = "",
  emptyTitle = "Sem dados no período",
  emptyDescription = "Importe ordens ou ajuste o filtro para visualizar este indicador."
}: ChartCardProps) {
  const donutTotal = data.reduce((total, item) => total + Number(item.value ?? 0), 0);
  const isEmpty = kind === "donut" ? donutTotal === 0 : data.length === 0;
  // Séries temporais com 1 ponto não permitem leitura de tendência.
  const isInsufficient = !isEmpty && kind !== "donut" && data.length < 2;

  if (isEmpty) {
    return (
      <article className={`panel rounded-lg p-4 ${className}`}>
        <h3 className="mb-3 text-[11px] font-extrabold uppercase tracking-wide text-[#5a3d12]">{title}</h3>
        <div className="h-[185px] w-full">
          <EmptyState icon={LineChartIcon} title={emptyTitle} description={emptyDescription} />
        </div>
      </article>
    );
  }

  return (
    <article className={`panel rounded-lg p-4 ${className}`}>
      <h3 className="mb-3 text-[11px] font-extrabold uppercase tracking-wide text-[#5a3d12]">{title}</h3>
      <div className="h-[185px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          {kind === "line" ? (
            <LineChart data={data}>
              <CartesianGrid stroke="#e8dfd1" strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="name" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip />
              <Legend iconType="rect" wrapperStyle={{ fontSize: 11 }} />
              <Line dataKey="abertas" name="Abertas" stroke="#245f83" strokeWidth={3} dot={{ r: 3 }} />
              <Line dataKey="fechadas" name="Fechadas" stroke="#c49a45" strokeWidth={3} dot={{ r: 3 }} />
            </LineChart>
          ) : kind === "donut" ? (
            <PieChart>
              <Pie data={data} dataKey="value" nameKey="name" innerRadius={48} outerRadius={72} paddingAngle={2}>
                {data.map((entry) => (
                  <Cell key={String(entry.name)} fill={String(entry.color)} />
                ))}
              </Pie>
              <Tooltip />
              <Legend layout="vertical" align="right" verticalAlign="middle" wrapperStyle={{ fontSize: 12 }} />
              <text x="36%" y="48%" textAnchor="middle" dominantBaseline="middle" className="fill-zinc-700 text-xs">
                Total
              </text>
              <text x="36%" y="60%" textAnchor="middle" dominantBaseline="middle" className="fill-zinc-950 text-xl font-bold">
                {donutTotal}
              </text>
            </PieChart>
          ) : kind === "bar-horizontal" ? (
            <BarChart data={data} layout="vertical" margin={{ left: 18, right: 24 }}>
              <CartesianGrid stroke="#eee4d6" strokeDasharray="3 3" horizontal={false} />
              <XAxis type="number" tick={{ fontSize: 11 }} />
              <YAxis dataKey="name" type="category" width={94} tick={{ fontSize: 11 }} />
              <Tooltip />
              <Bar dataKey="value" fill="#2f6384" radius={[0, 3, 3, 0]} />
            </BarChart>
          ) : kind === "bar" ? (
            <BarChart data={data}>
              <CartesianGrid stroke="#eee4d6" strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="name" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip formatter={(value) => `${value}k`} />
              <Bar dataKey="value" fill="#2f6384" radius={[4, 4, 0, 0]} />
            </BarChart>
          ) : (
            <AreaChart data={data}>
              <defs>
                <linearGradient id="lubricant" x1="0" x2="0" y1="0" y2="1">
                  <stop offset="5%" stopColor="#2f6384" stopOpacity={0.35} />
                  <stop offset="95%" stopColor="#2f6384" stopOpacity={0.03} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke="#eee4d6" strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="name" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip />
              <Area dataKey="value" fill="url(#lubricant)" stroke="#245f83" strokeWidth={3} />
            </AreaChart>
          )}
        </ResponsiveContainer>
      </div>
      {isInsufficient ? (
        <p className="mt-2 text-center text-[11px] italic text-zinc-500">
          Dados insuficientes para análise completa.
        </p>
      ) : null}
    </article>
  );
}
