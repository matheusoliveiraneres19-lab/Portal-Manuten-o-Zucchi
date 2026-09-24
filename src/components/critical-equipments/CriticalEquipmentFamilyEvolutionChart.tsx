"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Check, ChevronDown, Search, Table2 } from "lucide-react";
import { EmptyState } from "@/components/EmptyState";
import type { FamilyEvolutionData, FamilyEvolutionMetric, FamilyEvolutionSeries } from "@/types/critical-equipments";
import { CHART_CHROME } from "@/constants/theme";
import { formatMonthLong } from "@/services/critical-equipment-evolution.service";

/**
 * Paleta categórica DESTE gráfico (validada: faixa de luminosidade, croma, separação
 * para daltonismo e visão normal). A cor segue a FAMÍLIA, não o ranking: cada família
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

/** Família/mês destacados — vêm do estado único da página. */
type ChartSelection = { family: string | null; month: string | null };

type Props = {
  data: FamilyEvolutionData;
  selection: ChartSelection;
  /** Clique num ponto/célula (mês) ou na legenda (período inteiro, `month = null`). */
  onSelect: (family: string, month: string | null) => void;
};

/**
 * Gráfico de CONTEXTO: não é recortado pela seleção (senão a linha clicada viraria a
 * única do gráfico). Ele só DEFINE família/mês no estado da página, que recorta os
 * dashboards abaixo.
 */
