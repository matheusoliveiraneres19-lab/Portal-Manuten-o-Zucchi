"use client";

import { useEffect, useState } from "react";
import { Bar, BarChart, CartesianGrid, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Loader2, X } from "lucide-react";
import { EmptyState } from "@/components/EmptyState";
import { SEMANTIC, TOOLTIP } from "@/constants/theme";
import type { PlanningGroupKey } from "@/utils/service-order-planning";
import type {
  ServiceOrderAdherenceByArea,
  ServiceOrderAreaAdherence,
  ServiceOrderOpenByAreaResult,
  ServiceOrderStatusLabel
} from "@/types/service-orders";

/**
 * "ADERÊNCIA DE EXECUÇÃO POR ÁREA" — substitui o antigo "OS por status".
 *
 * Nada é calculado aqui: abertas, fechadas e aderência chegam prontas de
 * `getServiceOrderDashboard` (mesma varredura da tabela). O clique numa área abre,
 * logo abaixo, as OS ainda não encerradas dela — buscadas sob os mesmos filtros.
 *
 * Vermelho x verde é o par semântico do portal; como os dois se aproximam para
 * daltônicos, a identidade nunca depende só da cor: ordem fixa (Abertas sempre à
 * esquerda), legenda e o número escrito sobre cada barra.
 */
const OPEN_COLOR = SEMANTIC.danger.DEFAULT;
const CLOSED_COLOR = SEMANTIC.success.DEFAULT;

/** Volume mínimo para uma área disputar "melhor" / "menor aderência". */
const MIN_RANKED_VOLUME = 10;
const RANKING_HINT = `Entre áreas com ${MIN_RANKED_VOLUME}+ OS`;

/** Rótulo curto no eixo — o nome inteiro de "Serviço Terceiro" não cabe sobre as barras. */
const AXIS_LABEL: Record<PlanningGroupKey, string> = {
  MEC: "Mecânica",
  ELE: "Elétrica",
  SERVICO_TERCEIRO: "Terceiros",
  LUB: "Lubrificação",
  USINAGEM: "Usinagem",
  OUTROS: "Outros"
};

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
      <AdherenceChartCard
        className={className}
        adherence={adherence}
        selected={selected}
        onSelect={toggle}
      />
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
/* Gráfico                                                            */
/* ------------------------------------------------------------------ */

