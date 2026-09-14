"use client";

import { CalendarClock, CheckCircle2, Database, EyeOff, FileWarning, ShieldCheck } from "lucide-react";
import { FieldNotice } from "@/components/ui/FieldNotice";
import type { DataQualitySummary } from "@/types/data-quality";

type DataQualityPanelProps = {
  quality: DataQualitySummary;
  className?: string;
  /** Rótulo do botão. A aba PC-Factory usa um próprio, mais específico. */
  title?: string;
};

/**
 * Painel "Qualidade dos dados" — discreto, fechado por padrão.
 *
 * Existe para responder, sem sair da tela, as três perguntas que a gestão faz quando
 * desconfia de um número: quantos registros entraram, o que ficou de fora e de quando
 * é a base. Fica em `<details>` porque a resposta só interessa quando a pergunta
 * aparece — mas precisa estar a um clique, não numa reunião.
 *
 * Todos os valores vêm prontos do service (ver `DataQualitySummary`). Nenhuma conta
 * acontece aqui.
 */
export function DataQualityPanel({ quality, className = "", title = "Qualidade dos dados" }: DataQualityPanelProps) {
  const temAviso = quality.notices.length > 0 || quality.missingFields.length > 0;
  const int = (value: number) => value.toLocaleString("pt-BR");

  return (
    <details className={`group rounded-lg border border-gold/15 bg-ink/60 ${className}`}>
      <summary className="flex cursor-pointer list-none items-center gap-2 px-3 py-2 text-[11px] font-bold uppercase tracking-wide text-gold transition hover:bg-gold/5">
        <Database className="h-3.5 w-3.5" />
        <span className="flex-1">{title}</span>
        {temAviso ? (
          <span className="inline-flex items-center gap-1 rounded-full border border-amber-500/40 bg-amber-500/10 px-2 py-0.5 text-[10px] font-semibold normal-case text-amber-200">
            <FileWarning className="h-3 w-3" />
            {quality.notices.length + quality.missingFields.length} aviso
            {quality.notices.length + quality.missingFields.length > 1 ? "s" : ""}
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 rounded-full border border-success/35 bg-success/10 px-2 py-0.5 text-[10px] font-semibold normal-case text-success-strong">
            <ShieldCheck className="h-3 w-3" />
            Sem avisos
          </span>
        )}
        <span className="text-[10px] font-normal normal-case text-zinc-500 transition group-open:hidden">ver</span>
      </summary>

      <div className="space-y-3 border-t border-gold/10 px-3 py-3">
        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 xl:grid-cols-5">
          <Metric icon={Database} label="Registros analisados" value={int(quality.analyzedRecords)} />
          <Metric icon={CheckCircle2} label="Registros válidos" value={int(quality.validRecords)} />
          <Metric
            icon={FileWarning}
            label="Registros ignorados"
            value={int(quality.ignoredRecords)}
            tone={quality.ignoredRecords > 0 ? "warn" : undefined}
          />
          <Metric
            icon={EyeOff}
            label="Opções de filtro ocultadas"
            value={int(quality.removedFilterOptions)}
            hint="sem dados no período"
          />
          <Metric
            icon={CalendarClock}
            label="Última importação"
            value={formatDateTime(quality.lastImportAt)}
            hint={quality.lastImportLabel ?? undefined}
          />
        </div>

        {quality.metrics.length ? (
          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 xl:grid-cols-5">
            {quality.metrics.map((metric) => (
              <Metric key={metric.label} label={metric.label} value={metric.value} hint={metric.hint} />
            ))}
          </div>
        ) : null}

        {quality.hiddenFilters.length ? (
          <p className="text-[11px] text-zinc-400">
            <span className="font-semibold text-champagne">Filtros ocultados: </span>
            {quality.hiddenFilters.join(", ")} — nenhuma opção com dados na base importada.
          </p>
        ) : null}

        {quality.missingFields.length ? (
          <p className="text-[11px] text-zinc-400">
            <span className="font-semibold text-champagne">Campos ausentes na base: </span>
            {quality.missingFields.join(", ")}.
          </p>
        ) : null}

        <FieldNotice notices={quality.notices} />

        <p className="border-t border-gold/10 pt-2 text-[10px] text-zinc-500">Fonte: {quality.sourceLabel}</p>
      </div>
    </details>
  );
}

function Metric({
  icon: Icon,
  label,
  value,
  hint,
  tone
}: {
  icon?: typeof Database;
  label: string;
  value: string;
  hint?: string;
  tone?: "warn";
}) {
  return (
    <div className="rounded-lg border border-gold/10 bg-black/25 px-2.5 py-2">
      <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wide text-zinc-500">
        {Icon ? <Icon className="h-3 w-3 text-gold/70" /> : null}
        <span className="truncate" title={label}>
          {label}
        </span>
      </div>
      <p className={`mt-0.5 truncate text-sm font-semibold tabular-nums ${tone === "warn" ? "text-amber-300" : "text-champagne"}`} title={value}>
        {value}
      </p>
      {hint ? (
        <p className="truncate text-[10px] text-zinc-500" title={hint}>
          {hint}
        </p>
      ) : null}
    </div>
  );
}

function formatDateTime(iso: string | null): string {
  if (!iso) return "Não registrada";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "Não registrada";
  return date.toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
}
