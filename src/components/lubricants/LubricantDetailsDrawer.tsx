"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, m } from "framer-motion";
import { toast } from "sonner";
import {
  AlertTriangle,
  ArrowDownCircle,
  ArrowUpCircle,
  ExternalLink,
  FileCheck2,
  FileWarning,
  Gauge,
  Loader2,
  Save,
  Scale,
  Wrench,
  X
} from "lucide-react";
import { LUBRICANT_CATEGORY_LABELS } from "@/utils/lubricants-normalizer";
import type { LubricantDetails } from "@/types/lubricants";

type LubricantDetailsDrawerProps = {
  open: boolean;
  loading: boolean;
  error: string | null;
  details: LubricantDetails | null;
  onClose: () => void;
  onEditApplications: (code: string) => void;
  onEditSheet: (code: string) => void;
  onSaved: () => void;
};

export function LubricantDetailsDrawer({
  open,
  loading,
  error,
  details,
  onClose,
  onEditApplications,
  onEditSheet,
  onSaved
}: LubricantDetailsDrawerProps) {
  useEffect(() => {
    if (!open) {
      return;
    }
    function handleKey(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onClose();
      }
    }
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [open, onClose]);

  return (
    <AnimatePresence>
      {open ? (
        <m.div
          key="lubricant-drawer"
          className="fixed inset-0 z-50"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
        >
          <button type="button" aria-label="Fechar detalhes" onClick={onClose} className="absolute inset-0 bg-black/60 backdrop-blur-sm" />

          <m.aside
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ duration: 0.3, ease: [0.22, 0.61, 0.36, 1] }}
            className="absolute right-0 top-0 flex h-full w-full max-w-[540px] flex-col border-l border-gold/25 bg-ink text-champagne shadow-[0_0_60px_rgba(0,0,0,0.6)]"
          >
            <div className="flex items-start justify-between gap-3 border-b border-gold/20 bg-ink px-5 py-4">
              <div className="min-w-0">
                <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-gold">Detalhe do lubrificante</p>
                <h2 className="mt-1 truncate font-serif text-xl text-white" title={details?.description}>
                  {details?.description ?? "Carregando..."}
                </h2>
                {details ? (
                  <p className="mt-0.5 font-mono text-xs text-zinc-400">
                    {details.code} · {details.unit}
                    {details.category ? ` · ${details.category}` : ""}
                  </p>
                ) : null}
              </div>
              <button
                type="button"
                onClick={onClose}
                aria-label="Fechar"
                className="grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-gold/20 text-zinc-300 transition hover:border-gold/40 hover:text-white"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-5 py-4">
              {loading ? (
                <div className="flex h-40 items-center justify-center gap-2 text-sm text-zinc-400">
                  <Loader2 className="h-4 w-4 animate-spin text-gold" /> Carregando detalhes...
                </div>
              ) : error || !details ? (
                <div className="flex h-40 items-center justify-center px-6 text-center text-sm text-zinc-400">
                  {error ?? "Não foi possível carregar os detalhes deste lubrificante."}
                </div>
              ) : (
                <div className="space-y-5">
                  {/* Resumo */}
                  <div className="grid grid-cols-2 gap-3">
                    <Metric icon={ArrowUpCircle} label="Entradas totais" value={`${num(details.totalInputs)} ${details.unit}`} />
                    <Metric icon={ArrowDownCircle} label="Saídas totais" value={`${num(details.totalOutputs)} ${details.unit}`} />
                    <Metric icon={Scale} label="Saldo estimado" value={`${num(details.balance)} ${details.unit}`} />
                    <Metric icon={Gauge} label="Consumo médio/mês" value={`${num(details.averageMonthlyConsumption)} ${details.unit}`} />
                  </div>

                  <div className="grid grid-cols-2 gap-x-4 gap-y-1 rounded-lg border border-gold/10 bg-black/20 px-3 py-2 text-xs">
                    <InlineInfo label="Estoque inicial" value={`${num(details.initialStock)} ${details.unit}`} />
                    <InlineInfo label="Última movimentação" value={formatDate(details.lastMovementDate)} />
                  </div>

                  {details.belowMinimum ? (
                    <div className="flex items-center gap-2 rounded-lg border border-danger/40 bg-danger/15 px-3 py-2 text-xs text-rose-200">
                      <AlertTriangle className="h-4 w-4 shrink-0 text-danger" />
                      Saldo abaixo do estoque mínimo ({num(details.minimumStock)} {details.unit}) — necessita reposição.
                    </div>
                  ) : null}

                  <MinStockEditor
                    code={details.code}
                    unit={details.unit}
                    current={details.minimumStock}
                    onSaved={onSaved}
                  />

                  {/* Máquinas */}
                  <Section
                    title={`Máquinas onde é utilizado (${details.machineApplications.length})`}
                    action={
                      <SectionButton onClick={() => onEditApplications(details.code)}>
                        <Wrench className="h-3.5 w-3.5" /> Editar
                      </SectionButton>
                    }
                  >
                    {details.machineApplications.length ? (
                      <div className="space-y-2">
                        {details.machineApplications.map((app) => (
                          <div key={app.id} className="rounded-lg border border-gold/15 bg-black/30 px-3 py-2">
                            <div className="flex items-center justify-between gap-2">
                              <span className="truncate text-xs font-semibold text-zinc-100" title={app.equipmentName}>
                                {app.equipmentName}
                              </span>
                              {app.equipmentCode ? (
                                <span className="shrink-0 font-mono text-[10px] text-gold">{app.equipmentCode}</span>
                              ) : null}
                            </div>
                            {app.applicationPoint ? (
                              <p className="mt-0.5 text-[11px] text-zinc-400">Ponto: {app.applicationPoint}</p>
                            ) : null}
                            {app.recommendation ? (
                              <p className="mt-0.5 text-[11px] text-zinc-500">{app.recommendation}</p>
                            ) : null}
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-xs text-zinc-500">Nenhuma máquina informada. Use “Editar” para cadastrar.</p>
                    )}
                  </Section>

                  {/* Ficha técnica */}
                  <Section
                    title="Ficha técnica"
                    action={
                      <SectionButton onClick={() => onEditSheet(details.code)}>
                        <FileCheck2 className="h-3.5 w-3.5" /> Informar
                      </SectionButton>
                    }
                  >
                    {details.hasTechnicalSheet && details.technicalSheetUrl ? (
                      <a
                        href={details.technicalSheetUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-400 hover:underline"
                      >
                        <FileCheck2 className="h-4 w-4" /> Ficha técnica anexada
                        <ExternalLink className="h-3 w-3" />
                      </a>
                    ) : (
                      <p className="inline-flex items-center gap-1.5 text-xs font-semibold text-amber-400">
                        <FileWarning className="h-4 w-4" /> Ficha técnica pendente
                      </p>
                    )}
                    <p className="mt-1.5 text-[11px] text-zinc-500">
                      O upload de arquivos será habilitado na etapa de documentos. Por enquanto, informe a URL/caminho.
                    </p>
                  </Section>

                  {/* Movimentações recentes */}
                  <Section title={`Movimentações recentes (${details.recentMovements.length})`}>
                    <div className="max-h-[280px] space-y-1.5 overflow-y-auto pr-1">
                      {details.recentMovements.length ? (
                        details.recentMovements.map((movement) => {
                          const isOutput = movement.movementCategory === "SAIDA";
                          return (
                            <div
                              key={movement.id}
                              className="flex items-center justify-between gap-2 rounded-md border border-gold/10 bg-black/25 px-3 py-1.5 text-[11px]"
                            >
                              <span className="text-zinc-400">{formatDate(movement.movementDate)}</span>
                              <span className="flex-1 truncate text-zinc-300" title={movement.movementTypeText ?? ""}>
                                {LUBRICANT_CATEGORY_LABELS[movement.movementCategory]}
                              </span>
                              <span className={`font-semibold ${isOutput ? "text-danger" : "text-emerald-400"}`}>
                                {movement.quantity.toLocaleString("pt-BR", { maximumFractionDigits: 2 })} {movement.unit}
                              </span>
                            </div>
                          );
                        })
                      ) : (
                        <p className="text-xs text-zinc-500">Sem movimentações registradas.</p>
                      )}
                    </div>
                  </Section>
                </div>
              )}
            </div>
          </m.aside>
        </m.div>
      ) : null}
    </AnimatePresence>
  );
}

function Metric({ icon: Icon, label, value }: { icon: typeof Gauge; label: string; value: string }) {
  return (
    <div className="rounded-lg border border-gold/15 bg-black/30 p-3">
      <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-wide text-zinc-400">
        <Icon className="h-3.5 w-3.5 text-gold" />
        {label}
      </div>
      <p className="mt-1 truncate text-lg font-light text-white" title={value}>
        {value}
      </p>
    </div>
  );
}

function InlineInfo({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <p className="text-[10px] uppercase tracking-wide text-zinc-500">{label}</p>
      <p className="truncate text-zinc-200" title={value}>
        {value}
      </p>
    </div>
  );
}

function Section({ title, action, children }: { title: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section>
      <div className="mb-2 flex items-center justify-between gap-2">
        <h3 className="text-[11px] font-bold uppercase tracking-[0.18em] text-gold">{title}</h3>
        {action}
      </div>
      {children}
    </section>
  );
}

function SectionButton({ children, onClick }: { children: React.ReactNode; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center gap-1 rounded-md border border-gold/30 px-2 py-1 text-[10px] font-semibold text-gold transition hover:bg-gold/15"
    >
      {children}
    </button>
  );
}

function MinStockEditor({
  code,
  unit,
  current,
  onSaved
}: {
  code: string;
  unit: string;
  current: number;
  onSaved: () => void;
}) {
  const [value, setValue] = useState(String(current ?? 0));
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setValue(String(current ?? 0));
  }, [code, current]);

  async function save() {
    const parsed = Number(value.replace(",", "."));
    if (!Number.isFinite(parsed) || parsed < 0) {
      toast.error("Informe um estoque mínimo válido.");
      return;
    }
    setSaving(true);
    try {
      const response = await fetch("/api/lubricants/minimum-stock", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code, minimumStock: parsed })
      });
      if (!response.ok) {
        throw new Error("request failed");
      }
      toast.success("Estoque mínimo atualizado");
      onSaved();
    } catch {
      toast.error("Não foi possível salvar o estoque mínimo.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex items-end gap-2 rounded-lg border border-gold/10 bg-black/20 px-3 py-2">
      <label className="flex-1">
        <span className="mb-1 block text-[10px] uppercase tracking-wide text-zinc-500">Estoque mínimo ({unit})</span>
        <input
          value={value}
          onChange={(event) => setValue(event.target.value)}
          inputMode="decimal"
          className="h-9 w-full rounded-md border border-gold/15 bg-black/40 px-2.5 text-sm text-zinc-100 outline-none focus:border-gold/55"
        />
      </label>
      <button
        type="button"
        onClick={save}
        disabled={saving}
        className="inline-flex h-9 items-center gap-1.5 rounded-md border border-gold/40 px-3 text-xs font-semibold text-gold transition hover:bg-gold/15 disabled:opacity-60"
      >
        {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
        Salvar
      </button>
    </div>
  );
}

function num(value: number): string {
  return value.toLocaleString("pt-BR", { maximumFractionDigits: 2 });
}

function formatDate(iso: string | null): string {
  return iso ? new Date(iso).toLocaleDateString("pt-BR", { timeZone: "UTC" }) : "Não informado";
}
