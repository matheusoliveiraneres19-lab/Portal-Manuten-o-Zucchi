"use client";

import { useMemo, useState } from "react";
import { AlertTriangle, ArrowDown, ArrowUp, ChevronLeft, ChevronRight, ChevronsUpDown, Search } from "lucide-react";
import { EmptyState } from "@/components/EmptyState";
import { normalizeMachineName } from "@/utils/technical-object-normalizer";
import type { PcFactoryReliabilityRow } from "@/types/pc-factory";

type PcFactoryReliabilityTableProps = {
  rows: PcFactoryReliabilityRow[];
  className?: string;
  onSelect?: (resourceName: string) => void;
};

/** Colunas ordenáveis. */
type SortKey = "machineName" | "failureEvents" | "mtbf" | "mttr" | "mtta" | "downtimeHours" | "availability";
type SortDirection = "asc" | "desc";

const PAGE_SIZES = [25, 50, 100] as const;
type PageSize = (typeof PAGE_SIZES)[number] | "all";

/** Fórmulas oficiais (tooltip do cabeçalho — base: Tempo Decorrido / durationHours). */
const HEADER_HINTS = {
  machine: "Nome do recurso no PC-Factory. Clique na linha para abrir o detalhe da máquina.",
  failures: "Quebras = eventos de manutenção (Mecânica + Elétrica + Automação + Terceiros + Aguardando).",
  mtbf: "MTBF = Tempo Operacional / Quebras  (Tempo Operacional = Tempo de Carga − Setup).",
  mttr:
    "MTTR = Tempo de reparo corretivo / Quebras  (reparo = Mecânica + Elétrica + Automação + Terceiros). " +
    "Não inclui Aguardando Manutenção (é o MTTA) nem Manutenção Planejada (não é falha).",
  mtta: "MTTA = Tempo aguardando manutenção / Quebras.",
  downtime:
    "Paradas = Manutenção total = Mecânica + Elétrica + Automação + Planejada + Terceiros + Aguardando. " +
    "É o mesmo número do card Horas de Manutenção e do que a Disponibilidade subtrai — maior que o " +
    "numerador do MTTR, que é só o reparo corretivo. Passe o mouse na célula para ver a composição.",
  availability:
    "Disponibilidade Física = (Tempo Total do Período − Horas de Parada) / Tempo Total do Período × 100. " +
    "O Tempo Total é o tempo-calendário do filtro (ex.: agosto = 31 × 24 = 744 h). Soma direta de horas: " +
    "não usa LOADTIME, Tempo Operacional, Setup, MTTR, MTBF, MTTA nem quebras. " +
    "Passe o mouse na célula para ver a conta da máquina."
} as const;

/**
 * Tabela de confiabilidade por máquina: quebras, MTBF, MTTR, MTTA, paradas e
 * disponibilidade. Os valores vêm prontos do service central (regras oficiais do
 * PC-Factory, base Tempo Decorrido); indicadores não aplicáveis chegam como null e
 * são exibidos como "—" (nunca 0 h / 0% indevido). Clique numa linha para detalhar.
 *
 * A tabela mostra TODAS as máquinas do recorte, paginadas. Antes cortava em 12 linhas
 * (`slice(0, 12)`) sobre uma lista que já vinha filtrada por "só quem teve quebra" —
 * em agosto/2026 isso exibia 12 de 32 máquinas, e a gestão não tinha como saber que
 * faltava o resto da frota.
 *
 * ORDENAÇÃO ANTES DA PAGINAÇÃO, sempre: ordenar só a página mostraria "as piores da
 * página 1", não as piores da frota — que é exatamente a pergunta que a coluna
 * Disponibilidade existe para responder.
 */
