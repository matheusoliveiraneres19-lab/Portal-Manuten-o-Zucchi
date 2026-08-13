"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  Legend,
  Line,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from "recharts";
import type { TooltipProps } from "recharts";
import { CHART_CHROME, CHART_SERIES, GOLD } from "@/constants/theme";
import type {
  PreventiveAreaBreakdown,
  PreventiveMachineRow,
  PreventiveMonthlyPoint,
  PreventiveStatusSlice,
  PreventiveTypeBreakdown
} from "@/types/preventive-orders";

const nf = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 1 });

const AXIS_TICK = { fontSize: 11, fill: CHART_CHROME.onDark.axis };
const GRID_STROKE = "rgba(196,154,69,0.12)";

const COLORS = {
  total: GOLD.DEFAULT,
  realizadas: CHART_SERIES.producao,
  naoRealizadas: CHART_SERIES.corretiva,
  horas: CHART_SERIES.preventiva,
  area: GOLD.DEFAULT
};

function DarkEmpty({ message }: { message: string }) {
  return (
    <div className="grid h-full place-items-center px-4 text-center">
      <p className="text-xs font-medium text-zinc-400">{message}</p>
    </div>
  );
}

function DarkTooltip({ active, payload, label }: TooltipProps<number, string>) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-md border border-gold/30 bg-ink/95 px-3 py-2 text-xs text-zinc-100 shadow-lg">
      {label ? <p className="mb-1 font-semibold text-champagne">{label}</p> : null}
      {payload.map((entry) => (
        <p key={String(entry.dataKey)} className="flex items-center gap-1.5">
          <span className="inline-block h-2 w-2 rounded-full" style={{ backgroundColor: entry.color }} aria-hidden />
          {entry.name}: <strong className="text-white">{nf.format(Number(entry.value ?? 0))}</strong>
        </p>
      ))}
    </div>
  );
}

const legendStyle = { fontSize: 11, color: CHART_CHROME.onDark.axis };

// 1 — PL × PV (quantidades + horas)
export function PlPvChart({ data }: { data: PreventiveTypeBreakdown[] }) {
  const chartData = data.map((d) => ({
    name: d.type,
    label: d.label,
    Realizadas: d.realizadas,
    "Não realizadas": d.naoRealizadas,
    Horas: d.horas
  }));
  if (!chartData.some((d) => d.Realizadas + d["Não realizadas"] > 0)) {
    return <DarkEmpty message="Nenhuma ordem PL/PV encontrada no período selecionado." />;
  }

  return (
    <ResponsiveContainer width="100%" height="100%">
      <ComposedChart data={chartData} margin={{ top: 8, right: 8, left: -8, bottom: 0 }}>
        <CartesianGrid stroke={GRID_STROKE} strokeDasharray="3 3" vertical={false} />
        <XAxis dataKey="name" tick={AXIS_TICK} axisLine={{ stroke: GRID_STROKE }} tickLine={false} />
        <YAxis yAxisId="left" tick={AXIS_TICK} axisLine={false} tickLine={false} />
        <YAxis yAxisId="right" orientation="right" tick={AXIS_TICK} axisLine={false} tickLine={false} />
        <Tooltip cursor={{ fill: "rgba(255,255,255,0.04)" }} content={<DarkTooltip />} />
        <Legend wrapperStyle={legendStyle} iconType="circle" />
        <Bar yAxisId="left" dataKey="Realizadas" fill={COLORS.realizadas} radius={[3, 3, 0, 0]} barSize={26} />
        <Bar yAxisId="left" dataKey="Não realizadas" fill={COLORS.naoRealizadas} radius={[3, 3, 0, 0]} barSize={26} />
        <Line yAxisId="right" dataKey="Horas" stroke={COLORS.horas} strokeWidth={2.5} dot={{ r: 4 }} />
      </ComposedChart>
    </ResponsiveContainer>
  );
}

