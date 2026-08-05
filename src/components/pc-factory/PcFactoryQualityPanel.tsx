"use client";

import { AlertTriangle, CalendarRange, CheckCircle2, Database, Factory, Layers, Tag } from "lucide-react";
import type { PcFactoryDataQuality } from "@/types/pc-factory";

type PcFactoryQualityPanelProps = {
  quality: PcFactoryDataQuality;
};

/**
 * Painel "Qualidade da importação" (TAREFA 8) — confirma se a planilha foi lida
 * corretamente: total, período, grupos, máquinas, status e registros com problema.
 */
export function PcFactoryQualityPanel({ quality }: PcFactoryQualityPanelProps) {
  const period =
    quality.periodStart && quality.periodEnd
      ? `${formatDate(quality.periodStart)} a ${formatDate(quality.periodEnd)}`
      : "Sem datas detectadas";
  const hasIssues = quality.recordsWithIssue > 0;

  return (
    <section className="rounded-lg border border-gold/20 bg-[#080909] p-4 shadow-premium sm:p-5">
      <div className="mb-3 flex items-center gap-2 text-xs font-bold uppercase tracking-[0.22em] text-gold">
        <Database className="h-4 w-4" />
        Qualidade da importação
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-6">
        <Metric icon={<Database className="h-4 w-4" />} label="Registros" value={quality.totalRecords.toLocaleString("pt-BR")} />
        <Metric icon={<Factory className="h-4 w-4" />} label="Máquinas" value={quality.resourcesDetected.toLocaleString("pt-BR")} />
        <Metric icon={<Layers className="h-4 w-4" />} label="Grupos" value={String(quality.groupsDetected.length)} />
        <Metric icon={<Tag className="h-4 w-4" />} label="Status distintos" value={String(quality.statusDetected.length)} />
        <Metric icon={<CalendarRange className="h-4 w-4" />} label="Período detectado" value={period} small />
        <Metric
          icon={hasIssues ? <AlertTriangle className="h-4 w-4" /> : <CheckCircle2 className="h-4 w-4" />}
          label="Registros com problema"
          value={quality.recordsWithIssue.toLocaleString("pt-BR")}
          tone={hasIssues ? "danger" : "ok"}
        />
      </div>

      {quality.notReportedHours > 0 || quality.recordsWithoutEndDate > 0 ? (
        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
          {quality.notReportedHours > 0 ? (
            <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-2.5 text-[11px] leading-snug text-amber-200/90">
              <strong className="font-semibold">
                {quality.notReportedHours.toLocaleString("pt-BR", { maximumFractionDigits: 0 })} h sem apontamento
              </strong>{" "}
              (&quot;Aguardando lançamento&quot; e &quot;Parada não Identificada&quot;). Esse tempo está DENTRO do Tempo de
              Carga e, como não é manutenção, entra na Disponibilidade como tempo disponível —{" "}
              <strong className="font-semibold">o indicador fica melhor do que a realidade medida.</strong>
            </div>
          ) : null}
          {quality.recordsWithoutEndDate > 0 ? (
            <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-2.5 text-[11px] leading-snug text-amber-200/90">
              <strong className="font-semibold">
                {quality.recordsWithoutEndDate.toLocaleString("pt-BR")} registros sem data de fim
              </strong>
              . Status ainda abertos na origem — a duração vem da coluna &quot;durationHours&quot; da planilha.
            </div>
          ) : null}
        </div>
      ) : null}

      {quality.availabilityAudit.operationalHours > 0 ? (
        <details className="mt-3 rounded-lg border border-gold/15 bg-black/25 p-3">
          <summary className="cursor-pointer text-[11px] font-bold uppercase tracking-wide text-gold">
            Como a Disponibilidade é calculada (base G0134)
          </summary>
          <div className="mt-2 space-y-1 text-[11px] text-zinc-300">
            <p className="font-mono text-[10px] text-zinc-400">{quality.availabilityAudit.formula}</p>
            <AuditLine
              label="Tempo Operacional (= G0134.LOADTIME)"
              value={`${fmt(quality.availabilityAudit.operationalHours)} h`}
            />
            <AuditLine
              label="− Manutenção (inclui Aguardando Manutenção)"
              value={`${fmt(quality.availabilityAudit.maintenanceHours)} h`}
            />
            <AuditLine
              label="dos quais Aguardando Manutenção"
              value={`${fmt(quality.availabilityAudit.waitingMaintenanceHours)} h`}
              muted
            />
            <AuditLine
              label="= Disponibilidade"
              value={
                quality.availabilityAudit.availabilityPercent === null
                  ? "—"
                  : `${quality.availabilityAudit.availabilityPercent.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} %`
              }
              strong
            />
            <p className="pt-1 text-[10px] leading-snug text-zinc-500">
              Para comparação, a <strong className="text-zinc-400">Utilização</strong> (Tempo Trabalhado ÷ Tempo Operacional,
              que desconta todas as paradas, não só manutenção) seria{" "}
              {quality.availabilityAudit.utilizationPercent === null
                ? "—"
                : `${quality.availabilityAudit.utilizationPercent.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} %`}
              . Não é a Disponibilidade.
            </p>
          </div>
        </details>
      ) : null}

      {quality.groupsDetected.length > 0 ? (
        <p className="mt-3 text-[11px] text-zinc-400">
          <span className="font-semibold text-gold">Grupos:</span> {quality.groupsDetected.join(" · ")}
        </p>
      ) : null}
      {quality.statusDetected.length > 0 ? (
        <p className="mt-1 text-[11px] text-zinc-400">
          <span className="font-semibold text-gold">Status:</span> {quality.statusDetected.join(" · ")}
        </p>
      ) : null}
    </section>
  );
}

function fmt(value: number): string {
  return value.toLocaleString("pt-BR", { maximumFractionDigits: 1 });
}

/** Linha da decomposição da fórmula de Disponibilidade. */
function AuditLine({
  label,
  value,
  strong = false,
  muted = false
}: {
  label: string;
  value: string;
  strong?: boolean;
  muted?: boolean;
}) {
  return (
    <div className={`flex items-baseline justify-between gap-3 ${muted ? "text-zinc-500" : ""}`}>
      <span className={strong ? "font-semibold text-champagne" : ""}>{label}</span>
      <span className={`shrink-0 font-mono ${strong ? "font-semibold text-gold" : ""}`}>{value}</span>
    </div>
  );
}

function Metric({
  icon,
  label,
  value,
  tone = "default",
  small = false
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  tone?: "default" | "danger" | "ok";
  small?: boolean;
}) {
  const valueClass = tone === "danger" ? "text-danger" : tone === "ok" ? "text-emerald-400" : "text-champagne";
  return (
    <div className="rounded-lg border border-gold/15 bg-black/25 p-3">
      <div className="mb-1 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-zinc-500">
        <span className="text-gold">{icon}</span>
        {label}
      </div>
      <div className={`font-semibold ${small ? "text-xs" : "text-lg"} ${valueClass}`}>{value}</div>
    </div>
  );
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("pt-BR", { timeZone: "UTC", day: "2-digit", month: "2-digit", year: "numeric" });
}
