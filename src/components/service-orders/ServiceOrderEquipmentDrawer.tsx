"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, m } from "framer-motion";
import { ChevronRight, Loader2, X } from "lucide-react";
import { CHART_SERIES, GOLD, SEMANTIC } from "@/constants/theme";
import type {
  ServiceOrderEquipmentAnalysis,
  ServiceOrderEquipmentOrder,
  ServiceOrderEquipmentRankingItem,
  ServiceOrderEquipmentRepartimento,
  ServiceOrderEquipmentSlice
} from "@/types/service-orders";

/**
 * Drawer "Analisando — <máquina>": a investigação de UMA máquina sob os mesmos
 * filtros da página. Nada é calculado aqui além de filtrar/paginar a lista: tudo
 * vem de `getServiceOrderEquipmentAnalysis`, carregado só quando o drawer abre.
 *
 * Sem fallback: se a máquina não tem dados no recorte, o drawer diz isso — nunca
 * mostra números de outras máquinas no lugar.
 */
const OPEN_COLOR = SEMANTIC.danger.DEFAULT;
const CLOSED_COLOR = SEMANTIC.success.DEFAULT;
const CORRECTIVE_COLOR = CHART_SERIES.corretiva;
const PLANNED_COLOR = CHART_SERIES.preventiva;
const PAGE_SIZE = 20;
const REPARTIMENTOS_TOP = 8;

