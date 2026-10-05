"use client";

import { useMemo, useState } from "react";
import type { KeyboardEvent } from "react";
import { Search } from "lucide-react";
import { EmptyState } from "@/components/EmptyState";
import { ServiceOrderEquipmentDrawer } from "@/components/service-orders/ServiceOrderEquipmentDrawer";
import type { ServiceOrderEquipmentRankingItem } from "@/types/service-orders";

/**
 * "ANÁLISE DE ORDENS POR EQUIPAMENTO" — substitui o ranking "Top equipamentos por OS".
 *
 * Os números chegam prontos de `getServiceOrderDashboard` (mesma varredura da
 * tabela): TODAS as máquinas do recorte, não só as 10 visíveis — busca e ordenação
 * trabalham sobre a lista inteira. A linha abre o drawer de análise da máquina, que
 * carrega o detalhe sob demanda e sob os mesmos filtros da página.
 */
const TOP_N = 10;

type SortKey = "most" | "least" | "hours" | "open" | "corrective" | "name";

const SORT_OPTIONS: Array<{ value: SortKey; label: string }> = [
  { value: "most", label: "Mais OS" },
  { value: "least", label: "Menos OS" },
  { value: "hours", label: "Mais horas" },
  { value: "open", label: "Mais OS abertas" },
  { value: "corrective", label: "Mais corretivas" },
  { value: "name", label: "Nome A-Z" }
];

const SORTERS: Record<SortKey, (a: ServiceOrderEquipmentRankingItem, b: ServiceOrderEquipmentRankingItem) => number> = {
  most: (a, b) => b.total - a.total,
  least: (a, b) => a.total - b.total,
  hours: (a, b) => b.hours - a.hours,
  open: (a, b) => b.open - a.open,
  corrective: (a, b) => b.corrective - a.corrective,
  name: (a, b) => a.name.localeCompare(b.name, "pt-BR")
};

const int = (value: number) => value.toLocaleString("pt-BR");
const hoursText = (value: number) => `${value.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} h`;

function normalize(value: string) {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
}

