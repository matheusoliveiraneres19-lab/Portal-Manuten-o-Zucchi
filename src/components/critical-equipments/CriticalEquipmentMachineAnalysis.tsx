"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, ChevronRight, Loader2, Search, X } from "lucide-react";
import { EmptyState } from "@/components/EmptyState";
import { CHART_SERIES, GOLD, SEMANTIC } from "@/constants/theme";
import {
  CriticalEquipmentEvolutionChart,
  type EvolutionChartData
} from "@/components/critical-equipments/CriticalEquipmentEvolutionChart";
import type {
  CriticalMachineMonth,
  CriticalMachineMonthDetail,
  CriticalMachineOption,
  CriticalMachineSplit,
  CriticalMachineYearAnalysis
} from "@/types/critical-equipments";
import type { MachineAnalysisState } from "@/utils/critical-equipment-selection";

/**
 * ANÁLISE POR MÁQUINA — Máquina → ano (Jan → Dez) → mês → repartimento → OS.
 *
 * Caminho independente do modo Família: o seletor lista TODAS as máquinas válidas da
 * base (não a família filtrada, não o Top N), e a análise não usa a seleção por
 * família. Tudo é agregado no servidor (`/api/critical-equipments/machine`); aqui só
 * se filtra a lista e se desenha.
 */
const STATUS_TEXT: Record<string, string> = {
  ABERTA: "Aberta",
  LIBERADA: "Liberada",
  EM_ANDAMENTO: "Em andamento",
  AGUARDANDO_MATERIAL: "Aguardando material",
  FECHADA: "Fechada",
  CANCELADA: "Cancelada"
};

const OPEN_COLOR = SEMANTIC.danger.DEFAULT;
const CLOSED_COLOR = SEMANTIC.success.DEFAULT;
const CORRECTIVE_COLOR = CHART_SERIES.corretiva;
const PLANNED_COLOR = CHART_SERIES.preventiva;

const int = (value: number) => value.toLocaleString("pt-BR");
const hoursText = (value: number) => `${value.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} h`;
const normalize = (value: string) =>
  value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();

type Load<T> = { phase: "idle" } | { phase: "loading" } | { phase: "error"; message: string } | { phase: "ready"; data: T };