function AdherenceChartCard({
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
      <p className="text-[11px] text-zinc-500">
        Ordens abertas x fechadas no período e percentual de aderência por área.
      </p>

      {areas.length === 0 ? (
        <EmptyState title="Sem OS no período" description="Ajuste os filtros para visualizar a aderência por área." />
      ) : (
        <>
          <div className="mt-3 grid grid-cols-3 gap-2">
            <MiniStat label="Aderência geral" value={pct(adherence.adherence)} hint={`${int(adherence.total)} OS`} />
            <MiniStat
              label="Melhor área"
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

          <div className="mt-3 flex items-center gap-4 text-[11px] text-zinc-600">
            <LegendSwatch color={OPEN_COLOR} label="Abertas (não encerradas)" />
            <LegendSwatch color={CLOSED_COLOR} label="Fechadas (tecnicamente encerradas)" />
          </div>

          <div className="mt-1 h-[260px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={areas} margin={{ top: 4, right: 4, bottom: 4, left: -16 }} barGap={2} barCategoryGap="22%">
                <CartesianGrid vertical={false} stroke="rgba(62, 49, 29, 0.08)" />
                {/* Eixo no TOPO: nome da área + aderência ficam acima de cada grupo de barras. */}
                <XAxis
                  dataKey="key"
                  orientation="top"
                  axisLine={false}
                  tickLine={false}
                  interval={0}
                  height={44}
                  tick={(props) => <AreaTick {...props} areas={areas} selected={selected} onSelect={onSelect} />}
                />
                <YAxis
                  tickLine={false}
                  axisLine={false}
                  tick={{ fontSize: 10, fill: "#71717a" }}
                  allowDecimals={false}
                  tickFormatter={(value: number) => int(value)}
                />
                <Tooltip cursor={{ fill: "rgba(214, 170, 58, 0.08)" }} content={<AdherenceTooltip />} />
                <Bar
                  dataKey="open"
                  name="Abertas"
                  fill={OPEN_COLOR}
                  radius={[4, 4, 0, 0]}
                  maxBarSize={36}
                  cursor="pointer"
                  onClick={(entry: { key?: PlanningGroupKey }) => entry.key && onSelect(entry.key)}
                  fillOpacity={1}
                >
                  <LabelList dataKey="open" position="top" formatter={int} style={{ fontSize: 10, fill: "#52525b" }} />
                </Bar>
                <Bar
                  dataKey="closed"
                  name="Fechadas"
                  fill={CLOSED_COLOR}
                  radius={[4, 4, 0, 0]}
                  maxBarSize={36}
                  cursor="pointer"
                  onClick={(entry: { key?: PlanningGroupKey }) => entry.key && onSelect(entry.key)}
                >
                  <LabelList dataKey="closed" position="top" formatter={int} style={{ fontSize: 10, fill: "#52525b" }} />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Visão em tabela + alvo de clique acessível por teclado. */}
          <div className="mt-2 flex flex-wrap gap-1.5">
            {areas.map((area) => (
              <button
                key={area.key}
                type="button"
                onClick={() => onSelect(area.key)}
                aria-pressed={selected === area.key}
                className={`rounded-md border px-2 py-1 text-[11px] tabular-nums transition ${
                  selected === area.key
                    ? "border-gold/60 bg-gold/15 text-zinc-900"
                    : "border-zinc-300/70 text-zinc-600 hover:border-gold/50 hover:text-zinc-900"
                }`}
                title={`${area.area}: ${int(area.total)} OS · ${int(area.closed)} fechadas · ${int(area.open)} abertas · aderência ${pct(area.adherence)}`}
              >
                <strong className="font-semibold">{area.area}</strong> · {int(area.open)} abertas / {int(area.total)}
              </button>
            ))}
          </div>

          <p className="mt-2 text-[10px] leading-snug text-zinc-500">
            Contagem por ordem de manutenção: a OS só conta como fechada quando todas as operações estão encerradas
            ({int(adherence.total)} ordens; a tabela lista as {int(adherence.operationRows)} operações). Aderência =
            fechadas ÷ total da área × 100. Clique em uma área para ver as OS ainda não encerradas.
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

type TickProps = {
  x?: number;
  y?: number;
  payload?: { value?: string };
  areas: ServiceOrderAreaAdherence[];
  selected: PlanningGroupKey | null;
  onSelect: (key: PlanningGroupKey) => void;
};

function AreaTick({ x = 0, y = 0, payload, areas, selected, onSelect }: TickProps) {
  const area = areas.find((item) => item.key === payload?.value);
  if (!area) return null;
  const active = selected === area.key;

  return (
    <g transform={`translate(${x},${y})`} style={{ cursor: "pointer" }} onClick={() => onSelect(area.key)}>
      <title>{area.area}</title>
      <text textAnchor="middle" y={-26} fontSize={10} fontWeight={700} fill={active ? "#18181b" : "#52525b"}>
        {AXIS_LABEL[area.key]}
      </text>
      <text textAnchor="middle" y={-9} fontSize={14} fontWeight={800} fill="#7B551F">
        {pct(area.adherence)}
      </text>
    </g>
  );
}

function AdherenceTooltip({
  active,
  payload
}: {
  active?: boolean;
  payload?: Array<{ payload: ServiceOrderAreaAdherence }>;
}) {
  const area = active ? payload?.[0]?.payload : undefined;
  if (!area) return null;

  return (
    <div
      className="rounded-lg px-3 py-2 text-xs shadow-lg"
      style={{ background: TOOLTIP.background, border: `1px solid ${TOOLTIP.border}`, color: TOOLTIP.text }}
    >
      <p className="mb-1 font-bold" style={{ color: TOOLTIP.title }}>
        {area.area}
      </p>
      <p>Total de OS: {int(area.total)}</p>
      <p>Fechadas: {int(area.closed)}</p>
      <p>Abertas: {int(area.open)}</p>
      <p className="mt-1 font-semibold">Aderência: {pct(area.adherence)}</p>
      <p className="mt-1 text-[10px] opacity-70">Clique para ver as OS abertas</p>
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

type DetailState =
  | { phase: "loading" }
  | { phase: "error"; message: string }
  | { phase: "ready"; data: ServiceOrderOpenByAreaResult };

function AreaDetailPanel({
  area,
  filterQuery,
  onClose
}: {
  area: ServiceOrderAreaAdherence;
  filterQuery: string;
  onClose: () => void;
}) {
  const [state, setState] = useState<DetailState>({ phase: "loading" });

  useEffect(() => {
    if (area.open === 0) return;
    const controller = new AbortController();
    const query = new URLSearchParams(filterQuery);
    query.set("area", area.key);

    fetch(`/api/service-orders/adherence-by-area?${query.toString()}`, { signal: controller.signal })
      .then(async (response) => {
        const body = (await response.json().catch(() => null)) as
          | { ok: true; data: ServiceOrderOpenByAreaResult }
          | { ok: false; message?: string }
          | null;
        if (!response.ok || !body || !body.ok) {
          throw new Error((body && !body.ok && body.message) || "Falha ao carregar as OS abertas da área.");
        }
        setState({ phase: "ready", data: body.data });
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        setState({ phase: "error", message: error instanceof Error ? error.message : "Falha ao carregar." });
      });

    return () => controller.abort();
  }, [area.key, area.open, filterQuery]);

  return (
    <article className="panel flex flex-col rounded-lg p-4 xl:col-span-12" aria-label={`Detalhe — ${area.area}`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-[11px] font-extrabold uppercase tracking-wide text-gold-deep">
            Detalhe — {area.area}
          </h3>
          <p className="text-[11px] text-zinc-500">
            Ordens ainda não encerradas no recorte (uma linha por OS), das mais antigas para as mais novas.
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Fechar detalhe"
          className="grid h-8 w-8 shrink-0 place-items-center rounded-md border border-zinc-300/70 text-zinc-600 transition hover:border-gold/50 hover:text-zinc-900"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <MiniStat label="Total" value={int(area.total)} hint="Ordens da área no recorte" />
        <MiniStat label="Abertas" value={int(area.open)} hint="Não encerradas" />
        <MiniStat label="Fechadas" value={int(area.closed)} hint="Tecnicamente encerradas" />
        <MiniStat label="Aderência" value={pct(area.adherence)} hint="Fechadas ÷ total" />
      </div>

      <div className="mt-3">
        {area.open === 0 ? (
          <EmptyState title="Nenhuma OS pendente" description="Todas as OS desta área no recorte estão encerradas." />
        ) : state.phase === "loading" ? (
          <p className="flex items-center gap-2 py-6 text-xs text-zinc-500">
            <Loader2 className="h-4 w-4 animate-spin" /> Carregando OS abertas…
          </p>
        ) : state.phase === "error" ? (
          <p className="py-6 text-xs text-rose-700">{state.message}</p>
        ) : (
          <OpenOrdersTable data={state.data} />
        )}
      </div>
    </article>
  );
}

function OpenOrdersTable({ data }: { data: ServiceOrderOpenByAreaResult }) {
  return (
    <>
      {data.totalOpen > data.items.length ? (
        <p className="mb-2 text-[11px] text-zinc-500">
          Exibindo as {int(data.items.length)} mais antigas de {int(data.totalOpen)} OS abertas. Use os filtros da página
          para refinar.
        </p>
      ) : null}
      <div className="max-h-[420px] overflow-auto rounded-md border border-zinc-300/60">
        <table className="w-full min-w-[820px] text-left text-[11px]">
          <thead className="sticky top-0 bg-[#F4EEDF] text-[10px] uppercase tracking-wide text-zinc-600">
            <tr>
              <th className="px-2.5 py-2 font-semibold">OS</th>
              <th className="px-2.5 py-2 font-semibold">Título</th>
              <th className="px-2.5 py-2 font-semibold">Equipamento</th>
              <th className="px-2.5 py-2 font-semibold">Responsável</th>
              <th className="px-2.5 py-2 font-semibold">Status</th>
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
                  {order.totalOperations > 1 ? (
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
                  {STATUS_TEXT[order.status] ?? order.status}
                </td>
                <td className="whitespace-nowrap px-2.5 py-1.5 tabular-nums">
                  {order.openedAt ? new Date(order.openedAt).toLocaleDateString("pt-BR", { timeZone: "UTC" }) : "-"}
                </td>
                <td className="whitespace-nowrap px-2.5 py-1.5 text-right font-semibold tabular-nums">
                  {order.daysOpen === null ? "-" : int(order.daysOpen)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