export function ServiceOrderEquipmentRanking({
  items,
  filterQuery,
  periodLabel,
  className = ""
}: {
  items: ServiceOrderEquipmentRankingItem[];
  /** Query string dos filtros aplicados (a mesma da URL da aba). */
  filterQuery: string;
  /** Período dos filtros, já formatado ("01/09/2026 → 30/09/2026" ou "Todo o histórico"). */
  periodLabel: string;
  className?: string;
}) {
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<SortKey>("most");
  const [showAll, setShowAll] = useState(false);
  const [selected, setSelected] = useState<ServiceOrderEquipmentRankingItem | null>(null);

  const term = normalize(query.trim());
  const sorted = useMemo(() => {
    const filtered = term
      ? items.filter((item) => normalize(`${item.name} ${item.key} ${item.familyLabel}`).includes(term))
      : items;
    // Desempate estável por nome para a lista não "pular" entre renderizações.
    return [...filtered].sort((a, b) => SORTERS[sort](a, b) || a.name.localeCompare(b.name, "pt-BR"));
  }, [items, sort, term]);

  // Buscando, mostra todos os resultados: o equipamento procurado nunca fica escondido.
  const visible = showAll || term ? sorted : sorted.slice(0, TOP_N);
  const max = Math.max(...items.map((item) => item.total), 1);

  return (
    <article className={`panel flex flex-col rounded-lg p-4 ${className}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-[11px] font-extrabold uppercase tracking-wide text-gold-deep">
            Análise de ordens por equipamento
          </h3>
          <p className="text-[11px] text-zinc-500">
            Equipamentos com maior volume de OS no período. Clique em uma máquina para analisar suas ordens.
          </p>
        </div>
        <p className="text-[11px] tabular-nums text-zinc-500">{int(items.length)} máquinas no recorte</p>
      </div>

      {items.length === 0 ? (
        <EmptyState title="Sem equipamentos no recorte" description="Ajuste os filtros para visualizar o ranking." />
      ) : (
        <>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <label className="relative min-w-[220px] flex-1">
              <span className="sr-only">Buscar equipamento</span>
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-zinc-400" />
              <input
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Buscar equipamento..."
                className="h-9 w-full rounded-md border border-zinc-300/70 bg-white/70 pl-8 pr-3 text-[12px] text-zinc-800 outline-none transition placeholder:text-zinc-400 focus:border-gold/60"
              />
            </label>
            <label className="flex items-center gap-2 text-[11px] text-zinc-600">
              Ordenar por
              <select
                value={sort}
                onChange={(event) => setSort(event.target.value as SortKey)}
                className="h-9 rounded-md border border-zinc-300/70 bg-white/70 px-2 text-[12px] text-zinc-800 outline-none focus:border-gold/60"
              >
                {SORT_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            {!term && items.length > TOP_N ? (
              <button
                type="button"
                onClick={() => setShowAll((current) => !current)}
                className="h-9 rounded-md border border-zinc-300/70 px-3 text-[12px] font-semibold text-zinc-700 transition hover:border-gold/60 hover:text-zinc-900"
              >
                {showAll ? `Mostrar top ${TOP_N}` : `Ver todos os equipamentos (${int(items.length)})`}
              </button>
            ) : null}
          </div>

          {visible.length === 0 ? (
            <EmptyState title="Nenhum equipamento encontrado" description={`Nada corresponde a "${query.trim()}" no recorte atual.`} />
          ) : (
            <ol
              className={`mt-3 divide-y divide-zinc-200/80 ${showAll || term ? "max-h-[560px] overflow-y-auto pr-1" : ""}`}
              aria-label="Ranking de equipamentos"
            >
              {visible.map((item) => (
                <RankingRow
                  key={item.key}
                  item={item}
                  position={sorted.indexOf(item) + 1}
                  max={max}
                  active={selected?.key === item.key}
                  onOpen={() => setSelected(item)}
                />
              ))}
            </ol>
          )}

          <p className="mt-2 text-[10px] leading-snug text-zinc-500">
            Máquina = equipamento raiz do local de instalação: OS abertas em componentes (forno, jot, politriz…) somam
            para a máquina. Contagem por ordem de manutenção; horas = soma das operações apontadas.
          </p>
        </>
      )}

      {selected ? (
        <ServiceOrderEquipmentDrawer
          key={`${selected.key}|${filterQuery}`}
          item={selected}
          filterQuery={filterQuery}
          periodLabel={periodLabel}
          onClose={() => setSelected(null)}
        />
      ) : null}
    </article>
  );
}

function RankingRow({
  item,
  position,
  max,
  active,
  onOpen
}: {
  item: ServiceOrderEquipmentRankingItem;
  position: number;
  max: number;
  active: boolean;
  onOpen: () => void;
}) {
  const onKeyDown = (event: KeyboardEvent<HTMLLIElement>) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      onOpen();
    }
  };

  return (
    <li
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={onKeyDown}
      aria-label={`${item.name} (${item.key}): ${int(item.total)} OS, ${hoursText(item.hours)} apontadas, ${int(item.open)} abertas, ${int(item.closed)} fechadas. Abrir análise.`}
      className={`grid cursor-pointer grid-cols-[28px_minmax(0,1fr)] items-center gap-x-3 gap-y-1.5 rounded-md px-2 py-2.5 outline-none transition focus-visible:ring-2 focus-visible:ring-gold/70 md:grid-cols-[28px_minmax(0,1.4fr)_minmax(0,1fr)_auto] ${
        active ? "bg-gold/[0.12]" : "hover:bg-gold/[0.06]"
      }`}
    >
      <span className="text-[12px] font-bold tabular-nums text-zinc-400">{position}</span>

      <span className="min-w-0">
        <span className="block truncate text-[13px] font-bold text-zinc-900" title={item.name}>
          {item.name}
        </span>
        <span className="block truncate text-[10px] text-zinc-500" title={item.key}>
          {item.key} · {item.familyLabel}
        </span>
      </span>

      <span className="col-start-2 block md:col-start-auto" aria-hidden>
        <span className="block h-2 w-full overflow-hidden rounded-full bg-black/[0.06]">
          <span className="block h-full rounded-full bg-gold" style={{ width: `${(item.total / max) * 100}%` }} />
        </span>
      </span>

      <span className="col-start-2 flex flex-wrap gap-x-4 gap-y-0.5 text-[11px] tabular-nums text-zinc-600 md:col-start-auto md:justify-end">
        <span>
          <strong className="text-[13px] text-zinc-900">{int(item.total)}</strong> OS
        </span>
        <span>{hoursText(item.hours)}</span>
        <span className="text-rose-700">{int(item.open)} abertas</span>
        <span className="text-emerald-700">{int(item.closed)} fechadas</span>
      </span>
    </li>
  );
}
