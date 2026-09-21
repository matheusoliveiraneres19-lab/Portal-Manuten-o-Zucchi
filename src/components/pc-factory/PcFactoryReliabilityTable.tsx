"use client";

import { Fragment, useCallback, useEffect, useMemo, useRef, useState, type MouseEvent, type ReactNode } from "react";
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  ChevronsUpDown,
  Loader2,
  Plus,
  Search,
  X
} from "lucide-react";
import { toast } from "sonner";
import { EmptyState } from "@/components/EmptyState";
import { normalizeMachineName } from "@/utils/technical-object-normalizer";
import {
  PHYSICAL_AVAILABILITY_BANDS,
  classifyPhysicalAvailability
} from "@/utils/pc-factory-physical-availability";
import { AVAILABILITY_NOTE_LIMITS, type PcFactoryAvailabilityNoteDTO } from "@/types/pc-factory-availability-note";
import { FOCUS_RING } from "@/constants/interactive";
import type { PcFactoryPeriodWindowDTO, PcFactoryReliabilityRow } from "@/types/pc-factory";

type PcFactoryReliabilityTableProps = {
  rows: PcFactoryReliabilityRow[];
  /** Janela resolvida do recorte — é a chave de período das justificativas. */
  period: PcFactoryPeriodWindowDTO;
  /** Justificativas JÁ filtradas pelo período acima (vêm do server). */
  notes: PcFactoryAvailabilityNoteDTO[];
  /** ADMIN/GESTOR criam e editam; os demais apenas visualizam. */
  canEdit: boolean;
  className?: string;
  onSelect?: (resourceName: string) => void;
};

/** Colunas ordenáveis — as três colunas numéricas/textuais que a tabela expõe. */
type SortKey = "machineName" | "downtimeHours" | "availability";
type SortDirection = "asc" | "desc";

const PAGE_SIZES = [25, 50, 100] as const;
type PageSize = (typeof PAGE_SIZES)[number] | "all";

/** Fórmulas oficiais (tooltip do cabeçalho — base: Tempo Decorrido / durationHours). */
const HEADER_HINTS = {
  machine: "Nome do recurso no PC-Factory. Clique na linha para abrir o detalhe da máquina.",
  downtime:
    "Horas de Parada = Manutenção Mecânica + Elétrica + Automação + Planejada + Terceiros + Aguardando. " +
    "É EXATAMENTE o valor que a Disponibilidade Física subtrai do Tempo Total — o mesmo número, não um total " +
    "calculado à parte para a tabela. Passe o mouse na célula para ver a composição.",
  availability:
    "Disponibilidade Física = (Tempo Total do Período − Horas de Parada) / Tempo Total do Período × 100. " +
    "O Tempo Total é o tempo-calendário do filtro (ex.: agosto = 31 × 24 = 744 h). Soma direta de horas: " +
    "não usa LOADTIME, Tempo Operacional, Setup, MTTR, MTBF, MTTA nem quebras. " +
    "Passe o mouse na célula para ver a conta da máquina.",
  reason:
    "Justificativa gerencial da disponibilidade da máquina NESTE período. É texto de gestão: " +
    "não altera Horas de Parada, Tempo Total nem Disponibilidade."
} as const;

/**
 * VISÃO GERENCIAL DE DISPONIBILIDADE FÍSICA POR MÁQUINA.
 *
 * Quatro colunas, só o que a reunião de manutenção usa:
 *
 *     MÁQUINA | HORAS DE PARADA | DISPONIBILIDADE | MOTIVO / JUSTIFICATIVA
 *
 * Quebras, MTBF, MTTR e MTTA saíram DA TABELA — não do sistema. Continuam sendo
 * calculados no service central e exibidos no painel de detalhes da máquina e nos
 * KPIs; aqui eles competiam por atenção com a única pergunta que esta tabela
 * responde ("quais máquinas ficaram paradas, quanto, e por quê").
 *
 * HORAS DE PARADA e DISPONIBILIDADE vêm prontas do service (`row.downtimeHours` e
 * `row.availability`): o número exibido é o MESMO que entrou na fórmula, nunca um
 * total recalculado para a tela. Indicador não aplicável chega como null e vira
 * "—" (nunca 0 h / 0% indevido).
 *
 * A tabela mostra TODAS as máquinas do recorte, paginadas — nunca um Top N.
 * ORDENAÇÃO ANTES DA PAGINAÇÃO, sempre: ordenar só a página mostraria "as piores
 * da página 1", não as piores da frota.
 *
 * MOTIVO é informação gerencial pura, gravada por (máquina + período). Nada dele
 * entra em cálculo — ver `pc-factory-availability-notes.service`.
 */