export function CriticalEquipmentMachineAnalysis({
  state,
  filterQuery,
  defaultYear,
  onChange
}: {
  state: MachineAnalysisState;
  /** Query dos filtros gerais da página — no modo Máquina valem só os filtros de OS. */
  filterQuery: string;
  /** Ano do período da página: ponto de partida quando a URL não traz `year`. */
  defaultYear: number | null;
  onChange: (next: MachineAnalysisState) => void;
}) {
  const [options, setOptions] = useState<Load<CriticalMachineOption[]>>({ phase: "loading" });
  const [analysis, setAnalysis] = useState<Load<CriticalMachineYearAnalysis | null>>({ phase: "idle" });
  const [month, setMonth] = useState<string | null>(null);

  // Lista de máquinas: uma vez por montagem (independe de filtros, família e Top N).
  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/critical-equipments/machine?view=options", { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error("options");
        const body = (await response.json()) as { options: CriticalMachineOption[] };
        setOptions({ phase: "ready", data: body.options });
      })
      .catch(() => {
        if (!controller.signal.aborted) setOptions({ phase: "error", message: "Não foi possível carregar as máquinas." });
      });
    return () => controller.abort();
  }, []);

  const requestedYear = state.year ?? defaultYear;

  // Ano da máquina: UMA requisição por (máquina, ano, filtros) — o ano inteiro agregado no servidor.
  useEffect(() => {
    setMonth(null);
    if (!state.machineId) {
      setAnalysis({ phase: "idle" });
      return;
    }
    const controller = new AbortController();
    const query = new URLSearchParams(filterQuery);
    query.set("view", "year");
    query.set("machineId", state.machineId);
    if (requestedYear) query.set("year", String(requestedYear));
    setAnalysis({ phase: "loading" });
    fetch(`/api/critical-equipments/machine?${query.toString()}`, { signal: controller.signal })
      .then(async (response) => {
        if (response.status === 404) {
          setAnalysis({ phase: "ready", data: null });
          return;
        }
        if (!response.ok) throw new Error("year");
        const data = (await response.json()) as CriticalMachineYearAnalysis;
        // Sem ano escolhido e o ano do período não tem OS: vai para o mais recente com dados.
        if (!state.year && data.availableYears.length && !data.availableYears.includes(data.year)) {
          onChange({ ...state, year: data.availableYears[data.availableYears.length - 1] });
          return;
        }
        setAnalysis({ phase: "ready", data });
        // Ano veio do padrão (período da página): grava na URL para o link compartilhado fixá-lo.
        if (!state.year) onChange({ ...state, year: data.year });
      })
      .catch(() => {
        if (!controller.signal.aborted) setAnalysis({ phase: "error", message: "Não foi possível carregar a análise da máquina." });
      });
    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.machineId, requestedYear, filterQuery]);

  const optionList = options.phase === "ready" ? options.data : [];
  const selectedOption = optionList.find((option) => option.id === state.machineId) ?? null;
  const data = analysis.phase === "ready" ? analysis.data : null;
  const machineName = data?.machine.name ?? selectedOption?.name ?? state.machineId ?? "";
  const shownYear = data?.year ?? requestedYear;
  const hasData = Boolean(data && data.summary.totalOrders > 0);

  // Mesmos dados do gráfico de Família: uma série (a máquina), Jan → Dez.
  const chartData = useMemo<EvolutionChartData>(() => (data && hasData ? toChartData(data) : { months: [], series: [] }), [data, hasData]);

  const placeholder = !state.machineId ? (
    <EmptyState
      title="Selecione uma máquina"
      description="Pesquise por nome, código, local de instalação ou objeto técnico. Todas as máquinas válidas estão disponíveis, de qualquer família."
    />
  ) : analysis.phase === "loading" || analysis.phase === "idle" ? (
    <p className="flex h-40 items-center justify-center gap-2 text-sm text-zinc-500">
      <Loader2 className="h-4 w-4 animate-spin text-gold" /> Carregando a análise da máquina…
    </p>
  ) : analysis.phase === "error" ? (
    <p className="py-8 text-center text-sm text-rose-700">{analysis.message}</p>
  ) : !hasData ? (
    <EmptyState
      title={`Não há ordens para este equipamento em ${shownYear ?? "—"} com os filtros atuais.`}
      description={
        data?.availableYears.length
          ? `Anos com OS desta máquina: ${data.availableYears.join(", ")}.`
          : "Ajuste os filtros de OS ou escolha outra máquina."
      }
    />
  ) : null;

  const toolbar = (
    <>
      <div className="mt-2 grid grid-cols-1 gap-3 md:grid-cols-[minmax(0,1fr)_160px]">
        <div className="min-w-0">
          <span className="mb-1 block text-[10px] font-extrabold uppercase tracking-wide text-zinc-500">Máquina / Equipamento</span>
          <MachinePicker
            options={options}
            selected={selectedOption}
            selectedId={state.machineId}
            onSelect={(id) => onChange({ ...state, machineId: id, year: state.year })}
          />
        </div>
        <label className="block min-w-0">
          <span className="mb-1 block text-[10px] font-extrabold uppercase tracking-wide text-zinc-500">Ano</span>
          <select
            value={shownYear ?? ""}
            disabled={!data}
            onChange={(event) => onChange({ ...state, year: Number(event.target.value) })}
            className="h-9 w-full rounded-md border border-zinc-300/80 bg-white/70 px-2 text-sm font-semibold text-zinc-800 outline-none focus:border-gold/60 disabled:opacity-60"
          >
            {(data?.availableYears.length ? data.availableYears : shownYear ? [shownYear] : []).map((year) => (
              <option key={year} value={year}>
                {year}
              </option>
            ))}
          </select>
        </label>
      </div>
      {state.machineId ? <ContextStrip machineName={machineName} year={shownYear} ignored={data?.ignoredFilters ?? []} /> : null}
    </>
  );

  return (
    <CriticalEquipmentEvolutionChart
      mode="machine"
      title={state.machineId ? `Evolução mensal — ${machineName}` : "Evolução mensal por máquina"}
      subtitle="Desempenho mensal do equipamento no ano selecionado."
      data={chartData}
      selection={{ series: state.machineId, month }}
      // Clique num ponto (ou na célula da tabela) abre o detalhe só daquele mês.
      onSelect={(_key, period) => {
        if (period) setMonth(period);
      }}
      toolbar={toolbar}
      placeholder={placeholder}
    >
      {data && hasData ? (
        <>
          <p className="mt-1 text-[10px] text-zinc-500">
            — = mês ainda não ocorrido ou anterior ao início da base (sem período disponível); 0 = mês encerrado sem OS.
            {data.months.some((item) => item.state === "current")
              ? ` ${data.months.find((item) => item.state === "current")?.label}/${String(data.year).slice(2)} em andamento — valores parciais, não compare direto com meses completos.`
              : ""}
          </p>
          <div className="mt-3">
            <SummaryStrip data={data} />
          </div>
          <CompositionRow split={data.summary} />
          {month && state.machineId ? (
            <MonthDetail
              key={`${state.machineId}|${month}|${filterQuery}`}
              machineId={state.machineId}
              month={month}
              filterQuery={filterQuery}
              onClose={() => setMonth(null)}
            />
          ) : (
            <p className="mt-3 text-[11px] text-zinc-500">Clique em um ponto do gráfico para ver as ordens do equipamento naquele mês.</p>
          )}
        </>
      ) : null}
    </CriticalEquipmentEvolutionChart>
  );
}

