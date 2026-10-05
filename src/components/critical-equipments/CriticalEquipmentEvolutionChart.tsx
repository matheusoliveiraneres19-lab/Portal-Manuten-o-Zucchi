"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Check, ChevronDown, Search, Table2 } from "lucide-react";
import { EmptyState } from "@/components/EmptyState";
import type { FamilyEvolutionData, FamilyEvolutionMetric } from "@/types/critical-equipments";
import { CHART_CHROME } from "@/constants/theme";
import { formatMonthLong } from "@/services/critical-equipment-evolution.service";

/**
 * GRÁFICO DE EVOLUÇÃO MENSAL de Equipamentos Críticos — UM componente para os dois
 * caminhos analíticos:
 *
 *   mode="family"  → EVOLUÇÃO MENSAL DE ORDENS POR FAMÍLIA (uma linha por família)
 *   mode="machine" → EVOLUÇÃO MENSAL — <MÁQUINA> (uma linha, Jan → Dez do ano)
 *
 * Card, linha, pontos, eixos, tooltip, legenda, controles e tabela são os mesmos; só
 * os dados mudam. Valor `null` = mês SEM DADO (futuro ou anterior à base): vira
 * lacuna na linha e "—" na tabela — nunca um zero operacional.
 */

/**
 * Paleta categórica DESTE gráfico (validada: faixa de luminosidade, croma, separação
 * para daltonismo e visão normal). A cor segue a SÉRIE, não o ranking: cada família
 * ganha um slot ao ser exibida e o mantém enquanto estiver na tela. Acima de 8
 * famílias simultâneas as excedentes viram linhas de contexto cinza — nunca uma
 * 9ª cor gerada.
 */
export const FAMILY_PALETTE = [
  "#0B7FAB",
  "#D6AA3A",
  "#2E8B57",
  "#7C3AED",
  "#B01E35",
  "#0EA5E9",
  "#D97706",
  "#DB2777"
] as const;

export const FAMILY_CONTEXT_COLOR = "#B8AF9F";

const DEFAULT_VISIBLE = 5;

/** Uma linha do gráfico (uma família, ou a máquina analisada). */
export type EvolutionChartSeries = {
  key: string;
  label: string;
  totalOrders: number;
  totalWorkedHours: number;
  /** Por mês; `null` = sem dado (mês futuro/sem período disponível). */
  orders: Array<number | null>;
  hours: Array<number | null>;
  /** Máquinas afetadas por mês (só no modo Família). */
  machines?: number[];
};

export type EvolutionChartMonth = {
  period: string;
  /** Rótulo do eixo X. */
  label: string;
  /** Cabeçalho do tooltip. */
  tooltipLabel: string;
  /** Observação do mês no tooltip (ex.: "Mês em andamento — valores parciais"). */
  note?: string;
};

export type EvolutionChartData = { months: EvolutionChartMonth[]; series: EvolutionChartSeries[] };

/** Série/mês destacados — vêm do estado de quem usa o gráfico. */
type ChartSelection = { series: string | null; month: string | null };

type Props = {
  mode: "family" | "machine";
  title: string;
  subtitle: string;
  data: EvolutionChartData;
  selection: ChartSelection;
  /** Clique num ponto/célula (mês) ou na legenda (período inteiro, `month = null`). */
  onSelect: (seriesKey: string, month: string | null) => void;
  /** Controles extras dentro do card, abaixo do cabeçalho (ex.: máquina e ano). */
  toolbar?: ReactNode;
  /** Substitui o gráfico (carregando, nenhuma máquina, sem dados) — o card continua o mesmo. */
  placeholder?: ReactNode;
  /** Conteúdo depois do gráfico, no mesmo card (ex.: resumo anual, detalhe do mês). */
  children?: ReactNode;
  emptyTitle?: string;
  emptyDescription?: string;
};