const int = (value: number) => value.toLocaleString("pt-BR");
const hoursText = (value: number) => `${value.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} h`;
const pct = (value: number | null) =>
  value === null ? "—" : `${value.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;
const dateText = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("pt-BR", { timeZone: "UTC" }) : "-");

type ListFilter = "all" | "open" | "closed" | "corrective" | "planned";

const LIST_FILTERS: Array<{ value: ListFilter; label: string }> = [
  { value: "all", label: "Todas" },
  { value: "open", label: "Abertas" },
  { value: "closed", label: "Fechadas" },
  { value: "corrective", label: "Corretivas" },
  { value: "planned", label: "Planejadas" }
];

const LIST_MATCHERS: Record<ListFilter, (order: ServiceOrderEquipmentOrder) => boolean> = {
  all: () => true,
  open: (order) => !order.closed,
  closed: (order) => order.closed,
  corrective: (order) => !order.programmedType,
  planned: (order) => Boolean(order.programmedType)
};

type LoadState =
  | { phase: "loading" }
  | { phase: "empty"; message: string }
  | { phase: "error"; message: string }
  | { phase: "ready"; data: ServiceOrderEquipmentAnalysis };

export function ServiceOrderEquipmentDrawer({
  item,
  filterQuery,
  periodLabel,
  onClose
}: {
  item: ServiceOrderEquipmentRankingItem;
  filterQuery: string;
  periodLabel: string;
  onClose: () => void;
}) {
  const [state, setState] = useState<LoadState>({ phase: "loading" });
  const panelRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const controller = new AbortController();
    const query = new URLSearchParams(filterQuery);
    query.set("machine", item.key);

    fetch(`/api/service-orders/equipment-analysis?${query.toString()}`, { signal: controller.signal })
      .then(async (response) => {
        const body = (await response.json().catch(() => null)) as
          | { ok: true; data: ServiceOrderEquipmentAnalysis }
          | { ok: false; message?: string }
          | null;
        if (response.status === 404) {
          setState({ phase: "empty", message: "Sem dados disponíveis para este equipamento no recorte atual." });
          return;
        }
        if (!response.ok || !body || !body.ok) {
          throw new Error((body && !body.ok && body.message) || "Falha ao carregar a análise do equipamento.");
        }
        setState({ phase: "ready", data: body.data });
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        setState({ phase: "error", message: error instanceof Error ? error.message : "Falha ao carregar." });
      });

    return () => controller.abort();
  }, [item.key, filterQuery]);

  // Escape fecha; a página de trás não rola junto; foco entra no drawer e volta ao sair.
  useEffect(() => {
    const previousFocus = document.activeElement as HTMLElement | null;
    panelRef.current?.focus();
    const onKey = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = previousOverflow;
      previousFocus?.focus?.();
    };
  }, [onClose]);

  const data = state.phase === "ready" ? state.data : null;

  return (
    <AnimatePresence>
      <m.div
        key="equipment-analysis"
        className="fixed inset-0 z-[60]"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.2 }}
      >
        <button type="button" aria-label="Fechar análise" onClick={onClose} className="absolute inset-0 bg-black/60 backdrop-blur-sm" />

        <m.aside
          ref={panelRef}
          role="dialog"
          aria-modal="true"
          aria-label={`Análise do equipamento ${item.name}`}
          tabIndex={-1}
          initial={{ x: "100%" }}
          animate={{ x: 0 }}
          exit={{ x: "100%" }}
          transition={{ duration: 0.3, ease: [0.22, 0.61, 0.36, 1] }}
          className="absolute right-0 top-0 flex h-full w-full max-w-[1120px] flex-col border-l border-gold/25 bg-ink text-champagne shadow-[0_0_60px_rgba(0,0,0,0.6)] outline-none"
        >
          {/* Contexto ativo: em reunião, ninguém pode ter dúvida do que está na tela. */}
          <header className="flex items-start justify-between gap-3 border-b border-gold/20 bg-ink px-5 py-4">
            <div className="min-w-0">
              <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-gold">Analisando</p>
              <h2 className="mt-1 truncate font-serif text-xl text-white" title={item.name}>
                {item.name}
              </h2>
              <p className="mt-0.5 text-xs text-zinc-400">
                <span className="text-zinc-500">Local de instalação:</span> {item.key}
                <span className="mx-2 text-zinc-600">·</span>
                <span className="text-zinc-500">Período:</span> {periodLabel}
              </p>
              <p className="mt-1 text-xs tabular-nums text-champagne">
                {int(data?.totals.total ?? item.total)} OS no recorte atual · {hoursText(data?.totals.hours ?? item.hours)} ·{" "}
                {int(data?.totals.open ?? item.open)} abertas
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Fechar"
              className="grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-gold/20 text-zinc-300 transition hover:border-gold/40 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-gold/70"
            >
              <X className="h-4 w-4" />
            </button>
          </header>

          <div className="flex-1 overflow-y-auto overflow-x-hidden px-5 py-4">
            {state.phase === "loading" ? (
              <p className="flex h-40 items-center justify-center gap-2 text-sm text-zinc-400">
                <Loader2 className="h-4 w-4 animate-spin text-gold" /> Carregando análise…
              </p>
            ) : state.phase === "empty" || state.phase === "error" ? (
              <p className="flex h-40 items-center justify-center px-6 text-center text-sm text-zinc-400">{state.message}</p>
            ) : (
              <AnalysisBody data={state.data} />
            )}
          </div>
        </m.aside>
      </m.div>
    </AnimatePresence>
  );
}

/* ------------------------------------------------------------------ */

function AnalysisBody({ data }: { data: ServiceOrderEquipmentAnalysis }) {
  const [repartimento, setRepartimento] = useState<ServiceOrderEquipmentRepartimento | null>(null);
  const { totals } = data;
  const derivedType = data.quality.withoutStructuredActivityType > 0;

  return (
    <div className="space-y-5">
      <section className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-6" aria-label="Indicadores da máquina">
        <Kpi label="Total de OS" value={int(totals.total)} />
        <Kpi label="OS abertas" value={int(totals.open)} tone="open" />
        <Kpi label="OS fechadas" value={int(totals.closed)} tone="closed" />
        <Kpi label="Horas apontadas" value={hoursText(totals.hours)} />
        <Kpi
          label="Horas médias por OS"
          value={totals.hoursPerOrder === null ? "—" : hoursText(totals.hoursPerOrder)}
          hint="Horas apontadas ÷ OS"
        />
        <Kpi
          label="Última OS"
          value={data.lastOrder ? dateText(data.lastOrder.openedAt) : "—"}
          hint={data.lastOrder ? `OS ${data.lastOrder.osNumber}` : undefined}
          title={data.lastOrder?.title}
        />
      </section>

      <section className="grid grid-cols-1 gap-2 sm:grid-cols-3" aria-label="Mais recorrentes">
        <Recurrent label="Grupo mais recorrente" slice={data.mostFrequent.planningGroup} total={totals.total} />
        <Recurrent
          label="Tipo mais recorrente"
          slice={data.mostFrequent.activityType}
          total={totals.total}
          note={derivedType ? "derivado" : undefined}
        />
        <Recurrent label="Responsável mais recorrente" slice={data.mostFrequent.responsible} total={totals.total} />
      </section>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Section title="Ordens por grupo de planejamento">
          <HBars slices={data.byPlanningGroup} total={totals.total} color={GOLD.DEFAULT} />
          <p className="mt-2 text-[10px] text-zinc-500">
            Normalizador central de grupo (o mesmo da aderência por área). Automação e grupo vazio entram em Outros.
          </p>
        </Section>

        <Section title="Corretivas x planejadas">
          <SplitBar
            segments={[
              { value: totals.corrective, color: CORRECTIVE_COLOR, label: "Corretivas" },
              { value: totals.planned, color: PLANNED_COLOR, label: "Planejadas" }
            ]}
            total={totals.total}
          />
          <div className="mt-2 flex justify-between text-[12px] tabular-nums">
            <span>
              <Dot color={CORRECTIVE_COLOR} /> Corretivas <strong className="text-white">{int(totals.corrective)}</strong>{" "}
              <span className="text-zinc-400">({pct(totals.correctivePercent)})</span>
            </span>
            <span>
              <Dot color={PLANNED_COLOR} /> Planejadas <strong className="text-white">{int(totals.planned)}</strong>{" "}
              <span className="text-zinc-400">({pct(totals.plannedPercent)})</span>
            </span>
          </div>
          <p className="mt-2 text-[10px] text-zinc-500">Planejada = plano programado (PL/PV no título), mesma regra da home.</p>

          <h4 className="mb-2 mt-4 text-[10px] font-bold uppercase tracking-wide text-gold">Status das ordens</h4>
          <HBars slices={data.byStatus} total={totals.total} colorOf={(slice) => (slice.key === "FECHADA" ? CLOSED_COLOR : OPEN_COLOR)} />
        </Section>
      </div>

      <Section
        title="Tipo de ordem"
        aside={
          derivedType ? (
            <span
              className="rounded border border-amber-400/40 bg-amber-400/10 px-1.5 py-0.5 text-[10px] text-amber-200"
              title="O campo estruturado Tipo de Atividade (planningActivityType) está vazio nestas ordens. O tipo foi derivado pela regra central do portal: plano PL/PV no título, palavras-chave do título/operação e grupo de planejamento; sem indício, corretiva."
            >
              Derivado em {int(data.quality.withoutStructuredActivityType)} de {int(totals.total)} OS
            </span>
          ) : null
        }
      >
        <HBars slices={data.byActivityType} total={totals.total} color={SEMANTIC.petroleum.on_dark} />
      </Section>

      <Section title="Evolução das ordens do equipamento">
        <Evolution data={data} />
      </Section>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <Section title="Onde ocorrem mais problemas">
          <Repartimentos data={data} selected={repartimento} onSelect={setRepartimento} />
        </Section>

        <Section title="Principais responsáveis">
          {data.responsibles.length ? (
            <HBars slices={data.responsibles.slice(0, 8)} total={totals.total} color={GOLD.DEFAULT} />
          ) : (
            <p className="text-[12px] text-zinc-400">Nenhuma OS com responsável cadastrado no recorte.</p>
          )}
          {data.quality.withoutResponsible > 0 ? (
            <p className="mt-2 text-[11px] text-amber-200/90">
              {int(data.quality.withoutResponsible)} OS sem responsável cadastrado — falha de cadastro, não um colaborador.
            </p>
          ) : null}
        </Section>
      </div>

      <OrdersList data={data} repartimento={repartimento} onClearRepartimento={() => setRepartimento(null)} />

      <section className="rounded-lg border border-white/10 px-3 py-2 text-[11px] text-zinc-400" aria-label="Qualidade dos dados">
        <span className="mr-3 font-bold uppercase tracking-wide text-zinc-500">Qualidade dos dados</span>
        <span className="mr-4">OS sem responsável: {int(data.quality.withoutResponsible)}</span>
        <span className="mr-4">OS sem tipo estruturado: {int(data.quality.withoutStructuredActivityType)}</span>
        <span className="mr-4">OS sem repartimento: {int(data.quality.withoutRepartimento)}</span>
        {data.quality.unregisteredRepartimento > 0 ? (
          <span>Repartimento sem cadastro de local: {int(data.quality.unregisteredRepartimento)}</span>
        ) : null}
      </section>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Seções                                                             */
/* ------------------------------------------------------------------ */

function Evolution({ data }: { data: ServiceOrderEquipmentAnalysis }) {
  const { points, granularity } = data.evolution;
  if (points.length < 2) {
    return (
      <p className="text-[12px] text-zinc-400">
        {granularity === "day"
          ? "Todas as OS do recorte caem no mesmo dia — não há evolução para mostrar."
          : "Todas as OS do recorte caem no mesmo mês — não há evolução para mostrar."}
      </p>
    );
  }
  const max = Math.max(...points.map((point) => point.orders), 1);

  return (
    <>
      <p className="mb-2 text-[10px] text-zinc-500">
        {granularity === "day" ? "Por dia de abertura (recorte de um mês)." : "Por mês de abertura."} Barra = quantidade de OS;
        número abaixo = horas apontadas.
      </p>
      <div className="flex items-end gap-[3px] overflow-x-auto pb-1" role="list" aria-label="Evolução das ordens">
        {points.map((point) => (
          <div
            key={point.key}
            role="listitem"
            className="flex min-w-[26px] flex-1 flex-col items-center gap-1"
            title={`${point.label}: ${int(point.orders)} OS · ${hoursText(point.hours)}`}
          >
            <span className="text-[10px] tabular-nums text-zinc-300">{point.orders || ""}</span>
            <span className="flex h-24 w-full items-end">
              <span
                className="block w-full rounded-t"
                style={{ height: `${(point.orders / max) * 100}%`, minHeight: point.orders ? 3 : 0, background: GOLD.DEFAULT }}
              />
            </span>
            <span className="text-[9px] tabular-nums text-zinc-500">{point.label}</span>
            <span className="text-[9px] tabular-nums text-zinc-400">{point.hours ? point.hours.toLocaleString("pt-BR", { maximumFractionDigits: 0 }) : "0"}h</span>
          </div>
        ))}
      </div>
    </>
  );
}

function Repartimentos({
  data,
  selected,
  onSelect
}: {
  data: ServiceOrderEquipmentAnalysis;
  selected: ServiceOrderEquipmentRepartimento | null;
  onSelect: (value: ServiceOrderEquipmentRepartimento | null) => void;
}) {
  const [showAll, setShowAll] = useState(false);
  const real = data.repartimentos.filter((item) => item.tag !== null);
  if (!real.length) {
    return (
      <p className="text-[12px] text-zinc-400">
        Todas as OS do recorte estão registradas na própria máquina — não há repartimento informado para comparar.
      </p>
    );
  }
  const max = Math.max(...data.repartimentos.map((item) => item.orders), 1);
  const none = data.repartimentos.find((item) => item.tag === null);
  // Os principais primeiro; o selecionado e o "sem repartimento" nunca somem da lista.
  const shown = showAll
    ? data.repartimentos
    : [
        ...real.filter((item, index) => index < REPARTIMENTOS_TOP || item.tag === selected?.tag),
        ...(none ? [none] : [])
      ];

  return (
    <>
    <ul className="space-y-1" aria-label="Repartimentos da máquina">
      {shown.map((item) => {
        const active = selected?.tag === item.tag;
        const label = item.tag === null ? "Sem repartimento informado" : item.description ?? item.code ?? item.tag;
        return (
          <li key={item.tag ?? "__none__"}>
            <button
              type="button"
              onClick={() => onSelect(active ? null : item)}
              aria-pressed={active}
              className={`grid w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 rounded-md px-2 py-1.5 text-left transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-gold/70 ${
                active ? "bg-gold/15" : "hover:bg-white/[0.05]"
              }`}
            >
              <span className="min-w-0">
                <span className={`block truncate text-[12px] ${item.tag === null ? "italic text-zinc-400" : "text-champagne"}`} title={label}>
                  {label}
                </span>
                {item.tag !== null ? (
                  <span className="block truncate text-[10px] text-zinc-500">
                    {item.code}
                    {item.description ? "" : " · sem descrição no cadastro de locais"}
                  </span>
                ) : (
                  <span className="block text-[10px] text-zinc-500">OS registradas na própria máquina</span>
                )}
                <span className="mt-1 block h-1.5 w-full overflow-hidden rounded-full bg-white/10" aria-hidden>
                  <span className="block h-full rounded-full" style={{ width: `${(item.orders / max) * 100}%`, background: GOLD.DEFAULT }} />
                </span>
              </span>
              <span className="text-right text-[11px] tabular-nums text-zinc-300">
                <strong className="text-[13px] text-white">{int(item.orders)}</strong> OS
                <span className="block text-[10px] text-zinc-500">
                  {int(item.open)} abertas · {hoursText(item.hours)}
                </span>
              </span>
            </button>
          </li>
        );
      })}
    </ul>
    {real.length > REPARTIMENTOS_TOP ? (
      <button
        type="button"
        onClick={() => setShowAll((value) => !value)}
        className="mt-2 rounded border border-white/15 px-2 py-1 text-[11px] text-zinc-300 hover:text-white"
      >
        {showAll ? `Mostrar os ${REPARTIMENTOS_TOP} principais` : `Ver todos os repartimentos (${real.length})`}
      </button>
    ) : null}
    </>
  );
}

function OrdersList({
  data,
  repartimento,
  onClearRepartimento
}: {
  data: ServiceOrderEquipmentAnalysis;
  repartimento: ServiceOrderEquipmentRepartimento | null;
  onClearRepartimento: () => void;
}) {
  const [filter, setFilter] = useState<ListFilter>("all");
  const [page, setPage] = useState(1);

  const filtered = useMemo(
    () =>
      data.orders.filter(
        (order) => LIST_MATCHERS[filter](order) && (!repartimento || order.repartimentoTag === repartimento.tag)
      ),
    [data.orders, filter, repartimento]
  );

  // Trocar de filtro ou repartimento volta para a 1ª página.
  useEffect(() => setPage(1), [filter, repartimento]);

  const pages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const current = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const repartimentoLabel = repartimento
    ? repartimento.tag === null
      ? "Sem repartimento informado"
      : repartimento.description ?? repartimento.code ?? repartimento.tag
    : null;

  return (
    <Section title="Ordens de serviço do equipamento">
      <nav aria-label="Recorte da lista" className="mb-2 flex flex-wrap items-center gap-1 text-[11px] text-zinc-400">
        <button type="button" onClick={onClearRepartimento} className="hover:text-white disabled:cursor-default" disabled={!repartimento}>
          {data.name}
        </button>
        {repartimentoLabel ? (
          <>
            <ChevronRight className="h-3 w-3" />
            <span className="text-champagne">{repartimentoLabel}</span>
            <button type="button" onClick={onClearRepartimento} className="ml-2 rounded border border-white/15 px-1.5 text-[10px] hover:text-white">
              voltar para a máquina
            </button>
          </>
        ) : null}
        <ChevronRight className="h-3 w-3" />
        <span className="tabular-nums text-champagne">{int(filtered.length)} OS</span>
      </nav>

      <div className="mb-2 inline-flex flex-wrap rounded-md border border-white/15 p-0.5" role="group" aria-label="Filtrar ordens">
        {LIST_FILTERS.map((option) => (
          <button
            key={option.value}
            type="button"
            aria-pressed={filter === option.value}
            onClick={() => setFilter(option.value)}
            className={`rounded px-2.5 py-1 text-[11px] font-semibold transition ${
              filter === option.value ? "bg-gold/20 text-white" : "text-zinc-400 hover:text-white"
            }`}
          >
            {option.label}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <p className="py-6 text-center text-[12px] text-zinc-400">Nenhuma OS nesta combinação de filtros.</p>
      ) : (
        <>
          <div className="overflow-x-auto rounded-md border border-white/10">
            <table className="w-full min-w-[980px] text-left text-[11px]">
              <thead className="bg-white/[0.04] text-[10px] uppercase tracking-wide text-zinc-400">
                <tr>
                  <th className="px-2.5 py-2 font-semibold">Nº OS</th>
                  <th className="px-2.5 py-2 font-semibold">Título</th>
                  <th className="px-2.5 py-2 font-semibold">Data-base</th>
                  <th className="px-2.5 py-2 font-semibold">Status</th>
                  <th className="px-2.5 py-2 font-semibold">Grupo</th>
                  <th className="px-2.5 py-2 font-semibold">Tipo</th>
                  <th className="px-2.5 py-2 font-semibold">Responsável</th>
                  <th className="px-2.5 py-2 text-right font-semibold">Horas</th>
                  <th className="px-2.5 py-2 font-semibold">Local de instalação</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.06] text-zinc-300">
                {current.map((order) => (
                  <tr key={order.osNumber} className="hover:bg-white/[0.03]">
                    <td className="whitespace-nowrap px-2.5 py-1.5 font-semibold tabular-nums text-white">{order.osNumber}</td>
                    <td className="max-w-[260px] px-2.5 py-1.5">
                      <span className="line-clamp-1" title={order.title}>
                        {order.title}
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-2.5 py-1.5 tabular-nums">
                      {dateText(order.openedAt)}
                      {order.daysOpen !== null ? <span className="block text-[10px] text-rose-300">{int(order.daysOpen)} dias em aberto</span> : null}
                    </td>
                    <td className="whitespace-nowrap px-2.5 py-1.5">
                      <Dot color={order.closed ? CLOSED_COLOR : OPEN_COLOR} />
                      {order.closed ? "Fechada" : statusText(order.status)}
                    </td>
                    <td className="whitespace-nowrap px-2.5 py-1.5">{order.planningGroupLabel}</td>
                    <td className="whitespace-nowrap px-2.5 py-1.5">
                      <Dot color={order.programmedType ? PLANNED_COLOR : CORRECTIVE_COLOR} />
                      {order.programmedType ? `Planejada (${order.programmedType})` : "Corretiva"}
                      <span className="block text-[10px] text-zinc-500">{order.activityTypeLabel}</span>
                    </td>
                    <td className="whitespace-nowrap px-2.5 py-1.5">
                      {order.responsibleName ?? <span className="italic text-amber-200/80">Sem responsável</span>}
                    </td>
                    <td className="whitespace-nowrap px-2.5 py-1.5 text-right tabular-nums">{hoursText(order.hours)}</td>
                    <td className="max-w-[220px] px-2.5 py-1.5">
                      <span className="line-clamp-1 text-zinc-400" title={order.locationTag}>
                        {order.locationTag}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {pages > 1 ? (
            <div className="mt-2 flex items-center justify-end gap-2 text-[11px] text-zinc-400">
              <button
                type="button"
                onClick={() => setPage((value) => Math.max(1, value - 1))}
                disabled={page === 1}
                className="rounded border border-white/15 px-2 py-1 hover:text-white disabled:opacity-40"
              >
                Anterior
              </button>
              <span className="tabular-nums">
                Página {page} de {pages}
              </span>
              <button
                type="button"
                onClick={() => setPage((value) => Math.min(pages, value + 1))}
                disabled={page === pages}
                className="rounded border border-white/15 px-2 py-1 hover:text-white disabled:opacity-40"
              >
                Próxima
              </button>
            </div>
          ) : null}
        </>
      )}
    </Section>
  );
}

/* ------------------------------------------------------------------ */
/* Peças visuais                                                      */
/* ------------------------------------------------------------------ */

function statusText(status: ServiceOrderEquipmentOrder["status"]) {
  return (
    {
      ABERTA: "Aberta",
      LIBERADA: "Liberada",
      EM_ANDAMENTO: "Em andamento",
      AGUARDANDO_MATERIAL: "Aguardando material",
      FECHADA: "Fechada",
      CANCELADA: "Cancelada"
    } as const
  )[status];
}

function Section({ title, aside, children }: { title: string; aside?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="rounded-lg border border-white/10 bg-white/[0.02] p-3">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-[10px] font-bold uppercase tracking-wide text-gold">{title}</h3>
        {aside}
      </div>
      {children}
    </section>
  );
}

function Kpi({
  label,
  value,
  hint,
  title,
  tone
}: {
  label: string;
  value: string;
  hint?: string;
  title?: string;
  tone?: "open" | "closed";
}) {
  return (
    <div className="min-w-0 rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2" title={title}>
      <p className="text-[9px] font-bold uppercase tracking-wide text-zinc-400">{label}</p>
      <p
        className={`truncate text-lg font-semibold tabular-nums ${
          tone === "open" ? "text-rose-300" : tone === "closed" ? "text-emerald-300" : "text-white"
        }`}
      >
        {value}
      </p>
      {hint ? <p className="truncate text-[10px] text-zinc-500">{hint}</p> : null}
    </div>
  );
}

function Recurrent({
  label,
  slice,
  total,
  note
}: {
  label: string;
  slice: ServiceOrderEquipmentSlice | null;
  total: number;
  note?: string;
}) {
  return (
    <div className="min-w-0 rounded-lg border border-white/10 px-3 py-2">
      <p className="text-[9px] font-bold uppercase tracking-wide text-zinc-400">
        {label}
        {note ? <span className="ml-1 normal-case text-amber-200/80">({note})</span> : null}
      </p>
      {slice ? (
        <p className="truncate text-[13px] text-white" title={slice.label}>
          {slice.label} <span className="tabular-nums text-zinc-400">· {int(slice.count)} de {int(total)} OS</span>
        </p>
      ) : (
        <p className="text-[12px] text-zinc-500">Sem dado confiável no recorte</p>
      )}
    </div>
  );
}

/** Barras horizontais com o número escrito — nunca só a cor. */
function HBars({
  slices,
  total,
  color,
  colorOf
}: {
  slices: ServiceOrderEquipmentSlice[];
  total: number;
  color?: string;
  colorOf?: (slice: ServiceOrderEquipmentSlice) => string;
}) {
  if (!slices.length) return <p className="text-[12px] text-zinc-400">Sem dados disponíveis para este equipamento no recorte atual.</p>;
  const max = Math.max(...slices.map((slice) => slice.count), 1);
  return (
    <ul className="space-y-1.5">
      {slices.map((slice) => (
        <li key={slice.key} className="grid grid-cols-[minmax(90px,140px)_minmax(0,1fr)_auto] items-center gap-2 text-[12px]">
          <span className="truncate text-champagne" title={slice.label}>
            {slice.label}
          </span>
          <span className="block h-2 overflow-hidden rounded-full bg-white/10" aria-hidden>
            <span
              className="block h-full rounded-full"
              style={{ width: `${(slice.count / max) * 100}%`, background: colorOf ? colorOf(slice) : color }}
            />
          </span>
          <span className="w-20 text-right tabular-nums text-zinc-300">
            <strong className="text-white">{int(slice.count)}</strong>{" "}
            <span className="text-[10px] text-zinc-500">{pct(total ? (slice.count / total) * 100 : null)}</span>
          </span>
        </li>
      ))}
    </ul>
  );
}

function SplitBar({ segments, total }: { segments: Array<{ value: number; color: string; label: string }>; total: number }) {
  return (
    <span className="flex h-3 w-full gap-[2px] overflow-hidden rounded bg-white/10" aria-hidden>
      {segments
        .filter((segment) => segment.value > 0)
        .map((segment) => (
          <span
            key={segment.label}
            className="block h-full"
            style={{ width: `${(segment.value / Math.max(total, 1)) * 100}%`, minWidth: 3, background: segment.color }}
          />
        ))}
    </span>
  );
}

function Dot({ color }: { color: string }) {
  return <span className="mr-1.5 inline-block h-2 w-2 rounded-full align-middle" style={{ background: color }} aria-hidden />;
}