// 2 — Aderência por Área (%)
export function AreaAdherenceChart({ data }: { data: PreventiveAreaBreakdown[] }) {
  const chartData = data
    .filter((d) => d.total > 0)
    .map((d) => ({ name: d.area, Aderência: d.aderencia ?? 0 }));
  if (!chartData.length) {
    return <DarkEmpty message="Nenhuma ordem PL/PV encontrada no período selecionado." />;
  }

  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={chartData} margin={{ top: 8, right: 8, left: -8, bottom: 0 }}>
        <CartesianGrid stroke={GRID_STROKE} strokeDasharray="3 3" vertical={false} />
        <XAxis dataKey="name" tick={AXIS_TICK} axisLine={{ stroke: GRID_STROKE }} tickLine={false} />
        <YAxis tick={AXIS_TICK} axisLine={false} tickLine={false} domain={[0, 100]} unit="%" />
        <Tooltip cursor={{ fill: "rgba(255,255,255,0.04)" }} content={<DarkTooltip />} />
        <Bar dataKey="Aderência" radius={[4, 4, 0, 0]} barSize={56}>
          {chartData.map((entry) => (
            <Cell key={entry.name} fill={entry.Aderência >= 80 ? COLORS.realizadas : COLORS.area} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

// 3 — OS por Status Gerencial (rosca)
export function StatusChart({ data }: { data: PreventiveStatusSlice[] }) {
  const total = data.reduce((sum, s) => sum + s.count, 0);
  if (total === 0) {
    return <DarkEmpty message="Nenhuma ordem PL/PV encontrada no período selecionado." />;
  }

  const pieData = data.map((s) => ({ name: s.status, value: s.count, color: s.color }));
  return (
    <ResponsiveContainer width="100%" height="100%">
      <PieChart>
        <Pie data={pieData} dataKey="value" nameKey="name" cx="42%" cy="50%" innerRadius={50} outerRadius={82} paddingAngle={1.5} stroke="none">
          {pieData.map((entry) => (
            <Cell key={entry.name} fill={entry.color} />
          ))}
        </Pie>
        <Tooltip content={<DarkTooltip />} />
        <Legend layout="vertical" align="right" verticalAlign="middle" iconType="circle" wrapperStyle={legendStyle} />
      </PieChart>
    </ResponsiveContainer>
  );
}

// 5 — Evolução Mensal da Aderência (modo geral/PL/PV)
export function MonthlyAdherenceChart({
  data,
  mode
}: {
  data: PreventiveMonthlyPoint[];
  mode: "geral" | "pl" | "pv";
}) {
  if (!data.length) {
    return <DarkEmpty message="Nenhuma ordem PL/PV encontrada no período selecionado." />;
  }

  const chartData = data.map((point) => {
    const programadas = mode === "pl" ? point.plTotal : mode === "pv" ? point.pvTotal : point.total;
    const realizadas = mode === "pl" ? point.plRealizadas : mode === "pv" ? point.pvRealizadas : point.realizadas;
    const aderencia = mode === "pl" ? point.plAderencia : mode === "pv" ? point.pvAderencia : point.aderencia;
    return {
      name: point.label,
      Programadas: programadas,
      Realizadas: realizadas,
      "Não realizadas": Math.max(0, programadas - realizadas),
      "Aderência %": aderencia ?? 0
    };
  });

  return (
    <ResponsiveContainer width="100%" height="100%">
      <ComposedChart data={chartData} margin={{ top: 8, right: 8, left: -8, bottom: 0 }}>
        <CartesianGrid stroke={GRID_STROKE} strokeDasharray="3 3" vertical={false} />
        <XAxis dataKey="name" tick={AXIS_TICK} axisLine={{ stroke: GRID_STROKE }} tickLine={false} />
        <YAxis yAxisId="left" tick={AXIS_TICK} axisLine={false} tickLine={false} allowDecimals={false} />
        <YAxis yAxisId="right" orientation="right" tick={AXIS_TICK} axisLine={false} tickLine={false} domain={[0, 100]} unit="%" />
        <Tooltip cursor={{ fill: "rgba(255,255,255,0.04)" }} content={<DarkTooltip />} />
        <Legend wrapperStyle={legendStyle} iconType="circle" />
        <Bar yAxisId="left" dataKey="Programadas" fill={COLORS.total} radius={[3, 3, 0, 0]} barSize={18} />
        <Bar yAxisId="left" dataKey="Realizadas" fill={COLORS.realizadas} radius={[3, 3, 0, 0]} barSize={18} />
        <Line yAxisId="right" dataKey="Aderência %" stroke={COLORS.horas} strokeWidth={2.5} dot={{ r: 4 }} />
      </ComposedChart>
    </ResponsiveContainer>
  );
}

// 4 — Top Máquinas com OS Não Realizadas
export function TopMachinesChart({ data }: { data: PreventiveMachineRow[] }) {
  if (!data.length) {
    return <DarkEmpty message="Nenhuma OS não realizada encontrada para os filtros selecionados." />;
  }
  const chartData = data.map((m) => ({ name: m.name, "Não realizadas": m.naoRealizadas }));

  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={chartData} layout="vertical" margin={{ top: 4, right: 28, left: 8, bottom: 0 }}>
        <CartesianGrid stroke={GRID_STROKE} strokeDasharray="3 3" horizontal={false} />
        <XAxis type="number" tick={AXIS_TICK} axisLine={false} tickLine={false} allowDecimals={false} />
        <YAxis
          type="category"
          dataKey="name"
          width={150}
          tick={{ fontSize: 10, fill: CHART_CHROME.onDark.label }}
          axisLine={false}
          tickLine={false}
          tickFormatter={(v: string) => (v.length > 22 ? `${v.slice(0, 21)}…` : v)}
          interval={0}
        />
        <Tooltip cursor={{ fill: "rgba(255,255,255,0.04)" }} content={<DarkTooltip />} />
        <Bar dataKey="Não realizadas" fill={COLORS.naoRealizadas} radius={[0, 3, 3, 0]} barSize={13} />
      </BarChart>
    </ResponsiveContainer>
  );
}
