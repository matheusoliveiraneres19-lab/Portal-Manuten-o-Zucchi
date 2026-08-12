"use client";

import {
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
import type { TooltipProps } from "recharts";
import { AlertTriangle, LineChart as LineChartIcon } from "lucide-react";
import { EmptyState } from "@/components/EmptyState";
import { SeeAllLink } from "@/components/SeeAllLink";
import { CHART_CHROME, CHART_SERIES, TOOLTIP } from "@/constants/theme";

const numberPtBr = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 2 });

/**
 * Moldura do tooltip premium — escura, com filete dourado. Compartilhada pelos
 * dois tipos de gráfico para que a leitura seja idêntica em toda a home.
 */
function TooltipShell({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div
      className="rounded-lg border px-3 py-2 text-xs shadow-xl backdrop-blur-sm"
      style={{ background: TOOLTIP.background, borderColor: TOOLTIP.border, color: TOOLTIP.text }}
    >
      <p className="mb-1.5 font-semibold" style={{ color: TOOLTIP.title }}>
        {title}
      </p>
      {children}
    </div>
  );
}

function TooltipRow({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <p className="flex items-center gap-2 leading-relaxed">
      <span aria-hidden className="h-2 w-2 shrink-0 rounded-sm" style={{ background: color }} />
      <span>{label}:</span>
      <strong className="ml-auto pl-3 font-semibold text-white">{numberPtBr.format(value)}</strong>
    </p>
  );
}

/**
 * Tooltip de "OS abertas x fechadas (por mês)": mês + as duas séries + a fonte
 * oficial dos dados, para o gestor saber de onde o número vem.
 */
function OpenClosedTooltip({ active, payload, label }: TooltipProps<number, string>) {
  if (!active || !payload || payload.length === 0) {
    return null;
  }

  const abertas = Number(payload.find((item) => item.dataKey === "abertas")?.value ?? 0);
  const fechadas = Number(payload.find((item) => item.dataKey === "fechadas")?.value ?? 0);

  return (
    <TooltipShell title={String(label)}>
      <TooltipRow label="OS abertas" value={abertas} color={CHART_SERIES.ordens} />
      <TooltipRow label="OS fechadas" value={fechadas} color={CHART_SERIES.compras} />
      <p className="mt-1.5 border-t pt-1.5 text-[10px] opacity-60" style={{ borderColor: TOOLTIP.border }}>
        Fonte: Ordens de Manutenção
      </p>
    </TooltipShell>
  );
}

/** Tooltip do donut: categoria, valor absoluto e participação no total. */
function ShareTooltip({ active, payload, total }: TooltipProps<number, string> & { total: number }) {
  if (!active || !payload || payload.length === 0) {
    return null;
  }

  const slice = payload[0];
  const value = Number(slice.value ?? 0);
  const share = total > 0 ? (value / total) * 100 : 0;
  const color = String((slice.payload as { color?: string })?.color ?? CHART_SERIES.outros);

  return (
    <TooltipShell title={String(slice.name ?? "")}>
      <TooltipRow label="Ordens" value={value} color={color} />
      <p className="mt-0.5 text-[11px] opacity-75">
        {share.toFixed(1).replace(".", ",")}% do total de {numberPtBr.format(total)}
      </p>
    </TooltipShell>
  );
}

type ChartCardProps = {
  title: string;
  /**
   * Tipos suportados pelo card COMPARTILHADO da home. Os módulos internos
   * (PC-Factory, Lubrificantes, Compras…) têm componentes de gráfico próprios.
   */
  kind: "line" | "donut";
  data: Array<Record<string, string | number>>;
  className?: string;
  emptyTitle?: string;
  emptyDescription?: string;
  /** Rota da aba oficial para o botão "Ver todas" (com query params de período). */
  href?: string;
  /** Aviso técnico opcional exibido abaixo do gráfico (ex.: closedAt não importado). */
  note?: string;
};

/**
 * Altura responsiva. Antes era fixa em 185px, o que esmagava o gráfico em monitor
 * grande — a queixa de "gráficos pouco visíveis". Agora cresce com o viewport.
 */