export function PcFactoryReliabilityTable({ rows, className = "", onSelect }: PcFactoryReliabilityTableProps) {
  // Padrão preservado: Paradas, maior primeiro — a mesma ordem que a aba já tinha.
  const [sortKey, setSortKey] = useState<SortKey>("downtimeHours");
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");
  const [pageSize, setPageSize] = useState<PageSize>(25);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return rows;
    // Busca sobre TODAS as máquinas do recorte, não sobre a página atual.
    return rows.filter((row) => {
      const display = normalizeMachineName(row.machineName) || row.machineName;
      return row.machineName.toLowerCase().includes(term) || display.toLowerCase().includes(term);
    });
  }, [rows, search]);

  const sorted = useMemo(() => {
    const factor = sortDirection === "asc" ? 1 : -1;
    return [...filtered].sort((a, b) => {
      if (sortKey === "machineName") {
        const nomeA = normalizeMachineName(a.machineName) || a.machineName;
        const nomeB = normalizeMachineName(b.machineName) || b.machineName;
        return nomeA.localeCompare(nomeB, "pt-BR") * factor;
      }

      const valueA = a[sortKey];
      const valueB = b[sortKey];

      // Indicador indefinido (LOADTIME ≤ 0, sem quebras) vai para o FIM nos dois
      // sentidos: um "—" no meio da classificação não diz nada e atrapalha a leitura.
      const nullA = valueA === null || !Number.isFinite(valueA);
      const nullB = valueB === null || !Number.isFinite(valueB);
      if (nullA && nullB) return 0;
      if (nullA) return 1;
      if (nullB) return -1;

      return ((valueA as number) - (valueB as number)) * factor;
    });
  }, [filtered, sortKey, sortDirection]);

  const total = sorted.length;
  const size = pageSize === "all" ? Math.max(total, 1) : pageSize;
  const totalPages = Math.max(1, Math.ceil(total / size));
  const currentPage = Math.min(page, totalPages);
  const start = (currentPage - 1) * size;
  const visible = sorted.slice(start, start + size);

  /** Clique no cabeçalho: 1º clique ordena, cliques seguintes invertem. */
  function toggleSort(key: SortKey) {
    if (key === sortKey) {
      setSortDirection((current) => (current === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      // Disponibilidade e MTBF começam do MENOR (o pior caso primeiro, que é o que
      // a gestão procura); as demais colunas começam do maior.
      setSortDirection(key === "availability" || key === "mtbf" || key === "machineName" ? "asc" : "desc");
    }
    setPage(1);
  }

  return (
    <article className={`panel rounded-lg p-4 ${className}`}>
      <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-[11px] font-extrabold uppercase tracking-wide text-gold-deep">Confiabilidade por máquina</h3>
          <p className="mt-0.5 text-[11px] text-zinc-500">
            Quebras, MTBF (tempo médio entre falhas), MTTR (reparo), MTTA (aguardando) e disponibilidade. Base: Tempo
            Decorrido. Clique no cabeçalho para ordenar e na linha para detalhar.
          </p>
        </div>
        <span className="shrink-0 rounded-md border border-gold/40 bg-gold/15 px-2.5 py-1 text-[11px] font-bold text-gold-deep">
          {rows.length.toLocaleString("pt-BR")} máquina(s) no período
        </span>
      </div>

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <label className="relative flex-1 min-w-[180px]">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-zinc-400" />
          <input
            value={search}
            onChange={(event) => {
              setSearch(event.target.value);
              setPage(1);
            }}
            placeholder="Buscar máquina..."
            aria-label="Buscar máquina"
            className="h-8 w-full rounded-md border border-zinc-300 bg-white pl-8 pr-2 text-xs text-zinc-800 outline-none transition focus-visible:border-gold focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-gold/50"
          />
        </label>

        <label className="flex items-center gap-1.5 text-[11px] text-zinc-500">
          Ordenar por:
          <select
            value={`${sortKey}:${sortDirection}`}
            onChange={(event) => {
              const [key, direction] = event.target.value.split(":") as [SortKey, SortDirection];
              setSortKey(key);
              setSortDirection(direction);
              setPage(1);
            }}
            className="h-8 rounded-md border border-zinc-300 bg-white px-2 text-xs font-semibold text-zinc-800 outline-none transition focus-visible:border-gold"
          >
            <option value="availability:asc">Disponibilidade Física — menor primeiro</option>
            <option value="availability:desc">Disponibilidade Física — maior primeiro</option>
            <option value="downtimeHours:desc">Paradas — maior primeiro</option>
            <option value="failureEvents:desc">Quebras — maior primeiro</option>
            <option value="mtbf:asc">MTBF — menor primeiro</option>
            <option value="mtbf:desc">MTBF — maior primeiro</option>
            <option value="machineName:asc">Máquina — A-Z</option>
          </select>
        </label>

        <label className="flex items-center gap-1.5 text-[11px] text-zinc-500">
          Por página:
          <select
            value={String(pageSize)}
            onChange={(event) => {
              const value = event.target.value;
              setPageSize(value === "all" ? "all" : (Number(value) as PageSize));
              setPage(1);
            }}
            className="h-8 rounded-md border border-zinc-300 bg-white px-2 text-xs font-semibold text-zinc-800 outline-none transition focus-visible:border-gold"
          >
            {PAGE_SIZES.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
            <option value="all">Todas</option>
          </select>
        </label>
      </div>

      {total === 0 ? (
        <EmptyState
          title={search.trim() ? "Nenhuma máquina encontrada" : "Sem máquinas no período"}
          description={
            search.trim()
              ? "Ajuste o termo da busca para encontrar a máquina."
              : "Nenhuma máquina com tempo medido para os filtros atuais."
          }
        />
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-zinc-200 text-left text-[11px] font-extrabold uppercase tracking-wide text-zinc-500">
                  <SortableHeader
                    label="Máquina"
                    sortKey="machineName"
                    active={sortKey}
                    direction={sortDirection}
                    hint={HEADER_HINTS.machine}
                    onSort={toggleSort}
                    className="py-2 pr-3"
                  />
                  <SortableHeader label="Quebras" sortKey="failureEvents" active={sortKey} direction={sortDirection} hint={HEADER_HINTS.failures} onSort={toggleSort} align="right" />
                  <SortableHeader label="MTBF" sortKey="mtbf" active={sortKey} direction={sortDirection} hint={HEADER_HINTS.mtbf} onSort={toggleSort} align="right" />
                  <SortableHeader label="MTTR" sortKey="mttr" active={sortKey} direction={sortDirection} hint={HEADER_HINTS.mttr} onSort={toggleSort} align="right" />
                  <SortableHeader label="MTTA" sortKey="mtta" active={sortKey} direction={sortDirection} hint={HEADER_HINTS.mtta} onSort={toggleSort} align="right" />
                  <SortableHeader label="Paradas" sortKey="downtimeHours" active={sortKey} direction={sortDirection} hint={HEADER_HINTS.downtime} onSort={toggleSort} align="right" />
                  <SortableHeader
                    label="Disponib. Física"
                    sortKey="availability"
                    active={sortKey}
                    direction={sortDirection}
                    hint={`Clique para ordenar por disponibilidade. ${HEADER_HINTS.availability}`}
                    onSort={toggleSort}
                    align="right"
                    className="py-2 pl-3"
                  />
                </tr>
              </thead>
              <tbody>
                {visible.map((row) => (
                  <tr
                    key={row.machineName}
                    onClick={() => onSelect?.(row.machineName)}
                    onKeyDown={(event) => {
                      if (!onSelect) return;
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        onSelect(row.machineName);
                      }
                    }}
                    tabIndex={onSelect ? 0 : undefined}
                    role={onSelect ? "button" : undefined}
                    aria-label={onSelect ? `Ver detalhes de ${row.machineName}` : undefined}
                    className={`border-b border-zinc-100 text-zinc-800 transition duration-200 ease-premium last:border-0 ${
                      onSelect
                        ? "cursor-pointer hover:bg-gold/10 focus-visible:bg-gold/10 focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-gold"
                        : ""
                    }`}
                  >
                    <td className="max-w-[220px] truncate py-2 pr-3 font-semibold" title={row.dataQualityIssue ?? row.machineName}>
                      <span className="inline-flex items-center gap-1.5">
                        {row.dataQualityIssue ? (
                          <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-gold" aria-label={row.dataQualityIssue} />
                        ) : null}
                        <span className="truncate">{normalizeMachineName(row.machineName) || row.machineName}</span>
                      </span>
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">{row.failureEvents.toLocaleString("pt-BR")}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{formatHours(row.mtbf)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{formatHours(row.mttr)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{formatHours(row.mtta)}</td>
                    <td className="px-3 py-2 text-right tabular-nums" title={downtimeBreakdown(row)}>
                      {formatHours(row.downtimeHours)}
                    </td>
                    <td className="py-2 pl-3 text-right" title={availabilityBreakdown(row)}>
                      <span className={`inline-block rounded-md px-2 py-0.5 text-xs font-bold ${availabilityClass(row.availability)}`}>
                        {formatPercent(row.availability)}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-zinc-200 pt-3 text-xs text-zinc-500">
            <span>
              Exibindo {(start + 1).toLocaleString("pt-BR")}–{Math.min(start + size, total).toLocaleString("pt-BR")} de{" "}
              {total.toLocaleString("pt-BR")}
              {search.trim() ? ` (filtradas de ${rows.length.toLocaleString("pt-BR")})` : " máquinas"}
            </span>
            {totalPages > 1 ? (
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  disabled={currentPage <= 1}
                  onClick={() => setPage(currentPage - 1)}
                  className="inline-flex h-8 items-center gap-1 rounded-md border border-zinc-300 px-2 font-semibold text-zinc-700 transition hover:border-gold/50 disabled:cursor-not-allowed disabled:border-black/10 disabled:bg-black/[0.04] disabled:text-neutralized disabled:hover:border-black/10"
                >
                  <ChevronLeft className="h-4 w-4" /> Anterior
                </button>
                <span className="px-1 tabular-nums">
                  {currentPage}/{totalPages}
                </span>
                <button
                  type="button"
                  disabled={currentPage >= totalPages}
                  onClick={() => setPage(currentPage + 1)}
                  className="inline-flex h-8 items-center gap-1 rounded-md border border-zinc-300 px-2 font-semibold text-zinc-700 transition hover:border-gold/50 disabled:cursor-not-allowed disabled:border-black/10 disabled:bg-black/[0.04] disabled:text-neutralized disabled:hover:border-black/10"
                >
                  Próxima <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            ) : null}
          </div>
        </>
      )}
    </article>
  );
}

/** Cabeçalho clicável com indicador de estado (↕ / ↑ / ↓). */
function SortableHeader({
  label,
  sortKey,
  active,
  direction,
  hint,
  onSort,
  align = "left",
  className = "px-3 py-2"
}: {
  label: string;
  sortKey: SortKey;
  active: SortKey;
  direction: SortDirection;
  hint: string;
  onSort: (key: SortKey) => void;
  align?: "left" | "right";
  className?: string;
}) {
  const isActive = active === sortKey;
  const Icon = !isActive ? ChevronsUpDown : direction === "asc" ? ArrowUp : ArrowDown;

  return (
    <th className={`${className} ${align === "right" ? "text-right" : ""}`} aria-sort={isActive ? (direction === "asc" ? "ascending" : "descending") : "none"}>
      <button
        type="button"
        onClick={() => onSort(sortKey)}
        title={hint}
        className={`inline-flex items-center gap-1 font-extrabold uppercase tracking-wide transition hover:text-gold-deep focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-gold ${
          isActive ? "text-gold-deep" : ""
        } ${align === "right" ? "flex-row-reverse" : ""}`}
      >
        {label}
        <Icon className={`h-3 w-3 shrink-0 ${isActive ? "text-gold" : "text-zinc-400"}`} />
      </button>
    </th>
  );
}

/** Horas em pt-BR (1 casa). null/NaN/Infinity → "—" (nunca exibe 0 h indevido). */
function formatHours(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return "—";
  return `${value.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} h`;
}

/** Percentual em pt-BR (1 casa). null/NaN/Infinity → "—" (nunca exibe 0% indevido). */
function formatPercent(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return "—";
  return `${value.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`;
}

/**
 * Composição das Paradas da máquina, para a célula não ser um número sem origem.
 * Corretiva e Planejada aparecem separadas justamente porque só a corretiva entra
 * no MTTR — as duas somam nas Paradas e na Disponibilidade.
 */
function downtimeBreakdown(row: PcFactoryReliabilityRow): string {
  const h = (value: number) => `${value.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} h`;
  return [
    `Composição das Paradas — ${normalizeMachineName(row.machineName) || row.machineName}`,
    `Reparo corretivo (Mec. + Elét. + Autom. + Terceiros): ${h(row.repairHours)}`,
    `Manutenção Planejada: ${h(row.plannedMaintenanceHours)}`,
    `Aguardando Manutenção: ${h(row.waitingMaintenanceHours)}`,
    `Total: ${h(row.maintenanceDowntimeHours)}`,
    "Só o reparo corretivo entra no MTTR; Aguardando entra no MTTA."
  ].join("\n");
}

/**
 * A conta da DISPONIBILIDADE FÍSICA aberta na célula, nos mesmos termos da
 * conferência manual do PCM — os três insumos e a divisão, para bater na calculadora
 * sem sair da tela:
 *
 *   Tempo total do período: 744 h
 *   Horas de parada:        128 h
 *   Horas disponíveis:      616 h
 *   (616 / 744) × 100 = 82,8%
 */
function availabilityBreakdown(row: PcFactoryReliabilityRow): string {
  const h = (value: number) => `${value.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })} h`;
  const lines = [
    `Disponibilidade Física — ${normalizeMachineName(row.machineName) || row.machineName}`,
    "",
    `Tempo total do período: ${h(row.periodHours)}`,
    `Horas de parada: ${h(row.downtimeHours)}`,
    `Horas disponíveis: ${h(row.availableHours)}`,
    "",
    `(${h(row.availableHours)} ÷ ${h(row.periodHours)}) × 100 = ${formatPercent(row.availability)}`,
    "",
    "Paradas = Mecânica + Elétrica + Automação + Planejada + Terceiros + Aguardando.",
    "Não usa LOADTIME, Tempo Operacional, MTTR, MTBF, MTTA nem quebras."
  ];
  if (row.downtimeExceedsPeriod) {
    lines.push(
      "",
      "⚠ Horas de parada superiores às horas-calendário do período.",
      "Verifique sobreposição ou duplicidade dos registros."
    );
  }
  return lines.join("\n");
}

/**
 * Verde ≥ 90%, âmbar 70-90%, vermelho < 70% (metas usuais de disponibilidade).
 *
 * O vermelho e o âmbar ganharam borda e peso: num fundo claro, só o preenchimento a
 * 15% deixava a faixa crítica com contraste parecido com o da faixa boa — que é
 * justamente o oposto do que a tabela precisa comunicar de relance.
 */
function availabilityClass(value: number | null): string {
  if (value === null) return "border border-zinc-300 bg-zinc-100 text-zinc-600";
  if (value >= 90) return "border border-success/30 bg-success/15 text-success-strong";
  if (value >= 70) return "border border-gold/45 bg-gold/25 text-gold-deep";
  return "border border-danger/50 bg-danger/20 font-extrabold text-danger";
}
