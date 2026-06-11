"use client";

import { useEffect } from "react";
import { AnimatePresence, m } from "framer-motion";
import {
  AlertTriangle,
  CircleGauge,
  Info,
  Loader2,
  OctagonPause,
  Timer,
  TimerReset,
  TrendingUp,
  Wrench,
  X
} from "lucide-react";
import { PC_FACTORY_STATUS_LABELS } from "@/utils/pc-factory-normalizer";
import type { PcFactoryRecommendation, PcFactoryResourceDetails } from "@/types/pc-factory";

type PcFactoryDetailsDrawerProps = {
  open: boolean;
  loading: boolean;
  error: string | null;
  details: PcFactoryResourceDetails | null;
  onClose: () => void;
};

export function PcFactoryDetailsDrawer({ open, loading, error, details, onClose }: PcFactoryDetailsDrawerProps) {
  useEffect(() => {
    if (!open) return;
    function handleKey(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [open, onClose]);

  return (
    <AnimatePresence>
      {open ? (
        <m.div
          key="pc-factory-drawer"
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
            className="absolute right-0 top-0 flex h-full w-full max-w-[560px] flex-col border-l border-gold/25 bg-[#0a0b0b] text-champagne shadow-[0_0_60px_rgba(0,0,0,0.6)]"
          >
            <div className="flex items-start justify-between gap-3 border-b border-gold/20 bg-[#070808] px-5 py-4">
              <div className="min-w-0">
                <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-gold">Detalhe da máquina/recurso</p>
                <h2 className="mt-1 truncate font-serif text-xl text-white" title={details?.resourceName}>
                  {details?.resourceName ?? "Carregando..."}
                </h2>
                {details ? (
                  <p className="mt-0.5 font-mono text-xs text-zinc-400">
                    {details.resourceCode ?? "Sem código"}
                    {details.productionLine ? ` · ${details.productionLine}` : ""}
                    {details.sector ? ` · ${details.sector}` : ""}
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
                  {error ?? "Não foi possível carregar os detalhes deste recurso."}
                </div>
              ) : (
                <div className="space-y-5">
                  {/* Cabeçalho de indicadores */}
                  <div className="grid grid-cols-2 gap-3">
                    <Metric icon={CircleGauge} label="Disponibilidade" value={percent(details.availabilityPercent)} />
                    <Metric icon={TrendingUp} label="Utilização" value={percent(details.utilizationPercent)} />
                    <Metric icon={TimerReset} label="MTBF" value={metric(details.mtbf)} />
                    <Metric icon={Wrench} label="MTTR" value={metric(details.mttr)} />
                    <Metric icon={Timer} label="MTTF" value={metric(details.mttf)} />
                    <Metric icon={OctagonPause} label="Horas paradas" value={hours(details.stoppedHours)} />
                  </div>

                  {/* Resumo operacional */}
                  <Section title="Resumo operacional">
                    <div className="grid grid-cols-2 gap-x-4 gap-y-1 rounded-lg border border-gold/10 bg-black/20 px-3 py-2 text-xs">
                      <InlineInfo label="Horas totais" value={hours(details.totalHours)} />
                      <InlineInfo label="Horas em produção" value={hours(details.productionHours)} />
                      <InlineInfo label="Horas em manutenção" value={hours(details.maintenanceHours)} />
                      <InlineInfo label="Horas paradas" value={hours(details.stoppedHours)} />
                    </div>
                  </Section>

                  {/* Distribuição por status */}
                  <Section title="Distribuição por status">
                    {details.statusDistribution.length ? (
                      <div className="space-y-1.5">
                        {details.statusDistribution.map((slice) => (
                          <div key={slice.status} className="flex items-center gap-2 text-[11px]">
                            <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: slice.color }} />
                            <span className="w-32 shrink-0 truncate text-zinc-300">{slice.label}</span>
                            <div className="h-2 flex-1 overflow-hidden rounded-full bg-black/40">
                              <div className="h-full rounded-full" style={{ width: `${slice.percent}%`, background: slice.color }} />
                            </div>
                            <span className="w-20 shrink-0 text-right text-zinc-400">
                              {slice.totalHours.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} h
                            </span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-xs text-zinc-500">Sem distribuição de status.</p>
                    )}
                  </Section>

                  {/* Eventos de parada/manutenção */}
                  <Section title={`Eventos de manutenção (${details.maintenanceEvents.length})`}>
                    {details.maintenanceEvents.length ? (
                      <div className="max-h-[200px] space-y-1.5 overflow-y-auto pr-1">
                        {details.maintenanceEvents.map((event) => (
                          <div
                            key={event.id}
                            className="flex items-center justify-between gap-2 rounded-md border border-gold/10 bg-black/25 px-3 py-1.5 text-[11px]"
                          >
                            <span className="text-zinc-400">{formatDateTime(event.startDateTime)}</span>
                            <span className="flex-1 truncate text-zinc-300" title={event.observation ?? ""}>
                              {event.observation ?? PC_FACTORY_STATUS_LABELS[event.status]}
                            </span>
                            <span className="font-semibold text-amber-400">
                              {event.durationHours.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} h
                            </span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-xs text-zinc-500">Nenhum evento de manutenção registrado.</p>
                    )}
                  </Section>

                  {/* Histórico/timeline */}
                  <Section title={`Histórico recente (${details.recentRecords.length})`}>
                    <div className="max-h-[240px] space-y-1.5 overflow-y-auto pr-1">
                      {details.recentRecords.length ? (
                        details.recentRecords.map((record) => (
                          <div
                            key={record.id}
                            className="flex items-center justify-between gap-2 rounded-md border border-gold/10 bg-black/25 px-3 py-1.5 text-[11px]"
                          >
                            <span className="text-zinc-400">{formatDateTime(record.startDateTime)}</span>
                            <span className="flex-1 truncate text-zinc-300">{PC_FACTORY_STATUS_LABELS[record.status]}</span>
                            <span className="font-semibold text-zinc-200">
                              {record.durationHours.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} h
                            </span>
                          </div>
                        ))
                      ) : (
                        <p className="text-xs text-zinc-500">Sem registros.</p>
                      )}
                    </div>
                  </Section>

                  {/* Recomendações */}
                  <Section title="Recomendações automáticas">
                    <div className="space-y-2">
                      {details.recommendations.map((rec, index) => (
                        <Recommendation key={index} rec={rec} />
                      ))}
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

function Recommendation({ rec }: { rec: PcFactoryRecommendation }) {
  const styles = {
    danger: "border-danger/40 bg-danger/15 text-rose-200",
    warning: "border-amber-500/40 bg-amber-500/10 text-amber-200",
    info: "border-gold/20 bg-black/25 text-zinc-300"
  }[rec.tone];
  const Icon = rec.tone === "danger" ? AlertTriangle : rec.tone === "warning" ? Wrench : Info;
  return (
    <div className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-xs ${styles}`}>
      <Icon className="h-4 w-4 shrink-0" />
      {rec.message}
    </div>
  );
}

function Metric({ icon: Icon, label, value }: { icon: typeof CircleGauge; label: string; value: string }) {
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

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h3 className="mb-2 text-[11px] font-bold uppercase tracking-[0.18em] text-gold">{title}</h3>
      {children}
    </section>
  );
}

function hours(value: number): string {
  return `${value.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} h`;
}

function metric(value: number | null): string {
  return value === null ? "Dados insuficientes" : `${value.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} h`;
}

function percent(value: number | null): string {
  return value === null ? "Dados insuficientes" : `${value.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`;
}

function formatDateTime(iso: string | null): string {
  if (!iso) return "Não informado";
  return new Date(iso).toLocaleString("pt-BR", {
    timeZone: "UTC",
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  });
}