export function CriticalEquipmentEvolutionChart({
  mode,
  title,
  subtitle,
  data,
  selection,
  onSelect,
  toolbar,
  placeholder,
  children,
  emptyTitle = "Sem ordens no período",
  emptyDescription = "Ajuste o período ou os filtros para visualizar a evolução por família."
}: Props) {
  const [metric, setMetric] = useState<FamilyEvolutionMetric>("orders");
  const seriesKeys = useMemo(() => data.series.map((series) => series.key), [data.series]);
  // Modo Máquina: sempre a única linha (a máquina). Modo Família: Top 5 + a selecionada.
  const [visible, setVisible] = useState<string[]>(() => initialVisible(mode, seriesKeys, selection.series));
  const [slots, setSlots] = useState<Record<string, number>>(() => assignSlots({}, visible));
  const hoverIndexRef = useRef<number | null>(null);

  // Dados novos (filtros, outra máquina): mantém as séries exibidas que sobreviveram.
  useEffect(() => {
    setVisible((current) => {
      if (mode === "machine") return seriesKeys.slice(0, 1);
      const kept = current.filter((key) => seriesKeys.includes(key));
      return kept.length ? kept : seriesKeys.slice(0, DEFAULT_VISIBLE);
    });
  }, [seriesKeys, mode]);

  // Família selecionada fora das exibidas (ex.: via ranking) entra no gráfico.
  useEffect(() => {
    const key = selection.series;
    if (key && seriesKeys.includes(key)) {
      setVisible((current) => (current.includes(key) ? current : [...current, key]));
    }
  }, [selection.series, seriesKeys]);

  useEffect(() => {
    setSlots((current) => assignSlots(current, visible));
  }, [visible]);

  const seriesByKey = useMemo(() => new Map(data.series.map((series) => [series.key, series])), [data.series]);

  const colorOf = (key: string) => {
    const slot = slots[key];
    return slot === undefined ? FAMILY_CONTEXT_COLOR : FAMILY_PALETTE[slot];
  };

  /** Mês sem dado não abre drill-down: não há o que detalhar. */
  function selectPoint(key: string, monthIndex: number | null) {
    if (monthIndex !== null) {
      const series = seriesByKey.get(key);
      if (series && series.orders[monthIndex] === null) return;
    }
    const month = monthIndex !== null ? data.months[monthIndex]?.period ?? null : null;
    onSelect(key, month);
  }

  const chartRows = useMemo(
    () =>
      data.months.map((month, index) => {
        const row: Record<string, string | number | null> = { label: month.label };
        for (const key of visible) {
          const series = seriesByKey.get(key);
          row[key] = series ? (metric === "orders" ? series.orders[index] : series.hours[index]) : 0;
        }
        return row;
      }),
    [data.months, visible, seriesByKey, metric]
  );

  const selectedMonthLabel = selection.month
    ? data.months.find((month) => month.period === selection.month)?.label
    : undefined;

  const unit = metric === "orders" ? "OS" : "h";
  const hasChart = data.series.length > 0 && data.months.length > 0;

  return (
    <article className="panel rounded-lg p-4 xl:col-span-12">
      <div className="mb-1 flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="text-[11px] font-extrabold uppercase tracking-wide text-gold-deep">{title}</h3>
          <p className="text-[11px] text-zinc-500">{subtitle}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <MetricToggle metric={metric} onChange={setMetric} />
          {mode === "family" ? (
            <FamilyPicker series={data.series} visible={visible} onChange={setVisible} colorOf={colorOf} />
          ) : null}
        </div>
      </div>

      {toolbar}

      {placeholder ? (
        placeholder
      ) : !hasChart ? (
        <EmptyState title={emptyTitle} description={emptyDescription} />
      ) : (
        <>
          <SeriesLegend
            mode={mode}
            metric={metric}
            visible={visible}
            seriesByKey={seriesByKey}
            colorOf={colorOf}
            selectedKey={selection.series}
            onSelect={(key) => onSelect(key, null)}
          />

          <div className="h-[260px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart
                data={chartRows}
                margin={{ left: 4, right: 16, top: 8, bottom: 4 }}
                onMouseMove={(state) => {
                  hoverIndexRef.current =
                    typeof state?.activeTooltipIndex === "number" ? state.activeTooltipIndex : null;
                }}
                onClick={(state) => {
                  // Clique fora de um ponto: só é inequívoco com uma única série na tela.
                  if (visible.length === 1 && typeof state?.activeTooltipIndex === "number") {
                    selectPoint(visible[0], state.activeTooltipIndex);
                  }
                }}
              >
                <CartesianGrid stroke={CHART_CHROME.onLight.grid} strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 11, fill: CHART_CHROME.onLight.axis }} />
                <YAxis
                  tick={{ fontSize: 11, fill: CHART_CHROME.onLight.axis }}
                  allowDecimals={metric === "hours"}
                  width={44}
                />
                {selectedMonthLabel ? (
                  <ReferenceLine x={selectedMonthLabel} stroke={CHART_CHROME.onLight.label} strokeDasharray="4 3" />
                ) : null}
                <Tooltip
                  content={<EvolutionTooltip mode={mode} data={data} visible={visible} metric={metric} colorOf={colorOf} />}
                  cursor={{ stroke: CHART_CHROME.onLight.grid, strokeWidth: 1 }}
                />
                {visible.map((key) => {
                  const color = colorOf(key);
                  const isSelected = selection.series === key;
                  const isContext = color === FAMILY_CONTEXT_COLOR;
                  return (
                    <Line
                      key={key}
                      type="monotone"
                      // Função, não string: nome com "." viraria caminho no lodash.get do Recharts.
                      dataKey={(row: Record<string, number | null>) => row[key]}
                      name={seriesByKey.get(key)?.label ?? key}
                      stroke={color}
                      strokeWidth={isSelected ? 3 : isContext ? 1.25 : 2}
                      strokeOpacity={selection.series && !isSelected ? 0.55 : 1}
                      // Mês sem dado = lacuna, nunca ligado como se fosse zero.
                      connectNulls={false}
                      dot={{ r: 3, strokeWidth: 0, fill: color }}
                      activeDot={{
                        r: 7,
                        stroke: "#fff",
                        strokeWidth: 2,
                        cursor: "pointer",
                        onClick: () => selectPoint(key, hoverIndexRef.current)
                      }}
                      isAnimationActive={false}
                    />
                  );
                })}
              </LineChart>
            </ResponsiveContainer>
          </div>

          <EvolutionTable
            mode={mode}
            data={data}
            visible={visible}
            metric={metric}
            unit={unit}
            colorOf={colorOf}
            selection={selection}
            onSelect={selectPoint}
          />
        </>
      )}

      {children}
    </article>
  );
}