export function PcFactoryReliabilityTable({
  rows,
  period,
  notes,
  canEdit,
  className = "",
  onSelect
}: PcFactoryReliabilityTableProps) {
  // Padrão preservado: Paradas, maior primeiro — a mesma ordem que a aba já tinha.
  const [sortKey, setSortKey] = useState<SortKey>("downtimeHours");
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");
  const [pageSize, setPageSize] = useState<PageSize>(25);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [expanded, setExpanded] = useState<string | null>(null);

  /**
   * Justificativas do período, por máquina. Semeado pelo server e atualizado
   * localmente ao salvar, para a linha refletir a edição sem recarregar a página
   * inteira (o reload também traz o valor certo — ver requisito de persistência).
   */
  const [noteByMachine, setNoteByMachine] = useState<Record<string, PcFactoryAvailabilityNoteDTO>>(() =>
    indexNotes(notes)
  );

  // Trocou o período (ou o server devolveu outro conjunto): recomeça do que veio.
  // É isto que faz a justificativa de agosto sumir ao mudar para setembro, em vez
  // de ficar pendurada no estado local do componente.
  const notesSignature = `${period.startDate}|${period.endDate}|${notes.map((note) => `${note.resourceName}:${note.updatedAt}`).join(",")}`;
  useEffect(() => {
    setNoteByMachine(indexNotes(notes));
    setExpanded(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [notesSignature]);

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

      // Indicador indefinido (sem período medido) vai para o FIM nos dois sentidos:
      // um "—" no meio da classificação não diz nada e atrapalha a leitura.
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
      // Disponibilidade começa do MENOR (o pior caso primeiro, que é o que a
      // gestão procura); Horas de Parada começa do maior.
      setSortDirection(key === "availability" || key === "machineName" ? "asc" : "desc");
    }
    setPage(1);
  }

  function handleSaved(note: PcFactoryAvailabilityNoteDTO) {
    setNoteByMachine((current) => ({ ...current, [note.resourceName]: note }));
    setExpanded(null);
  }

  /** Sem período resolvido não há chave de justificativa — só leitura. */
  const periodIsUsable = Boolean(period.startDate && period.endDate);

  return (
    <article className={`panel rounded-lg p-4 ${className}`}>
      <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-[11px] font-extrabold uppercase tracking-wide text-gold-deep">Confiabilidade por máquina</h3>
          <p className="mt-0.5 text-[11px] text-zinc-500">
            Horas de parada, Disponibilidade Física e a justificativa gerencial do período. Clique no cabeçalho para
            ordenar, no motivo para registrar/editar e na linha para abrir o detalhe da máquina (com MTBF, MTTR e MTTA).
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          <span className="rounded-md border border-gold/40 bg-gold/15 px-2.5 py-1 text-[11px] font-bold text-gold-deep">
            {rows.length.toLocaleString("pt-BR")} máquina(s) no período
          </span>
          {periodIsUsable ? (
            <span className="rounded-md border border-zinc-300 bg-white px-2.5 py-1 text-[11px] font-semibold text-zinc-600">
              {period.label}
            </span>
          ) : null}
        </div>
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
            <option value="downtimeHours:desc">Horas de Parada — maior primeiro</option>
            <option value="downtimeHours:asc">Horas de Parada — menor primeiro</option>
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
          {/* Quatro colunas cabem em tela pequena: a de motivo encolhe para um
              botão "Ver motivo" em vez de forçar rolagem horizontal. */}
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
                  <SortableHeader
                    label="Horas de Parada"
                    sortKey="downtimeHours"
                    active={sortKey}
                    direction={sortDirection}
                    hint={HEADER_HINTS.downtime}
                    onSort={toggleSort}
                    align="right"
                  />
                  <SortableHeader
                    label="Disponibilidade"
                    sortKey="availability"
                    active={sortKey}
                    direction={sortDirection}
                    hint={`Clique para ordenar por disponibilidade. ${HEADER_HINTS.availability}`}
                    onSort={toggleSort}
                    align="right"
                  />
                  <th className="py-2 pl-3 text-left" title={HEADER_HINTS.reason}>
                    <span className="font-extrabold uppercase tracking-wide">Motivo / Justificativa</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {visible.map((row) => {
                  const note = noteByMachine[row.machineName] ?? null;
                  const isExpanded = expanded === row.machineName;

                  return (
                    <Fragment key={row.machineName}>
                      <tr
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
                        className={`border-b border-zinc-100 text-zinc-800 transition duration-200 ease-premium ${
                          isExpanded ? "bg-gold/10" : ""
                        } ${
                          onSelect
                            ? "cursor-pointer hover:bg-gold/10 focus-visible:bg-gold/10 focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-gold"
                            : ""
                        }`}
                      >
                        <td
                          className="max-w-[220px] truncate py-2 pr-3 font-semibold"
                          title={row.dataQualityIssue ?? row.machineName}
                        >
                          <span className="inline-flex items-center gap-1.5">
                            {row.dataQualityIssue ? (
                              <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-gold" aria-label={row.dataQualityIssue} />
                            ) : null}
                            <span className="truncate">{normalizeMachineName(row.machineName) || row.machineName}</span>
                          </span>
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums" title={downtimeBreakdown(row)}>
                          {formatHours(row.downtimeHours)}
                        </td>
                        <td className="px-3 py-2 text-right" title={availabilityBreakdown(row)}>
                          <span
                            className={`inline-block rounded-md px-2 py-0.5 text-xs font-bold ${availabilityClass(row.availability)}`}
                          >
                            {formatPercent(row.availability)}
                          </span>
                        </td>
                        <td className="py-2 pl-3 align-top">
                          <ReasonCell
                            note={note}
                            availability={row.availability}
                            canEdit={canEdit && periodIsUsable}
                            expanded={isExpanded}
                            onToggle={() => setExpanded(isExpanded ? null : row.machineName)}
                          />
                        </td>
                      </tr>

                      {isExpanded ? (
                        <tr className="border-b border-zinc-100">
                          {/* Painel central: ocupa a largura inteira da tabela. */}
                          <td colSpan={4} className="p-0">
                            <AvailabilityNotePanel
                              row={row}
                              note={note}
                              period={period}
                              canEdit={canEdit}
                              onClose={() => setExpanded(null)}
                              onSaved={handleSaved}
                            />
                          </td>
                        </tr>
                      ) : null}
                    </Fragment>
                  );
                })}
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

/* ------------------------------------------------------------------ */
/* Coluna MOTIVO                                                      */
/* ------------------------------------------------------------------ */

/**
 * A célula nunca vira uma textarea permanente: sem justificativa mostra o gatilho
 * "Registrar motivo"; com justificativa mostra no máximo duas linhas do texto
 * (`line-clamp-2`, tooltip com o texto inteiro) e o gatilho "Ver / Editar". Assim
 * a altura da linha não cresce quando alguém escreve um parágrafo.
 *
 * O clique aqui NÃO pode abrir o painel de detalhes da máquina (a linha inteira é
 * clicável), por isso cada botão interrompe a propagação.
 */
function ReasonCell({
  note,
  availability,
  canEdit,
  expanded,
  onToggle
}: {
  note: PcFactoryAvailabilityNoteDTO | null;
  availability: number | null;
  canEdit: boolean;
  expanded: boolean;
  onToggle: () => void;
}) {
  const critical = classifyPhysicalAvailability(availability) === "critica";

  function handle(event: MouseEvent) {
    event.stopPropagation();
    onToggle();
  }

  if (!note) {
    return (
      <div className="flex flex-col items-start gap-1">
        {/* Destaque discreto: só quando a disponibilidade está abaixo do MESMO
            corte que o portal já usa para "baixa disponibilidade" (70%), e só
            enquanto não houver justificativa. Nenhum limite novo foi inventado. */}
        {critical ? (
          <span
            title={`Disponibilidade abaixo de ${PHYSICAL_AVAILABILITY_BANDS.attention}% (mesmo corte de "baixa disponibilidade" já usado pelo portal) e sem justificativa registrada neste período.`}
            className="inline-flex items-center gap-1 rounded-md border border-danger/40 bg-danger/10 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-danger-strong"
          >
            <AlertTriangle className="h-3 w-3" /> Justificativa pendente
          </span>
        ) : null}
        {canEdit ? (
          <button
            type="button"
            onClick={handle}
            aria-expanded={expanded}
            className={`inline-flex items-center gap-1 rounded-md border border-dashed border-gold/50 px-2 py-1 text-[11px] font-bold text-gold-deep transition hover:border-gold hover:bg-gold/10 ${FOCUS_RING}`}
          >
            <Plus className="h-3 w-3" /> Registrar motivo
          </button>
        ) : (
          <span className="text-[11px] text-zinc-400">—</span>
        )}
      </div>
    );
  }

  return (
    <div className="flex max-w-[340px] flex-col items-start gap-1">
      <span className="inline-flex items-center gap-1 rounded-md border border-success/35 bg-success/10 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-success-strong">
        <CheckCircle2 className="h-3 w-3" /> Justificado
      </span>
      {/* Resumo só em tela média para cima; no celular fica apenas o gatilho.
          O `hidden/sm:block` vive no CONTÊINER: aplicado no próprio parágrafo ele
          brigaria com o `display:-webkit-box` que o `line-clamp-2` precisa. */}
      <div className="hidden sm:block">
        <p className="line-clamp-2 text-[11px] leading-snug text-zinc-600" title={note.reason}>
          {note.reason}
        </p>
      </div>
      <button
        type="button"
        onClick={handle}
        aria-expanded={expanded}
        className={`rounded-md px-1 text-[11px] font-bold text-gold-deep underline decoration-gold/50 underline-offset-2 transition hover:decoration-gold ${FOCUS_RING}`}
      >
        <span className="sm:hidden">Ver motivo</span>
        <span className="hidden sm:inline">{canEdit ? "Ver / Editar" : "Ver justificativa"}</span>
      </button>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Painel central expansível                                          */
/* ------------------------------------------------------------------ */

type HistoryState = { loading: boolean; notes: PcFactoryAvailabilityNoteDTO[] };

/**
 * Painel horizontal que abre logo abaixo da máquina selecionada, ocupando a
 * largura inteira da tabela. Visual escuro da identidade Zucchi (preto/grafite,
 * dourado e bege) para destacar-se da tabela clara sem virar um modal.
 *
 * Mostra os números do recorte (disponibilidade, horas de parada, período) só
 * para leitura — o painel nunca recalcula nada: ele repete `row.availability` e
 * `row.downtimeHours`, os mesmos valores das células.
 */
function AvailabilityNotePanel({
  row,
  note,
  period,
  canEdit,
  onClose,
  onSaved
}: {
  row: PcFactoryReliabilityRow;
  note: PcFactoryAvailabilityNoteDTO | null;
  period: PcFactoryPeriodWindowDTO;
  canEdit: boolean;
  onClose: () => void;
  onSaved: (note: PcFactoryAvailabilityNoteDTO) => void;
}) {
  const [reason, setReason] = useState(note?.reason ?? "");
  const [actionPlan, setActionPlan] = useState(note?.actionPlan ?? "");
  const [responsible, setResponsible] = useState(note?.responsible ?? "");
  const [saving, setSaving] = useState(false);
  const [history, setHistory] = useState<HistoryState>({ loading: true, notes: [] });
  const reasonRef = useRef<HTMLTextAreaElement | null>(null);

  const machineLabel = normalizeMachineName(row.machineName) || row.machineName;

  useEffect(() => {
    reasonRef.current?.focus();
  }, []);

  // Histórico: as OUTRAS janelas já justificadas desta máquina. Confirma na tela
  // que nada foi sobrescrito quando um novo período recebe outra justificativa.
  const loadHistory = useCallback(async () => {
    try {
      const response = await fetch(
        `/api/pc-factory/availability-notes?machine=${encodeURIComponent(row.machineName)}&history=1`
      );
      const payload = (await response.json()) as { ok?: boolean; notes?: PcFactoryAvailabilityNoteDTO[] };
      setHistory({ loading: false, notes: response.ok && payload.notes ? payload.notes : [] });
    } catch {
      setHistory({ loading: false, notes: [] });
    }
  }, [row.machineName]);

  useEffect(() => {
    void loadHistory();
  }, [loadHistory]);

  async function save() {
    const text = reason.trim();
    if (!text) {
      toast.error("Escreva a justificativa antes de salvar.");
      reasonRef.current?.focus();
      return;
    }

    setSaving(true);
    try {
      const response = await fetch("/api/pc-factory/availability-notes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          resourceName: row.machineName,
          resourceCode: row.machineCode,
          periodStart: period.startDate,
          periodEnd: period.endDate,
          reason: text,
          actionPlan: actionPlan.trim() || null,
          responsible: responsible.trim() || null,
          // Foto informativa do que o gestor via ao escrever. Não é usada em
          // cálculo nenhum — a tela sempre recalcula a partir dos registros.
          availabilitySnapshot: row.availability,
          downtimeHoursSnapshot: row.downtimeHours
        })
      });

      const payload = (await response.json().catch(() => null)) as
        | { ok?: boolean; note?: PcFactoryAvailabilityNoteDTO; message?: string }
        | null;

      if (!response.ok || !payload?.ok || !payload.note) {
        toast.error(payload?.message ?? "Não foi possível salvar a justificativa.");
        return;
      }

      toast.success("Justificativa salva.");
      onSaved(payload.note);
    } catch {
      toast.error("Não foi possível salvar a justificativa.");
    } finally {
      setSaving(false);
    }
  }

  // Cliques dentro do painel não devem abrir o drawer da linha.
  return (
    <section
      onClick={(event) => event.stopPropagation()}
      className="my-2 w-full rounded-lg border border-gold/35 bg-ink p-4 text-parchment shadow-premium sm:p-5"
      aria-label={`Justificativa de disponibilidade — ${machineLabel}`}
    >
      <header className="mb-4 flex flex-wrap items-start justify-between gap-3 border-b border-gold/20 pb-3">
        <div>
          <h4 className="text-sm font-extrabold uppercase tracking-wide text-gold-soft">{machineLabel}</h4>
          <dl className="mt-1.5 flex flex-wrap gap-x-5 gap-y-1 text-[11px]">
            <Fact label="Disponibilidade Física" value={formatPercent(row.availability)} />
            <Fact label="Horas de Parada" value={formatHours(row.downtimeHours)} />
            <Fact label="Tempo Total do Período" value={formatHours(row.periodHours)} />
            <Fact label="Período" value={period.label} />
          </dl>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Fechar justificativa"
          className={`rounded-md border border-gold/25 p-1.5 text-parchment transition hover:border-gold/55 hover:text-white ${FOCUS_RING}`}
        >
          <X className="h-4 w-4" />
        </button>
      </header>

      {canEdit ? (
        <div className="space-y-3">
          <Field
            label="Justificativa da baixa disponibilidade"
            hint={`Obrigatório · até ${AVAILABILITY_NOTE_LIMITS.reason} caracteres`}
          >
            <textarea
              ref={reasonRef}
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              maxLength={AVAILABILITY_NOTE_LIMITS.reason}
              rows={3}
              placeholder="Ex.: Quebra do redutor principal. Máquina aguardou componente de reposição durante quatro dias."
              className={FIELD_CLASS}
            />
          </Field>

          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Plano de ação" hint="Opcional">
              <textarea
                value={actionPlan}
                onChange={(event) => setActionPlan(event.target.value)}
                maxLength={AVAILABILITY_NOTE_LIMITS.actionPlan}
                rows={2}
                placeholder="Ex.: Antecipar compra de redutor reserva."
                className={FIELD_CLASS}
              />
            </Field>
            <Field label="Responsável" hint="Opcional">
              <input
                value={responsible}
                onChange={(event) => setResponsible(event.target.value)}
                maxLength={AVAILABILITY_NOTE_LIMITS.responsible}
                placeholder="Ex.: Manutenção Mecânica"
                className={FIELD_CLASS}
              />
            </Field>
          </div>

          <p className="text-[11px] text-parchment-dim">
            A justificativa é informação gerencial: não altera Horas de Parada, Tempo Total nem Disponibilidade.
          </p>

          <div className="flex flex-wrap justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              className={`inline-flex h-9 items-center gap-2 rounded-lg border border-gold/25 px-4 text-sm font-bold text-parchment transition hover:border-gold/55 hover:text-white disabled:cursor-not-allowed disabled:opacity-60 ${FOCUS_RING}`}
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={save}
              disabled={saving}
              className={`inline-flex h-9 items-center gap-2 rounded-lg border border-gold/60 bg-gold/20 px-4 text-sm font-bold text-gold-soft transition hover:bg-gold/30 disabled:cursor-not-allowed disabled:opacity-60 ${FOCUS_RING}`}
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Salvar justificativa
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-2">
          <p className="whitespace-pre-wrap text-sm text-parchment">{note?.reason ?? "Sem justificativa registrada."}</p>
          {note?.actionPlan ? (
            <p className="text-[12px] text-parchment-dim">
              <span className="font-bold text-gold-soft">Plano de ação:</span> {note.actionPlan}
            </p>
          ) : null}
          {note?.responsible ? (
            <p className="text-[12px] text-parchment-dim">
              <span className="font-bold text-gold-soft">Responsável:</span> {note.responsible}
            </p>
          ) : null}
          <p className="text-[11px] text-parchment-dim">Seu perfil permite apenas visualizar justificativas.</p>
        </div>
      )}

      {note ? (
        <p className="mt-3 border-t border-gold/15 pt-2 text-[11px] text-parchment-dim">
          Registrado por {note.createdByName ?? "usuário desconhecido"} em {formatDateTime(note.createdAt)}
          {note.updatedAt !== note.createdAt
            ? ` · Última alteração por ${note.updatedByName ?? "usuário desconhecido"} em ${formatDateTime(note.updatedAt)}`
            : ""}
        </p>
      ) : null}

      <div className="mt-3 border-t border-gold/15 pt-3">
        <h5 className="text-[11px] font-extrabold uppercase tracking-wide text-gold-soft">Histórico de justificativas</h5>
        {history.loading ? (
          <p className="mt-1 text-[11px] text-parchment-dim">Carregando…</p>
        ) : history.notes.length === 0 ? (
          <p className="mt-1 text-[11px] text-parchment-dim">Nenhuma justificativa registrada para esta máquina.</p>
        ) : (
          <ul className="mt-1.5 space-y-1">
            {history.notes.map((item) => (
              <li key={item.id} className="flex flex-wrap gap-x-2 text-[11px] text-parchment-dim">
                <span className="font-bold text-parchment">{item.periodLabel}</span>
                <span className="line-clamp-1 max-w-[70%]" title={item.reason}>
                  — {item.reason}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

const FIELD_CLASS =
  "w-full rounded-md border border-gold/25 bg-ink-raised px-2.5 py-2 text-sm text-champagne placeholder:text-parchment-dim/60 outline-none transition focus-visible:border-gold focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-gold/50";

function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 flex items-baseline gap-2 text-[11px] font-extrabold uppercase tracking-wide text-gold-soft">
        {label}
        {hint ? <span className="font-semibold normal-case tracking-normal text-parchment-dim">{hint}</span> : null}
      </span>
      {children}
    </label>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline gap-1.5">
      <dt className="text-parchment-dim">{label}:</dt>
      <dd className="font-bold text-champagne tabular-nums">{value}</dd>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Cabeçalho ordenável e formatadores                                 */
/* ------------------------------------------------------------------ */

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
    <th
      className={`${className} ${align === "right" ? "text-right" : ""}`}
      aria-sort={isActive ? (direction === "asc" ? "ascending" : "descending") : "none"}
    >
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

function indexNotes(notes: PcFactoryAvailabilityNoteDTO[]): Record<string, PcFactoryAvailabilityNoteDTO> {
  const map: Record<string, PcFactoryAvailabilityNoteDTO> = {};
  for (const note of notes) map[note.resourceName] = note;
  return map;
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

function formatDateTime(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime())
    ? "—"
    : date.toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}

/**
 * Composição das HORAS DE PARADA da máquina, para a célula não ser um número sem
 * origem. Corretiva e Planejada aparecem separadas porque só a corretiva entra no
 * MTTR (calculado no service e exibido no detalhe da máquina) — as duas somam
 * aqui e na Disponibilidade.
 */
function downtimeBreakdown(row: PcFactoryReliabilityRow): string {
  const h = (value: number) => `${value.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} h`;
  return [
    `Composição das Horas de Parada — ${normalizeMachineName(row.machineName) || row.machineName}`,
    `Reparo corretivo (Mec. + Elét. + Autom. + Terceiros): ${h(row.repairHours)}`,
    `Manutenção Planejada: ${h(row.plannedMaintenanceHours)}`,
    `Aguardando Manutenção: ${h(row.waitingMaintenanceHours)}`,
    `Total: ${h(row.maintenanceDowntimeHours)}`,
    "Este total é o mesmo valor subtraído do Tempo Total na Disponibilidade Física."
  ].join("\n");
}

/**
 * A conta da DISPONIBILIDADE FÍSICA aberta na célula, nos mesmos termos da
 * conferência manual do PCM — os três insumos e a divisão, para bater na
 * calculadora sem sair da tela:
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
    "Horas de Parada = Mecânica + Elétrica + Automação + Planejada + Terceiros + Aguardando.",
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
 * Verde ≥ 90%, âmbar 70-90%, vermelho < 70% — as MESMAS faixas que a tabela já
 * usava, agora vindas de `PHYSICAL_AVAILABILITY_BANDS` para que o badge de
 * "Justificativa pendente" use exatamente o mesmo corte de criticidade.
 *
 * O vermelho e o âmbar ganharam borda e peso: num fundo claro, só o preenchimento
 * a 15% deixava a faixa crítica com contraste parecido com o da faixa boa — que é
 * justamente o oposto do que a tabela precisa comunicar de relance.
 */
function availabilityClass(value: number | null): string {
  switch (classifyPhysicalAvailability(value)) {
    case "boa":
      return "border border-success/30 bg-success/15 text-success-strong";
    case "atencao":
      return "border border-gold/45 bg-gold/25 text-gold-deep";
    case "critica":
      return "border border-danger/50 bg-danger/20 font-extrabold text-danger";
    default:
      return "border border-zinc-300 bg-zinc-100 text-zinc-600";
  }
}