const MONTH_LABELS = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

/**
 * Ano da máquina → dados do gráfico comum. Mês futuro ou anterior à base = `null`
 * (sem dado, lacuna na linha); mês encerrado sem OS = 0.
 */
function toChartData(data: CriticalMachineYearAnalysis): EvolutionChartData {
  const yy = String(data.year).slice(2);
  const hasValue = (month: CriticalMachineMonth) => month.state === "closed" || month.state === "current";
  return {
    months: data.months.map((month, index) => ({
      period: month.period,
      label: MONTH_LABELS[index],
      tooltipLabel: `${MONTH_LABELS[index]}/${yy}`,
      note:
        month.state === "current"
          ? "Mês em andamento — valores parciais"
          : month.state === "future"
            ? "Mês ainda não ocorreu"
            : month.state === "noBase"
              ? "Sem período disponível na base"
              : undefined
    })),
    series: [
      {
        key: data.machine.id,
        label: data.machine.name,
        totalOrders: data.summary.totalOrders,
        totalWorkedHours: data.summary.totalWorkedHours,
        orders: data.months.map((month) => (hasValue(month) ? month.totalOrders : null)),
        hours: data.months.map((month) => (hasValue(month) ? month.totalWorkedHours : null))
      }
    ]
  };
}

/* ------------------------------------------------------------------ */
/* Seletor de máquina                                                 */
/* ------------------------------------------------------------------ */

const VISIBLE_MATCHES = 60;

