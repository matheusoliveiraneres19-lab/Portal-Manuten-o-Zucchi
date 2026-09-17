"use client";

/**
 * Modal "Gerar Relatório de Aderência" da aba Ordens de Serviço.
 *
 * Só coleta período e a opção de reaproveitar os filtros da tela — nenhuma regra
 * de aderência mora aqui. O POST manda apenas filtros; o servidor devolve o PDF
 * pronto e o navegador baixa o arquivo.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { FileBarChart, Loader2, X } from "lucide-react";
import { toast } from "sonner";
import type { AppliedServiceOrderFilters } from "@/types/service-orders";

type AdherenceReportModalProps = {
  open: boolean;
  onClose: () => void;
  /** Filtros aplicados na tela — origem do período padrão e do "usar filtros atuais". */
  appliedFilters: AppliedServiceOrderFilters;
};

/** "2026-08-31" → "31/08/2026" (só para exibição). */
function toBr(value: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return "--/--/----";
  const [year, month, day] = value.split("-");
  return `${day}/${month}/${year}`;
}

/** Primeiro dia do ano corrente, usado quando a tela está sem período. */
function defaultStart(): string {
  return `${new Date().getFullYear()}-01-01`;
}

/** Hoje, em AAAA-MM-DD (fuso local), usado quando a tela está sem período. */
function defaultEnd(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

export function AdherenceReportModal({ open, onClose, appliedFilters }: AdherenceReportModalProps) {
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [useCurrentFilters, setUseCurrentFilters] = useState(true);
  const [generating, setGenerating] = useState(false);
  const closeRef = useRef<HTMLButtonElement>(null);

  /** Filtros da tela que o relatório sabe replicar (período vai separado). */
  const activeFilters = useMemo(() => {
    const parts: string[] = [];
    if (appliedFilters.statuses.length) parts.push(`Status (${appliedFilters.statuses.length})`);
    if (appliedFilters.planningGroups.length) parts.push(`Grupo de planejamento (${appliedFilters.planningGroups.length})`);
    if (appliedFilters.responsibles.length) parts.push(`Responsável (${appliedFilters.responsibles.length})`);
    if (appliedFilters.equipment.trim()) parts.push("Objeto técnico");
    if (appliedFilters.areas.length) parts.push(`Área de manutenção (${appliedFilters.areas.length})`);
    return parts;
  }, [appliedFilters]);

  // Ao abrir, o período do modal começa igual ao período ATIVO da página.
  useEffect(() => {
    if (!open) return;
    setDateFrom(appliedFilters.startDate || defaultStart());
    setDateTo(appliedFilters.endDate || defaultEnd());
    setUseCurrentFilters(true);
    setGenerating(false);
    closeRef.current?.focus();
  }, [open, appliedFilters.startDate, appliedFilters.endDate]);

  // Esc fecha — mas não no meio de uma geração, para não perder o download.
  useEffect(() => {
    if (!open) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape" && !generating) onClose();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, generating, onClose]);

  if (!open) return null;

  const invalidRange = Boolean(dateFrom && dateTo && dateFrom > dateTo);
  const canGenerate = Boolean(dateFrom) && Boolean(dateTo) && !invalidRange && !generating;

  async function handleGenerate() {
    if (!canGenerate) return;
    setGenerating(true);

    const toastId = toast.loading("Calculando aderência das ordens...");

    try {
      const response = await fetch("/api/service-orders/adherence-report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          dateFrom,
          dateTo,
          useCurrentFilters,
          // Só os FILTROS viajam — nunca as ordens.
          filters: useCurrentFilters
            ? {
                statuses: appliedFilters.statuses,
                areas: appliedFilters.areas,
                planningGroups: appliedFilters.planningGroups,
                responsibles: appliedFilters.responsibles,
                equipment: appliedFilters.equipment
              }
            : undefined
        })
      });

      if (!response.ok) {
        const detail = await response.json().catch(() => null);
        throw new Error(detail?.message ?? "Não foi possível gerar o relatório de aderência.");
      }

      const blob = await response.blob();
      const fileName = response.headers.get("X-Report-File-Name") ?? "relatorio-aderencia.pdf";

      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = fileName;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);

      const total = response.headers.get("X-Report-Total");
      const adherence = response.headers.get("X-Report-Adherence");
      toast.success(
        total && adherence
          ? `Relatório gerado: ${Number(total).toLocaleString("pt-BR")} OS · aderência ${Number(adherence).toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`
          : "Relatório de aderência gerado.",
        { id: toastId }
      );
      onClose();
    } catch (caught) {
      console.error("Falha ao gerar o relatório de aderência.", caught);
      toast.error(caught instanceof Error ? caught.message : "Falha ao gerar o relatório.", { id: toastId });
    } finally {
      setGenerating(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="adherence-report-title"
      onClick={(event) => {
        if (event.target === event.currentTarget && !generating) onClose();
      }}
    >
      <div className="w-full max-w-lg overflow-hidden rounded-xl border border-gold/25 bg-ink-card shadow-premium">
        <header className="flex items-start justify-between gap-4 border-b border-gold/15 bg-ink-card-top px-5 py-4">
          <div className="flex items-start gap-3">
            <span className="mt-0.5 rounded-lg border border-gold/30 bg-gold/10 p-2">
              <FileBarChart className="h-5 w-5 text-gold" />
            </span>
            <div>
              <h2 id="adherence-report-title" className="text-sm font-semibold text-surface">
                Gerar Relatório de Aderência
              </h2>
              <p className="mt-0.5 text-xs text-parchment-dim">
                Aderência (%) à execução das ordens de serviços — Mecânica, Elétrica e Terceiros.
              </p>
            </div>
          </div>
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            disabled={generating}
            aria-label="Fechar"
            className="rounded-lg border border-gold/20 p-1.5 text-parchment transition hover:border-gold/40 hover:text-white disabled:opacity-40"
          >
            <X className="h-4 w-4" />
          </button>
        </header>

        <div className="space-y-4 px-5 py-5">
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block">
              <span className="mb-1.5 block text-xs font-semibold text-parchment">Data inicial</span>
              <input
                type="date"
                value={dateFrom}
                max={dateTo || undefined}
                onChange={(event) => setDateFrom(event.target.value)}
                disabled={generating}
                className="h-10 w-full rounded-lg border border-gold/20 bg-white/[0.04] px-3 text-sm text-surface outline-none transition focus:border-gold/50 disabled:opacity-50"
              />
            </label>
            <label className="block">
              <span className="mb-1.5 block text-xs font-semibold text-parchment">Data final</span>
              <input
                type="date"
                value={dateTo}
                min={dateFrom || undefined}
                onChange={(event) => setDateTo(event.target.value)}
                disabled={generating}
                className="h-10 w-full rounded-lg border border-gold/20 bg-white/[0.04] px-3 text-sm text-surface outline-none transition focus:border-gold/50 disabled:opacity-50"
              />
            </label>
          </div>

          {invalidRange ? (
            <p className="rounded-lg border border-danger/40 bg-danger/10 px-3 py-2 text-xs text-danger-soft">
              A data inicial precisa ser anterior ou igual à data final.
            </p>
          ) : (
            <p className="text-xs text-parchment-dim">
              Período do relatório: <strong className="text-parchment">{toBr(dateFrom)}</strong> a{" "}
              <strong className="text-parchment">{toBr(dateTo)}</strong>. Todos os gráficos usam exatamente este recorte.
            </p>
          )}

          <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-gold/20 bg-white/[0.03] px-3 py-3">
            <input
              type="checkbox"
              checked={useCurrentFilters}
              onChange={(event) => setUseCurrentFilters(event.target.checked)}
              disabled={generating}
              className="mt-0.5 h-4 w-4 accent-[#D6AA3A]"
            />
            <span className="text-xs">
              <span className="font-semibold text-surface">Usar filtros atuais da tela</span>
              <span className="mt-1 block text-parchment-dim">
                {activeFilters.length
                  ? `Aplicados: ${activeFilters.join(" · ")}.`
                  : "Nenhum filtro além do período está ativo na tela no momento."}{" "}
                Desmarque para considerar apenas o período acima.
              </span>
            </span>
          </label>

          <p className="text-[11px] leading-relaxed text-parchment-dim">
            OS fechada = status <strong className="text-parchment">Tecnicamente encerrado</strong>. A contagem é por ordem
            de serviço (não por operação), com a data-base de início como referência temporal.
          </p>
        </div>

        <footer className="flex items-center justify-end gap-2 border-t border-gold/15 bg-ink-card-top px-5 py-3">
          <button
            type="button"
            onClick={onClose}
            disabled={generating}
            className="h-10 rounded-lg border border-gold/20 px-4 text-xs font-semibold text-parchment transition hover:border-gold/40 hover:text-white disabled:opacity-40"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleGenerate}
            disabled={!canGenerate}
            className="inline-flex h-10 items-center gap-2 rounded-lg border border-gold/55 bg-gold/15 px-4 text-xs font-semibold text-gold transition hover:bg-gold/25 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {generating ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileBarChart className="h-4 w-4" />}
            {generating ? "Calculando aderência das ordens..." : "Gerar relatório"}
          </button>
        </footer>
      </div>
    </div>
  );
}