const CHART_HEIGHT = "h-[200px] sm:h-[224px] xl:h-[248px] 2xl:h-[288px]";

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
  const isInsufficient = !isEmpty && kind === "line" && data.length < 2;

  const header = (
    <div className="mb-3 flex items-center justify-between gap-3">
      <h3 className="text-[11px] font-extrabold uppercase tracking-wide text-gold-deep">{title}</h3>
      {href ? <SeeAllLink href={href} /> : null}
    </div>
  );

  if (isEmpty) {
    return (
      <article className={`panel panel-accent flex h-full flex-col p-4 ${className}`}>
        {header}
        <div className={`w-full ${CHART_HEIGHT}`}>
          <EmptyState icon={LineChartIcon} title={emptyTitle} description={emptyDescription} />
        </div>
      </article>
    );
  }

  return (
    <article className={`panel panel-accent flex h-full flex-col p-4 ${className}`}>
      {header}
      <div className={`w-full ${CHART_HEIGHT}`}>
        <ResponsiveContainer width="100%" height="100%">
          {kind === "line" ? (
            <LineChart data={data} margin={{ top: 4, right: 8, left: -12, bottom: 0 }}>
              <CartesianGrid stroke={CHART_CHROME.onLight.grid} strokeDasharray="3 3" vertical={false} />
              <XAxis
                dataKey="name"
                tick={{ fontSize: 11, fill: CHART_CHROME.onLight.axis }}
                stroke={CHART_CHROME.onLight.grid}
                tickMargin={8}
              />
              <YAxis
                tick={{ fontSize: 11, fill: CHART_CHROME.onLight.axis }}
                stroke={CHART_CHROME.onLight.grid}
                allowDecimals={false}
                width={44}
              />
              <Tooltip content={<OpenClosedTooltip />} cursor={{ stroke: CHART_CHROME.onLight.grid, strokeWidth: 1 }} />
              <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 11, paddingTop: 8 }} />
              <Line
                dataKey="abertas"
                name="Abertas"
                stroke={CHART_SERIES.ordens}
                strokeWidth={2.5}
                dot={{ r: 3, strokeWidth: 0, fill: CHART_SERIES.ordens }}
                activeDot={{ r: 5, strokeWidth: 2, stroke: "#fff" }}
              />
              <Line
                dataKey="fechadas"
                name="Fechadas"
                stroke={CHART_SERIES.compras}
                strokeWidth={2.5}
                dot={{ r: 3, strokeWidth: 0, fill: CHART_SERIES.compras }}
                activeDot={{ r: 5, strokeWidth: 2, stroke: "#fff" }}
              />
            </LineChart>
          ) : (
            <PieChart>
              <Pie
                data={data}
                dataKey="value"
                nameKey="name"
                cx="42%"
                innerRadius="56%"
                outerRadius="82%"
                paddingAngle={2}
                stroke="#fff"
                strokeWidth={2}
              >
                {data.map((entry) => (
                  <Cell key={String(entry.name)} fill={String(entry.color)} />
                ))}
              </Pie>
              <Tooltip content={<ShareTooltip total={donutTotal} />} />
              <Legend
                layout="vertical"
                align="right"
                verticalAlign="middle"
                iconType="circle"
                iconSize={8}
                wrapperStyle={{ fontSize: 12 }}
              />
              <text x="42%" y="46%" textAnchor="middle" dominantBaseline="middle" className="fill-neutralized-strong text-[11px]">
                Total
              </text>
              <text x="42%" y="58%" textAnchor="middle" dominantBaseline="middle" className="fill-ink text-2xl font-semibold">
                {numberPtBr.format(donutTotal)}
              </text>
            </PieChart>
          )}
        </ResponsiveContainer>
      </div>

      {isInsufficient ? (
        <p className="mt-2 text-center text-[11px] italic text-neutralized-strong">
          Dados insuficientes para análise completa.
        </p>
      ) : null}

      {note ? (
        <p className="mt-2 flex items-start gap-1.5 rounded-lg border border-warning/35 bg-warning/[0.09] px-2.5 py-1.5 text-[11px] leading-snug text-warning-strong">
          <AlertTriangle className="mt-px h-3.5 w-3.5 shrink-0 text-warning" />
          <span>{note}</span>
        </p>
      ) : null}
    </article>
  );
}
