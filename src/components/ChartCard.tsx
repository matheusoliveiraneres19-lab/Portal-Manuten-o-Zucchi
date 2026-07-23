"use client";

import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  LabelList,
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
import type { TooltipProps } from "recharts";
import { AlertTriangle, LineChart as LineChartIcon } from "lucide-react";
import { EmptyState } from "@/components/EmptyState";
import { SeeAllLink } from "@/components/SeeAllLink";

/** Trunca nomes longos no eixo, preservando leitura (o nome completo vai no tooltip). */
function truncateLabel(value: string, max = 18): string {
  return value.length > max ? `${value.slice(0, max - 1)}…` : value;
}

const numberPtBr = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 2 });

/**
 * Tooltip do gráfico "Horas apontadas por colaborador": mostra nome completo,
 * horas, quantidade de ordens e média de horas por ordem (quando disponíveis).
 */
function CollaboratorHoursTooltip({ active, payload }: TooltipProps<number, string>) {
  if (!active || !payload || payload.length === 0) {
    return null;
  }

  const row = payload[0].payload as { name?: string; value?: number; orders?: number; avg?: number };
  const hours = Number(row.value ?? 0);
  const orders = Number(row.orders ?? 0);
  const avg = Number(row.avg ?? 0);

  return (
    <div className="rounded-md border border-gold/30 bg-[#0a0b0b]/95 px-3 py-2 text-xs text-zinc-100 shadow-lg">
      <p className="mb-1 max-w-[220px] font-semibold text-champagne">{row.name}</p>
      <p>
        Horas: <strong className="text-white">{numberPtBr.format(hours)}h</strong>
      </p>
      <p>
        Ordens: <strong className="text-white">{numberPtBr.format(orders)}</strong>
      </p>
      {orders > 0 ? (
        <p>
          Média: <strong className="text-white">{numberPtBr.format(avg)}h/ordem</strong>
        </p>
      ) : null}
    </div>
  );
}

/**
 * Tooltip do gráfico "OS abertas x fechadas (por mês)": mês + abertas + fechadas
 * e a fonte oficial dos dados.
 */
function OpenClosedTooltip({ active, payload, label }: TooltipProps<number, string>) {
  if (!active || !payload || payload.length === 0) {
    return null;
  }
  const abertas = Number(payload.find((item) => item.dataKey === "abertas")?.value ?? 0);
  const fechadas = Number(payload.find((item) => item.dataKey === "fechadas")?.value ?? 0);

  return (
    <div className="rounded-md border border-gold/30 bg-[#0a0b0b]/95 px-3 py-2 text-xs text-zinc-100 shadow-lg">
      <p className="mb-1 font-semibold text-champagne">{label}</p>
      <p>
        OS abertas: <strong className="text-white">{numberPtBr.format(abertas)}</strong>
      </p>
      <p>
        OS fechadas: <strong className="text-white">{numberPtBr.format(fechadas)}</strong>
      </p>
      <p className="mt-1 text-[10px] text-zinc-400">Fonte: Ordens de Manutenção</p>
    </div>
  );
}

type ChartCardProps = {
  title: string;
  kind: "line" | "donut" | "bar-horizontal" | "bar" | "area";
  data: Array<Record<string, string | number>>;
  className?: string;
  emptyTitle?: string;
  emptyDescription?: string;
  /** Rota da aba oficial para o botão "Ver todas" (com query params de período). */
  href?: string;
  /** Aviso técnico opcional exibido abaixo do gráfico (ex.: closedAt não importado). */
  note?: string;
};

export function ChartCard({
  title,
  kind,
  data,
  className = "",
  emptyTitle = "Sem dados no período",
  emptyDescription = "Importe ordens ou ajuste o filtro para visualizar este indicador.",
  href,
  note
}: ChartCardProps) {
  const donutTotal = data.reduce((total, item) => total + Number(item.value ?? 0), 0);
  const isEmpty = kind === "donut" ? donutTotal === 0 : data.length === 0;
  // Séries temporais com 1 ponto não permitem leitura de tendência.
  const isInsufficient = !isEmpty && kind !== "donut" && data.length < 2;

  const header = (
    <div className="mb-3 flex items-center justify-between gap-3">
      <h3 className="text-[11px] font-extrabold uppercase tracking-wide text-[#5a3d12]">{title}</h3>
      {href ? <SeeAllLink href={href} /> : null}
    </div>
  );

  if (isEmpty) {
    return (
      <article className={`panel rounded-lg p-4 ${className}`}>
        {header}
        <div className="h-[185px] w-full">
          <EmptyState icon={LineChartIcon} title={emptyTitle} description={emptyDescription} />
        </div>
      </article>
    );
  }

  return (
    <article className={`panel rounded-lg p-4 ${className}`}>
      {header}
      <div className="h-[185px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          {kind === "line" ? (
            <LineChart data={data}>
              <CartesianGrid stroke="#e8dfd1" strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="name" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip content={<OpenClosedTooltip />} />
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
            <BarChart data={data} layout="vertical" margin={{ left: 8, right: 36 }}>
              <CartesianGrid stroke="#eee4d6" strokeDasharray="3 3" horizontal={false} />
              <XAxis type="number" tick={{ fontSize: 11 }} />
              <YAxis
                dataKey="name"
                type="category"
                width={140}
                tick={{ fontSize: 11 }}
                tickFormatter={(value: string) => truncateLabel(value)}
                interval={0}
              />
              <Tooltip cursor={{ fill: "rgba(47,99,132,0.08)" }} content={<CollaboratorHoursTooltip />} />
              <Bar dataKey="value" fill="#2f6384" radius={[0, 3, 3, 0]} barSize={14}>
                <LabelList
                  dataKey="value"
                  position="right"
                  className="fill-[#5a3d12]"
                  fontSize={10}
                  formatter={(value: number) => numberPtBr.format(value)}
                />
              </Bar>
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
      {note ? (
        <p className="mt-2 flex items-start gap-1.5 rounded-md border border-gold/30 bg-gold/[0.08] px-2.5 py-1.5 text-[11px] leading-snug text-[#7a5312]">
          <AlertTriangle className="mt-px h-3.5 w-3.5 shrink-0 text-gold" />
          <span>{note}</span>
        </p>
      ) : null}
    </article>
  );
}