/* ------------------------------------------------------------------ */
/* Modo Família — adaptador (comportamento inalterado)                */
/* ------------------------------------------------------------------ */

/** "EVOLUÇÃO MENSAL DE ORDENS POR FAMÍLIA" — os dados de família no gráfico comum. */
export function CriticalEquipmentFamilyEvolutionChart({
  data,
  selection,
  onSelect
}: {
  data: FamilyEvolutionData;
  /** Família/mês destacados — vêm do estado único da página. */
  selection: { family: string | null; month: string | null };
  /** Clique num ponto/célula (mês) ou na legenda (período inteiro, `month = null`). */
  onSelect: (family: string, month: string | null) => void;
}) {
  const chartData = useMemo<EvolutionChartData>(
    () => ({
      months: data.months.map((month) => ({ ...month, tooltipLabel: formatMonthLong(month.period) })),
      series: data.families.map((family) => ({
        key: family.family,
        label: family.family,
        totalOrders: family.totalOrders,
        totalWorkedHours: family.totalWorkedHours,
        orders: family.orders,
        hours: family.hours,
        machines: family.machines
      }))
    }),
    [data]
  );

  return (
    <CriticalEquipmentEvolutionChart
      mode="family"
      // Gráfico de CONTEXTO: não é recortado pela seleção (senão a linha clicada viraria a
      // única do gráfico). Ele só DEFINE família/mês no estado da página.
      title="Evolução mensal de ordens por família"
      subtitle="Clique em uma família ou num ponto do mês para recortar toda a análise abaixo."
      data={chartData}
      selection={{ series: selection.family, month: selection.month }}
      onSelect={onSelect}
    />
  );
}