function MachinePicker({
  options,
  selected,
  selectedId,
  onSelect
}: {
  options: Load<CriticalMachineOption[]>;
  selected: CriticalMachineOption | null;
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const boxRef = useRef<HTMLDivElement>(null);
  const list = useMemo(() => (options.phase === "ready" ? options.data : []), [options]);

  const matches = useMemo(() => {
    const term = normalize(query.trim());
    const filtered = term ? list.filter((option) => option.searchText.includes(term) || normalize(option.name).includes(term)) : list;
    return filtered;
  }, [list, query]);

  useEffect(() => {
    if (!open) return;
    const onPointer = (event: PointerEvent) => {
      if (boxRef.current && !boxRef.current.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", onPointer);
    return () => document.removeEventListener("pointerdown", onPointer);
  }, [open]);

  return (
    <div className="relative" ref={boxRef}>
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-haspopup="listbox"
        className="flex h-9 w-full items-center justify-between gap-2 rounded-md border border-zinc-300/80 bg-white/70 px-3 text-left text-sm text-zinc-800 outline-none transition hover:border-gold/60 focus-visible:border-gold"
      >
        <span className="min-w-0 truncate">
          {selected ? (
            <>
              <strong className="font-semibold">{selected.name}</strong>
              <span className="ml-2 text-[11px] text-zinc-500">{selected.id} · {selected.familyLabel}</span>
            </>
          ) : selectedId ? (
            <span className="font-semibold">{selectedId}</span>
          ) : (
            <span className="text-zinc-400">Selecione uma máquina...</span>
          )}
        </span>
        <ChevronDown className="h-4 w-4 shrink-0 text-zinc-400" />
      </button>

      {open ? (
        <div className="absolute left-0 right-0 z-30 mt-1 rounded-md border border-zinc-300 bg-white shadow-lg">
          <label className="relative block border-b border-zinc-200">
            <span className="sr-only">Buscar máquina</span>
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-zinc-400" />
            <input
              autoFocus
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Escape") setOpen(false);
                if (event.key === "Enter" && matches[0]) {
                  onSelect(matches[0].id);
                  setOpen(false);
                }
              }}
              placeholder="Buscar máquina..."
              className="h-9 w-full rounded-t-md bg-transparent pl-8 pr-2 text-sm text-zinc-800 outline-none"
            />
          </label>
          {options.phase === "loading" ? (
            <p className="px-3 py-3 text-xs text-zinc-500">Carregando máquinas…</p>
          ) : options.phase === "error" ? (
            <p className="px-3 py-3 text-xs text-rose-700">{options.message}</p>
          ) : matches.length === 0 ? (
            <p className="px-3 py-3 text-xs text-zinc-500">Nenhuma máquina encontrada.</p>
          ) : (
            <ul role="listbox" aria-label="Máquinas" className="max-h-72 overflow-y-auto">
              {matches.slice(0, VISIBLE_MATCHES).map((option) => (
                <li key={option.id}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={option.id === selectedId}
                    onClick={() => {
                      onSelect(option.id);
                      setOpen(false);
                      setQuery("");
                    }}
                    className={`flex w-full items-baseline justify-between gap-3 border-b border-zinc-100 px-3 py-1.5 text-left transition hover:bg-gold/10 ${
                      option.id === selectedId ? "bg-gold/10" : ""
                    }`}
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-[13px] font-semibold text-zinc-900">{option.name}</span>
                      <span className="block truncate text-[10px] text-zinc-500">
                        {option.id} · {option.familyLabel}
                      </span>
                    </span>
                    <span className="shrink-0 text-[10px] tabular-nums text-zinc-500">{int(option.totalOrders)} OS</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          <p className="border-t border-zinc-200 px-3 py-1.5 text-[10px] text-zinc-500">
            {matches.length > VISIBLE_MATCHES
              ? `Mostrando ${VISIBLE_MATCHES} de ${int(matches.length)} — refine a busca.`
              : `${int(matches.length)} de ${int(list.length)} máquinas`}{" "}
            · todas as famílias, sem limite de Top N
          </p>
        </div>
      ) : null}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Contexto, resumo e composição                                      */
/* ------------------------------------------------------------------ */

function ContextStrip({ machineName, year, ignored }: { machineName: string; year: number | null; ignored: string[] }) {
  return (
    <div className="mt-3 rounded-md border border-gold/30 bg-gold/[0.07] px-3 py-2 text-[11px] text-zinc-700">
      <span className="mr-3 font-extrabold uppercase tracking-wide text-gold-deep">Análise atual</span>
      <span className="mr-3">
        Modo: <strong>Máquina</strong>
      </span>
      <span className="mr-3">
        Equipamento: <strong>{machineName}</strong>
      </span>
      <span>
        Ano: <strong>{year ?? "—"}</strong>
      </span>
      <p className="mt-1 text-[10px] text-zinc-500">
        Valem os filtros de OS da página (status, grupo, tipo, corretiva/planejada, responsável, área; &ldquo;somente
        abertas/com horas&rdquo; recortam as OS).
        {ignored.length ? (
          <>
            {" "}
            <strong className="text-amber-700">Ignorados neste modo (filtros de frota): {ignored.join(", ")}.</strong>
          </>
        ) : null}{" "}
        Os painéis abaixo continuam mostrando a frota pelos filtros gerais.
      </p>
    </div>
  );
}

function SummaryStrip({ data }: { data: CriticalMachineYearAnalysis }) {
  const s = data.summary;
  const items: Array<[string, string, string?]> = [
    ["Total de OS no ano", int(s.totalOrders)],
    ["Horas apontadas", hoursText(s.totalWorkedHours)],
    ["Corretivas", int(s.correctiveOrders)],
    ["Planejadas", int(s.plannedOrders)],
    ["Abertas", int(s.openOrders)],
    ["Fechadas", int(s.closedOrders)],
    ["Mês com mais OS", s.peakOrdersMonth ? `${s.peakOrdersMonth.label.split("/")[0]} · ${int(s.peakOrdersMonth.value)}` : "—"],
    ["Mês com mais horas", s.peakHoursMonth ? `${s.peakHoursMonth.label.split("/")[0]} · ${hoursText(s.peakHoursMonth.value)}` : "—"]
  ];
  return (
    <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-md border border-zinc-200 bg-zinc-200 sm:grid-cols-4 xl:grid-cols-8">
      {items.map(([label, value]) => (
        <div key={label} className="bg-white/80 px-2.5 py-1.5">
          <dt className="truncate text-[9px] font-bold uppercase tracking-wide text-zinc-500">{label}</dt>
          <dd className="truncate text-[13px] font-extrabold tabular-nums text-zinc-900" title={value}>
            {value}
          </dd>
        </div>
      ))}
    </dl>
  );
}

function CompositionRow({ split }: { split: CriticalMachineSplit }) {
  const total = Math.max(split.totalOrders, 1);
  return (
    <div className="mt-3 grid gap-3 lg:grid-cols-2">
      <div>
        <p className="mb-1 text-[10px] font-extrabold uppercase tracking-wide text-zinc-500">Corretivas x planejadas no ano</p>
        <span className="flex h-3 w-full gap-[2px] overflow-hidden rounded bg-black/[0.06]" aria-hidden>
          {[
            [split.correctiveOrders, CORRECTIVE_COLOR],
            [split.plannedOrders, PLANNED_COLOR],
            [split.unclassifiedOrders, "#9CA3AF"]
          ]
            .filter(([value]) => (value as number) > 0)
            .map(([value, color], index) => (
              <span key={index} className="block h-full" style={{ width: `${((value as number) / total) * 100}%`, minWidth: 3, background: color as string }} />
            ))}
        </span>
        <p className="mt-1 flex flex-wrap gap-x-4 text-[11px] tabular-nums text-zinc-600">
          <span>
            <Dot color={CORRECTIVE_COLOR} /> Corretivas {int(split.correctiveOrders)} ({pct(split.correctiveOrders, split.totalOrders)})
          </span>
          <span>
            <Dot color={PLANNED_COLOR} /> Planejadas {int(split.plannedOrders)} ({pct(split.plannedOrders, split.totalOrders)})
          </span>
          {split.unclassifiedOrders ? <span>Não classificadas {int(split.unclassifiedOrders)}</span> : null}
        </p>
      </div>
      <div>
        <p className="mb-1 text-[10px] font-extrabold uppercase tracking-wide text-zinc-500">Grupo de planejamento no ano</p>
        <GroupChips split={split} />
      </div>
    </div>
  );
}

function GroupChips({ split }: { split: CriticalMachineSplit }) {
  return (
    <ul className="flex flex-wrap gap-1.5">
      {split.planningGroups.map((group) => (
        <li
          key={group.key}
          className="rounded-md border border-zinc-300/70 bg-white/70 px-2 py-0.5 text-[11px] tabular-nums text-zinc-700"
          title={`${group.label}: ${int(group.orders)} OS · ${hoursText(group.hours)}`}
        >
          {group.label} <strong className="text-zinc-900">{int(group.orders)}</strong>
        </li>
      ))}
    </ul>
  );
}

/* ------------------------------------------------------------------ */
/* Detalhe do mês                                                     */
/* ------------------------------------------------------------------ */

function MonthDetail({
  machineId,
  month,
  filterQuery,
  onClose
}: {
  machineId: string;
  month: string;
  filterQuery: string;
  onClose: () => void;
}) {
  const [load, setLoad] = useState<Load<CriticalMachineMonthDetail>>({ phase: "loading" });
  const [component, setComponent] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    const query = new URLSearchParams(filterQuery);
    query.set("view", "month");
    query.set("machineId", machineId);
    query.set("month", month);
    fetch(`/api/critical-equipments/machine?${query.toString()}`, { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error("month");
        setLoad({ phase: "ready", data: (await response.json()) as CriticalMachineMonthDetail });
      })
      .catch(() => {
        if (!controller.signal.aborted) setLoad({ phase: "error", message: "Não foi possível carregar o detalhe do mês." });
      });
    return () => controller.abort();
  }, [machineId, month, filterQuery]);

  if (load.phase !== "ready") {
    return (
      <section className="mt-4 rounded-lg border border-gold/30 bg-ink p-4 text-champagne">
        {load.phase === "error" ? (
          <p className="text-sm text-rose-300">{load.message}</p>
        ) : (
          <p className="flex items-center gap-2 text-sm text-zinc-400">
            <Loader2 className="h-4 w-4 animate-spin text-gold" /> Carregando o mês…
          </p>
        )}
      </section>
    );
  }

  const d = load.data;
  const s = d.split;
  const groupCount = (key: string) => s.planningGroups.find((group) => group.key === key)?.orders ?? 0;
  const orders = component ? d.orders.items.filter((order) => order.componentKey === component) : d.orders.items;
  const componentLabel = component ? d.components.find((item) => item.key === component)?.label ?? component : null;
  const maxComponent = Math.max(...d.components.map((item) => item.orders), 1);

  return (
    <section className="mt-4 rounded-lg border border-gold/30 bg-ink p-4 text-champagne" aria-label={`Detalhe — ${d.machine.name} — ${d.periodLabel}`}>
      <header className="mb-3 flex items-start justify-between gap-3">
        <div>
          <h4 className="text-[11px] font-extrabold uppercase tracking-wide text-gold">
            Detalhe — {d.machine.name} — {d.periodLabel}
          </h4>
          {d.state === "current" ? <p className="text-[11px] text-amber-200/90">Mês em andamento — valores parciais.</p> : null}
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Fechar detalhe do mês"
          className="grid h-8 w-8 shrink-0 place-items-center rounded-md border border-gold/25 text-zinc-300 transition hover:text-white"
        >
          <X className="h-4 w-4" />
        </button>
      </header>

      <dl className="grid grid-cols-3 gap-2 sm:grid-cols-5 xl:grid-cols-9">
        {(
          [
            ["Total de OS", int(s.totalOrders)],
            ["Horas apontadas", hoursText(s.totalWorkedHours)],
            ["Abertas", int(s.openOrders)],
            ["Fechadas", int(s.closedOrders)],
            ["Corretivas", int(s.correctiveOrders)],
            ["Planejadas", int(s.plannedOrders)],
            ["Mecânicas", int(groupCount("MEC"))],
            ["Elétricas", int(groupCount("ELE"))],
            ["Terceiros", int(groupCount("SERVICO_TERCEIRO"))]
          ] as const
        ).map(([label, value]) => (
          <div key={label} className="rounded-md border border-white/10 bg-white/[0.03] px-2.5 py-1.5">
            <dt className="truncate text-[9px] font-bold uppercase tracking-wide text-zinc-400">{label}</dt>
            <dd className="text-sm font-semibold tabular-nums text-white">{value}</dd>
          </div>
        ))}
      </dl>

      {d.components.length ? (
        <div className="mt-4">
          <h5 className="mb-1.5 text-[10px] font-bold uppercase tracking-wide text-gold">Repartimentos / subconjuntos com mais OS</h5>
          <ul className="grid gap-1 md:grid-cols-2">
            {d.components.map((item) => {
              const active = component === item.key;
              return (
                <li key={item.key}>
                  <button
                    type="button"
                    aria-pressed={active}
                    onClick={() => setComponent(active ? null : item.key)}
                    className={`grid w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-2 rounded-md px-2 py-1 text-left transition ${
                      active ? "bg-gold/15" : "hover:bg-white/[0.05]"
                    }`}
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-[12px]" title={item.label}>
                        {item.label}
                      </span>
                      <span className="mt-0.5 block h-1.5 overflow-hidden rounded-full bg-white/10">
                        <span className="block h-full rounded-full" style={{ width: `${(item.orders / maxComponent) * 100}%`, background: GOLD.DEFAULT }} />
                      </span>
                    </span>
                    <span className="text-right text-[11px] tabular-nums text-zinc-300">
                      <strong className="text-white">{int(item.orders)}</strong> OS
                      <span className="block text-[10px] text-zinc-500">{hoursText(item.hours)}</span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}

      <div className="mt-4">
        <nav aria-label="Recorte das ordens" className="mb-1.5 flex flex-wrap items-center gap-1 text-[11px] text-zinc-400">
          <span className="text-[10px] font-bold uppercase tracking-wide text-gold">Ordens do equipamento</span>
          <ChevronRight className="h-3 w-3" />
          <button type="button" onClick={() => setComponent(null)} className="hover:text-white disabled:cursor-default" disabled={!component}>
            {d.machine.name}
          </button>
          <ChevronRight className="h-3 w-3" />
          <span>{d.periodLabel}</span>
          {componentLabel ? (
            <>
              <ChevronRight className="h-3 w-3" />
              <span className="text-champagne">{componentLabel}</span>
            </>
          ) : null}
          <ChevronRight className="h-3 w-3" />
          <span className="tabular-nums text-champagne">{int(component ? orders.length : d.orders.total)} OS</span>
        </nav>
        {d.orders.truncated ? (
          <p className="mb-1 text-[11px] text-amber-200/90">
            Exibindo as {int(d.orders.items.length)} mais recentes de {int(d.orders.total)} OS do mês.
          </p>
        ) : null}
        {orders.length === 0 ? (
          <p className="py-4 text-center text-[12px] text-zinc-400">Nenhuma OS neste recorte.</p>
        ) : (
          <div className="max-h-[420px] overflow-auto rounded-md border border-white/10">
            <table className="w-full min-w-[980px] text-left text-[11px]">
              <thead className="sticky top-0 bg-ink-raised text-[10px] uppercase tracking-wide text-zinc-400">
                <tr>
                  {["Nº OS", "Título", "Status", "Grupo de planejamento", "Tipo", "Responsável", "Data", "Horas", "Local de instalação"].map((header) => (
                    <th key={header} className={`px-2.5 py-2 font-semibold ${header === "Horas" ? "text-right" : ""}`}>
                      {header}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.06] text-zinc-300">
                {orders.map((order) => {
                  const open = order.status !== "FECHADA" && order.status !== "CANCELADA";
                  return (
                    <tr key={order.id} className="hover:bg-white/[0.03]">
                      <td className="whitespace-nowrap px-2.5 py-1.5 font-semibold tabular-nums text-white">{order.osNumber}</td>
                      <td className="max-w-[260px] px-2.5 py-1.5">
                        <span className="line-clamp-1" title={order.title}>
                          {order.title}
                        </span>
                      </td>
                      <td className="whitespace-nowrap px-2.5 py-1.5">
                        <Dot color={open ? OPEN_COLOR : CLOSED_COLOR} />
                        {STATUS_TEXT[order.status] ?? order.status}
                      </td>
                      <td className="whitespace-nowrap px-2.5 py-1.5">{order.planningGroupLabel}</td>
                      <td className="whitespace-nowrap px-2.5 py-1.5">{order.activityTypeLabel}</td>
                      <td className="whitespace-nowrap px-2.5 py-1.5">{order.responsibleName || "Sem responsável"}</td>
                      <td className="whitespace-nowrap px-2.5 py-1.5 tabular-nums">
                        {order.openedAt ? new Date(order.openedAt).toLocaleDateString("pt-BR", { timeZone: "UTC" }) : "-"}
                      </td>
                      <td className="whitespace-nowrap px-2.5 py-1.5 text-right tabular-nums">{hoursText(order.workedHours ?? 0)}</td>
                      <td className="max-w-[220px] px-2.5 py-1.5">
                        <span className="line-clamp-1 text-zinc-400" title={order.technicalObjectRaw ?? order.equipmentCode ?? ""}>
                          {order.technicalObjectRaw ?? order.equipmentCode ?? "-"}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Peças                                                              */
/* ------------------------------------------------------------------ */

function Dot({ color }: { color: string }) {
  return <span className="mr-1.5 inline-block h-2 w-2 rounded-full align-middle" style={{ background: color }} aria-hidden />;
}

function pct(part: number, total: number): string {
  return total > 0 ? `${((part / total) * 100).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%` : "—";
}