export function CriticalEquipmentFamilyEvolutionChart({ data, selection, onSelect }: Props) {
  const [metric, setMetric] = useState<FamilyEvolutionMetric>("orders");
  const familyNames = useMemo(() => data.families.map((family) => family.family), [data.families]);

  const [visible, setVisible] = useState<string[]>(() => {
    const top = familyNames.slice(0, DEFAULT_VISIBLE);
    return selection.family && familyNames.includes(selection.family) && !top.includes(selection.family)
      ? [...top, selection.family]
      : top;
  });
  const [slots, setSlots] = useState<Record<string, number>>(() => assignSlots({}, visible));
  const hoverIndexRef = useRef<number | null>(null);

  // Filtros novos da página: o conjunto de famílias pode mudar — mantém as exibidas que sobreviveram.
  useEffect(() => {
    setVisible((current) => {
      const kept = current.filter((family) => familyNames.includes(family));
      return kept.length ? kept : familyNames.slice(0, DEFAULT_VISIBLE);
    });
  }, [familyNames]);

  // Família selecionada fora das exibidas (ex.: via ranking) entra no gráfico.
  useEffect(() => {
    const family = selection.family;
    if (family && familyNames.includes(family)) {
      setVisible((current) => (current.includes(family) ? current : [...current, family]));
    }
  }, [selection.family, familyNames]);

  useEffect(() => {
    setSlots((current) => assignSlots(current, visible));
  }, [visible]);

  const seriesByFamily = useMemo(
    () => new Map(data.families.map((family) => [family.family, family])),
    [data.families]
  );

  const colorOf = (family: string) => {
    const slot = slots[family];
    return slot === undefined ? FAMILY_CONTEXT_COLOR : FAMILY_PALETTE[slot];
  };

  function selectPoint(family: string, monthIndex: number | null) {
    const month = monthIndex !== null ? data.months[monthIndex]?.period ?? null : null;
    onSelect(family, month);
  }

  const chartRows = useMemo(
    () =>
      data.months.map((month, index) => {
        const row: Record<string, string | number> = { label: month.label };
        for (const family of visible) {
          const series = seriesByFamily.get(family);
          row[family] = series ? (metric === "orders" ? series.orders[index] : series.hours[index]) : 0;
        }
        return row;
      }),
    [data.months, visible, seriesByFamily, metric]
  );

  const selectedMonthLabel = selection.month
    ? data.months.find((month) => month.period === selection.month)?.label
    : undefined;

  const unit = metric === "orders" ? "OS" : "h";

  return (
    <article className="panel rounded-lg p-4 xl:col-span-12">
      <div className="mb-1 flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="text-[11px] font-extrabold uppercase tracking-wide text-gold-deep">
            Evolução mensal de ordens por família
          </h3>
          <p className="text-[11px] text-zinc-500">
            Clique em uma família ou num ponto do mês para recortar toda a análise abaixo.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <MetricToggle metric={metric} onChange={setMetric} />
          <FamilyPicker families={data.families} visible={visible} onChange={setVisible} colorOf={colorOf} />
        </div>
      </div>

      {data.families.length === 0 || data.months.length === 0 ? (
        <EmptyState
          title="Sem ordens no período"
          description="Ajuste o período ou os filtros para visualizar a evolução por família."
        />
      ) : (
        <>
          <FamilyLegend
            visible={visible}
            seriesByFamily={seriesByFamily}
            colorOf={colorOf}
            selectedFamily={selection.family}
            onSelect={(family) => onSelect(family, null)}
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
                  // Clique fora de um ponto: só é inequívoco com uma única família na tela.
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
                  content={<EvolutionTooltip data={data} visible={visible} metric={metric} colorOf={colorOf} />}
                  cursor={{ stroke: CHART_CHROME.onLight.grid, strokeWidth: 1 }}
                />
                {visible.map((family) => {
                  const color = colorOf(family);
                  const isSelected = selection.family === family;
                  const isContext = color === FAMILY_CONTEXT_COLOR;
                  return (
                    <Line
                      key={family}
                      type="monotone"
                      // Função, não string: nome de família com "." viraria caminho no lodash.get do Recharts.
                      dataKey={(row: Record<string, number>) => row[family]}
                      name={family}
                      stroke={color}
                      strokeWidth={isSelected ? 3 : isContext ? 1.25 : 2}
                      strokeOpacity={selection.family && !isSelected ? 0.55 : 1}
                      dot={{ r: 3, strokeWidth: 0, fill: color }}
                      activeDot={{
                        r: 7,
                        stroke: "#fff",
                        strokeWidth: 2,
                        cursor: "pointer",
                        onClick: () => selectPoint(family, hoverIndexRef.current)
                      }}
                      isAnimationActive={false}
                    />
                  );
                })}
              </LineChart>
            </ResponsiveContainer>
          </div>

          <EvolutionTable
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
    </article>
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
  families,
  visible,
  onChange,
  colorOf
}: {
  families: FamilyEvolutionSeries[];
  visible: string[];
  onChange: (next: string[]) => void;
  colorOf: (family: string) => string;
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
  const filtered = normalized
    ? families.filter((family) => family.family.toLowerCase().includes(normalized))
    : families;

  function toggle(family: string) {
    if (visible.includes(family)) {
      // Nunca deixa o gráfico vazio.
      if (visible.length > 1) onChange(visible.filter((value) => value !== family));
    } else {
      onChange([...visible, family]);
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
          {visible.length}/{families.length}
        </span>
        <ChevronDown className="h-3.5 w-3.5" />
      </button>

      {open ? (
        <div className="absolute right-0 z-30 mt-1 w-[min(20rem,calc(100vw-2rem))] rounded-lg border border-zinc-200 bg-white p-2 shadow-lg">
          <div className="mb-2 flex flex-wrap gap-1.5">
            <button
              type="button"
              onClick={() => onChange(families.slice(0, DEFAULT_VISIBLE).map((family) => family.family))}
              className="rounded border border-zinc-200 px-2 py-1 text-[10px] font-bold uppercase text-zinc-600 hover:border-gold/60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-gold"
            >
              Top {DEFAULT_VISIBLE}
            </button>
            <button
              type="button"
              onClick={() => onChange(families.map((family) => family.family))}
              className="rounded border border-zinc-200 px-2 py-1 text-[10px] font-bold uppercase text-zinc-600 hover:border-gold/60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-gold"
            >
              Ver todas
            </button>
          </div>
          {families.length > 6 ? (
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
            {filtered.map((family) => {
              const checked = visible.includes(family.family);
              return (
                <li key={family.family}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={checked}
                    onClick={() => toggle(family.family)}
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
                      <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: colorOf(family.family) }} />
                    ) : null}
                    <span className="min-w-0 flex-1 truncate">{family.family}</span>
                    <span className="text-[11px] tabular-nums text-zinc-500">{fmtInt(family.totalOrders)} OS</span>
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

function FamilyLegend({
  visible,
  seriesByFamily,
  colorOf,
  selectedFamily,
  onSelect
}: {
  visible: string[];
  seriesByFamily: Map<string, FamilyEvolutionSeries>;
  colorOf: (family: string) => string;
  selectedFamily: string | null;
  onSelect: (family: string) => void;
}) {
  return (
    <ul className="mb-2 mt-2 flex flex-wrap gap-1.5" aria-label="Famílias exibidas no gráfico">
      {visible.map((family) => {
        const series = seriesByFamily.get(family);
        const active = selectedFamily === family;
        return (
          <li key={family}>
            <button
              type="button"
              onClick={() => onSelect(family)}
              aria-pressed={active}
              aria-label={`Detalhar ${family} no período inteiro: ${fmtInt(series?.totalOrders ?? 0)} OS`}
              className={`flex items-center gap-1.5 rounded-md border px-2 py-1 text-[11px] transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-gold ${
                active ? "border-ink bg-ink/[0.04] font-semibold text-zinc-900" : "border-zinc-200 text-zinc-700 hover:border-gold/60"
              }`}
            >
              <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: colorOf(family) }} />
              {family}
              <span className="tabular-nums text-zinc-500">{fmtInt(series?.totalOrders ?? 0)}</span>
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
  data: FamilyEvolutionData;
  visible: string[];
  metric: FamilyEvolutionMetric;
  colorOf: (family: string) => string;
};

function EvolutionTooltip({ active, label, data, visible, metric, colorOf }: TooltipProps) {
  if (!active || !label) return null;
  const index = data.months.findIndex((month) => month.label === label);
  if (index < 0) return null;
  const month = data.months[index];

  const rows = visible
    .map((family) => data.families.find((series) => series.family === family))
    .filter((series): series is FamilyEvolutionSeries => Boolean(series))
    .map((series) => {
      const value = metric === "orders" ? series.orders[index] : series.hours[index];
      const previous = index > 0 ? (metric === "orders" ? series.orders[index - 1] : series.hours[index - 1]) : null;
      return {
        family: series.family,
        value,
        machines: series.machines[index],
        // Sem mês anterior no período, ou anterior zerado: não há base para percentual.
        variation: previous !== null && previous > 0 ? ((value - previous) / previous) * 100 : null
      };
    })
    .sort((a, b) => b.value - a.value);

  const previousLabel = index > 0 ? formatMonthLong(data.months[index - 1].period).split("/")[0].toLowerCase() : null;

  return (
    <div className="max-w-xs rounded-md border border-zinc-200 bg-white px-3 py-2 text-[11px] shadow-lg">
      <p className="mb-1.5 font-bold text-zinc-900">{formatMonthLong(month.period)}</p>
      <ul className="space-y-1.5">
        {rows.map((row) => (
          <li key={row.family} className="flex gap-2">
            <span className="mt-1 h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: colorOf(row.family) }} />
            <div className="min-w-0">
              <p className="font-semibold text-zinc-800">
                {row.family}{" "}
                <span className="tabular-nums text-zinc-900">
                  {metric === "orders" ? `${fmtInt(row.value)} OS` : `${fmtHours(row.value)} h`}
                </span>
              </p>
              <p className="text-zinc-500">
                Máquinas afetadas: {fmtInt(row.machines)}
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
 * recebem foco) e a leitura exata dos números. Cada célula é um botão.
 */
function EvolutionTable({
  data,
  visible,
  metric,
  unit,
  colorOf,
  selection,
  onSelect
}: {
  data: FamilyEvolutionData;
  visible: string[];
  metric: FamilyEvolutionMetric;
  unit: string;
  colorOf: (family: string) => string;
  selection: ChartSelection;
  onSelect: (family: string, monthIndex: number | null) => void;
}) {
  const rows = visible
    .map((family) => data.families.find((series) => series.family === family))
    .filter((series): series is FamilyEvolutionSeries => Boolean(series));

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
            {metric === "orders" ? "Quantidade de OS" : "Horas apontadas"} por família e mês. Selecione uma célula
            para detalhar.
          </caption>
          <thead>
            <tr className="border-b border-zinc-200 text-left text-[10px] uppercase tracking-wide text-zinc-500">
              <th scope="col" className="px-2 py-1.5 font-bold">
                Família
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
              <tr key={series.family} className="border-b border-zinc-100">
                <th scope="row" className="px-2 py-1 text-left font-semibold text-zinc-800">
                  <span className="flex items-center gap-1.5">
                    <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: colorOf(series.family) }} />
                    {series.family}
                  </span>
                </th>
                {data.months.map((month, index) => {
                  const value = metric === "orders" ? series.orders[index] : series.hours[index];
                  const active = selection?.family === series.family && selection.month === month.period;
                  return (
                    <td key={month.period} className="px-1 py-0.5 text-right">
                      <button
                        type="button"
                        onClick={() => onSelect(series.family, index)}
                        aria-pressed={active}
                        aria-label={`${series.family}, ${formatMonthLong(month.period)}: ${
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

/** Mantém o slot de cor de quem continua na tela; novos pegam o primeiro slot livre. */
function assignSlots(previous: Record<string, number>, visible: string[]): Record<string, number> {
  const next: Record<string, number> = {};
  const used = new Set<number>();
  for (const family of visible) {
    if (previous[family] !== undefined) {
      next[family] = previous[family];
      used.add(previous[family]);
    }
  }
  for (const family of visible) {
    if (next[family] !== undefined) continue;
    const free = FAMILY_PALETTE.findIndex((_, index) => !used.has(index));
    if (free < 0) break;
    next[family] = free;
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