/* ------------------------------------------------------------------ */
/* Controles                                                          */
/* ------------------------------------------------------------------ */

function MetricToggle({
  metric,
  onChange
}: {
  metric: FamilyEvolutionMetric;
  onChange: (metric: FamilyEvolutionMetric) => void;
}) {
  const options: Array<{ value: FamilyEvolutionMetric; label: string }> = [
    { value: "orders", label: "Quantidade de OS" },
    { value: "hours", label: "Horas apontadas" }
  ];
  return (
    <div role="radiogroup" aria-label="Métrica" className="flex rounded-md border border-zinc-200 bg-white p-0.5">
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          role="radio"
          aria-checked={metric === option.value}
          onClick={() => onChange(option.value)}
          className={`rounded px-2 py-1 text-[10px] font-bold uppercase tracking-wide transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-gold ${
            metric === option.value ? "bg-ink text-white" : "text-zinc-500 hover:text-zinc-800"
          }`}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

function FamilyPicker({
  series,
  visible,
  onChange,
  colorOf
}: {
  series: EvolutionChartSeries[];
  visible: string[];
  onChange: (next: string[]) => void;
  colorOf: (key: string) => string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handleClick(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    function handleKey(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("mousedown", handleClick);
      document.removeEventListener("keydown", handleKey);
    };
  }, [open]);

  const normalized = query.trim().toLowerCase();
  const filtered = normalized ? series.filter((item) => item.label.toLowerCase().includes(normalized)) : series;

  function toggle(key: string) {
    if (visible.includes(key)) {
      // Nunca deixa o gráfico vazio.
      if (visible.length > 1) onChange(visible.filter((value) => value !== key));
    } else {
      onChange([...visible, key]);
    }
  }

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        aria-expanded={open}
        aria-haspopup="listbox"
        className="flex items-center gap-1.5 rounded-md border border-zinc-200 bg-white px-2.5 py-1.5 text-[11px] font-semibold text-zinc-700 transition hover:border-gold/60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-gold"
      >
        Famílias exibidas
        <span className="rounded bg-zinc-100 px-1.5 text-[10px] font-bold text-zinc-600">
          {visible.length}/{series.length}
        </span>
        <ChevronDown className="h-3.5 w-3.5" />
      </button>

      {open ? (
        <div className="absolute right-0 z-30 mt-1 w-[min(20rem,calc(100vw-2rem))] rounded-lg border border-zinc-200 bg-white p-2 shadow-lg">
          <div className="mb-2 flex flex-wrap gap-1.5">
            <button
              type="button"
              onClick={() => onChange(series.slice(0, DEFAULT_VISIBLE).map((item) => item.key))}
              className="rounded border border-zinc-200 px-2 py-1 text-[10px] font-bold uppercase text-zinc-600 hover:border-gold/60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-gold"
            >
              Top {DEFAULT_VISIBLE}
            </button>
            <button
              type="button"
              onClick={() => onChange(series.map((item) => item.key))}
              className="rounded border border-zinc-200 px-2 py-1 text-[10px] font-bold uppercase text-zinc-600 hover:border-gold/60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-gold"
            >
              Ver todas
            </button>
          </div>
          {series.length > 6 ? (
            <label className="mb-2 flex items-center gap-1.5 rounded border border-zinc-200 px-2 py-1">
              <Search className="h-3.5 w-3.5 text-zinc-400" />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Buscar família..."
                aria-label="Buscar família"
                className="w-full bg-transparent text-[12px] text-zinc-800 outline-none placeholder:text-zinc-400"
              />
            </label>
          ) : null}
          <ul role="listbox" aria-multiselectable="true" className="max-h-64 overflow-y-auto">
            {filtered.map((item) => {
              const checked = visible.includes(item.key);
              return (
                <li key={item.key}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={checked}
                    onClick={() => toggle(item.key)}
                    className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-[12px] text-zinc-700 hover:bg-gold/[0.06] focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-gold"
                  >
                    <span
                      className={`flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-sm border ${
                        checked ? "border-ink bg-ink text-white" : "border-zinc-300"
                      }`}
                    >
                      {checked ? <Check className="h-2.5 w-2.5" /> : null}
                    </span>
                    {checked ? (
                      <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: colorOf(item.key) }} />
                    ) : null}
                    <span className="min-w-0 flex-1 truncate">{item.label}</span>
                    <span className="text-[11px] tabular-nums text-zinc-500">{fmtInt(item.totalOrders)} OS</span>
                  </button>
                </li>
              );
            })}
          </ul>
          {visible.length > FAMILY_PALETTE.length ? (
            <p className="mt-2 text-[10px] leading-snug text-zinc-500">
              Acima de {FAMILY_PALETTE.length} famílias, as excedentes aparecem em cinza (contexto). Os valores
              completos estão no tooltip e na tabela.
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

/**
 * Tags das séries exibidas. Família: total de OS (como sempre foi). Máquina: o total
 * da métrica escolhida — "184 OS" ou "1.245,4 h".
 */
function SeriesLegend({
  mode,
  metric,
  visible,
  seriesByKey,
  colorOf,
  selectedKey,
  onSelect
}: {
  mode: "family" | "machine";
  metric: FamilyEvolutionMetric;
  visible: string[];
  seriesByKey: Map<string, EvolutionChartSeries>;
  colorOf: (key: string) => string;
  selectedKey: string | null;
  onSelect: (key: string) => void;
}) {
  return (
    <ul
      className="mb-2 mt-2 flex flex-wrap gap-1.5"
      aria-label={mode === "family" ? "Famílias exibidas no gráfico" : "Máquina exibida no gráfico"}
    >
      {visible.map((key) => {
        const series = seriesByKey.get(key);
        const label = series?.label ?? key;
        const active = selectedKey === key;
        const value =
          mode === "machine" && metric === "hours"
            ? `${fmtHours(series?.totalWorkedHours ?? 0)} h`
            : mode === "machine"
              ? `${fmtInt(series?.totalOrders ?? 0)} OS`
              : fmtInt(series?.totalOrders ?? 0);
        return (
          <li key={key}>
            <button
              type="button"
              onClick={() => onSelect(key)}
              aria-pressed={active}
              aria-label={
                mode === "family"
                  ? `Detalhar ${label} no período inteiro: ${fmtInt(series?.totalOrders ?? 0)} OS`
                  : `${label}: ${value} no ano`
              }
              className={`flex items-center gap-1.5 rounded-md border px-2 py-1 text-[11px] transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-gold ${
                active ? "border-ink bg-ink/[0.04] font-semibold text-zinc-900" : "border-zinc-200 text-zinc-700 hover:border-gold/60"
              }`}
            >
              <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: colorOf(key) }} />
              {label}
              <span className="tabular-nums text-zinc-500">{value}</span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

/* ------------------------------------------------------------------ */
/* Tooltip e tabela                                                   */
/* ------------------------------------------------------------------ */

type TooltipProps = {
  active?: boolean;
  label?: string;
  mode: "family" | "machine";
  data: EvolutionChartData;
  visible: string[];
  metric: FamilyEvolutionMetric;
  colorOf: (key: string) => string;
};

function EvolutionTooltip({ active, label, mode, data, visible, metric, colorOf }: TooltipProps) {
  if (!active || !label) return null;
  const index = data.months.findIndex((month) => month.label === label);
  if (index < 0) return null;
  const month = data.months[index];

  const rows = visible
    .map((key) => data.series.find((series) => series.key === key))
    .filter((series): series is EvolutionChartSeries => Boolean(series))
    .map((series) => {
      const value = metric === "orders" ? series.orders[index] : series.hours[index];
      const previous = index > 0 ? (metric === "orders" ? series.orders[index - 1] : series.hours[index - 1]) : null;
      return {
        key: series.key,
        label: series.label,
        value,
        machines: series.machines?.[index] ?? null,
        // Sem mês anterior no período, ou anterior zerado/sem dado: não há base para percentual.
        variation: value !== null && previous !== null && previous > 0 ? ((value - previous) / previous) * 100 : null
      };
    })
    .sort((a, b) => (b.value ?? -1) - (a.value ?? -1));

  if (mode === "machine") {
    const row = rows[0];
    if (!row) return null;
    return (
      <div className="max-w-xs rounded-md border border-zinc-200 bg-white px-3 py-2 text-[11px] shadow-lg">
        <p className="mb-1 font-bold text-zinc-900">{month.tooltipLabel}</p>
        <p className="flex items-center gap-1.5 font-semibold text-zinc-800">
          <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: colorOf(row.key) }} />
          {row.label}
        </p>
        <p className="mt-0.5 tabular-nums text-zinc-900">
          {row.value === null
            ? "Sem dado neste mês"
            : metric === "orders"
              ? `OS: ${fmtInt(row.value)}`
              : `Horas apontadas: ${fmtHours(row.value)} h`}
        </p>
        {month.note ? <p className="mt-0.5 text-amber-700">{month.note}</p> : null}
        {row.value !== null ? (
          <p className="mt-1.5 border-t border-zinc-100 pt-1 text-[10px] text-zinc-400">Clique no ponto para detalhar o mês</p>
        ) : null}
      </div>
    );
  }

  const previousLabel = index > 0 ? formatMonthLong(data.months[index - 1].period).split("/")[0].toLowerCase() : null;

  return (
    <div className="max-w-xs rounded-md border border-zinc-200 bg-white px-3 py-2 text-[11px] shadow-lg">
      <p className="mb-1.5 font-bold text-zinc-900">{month.tooltipLabel}</p>
      <ul className="space-y-1.5">
        {rows.map((row) => (
          <li key={row.key} className="flex gap-2">
            <span className="mt-1 h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: colorOf(row.key) }} />
            <div className="min-w-0">
              <p className="font-semibold text-zinc-800">
                {row.label}{" "}
                <span className="tabular-nums text-zinc-900">
                  {metric === "orders" ? `${fmtInt(row.value ?? 0)} OS` : `${fmtHours(row.value ?? 0)} h`}
                </span>
              </p>
              <p className="text-zinc-500">
                Máquinas afetadas: {fmtInt(row.machines ?? 0)}
                {previousLabel
                  ? row.variation !== null
                    ? ` · vs ${previousLabel}: ${row.variation > 0 ? "+" : ""}${fmtPercent(row.variation)}`
                    : ` · vs ${previousLabel}: sem base`
                  : ""}
              </p>
            </div>
          </li>
        ))}
      </ul>
      <p className="mt-1.5 border-t border-zinc-100 pt-1 text-[10px] text-zinc-400">Clique no ponto para detalhar</p>
    </div>
  );
}

/**
 * Tabela mês a mês — o caminho por TECLADO até o drill-down (os pontos do SVG não
 * recebem foco) e a leitura exata dos números. Cada célula é um botão; mês sem dado
 * mostra "—" e não é clicável.
 */
function EvolutionTable({
  mode,
  data,
  visible,
  metric,
  unit,
  colorOf,
  selection,
  onSelect
}: {
  mode: "family" | "machine";
  data: EvolutionChartData;
  visible: string[];
  metric: FamilyEvolutionMetric;
  unit: string;
  colorOf: (key: string) => string;
  selection: ChartSelection;
  onSelect: (key: string, monthIndex: number | null) => void;
}) {
  const rows = visible
    .map((key) => data.series.find((series) => series.key === key))
    .filter((series): series is EvolutionChartSeries => Boolean(series));
  const subject = mode === "family" ? "Família" : "Máquina";

  return (
    <details className="group mt-2">
      <summary className="flex cursor-pointer list-none items-center gap-1.5 text-[11px] font-semibold text-gold-deep focus-visible:outline focus-visible:outline-2 focus-visible:outline-gold">
        <Table2 className="h-3.5 w-3.5" />
        <span className="group-open:hidden">Ver tabela mês a mês</span>
        <span className="hidden group-open:inline">Ocultar tabela</span>
      </summary>
      <div className="mt-2 overflow-x-auto">
        <table className="w-full min-w-max text-[11px]">
          <caption className="sr-only">
            {metric === "orders" ? "Quantidade de OS" : "Horas apontadas"} por {subject.toLowerCase()} e mês. Selecione uma
            célula para detalhar.
          </caption>
          <thead>
            <tr className="border-b border-zinc-200 text-left text-[10px] uppercase tracking-wide text-zinc-500">
              <th scope="col" className="px-2 py-1.5 font-bold">
                {subject}
              </th>
              {data.months.map((month) => (
                <th key={month.period} scope="col" className="px-2 py-1.5 text-right font-bold">
                  {month.label}
                </th>
              ))}
              <th scope="col" className="px-2 py-1.5 text-right font-bold">
                Total
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((series) => (
              <tr key={series.key} className="border-b border-zinc-100">
                <th scope="row" className="px-2 py-1 text-left font-semibold text-zinc-800">
                  <span className="flex items-center gap-1.5">
                    <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: colorOf(series.key) }} />
                    {series.label}
                  </span>
                </th>
                {data.months.map((month, index) => {
                  const value = metric === "orders" ? series.orders[index] : series.hours[index];
                  const active = selection?.series === series.key && selection.month === month.period;
                  if (value === null) {
                    return (
                      <td key={month.period} className="px-2 py-0.5 text-right text-zinc-400" title={month.note ?? "Sem dado neste mês"}>
                        —
                      </td>
                    );
                  }
                  return (
                    <td key={month.period} className="px-1 py-0.5 text-right">
                      <button
                        type="button"
                        onClick={() => onSelect(series.key, index)}
                        aria-pressed={active}
                        aria-label={`${series.label}, ${month.tooltipLabel}: ${
                          metric === "orders" ? fmtInt(value) : fmtHours(value)
                        } ${unit}. Detalhar.`}
                        className={`w-full rounded px-1 py-0.5 tabular-nums transition hover:bg-gold/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-gold ${
                          active ? "bg-ink font-bold text-white hover:bg-ink" : value === 0 ? "text-zinc-400" : "text-zinc-800"
                        }`}
                      >
                        {metric === "orders" ? fmtInt(value) : fmtHours(value)}
                      </button>
                    </td>
                  );
                })}
                <td className="px-2 py-1 text-right font-semibold tabular-nums text-zinc-900">
                  {metric === "orders" ? fmtInt(series.totalOrders) : fmtHours(series.totalWorkedHours)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}

/* ------------------------------------------------------------------ */
/* Helpers                                                            */
/* ------------------------------------------------------------------ */

function initialVisible(mode: "family" | "machine", keys: string[], selected: string | null): string[] {
  if (mode === "machine") return keys.slice(0, 1);
  const top = keys.slice(0, DEFAULT_VISIBLE);
  return selected && keys.includes(selected) && !top.includes(selected) ? [...top, selected] : top;
}

/** Mantém o slot de cor de quem continua na tela; novos pegam o primeiro slot livre. */
function assignSlots(previous: Record<string, number>, visible: string[]): Record<string, number> {
  const next: Record<string, number> = {};
  const used = new Set<number>();
  for (const key of visible) {
    if (previous[key] !== undefined) {
      next[key] = previous[key];
      used.add(previous[key]);
    }
  }
  for (const key of visible) {
    if (next[key] !== undefined) continue;
    const free = FAMILY_PALETTE.findIndex((_, index) => !used.has(index));
    if (free < 0) break;
    next[key] = free;
    used.add(free);
  }
  return next;
}

function fmtInt(value: number): string {
  return value.toLocaleString("pt-BR");
}

function fmtHours(value: number): string {
  return value.toLocaleString("pt-BR", { maximumFractionDigits: 1 });
}

function fmtPercent(value: number): string {
  return `${value.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`;
}
