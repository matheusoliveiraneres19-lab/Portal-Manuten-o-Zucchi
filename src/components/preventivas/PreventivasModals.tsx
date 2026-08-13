"use client";

import { useEffect } from "react";
import { Calculator, X } from "lucide-react";
import type { PreventiveOrderRow } from "@/types/preventive-orders";

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Intl.DateTimeFormat("pt-BR", { timeZone: "UTC", day: "2-digit", month: "2-digit", year: "numeric" }).format(
    new Date(iso)
  );
}

export function alertReason(row: PreventiveOrderRow): string {
  switch (row.managementStatus) {
    case "Fechada sem execução":
      return "OS encerrada no SAP com trabalho real ≤ 0,1 h — sem evidência de execução.";
    case "Aberta sem execução":
      return row.daysOpen !== null
        ? `Aberta há ${row.daysOpen} dia(s) e ainda sem trabalho real apontado.`
        : "Aberta e ainda sem trabalho real apontado.";
    case "Atrasada":
      return "OS vencida e ainda não concluída.";
    case "Em andamento":
      return "Execução iniciada (trabalho real > 0,1 h), ordem ainda aberta.";
    case "Realizada":
      return "Execução confirmada (trabalho real > 0,1 h).";
    case "Cancelada":
      return "OS cancelada no SAP.";
    default:
      return "—";
  }
}

// Fecha modais ao pressionar Esc.
function useEscClose(active: boolean, onClose: () => void) {
  useEffect(() => {
    if (!active) return;
    const handler = (event: KeyboardEvent) => event.key === "Escape" && onClose();
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [active, onClose]);
}

export function OrderDetailDrawer({ row, onClose }: { row: PreventiveOrderRow | null; onClose: () => void }) {
  useEscClose(Boolean(row), onClose);
  if (!row) return null;

  const executionClass = row.executionStatus === "Realizada" ? "text-emerald-300" : "text-red-300";

  return (
    <div className="fixed inset-0 z-50 flex justify-end" role="dialog" aria-modal="true" aria-label="Detalhe da ordem">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <aside className="relative z-10 flex h-full w-full max-w-md flex-col overflow-y-auto border-l border-gold/30 bg-ink shadow-2xl">
        <div className="flex items-start justify-between gap-3 border-b border-gold/20 p-5">
          <div>
            <div className="flex items-center gap-2">
              <span
                className={`rounded px-1.5 py-0.5 text-[11px] font-bold ${
                  row.type === "PL" ? "bg-sky-400/15 text-sky-300" : "bg-gold/15 text-gold"
                }`}
              >
                {row.type}
              </span>
              <span className="text-xs text-zinc-400">{row.area}</span>
            </div>
            <h2 className="mt-2 font-serif text-xl text-white">OS {row.osNumber}</h2>
            <p className="mt-1 text-sm text-zinc-300">{row.title}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar"
            className="grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-gold/25 text-zinc-300 transition hover:border-gold/50 hover:text-white"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-1 p-5">
          <DetailRow label="Equipamento" value={row.equipmentName} />
          <DetailRow label="Local de instalação" value={row.technicalObject} />
          <DetailRow label="Operação" value={row.operation} />
          <DetailRow label="Responsável" value={row.responsibleName} />
          <DetailRow label="Status SAP" value={row.statusSapLabel} />
          <DetailRow label="Status Gerencial" value={row.managementStatus} />
          <DetailRow
            label="Trabalho Real"
            value={`${row.workedHours.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })} h`}
            valueClass={executionClass}
          />
          <DetailRow label="Execução" value={row.executionStatus} valueClass={executionClass} />
          <DetailRow label="Data início" value={formatDate(row.openedAt)} />
          <DetailRow label="Data fim" value={formatDate(row.closedAt)} />
          <DetailRow label="Dias em aberto" value={row.daysOpen === null ? "—" : `${row.daysOpen} dias`} />

          <div className="mt-4 rounded-lg border border-gold/20 bg-black/40 p-4">
            <p className="text-[11px] font-bold uppercase tracking-wide text-gold">Motivo do alerta</p>
            <p className="mt-1 text-sm leading-relaxed text-zinc-200">{alertReason(row)}</p>
          </div>

          {row.note ? (
            <div className="mt-3 rounded-lg border border-gold/15 bg-black/30 p-4">
              <p className="text-[11px] font-bold uppercase tracking-wide text-champagne/70">Observação</p>
              <p className="mt-1 text-sm leading-relaxed text-zinc-300">{row.note}</p>
            </div>
          ) : null}
        </div>
      </aside>
    </div>
  );
}

function DetailRow({
  label,
  value,
  valueClass = "text-zinc-100"
}: {
  label: string;
  value: string | null;
  valueClass?: string;
}) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-white/5 py-2">
      <span className="text-xs font-medium uppercase tracking-wide text-zinc-500">{label}</span>
      <span className={`text-right text-sm font-medium ${valueClass}`}>{value || "—"}</span>
    </div>
  );
}

export function RulesModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  useEscClose(open, onClose);
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 grid place-items-center p-4" role="dialog" aria-modal="true" aria-label="Como os indicadores são calculados">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative z-10 w-full max-w-lg overflow-hidden rounded-lg border border-gold/30 bg-ink shadow-2xl">
        <div className="flex items-center justify-between border-b border-gold/20 p-5">
          <div className="flex items-center gap-2 text-champagne">
            <Calculator className="h-5 w-5 text-gold" />
            <h2 className="text-sm font-bold uppercase tracking-[0.18em]">Como os indicadores são calculados</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar"
            className="grid h-9 w-9 place-items-center rounded-lg border border-gold/25 text-zinc-300 transition hover:border-gold/50 hover:text-white"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="space-y-3 p-5 text-sm leading-relaxed text-zinc-200">
          <RuleItem term="PL" desc="Ordens cujo título começa com “PL -” (Lubrificação)." />
          <RuleItem term="PV" desc="Ordens cujo título começa com “PV -” (Preventiva Elétrica)." />
          <RuleItem term="Realizada" desc="Trabalho real maior que 0,1 h." />
          <RuleItem term="Não realizada" desc="Trabalho real igual ou menor que 0,1 h (vazio conta como 0)." />
          <RuleItem term="Fechada sem execução" desc="OS encerrada no SAP com trabalho real ≤ 0,1 h." />
          <RuleItem term="Aderência" desc="realizadas ÷ total programadas × 100." />
          <RuleItem term="Backlog" desc="OS abertas/atrasadas ainda não realizadas (exclui as já fechadas)." />
          <p className="mt-2 rounded-lg border border-gold/15 bg-black/30 p-3 text-xs text-zinc-400">
            Observação: a base atual não traz data de vencimento, então “Atrasada” e “Preventiva vencida” só serão
            calculadas quando a importação passar a incluir esse campo.
          </p>
        </div>
      </div>
    </div>
  );
}

function RuleItem({ term, desc }: { term: string; desc: string }) {
  return (
    <div className="flex gap-3">
      <span className="min-w-[150px] shrink-0 font-semibold text-gold">{term}</span>
      <span className="text-zinc-300">{desc}</span>
    </div>
  );
}
