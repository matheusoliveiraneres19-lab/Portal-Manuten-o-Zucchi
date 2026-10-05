"use client";

import { useEffect, useState } from "react";
import { Loader2, X } from "lucide-react";
import { EmptyState } from "@/components/EmptyState";
import { CHART_SERIES, SEMANTIC, TOOLTIP } from "@/constants/theme";
import type { PlanningGroupKey } from "@/utils/service-order-planning";
import type {
  ServiceOrderAdherenceByArea,
  ServiceOrderAreaAdherence,
  ServiceOrderAreaOrdersResult,
  ServiceOrderAreaStatusFilter,
  ServiceOrderAreaTypeFilter,
  ServiceOrderStatusLabel
} from "@/types/service-orders";

/**
 * "ADERÊNCIA DE EXECUÇÃO POR ÁREA" — painel único da análise por área.
 *
 * Concentra o que antes eram três painéis (OS por status / por grupo de
 * planejamento / corretivas x planejadas). Nada é calculado aqui: tudo chega pronto
 * de `getServiceOrderDashboard`, na mesma varredura da tabela.
 *
 * Layout híbrido: uma linha por área, com DUAS barras 100% — uma por dimensão.
 * Barras normalizadas evitam que o volume de Lubrificação (centenas de ordens por
 * mês) achate Usinagem ou Terceiros; os números absolutos ficam escritos ao lado.
 *
 * Duas dimensões independentes sobre o mesmo conjunto de ordens:
 *   STATUS          → abertas (vermelho) x fechadas (verde)
 *   CLASSIFICAÇÃO   → corretivas (vermelho) x planejadas (azul)
 * O vermelho aparece nas duas, então cada barra fica sob o cabeçalho da sua
 * dimensão e com o rótulo escrito — a cor nunca é a única pista.
 */
const OPEN_COLOR = SEMANTIC.danger.DEFAULT;
const CLOSED_COLOR = SEMANTIC.success.DEFAULT;
const CORRECTIVE_COLOR = CHART_SERIES.corretiva;
const PLANNED_COLOR = CHART_SERIES.preventiva;

/** Volume mínimo para uma área disputar "melhor" / "menor aderência". */
const MIN_RANKED_VOLUME = 10;
const RANKING_HINT = `Entre áreas com ${MIN_RANKED_VOLUME}+ OS`;

const int = (value: number) => value.toLocaleString("pt-BR");
const pct = (value: number | null) =>
  value === null ? "—" : `${value.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;

export function ServiceOrderAreaAdherenceSection({
  adherence,
  filterQuery,
  className = ""
}: {
  adherence: ServiceOrderAdherenceByArea;
  /** Query string dos filtros aplicados (a mesma da URL da aba). */
  filterQuery: string;
  className?: string;
}) {
  const [selected, setSelected] = useState<PlanningGroupKey | null>(null);
  const selectedArea = adherence.areas.find((area) => area.key === selected) ?? null;

  // Filtro mudou e a área sumiu do recorte: fecha o detalhe em vez de mostrar dados velhos.
  useEffect(() => {
    if (selected && !selectedArea) setSelected(null);
  }, [selected, selectedArea]);

  const toggle = (key: PlanningGroupKey) => setSelected((current) => (current === key ? null : key));

  return (
    <>
      <AdherencePanel className={className} adherence={adherence} selected={selected} onSelect={toggle} />
      {selectedArea ? (
        <AreaDetailPanel
          key={`${selectedArea.key}|${filterQuery}`}
          area={selectedArea}
          filterQuery={filterQuery}
          onClose={() => setSelected(null)}
        />
      ) : null}
    </>
  );
}

/* ------------------------------------------------------------------ */
/* Painel                                                             */
/* ------------------------------------------------------------------ */

function AdherencePanel({
  adherence,
  selected,
  onSelect,
  className
}: {
  adherence: ServiceOrderAdherenceByArea;
  selected: PlanningGroupKey | null;
  onSelect: (key: PlanningGroupKey) => void;
  className: string;
}) {
  const { areas } = adherence;
  // "Outros" não disputa melhor/pior: é sobra de classificação, não uma equipe. Área
  // com poucas OS também não — 1 OS fechada viraria "melhor área · 100%".
  const ranked = areas.filter(
    (area) => area.key !== "OUTROS" && area.adherence !== null && area.total >= MIN_RANKED_VOLUME
  );
  const best = ranked.length > 1 ? ranked.reduce((a, b) => ((b.adherence ?? 0) > (a.adherence ?? 0) ? b : a)) : null;
  const worst = ranked.length > 1 ? ranked.reduce((a, b) => ((b.adherence ?? 0) < (a.adherence ?? 0) ? b : a)) : null;

  return (
    <article className={`panel flex h-full flex-col rounded-lg p-4 ${className}`}>
      <h3 className="text-[11px] font-extrabold uppercase tracking-wide text-gold-deep">
        Aderência de execução por área
      </h3>
      <p className="text-[11px] text-zinc-500">Abertas x fechadas e composição de corretivas x planejadas por área.</p>

      {areas.length === 0 ? (
        <EmptyState title="Sem OS no período" description="Ajuste os filtros para visualizar a aderência por área." />
      ) : (
        <>
          <div className="mt-3 grid grid-cols-2 gap-2 lg:grid-cols-4">
            <MiniStat label="Aderência geral" value={pct(adherence.adherence)} hint={`${int(adherence.total)} OS`} />
            <MiniStat
              label="Corretivas"
              value={pct(adherence.correctivePercent)}
              hint={`${int(adherence.corrective)} corretivas · ${int(adherence.planned)} planejadas`}
            />
            <MiniStat
              label="Melhor aderência"
              value={best ? pct(best.adherence) : "—"}
              hint={best ? `${best.area} · ${int(best.total)} OS` : RANKING_HINT}
              title={RANKING_HINT}
            />
            <MiniStat
              label="Menor aderência"
              value={worst ? pct(worst.adherence) : "—"}
              hint={worst ? `${worst.area} · ${int(worst.total)} OS` : RANKING_HINT}
              title={RANKING_HINT}
            />
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-1 text-[11px] text-zinc-600">
            <span className="flex items-center gap-2">
              <span className="font-bold uppercase tracking-wide text-zinc-500">Status</span>
              <LegendSwatch color={OPEN_COLOR} label="Abertas" />
              <LegendSwatch color={CLOSED_COLOR} label="Fechadas" />
            </span>
            <span className="flex items-center gap-2">
              <span className="font-bold uppercase tracking-wide text-zinc-500">Classificação</span>
              <LegendSwatch color={CORRECTIVE_COLOR} label="Corretivas" />
              <LegendSwatch color={PLANNED_COLOR} label="Planejadas (PL/PV)" />
            </span>
          </div>

          <div className="mt-3" role="table" aria-label="Aderência e composição por área">
            <div
              role="row"
              className="hidden grid-cols-[minmax(120px,1fr)_minmax(0,2.2fr)_88px_minmax(0,2.2fr)] gap-4 border-b border-zinc-300/60 px-2 pb-1.5 text-[9px] font-bold uppercase tracking-wide text-zinc-500 md:grid"
            >
              <span role="columnheader">Área</span>
              <span role="columnheader">Status · abertas x fechadas</span>
              <span role="columnheader" className="text-right">
                Aderência
              </span>
              <span role="columnheader">Classificação · corretivas x planejadas</span>
            </div>
            <div className="divide-y divide-zinc-200/80">
              {areas.map((area) => (
                <AreaRow key={area.key} area={area} active={selected === area.key} onSelect={onSelect} />
              ))}
            </div>
          </div>

          <p className="mt-3 text-[10px] leading-snug text-zinc-500">
            Contagem por ordem de manutenção ({int(adherence.total)} ordens; a tabela lista as{" "}
            {int(adherence.operationRows)} operações). Fechada = todas as operações tecnicamente encerradas; aderência =
            fechadas ÷ total da área. Planejada = plano programado (PL/PV no título), mesma regra da home. Clique em uma
            área para analisar as ordens.
          </p>

          {adherence.periodInProgress ? (
            <p className="mt-1 text-[10px] leading-snug text-amber-700">
              {adherence.singleMonth ? "Mês em andamento" : "Período inclui dias em andamento"} — os valores de
              aderência podem variar até o fechamento do período.
            </p>
          ) : null}
        </>
      )}
    </article>
  );
}

function AreaRow({
  area,
  active,
  onSelect
}: {
  area: ServiceOrderAreaAdherence;
  active: boolean;
  onSelect: (key: PlanningGroupKey) => void;
}) {
  return (
    <div role="row" className="group relative">
      <button
        type="button"
        onClick={() => onSelect(area.key)}
        aria-pressed={active}
        aria-label={`${area.area}: ${int(area.total)} OS, ${int(area.open)} abertas, ${int(area.closed)} fechadas, aderência ${pct(area.adherence)}, ${int(area.corrective)} corretivas, ${int(area.planned)} planejadas`}
        className={`grid w-full grid-cols-1 gap-2 rounded-md px-2 py-2.5 text-left transition md:grid-cols-[minmax(120px,1fr)_minmax(0,2.2fr)_88px_minmax(0,2.2fr)] md:items-center md:gap-4 ${
          active ? "bg-gold/[0.12] ring-1 ring-gold/50" : "hover:bg-gold/[0.06]"
        }`}
      >
        <span role="cell" className="flex items-baseline justify-between gap-2 md:block">
          <span className="block text-[13px] font-bold text-zinc-900">{area.area}</span>
          <span className="block text-[11px] tabular-nums text-zinc-500">{int(area.total)} OS</span>
        </span>

        <span role="cell" className="block">
          <SplitBar
            segments={[
              { value: area.open, color: OPEN_COLOR },
              { value: area.closed, color: CLOSED_COLOR }
            ]}
            total={area.total}
          />
          <span className="mt-1 flex justify-between text-[10px] tabular-nums text-zinc-600">
            <span>{int(area.open)} abertas</span>
            <span>{int(area.closed)} fechadas</span>
          </span>
        </span>

        <span role="cell" className="flex items-baseline justify-between md:block md:text-right">
          <span className="text-[10px] uppercase tracking-wide text-zinc-500 md:hidden">Aderência</span>
          <span className="text-[17px] font-extrabold tabular-nums text-gold-deep">{pct(area.adherence)}</span>
        </span>

        <span role="cell" className="block">
          <SplitBar
            segments={[
              { value: area.corrective, color: CORRECTIVE_COLOR },
              { value: area.planned, color: PLANNED_COLOR }
            ]}
            total={area.total}
          />
          <span className="mt-1 flex justify-between text-[10px] tabular-nums text-zinc-600">
            <span>{pct(area.correctivePercent)} corretivas</span>
            <span>{pct(area.plannedPercent)} planejadas</span>
          </span>
        </span>
      </button>

      <AreaTooltip area={area} />
    </div>
  );
}

/** Barra 100% com 2px de respiro entre os segmentos; segmento zero não é desenhado. */
function SplitBar({ segments, total }: { segments: Array<{ value: number; color: string }>; total: number }) {
  const visible = segments.filter((segment) => segment.value > 0);
  return (
    <span className="flex h-3 w-full gap-[2px] overflow-hidden rounded bg-black/[0.06]" aria-hidden>
      {visible.map((segment, index) => (
        <span
          key={index}
          className="block h-full first:rounded-l last:rounded-r"
          style={{ width: `${(segment.value / total) * 100}%`, minWidth: 3, background: segment.color }}
        />
      ))}
    </span>
  );
}

function AreaTooltip({ area }: { area: ServiceOrderAreaAdherence }) {
  return (
    <div
      role="tooltip"
      className="pointer-events-none absolute left-1/2 top-full z-30 hidden w-60 -translate-x-1/2 rounded-lg px-3 py-2 text-xs shadow-lg group-hover:block md:left-[38%]"
      style={{ background: TOOLTIP.background, border: `1px solid ${TOOLTIP.border}`, color: TOOLTIP.text }}
    >
      <p className="font-bold uppercase" style={{ color: TOOLTIP.title }}>
        {area.area}
      </p>
      <p className="mb-1.5">Total de OS: {int(area.total)}</p>
      <p className="text-[10px] font-bold uppercase opacity-70">Status</p>
      <p>Abertas: {int(area.open)}</p>
      <p>Fechadas: {int(area.closed)}</p>
      <p className="mb-1.5 font-semibold">Aderência: {pct(area.adherence)}</p>
      <p className="text-[10px] font-bold uppercase opacity-70">Classificação</p>
      <p>
        Corretivas: {int(area.corrective)} ({pct(area.correctivePercent)})
      </p>
      <p>
        Planejadas: {int(area.planned)} ({pct(area.plannedPercent)})
      </p>
      <p className="mt-1.5 text-[10px] opacity-70">Clique para analisar as ordens</p>
    </div>
  );
}

function MiniStat({ label, value, hint, title }: { label: string; value: string; hint: string; title?: string }) {
  return (
    <div className="min-w-0 rounded-md border border-zinc-300/60 bg-white/50 px-2.5 py-1.5" title={title}>
      <p className="text-[9px] font-bold uppercase tracking-wide text-zinc-500">{label}</p>
      <p className="truncate text-[13px] font-extrabold tabular-nums text-zinc-900">{value}</p>
      <p className="truncate text-[10px] tabular-nums text-zinc-500" title={hint}>
        {hint}
      </p>
    </div>
  );
}

function LegendSwatch({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="h-2.5 w-2.5 rounded-sm" style={{ background: color }} aria-hidden />
      {label}
    </span>
  );
}

/* ------------------------------------------------------------------ */
/* Detalhe da área                                                    */
/* ------------------------------------------------------------------ */

const STATUS_TEXT: Record<ServiceOrderStatusLabel, string> = {
  ABERTA: "Aberta",
  LIBERADA: "Liberada",
  EM_ANDAMENTO: "Em andamento",
  AGUARDANDO_MATERIAL: "Aguardando material",
  FECHADA: "Fechada",
  CANCELADA: "Cancelada"
};

const STATUS_FILTER_OPTIONS: Array<{ value: ServiceOrderAreaStatusFilter; label: string }> = [
  { value: "all", label: "Todas" },
  { value: "open", label: "Abertas" },
  { value: "closed", label: "Fechadas" }
];

const TYPE_FILTER_OPTIONS: Array<{ value: ServiceOrderAreaTypeFilter; label: string }> = [
  { value: "all", label: "Todas" },
  { value: "corrective", label: "Corretivas" },
  { value: "planned", label: "Planejadas" }
];

type DetailState =
  | { phase: "loading" }
  | { phase: "error"; message: string }
  | { phase: "ready"; data: ServiceOrderAreaOrdersResult };

function AreaDetailPanel({
  area,
  filterQuery,
  onClose
}: {
  area: ServiceOrderAreaAdherence;
  filterQuery: string;
  onClose: () => void;
}) {
  // O gestor chega aqui para saber o que falta encerrar: abre em "Abertas".
  const [status, setStatus] = useState<ServiceOrderAreaStatusFilter>(area.open > 0 ? "open" : "all");
  const [type, setType] = useState<ServiceOrderAreaTypeFilter>("all");
  const [state, setState] = useState<DetailState>({ phase: "loading" });

  useEffect(() => {
    const controller = new AbortController();
    const query = new URLSearchParams(filterQuery);
    query.set("area", area.key);
    query.set("detailStatus", status);
    query.set("detailType", type);
    setState({ phase: "loading" });

    fetch(`/api/service-orders/adherence-by-area?${query.toString()}`, { signal: controller.signal })
      .then(async (response) => {
        const body = (await response.json().catch(() => null)) as
          | { ok: true; data: ServiceOrderAreaOrdersResult }
          | { ok: false; message?: string }
          | null;
        if (!response.ok || !body || !body.ok) {
          throw new Error((body && !body.ok && body.message) || "Falha ao carregar as OS da área.");
        }
        setState({ phase: "ready", data: body.data });
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        setState({ phase: "error", message: error instanceof Error ? error.message : "Falha ao carregar." });
      });

    return () => controller.abort();
  }, [area.key, filterQuery, status, type]);

  return (
    <article className="panel flex flex-col rounded-lg p-4 xl:col-span-12" aria-label={`Análise — ${area.area}`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-[11px] font-extrabold uppercase tracking-wide text-gold-deep">Análise — {area.area}</h3>
          <p className="text-[11px] text-zinc-500">
            Uma linha por ordem de manutenção. Abertas primeiro, das mais antigas para as mais novas.
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Fechar análise"
          className="grid h-8 w-8 shrink-0 place-items-center rounded-md border border-zinc-300/70 text-zinc-600 transition hover:border-gold/50 hover:text-zinc-900"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
        <MiniStat label="Total de OS" value={int(area.total)} hint="Ordens da área no recorte" />
        <MiniStat label="Abertas" value={int(area.open)} hint="Alguma operação pendente" />
        <MiniStat label="Fechadas" value={int(area.closed)} hint="Tecnicamente encerradas" />
        <MiniStat label="Aderência" value={pct(area.adherence)} hint="Fechadas ÷ total" />
        <MiniStat label="Corretivas" value={int(area.corrective)} hint={pct(area.correctivePercent)} />
        <MiniStat label="Planejadas" value={int(area.planned)} hint={pct(area.plannedPercent)} />
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2">
        <Segmented label="Status" options={STATUS_FILTER_OPTIONS} value={status} onChange={setStatus} />
        <Segmented label="Tipo" options={TYPE_FILTER_OPTIONS} value={type} onChange={setType} />
        {state.phase === "ready" ? (
          <span className="text-[11px] tabular-nums text-zinc-500">{int(state.data.totalMatching)} ordens</span>
        ) : null}
      </div>

      <div className="mt-3">
        {state.phase === "loading" ? (
          <p className="flex items-center gap-2 py-6 text-xs text-zinc-500">
            <Loader2 className="h-4 w-4 animate-spin" /> Carregando ordens…
          </p>
        ) : state.phase === "error" ? (
          <p className="py-6 text-xs text-rose-700">{state.message}</p>
        ) : state.data.totalMatching === 0 ? (
          <EmptyState title="Nenhuma ordem nessa combinação" description="Troque os filtros de status ou tipo acima." />
        ) : (
          <AreaOrdersTable data={state.data} />
        )}
      </div>
    </article>
  );
}

function Segmented<T extends string>({
  label,
  options,
  value,
  onChange
}: {
  label: string;
  options: Array<{ value: T; label: string }>;
  value: T;
  onChange: (value: T) => void;
}) {
  return (
    <div className="flex items-center gap-2" role="group" aria-label={label}>
      <span className="text-[10px] font-bold uppercase tracking-wide text-zinc-500">{label}</span>
      <div className="inline-flex rounded-md border border-zinc-300/70 bg-white/50 p-0.5">
        {options.map((option) => (
          <button
            key={option.value}
            type="button"
            aria-pressed={value === option.value}
            onClick={() => onChange(option.value)}
            className={`rounded px-2.5 py-1 text-[11px] font-semibold transition ${
              value === option.value ? "bg-gold/20 text-zinc-900" : "text-zinc-600 hover:text-zinc-900"
            }`}
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function AreaOrdersTable({ data }: { data: ServiceOrderAreaOrdersResult }) {
  return (
    <>
      {data.totalMatching > data.items.length ? (
        <p className="mb-2 text-[11px] text-zinc-500">
          Exibindo as primeiras {int(data.items.length)} de {int(data.totalMatching)} ordens. Use os filtros da página
          para refinar.
        </p>
      ) : null}
      <div className="max-h-[420px] overflow-auto rounded-md border border-zinc-300/60">
        <table className="w-full min-w-[900px] text-left text-[11px]">
          <thead className="sticky top-0 bg-[#F4EEDF] text-[10px] uppercase tracking-wide text-zinc-600">
            <tr>
              <th className="px-2.5 py-2 font-semibold">OS</th>
              <th className="px-2.5 py-2 font-semibold">Título</th>
              <th className="px-2.5 py-2 font-semibold">Equipamento</th>
              <th className="px-2.5 py-2 font-semibold">Responsável</th>
              <th className="px-2.5 py-2 font-semibold">Status</th>
              <th className="px-2.5 py-2 font-semibold">Tipo</th>
              <th className="px-2.5 py-2 font-semibold">Data-base</th>
              <th className="px-2.5 py-2 text-right font-semibold">Dias em aberto</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-200/80 text-zinc-700">
            {data.items.map((order) => (
              <tr key={order.osNumber} className="hover:bg-gold/[0.06]">
                <td className="whitespace-nowrap px-2.5 py-1.5 font-semibold tabular-nums text-zinc-900">{order.osNumber}</td>
                <td className="max-w-[280px] px-2.5 py-1.5">
                  <span className="line-clamp-1" title={order.title}>
                    {order.title}
                  </span>
                  {order.totalOperations > 1 && order.openOperations > 0 ? (
                    <span className="text-[10px] text-zinc-500">
                      {int(order.openOperations)} de {int(order.totalOperations)} operações pendentes
                    </span>
                  ) : null}
                </td>
                <td className="max-w-[220px] px-2.5 py-1.5">
                  <span className="line-clamp-1" title={order.technicalObject}>
                    {order.technicalObject}
                  </span>
                </td>
                <td className="whitespace-nowrap px-2.5 py-1.5">{order.responsibleName || "SEM RESPONSÁVEL"}</td>
                <td className="whitespace-nowrap px-2.5 py-1.5" title={order.statusSapRaw ?? undefined}>
                  <StatusDot color={order.closed ? CLOSED_COLOR : OPEN_COLOR} />
                  {order.closed ? "Fechada" : STATUS_TEXT[order.status] ?? order.status}
                </td>
                <td className="whitespace-nowrap px-2.5 py-1.5">
                  <StatusDot color={order.programmedType ? PLANNED_COLOR : CORRECTIVE_COLOR} />
                  {order.programmedType ? `Planejada (${order.programmedType})` : "Corretiva"}
                </td>
                <td className="whitespace-nowrap px-2.5 py-1.5 tabular-nums">
                  {order.openedAt ? new Date(order.openedAt).toLocaleDateString("pt-BR", { timeZone: "UTC" }) : "-"}
                </td>
                <td className="whitespace-nowrap px-2.5 py-1.5 text-right font-semibold tabular-nums">
                  {order.closed ? <span className="font-normal text-zinc-400">encerrada</span> : order.daysOpen === null ? "-" : int(order.daysOpen)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

function StatusDot({ color }: { color: string }) {
  return <span className="mr-1.5 inline-block h-2 w-2 rounded-full align-middle" style={{ background: color }} aria-hidden />;
}
