"use client";

import { AlertTriangle, CalendarRange, CheckCircle2, Database, EyeOff, Factory, Filter, Layers, ListChecks, Tag } from "lucide-react";
import type { PcFactoryDataQuality, PcFactoryFilterAudit } from "@/types/pc-factory";

type PcFactoryQualityPanelProps = {
  quality: PcFactoryDataQuality;
  /** Prestação de contas dos filtros do recorte (FASE 4). */
  filterAudit: PcFactoryFilterAudit;
};

/**
 * Painel "Qualidade da importação" (TAREFA 8) — confirma se a planilha foi lida
 * corretamente: total, período, grupos, máquinas, status e registros com problema.
 */
export function PcFactoryQualityPanel({ quality, filterAudit }: PcFactoryQualityPanelProps) {
  const period =
    quality.periodStart && quality.periodEnd
      ? `${formatDate(quality.periodStart)} a ${formatDate(quality.periodEnd)}`
      : "Sem datas detectadas";
  const hasIssues = quality.recordsWithIssue > 0;

  return (
    <section className="rounded-lg border border-gold/20 bg-ink p-4 shadow-premium sm:p-5">
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

      {/*
        Auditoria dos filtros (FASE 4). O filtro de máquinas passou a listar só o que
        tem registro no período — antes eram 83 opções para 40 máquinas com dados em
        agosto/2026. Some opção da lista, então a tela precisa dizer quantas e por quê;
        sem isso, "a máquina sumiu do filtro" viraria mais um motivo de desconfiança.
      */}
      <div className="mt-3 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Metric
          icon={<Factory className="h-4 w-4" />}
          label="Máquinas na base"
          value={filterAudit.resourcesInDatabase.toLocaleString("pt-BR")}
        />
        <Metric
          icon={<Filter className="h-4 w-4" />}
          label="Disponíveis no período"
          value={filterAudit.resourcesInPeriod.toLocaleString("pt-BR")}
        />
        <Metric
          icon={<ListChecks className="h-4 w-4" />}
          label="Na tabela de confiabilidade"
          value={filterAudit.resourcesInReliabilityTable.toLocaleString("pt-BR")}
          small
        />
        <Metric
          icon={<EyeOff className="h-4 w-4" />}
          label="Removidas do filtro"
          value={filterAudit.resourcesRemovedFromFilter.toLocaleString("pt-BR")}
          small
        />
      </div>

      {filterAudit.resourcesRemovedFromFilter > 0 || filterAudit.hiddenFilters.length > 0 ? (
        <p className="mt-2 text-[11px] leading-snug text-zinc-400">
          {filterAudit.resourcesRemovedFromFilter > 0 ? (
            <>
              <strong className="font-semibold text-champagne">
                {filterAudit.resourcesRemovedFromFilter} máquina(s) fora do filtro
              </strong>{" "}
              por não terem nenhum registro no período selecionado.{" "}
            </>
          ) : null}
          {filterAudit.hiddenFilters.length > 0 ? (
            <>
              <strong className="font-semibold text-champagne">Filtros ocultados: </strong>
              {filterAudit.hiddenFilters.join(", ")} — a base importada não traz esses campos preenchidos.
            </>
          ) : null}
        </p>
      ) : null}

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
            <div className="rounded-lg border border-danger/40 bg-danger/10 p-2.5 text-[11px] leading-snug text-rose-200">
              <strong className="font-semibold">
                {quality.recordsWithoutEndDate.toLocaleString("pt-BR")} status abertos, com{" "}
                {quality.excludedOpenEndedHours.toLocaleString("pt-BR", { maximumFractionDigits: 0 })} h EXCLUÍDAS dos
                indicadores
              </strong>
              . O PC-Factory nunca registrou a mudança seguinte, então essa &quot;duração&quot; é só a distância até o momento
              do export — não é medição. Os registros seguem visíveis na tabela. Correção: fechar esses status na origem.
            </div>
          ) : null}
        </div>
      ) : null}

      {quality.availabilityAudit.operationalHours > 0 ? (
        <details className="mt-3 rounded-lg border border-gold/15 bg-black/25 p-3">
          <summary className="cursor-pointer text-[11px] font-bold uppercase tracking-wide text-gold">
            Auditoria da Disponibilidade Física
          </summary>
          <div className="mt-2 space-y-1 text-[11px] text-zinc-300">
            <p className="text-[11px]">
              <span className="text-zinc-500">Atribuição das horas ao período: </span>
              <strong className="font-semibold text-gold">
                {quality.availabilityAudit.mode === "G0134_OFICIAL" ? "Mês de início (G0134)" : "Rateio por mês real"}
              </strong>
            </p>
            <p className="text-[10px] leading-snug text-zinc-500">
              {quality.availabilityAudit.mode === "G0134_OFICIAL"
                ? "O registro conta inteiro no período em que começou — é o agrupamento do relatório nativo do PC-Factory."
                : "Registros que atravessam meses são rateados proporcionalmente, e o período conta só a fatia dentro da janela."}{" "}
              Esta escolha muda QUAIS horas entram no recorte, não a fórmula da disponibilidade.
            </p>

            {/* A conta oficial primeiro: os três números que o gestor confere na mão. */}
            <p className="pt-2 text-[10px] font-bold uppercase tracking-wide text-gold">Disponibilidade Física</p>
            <p className="font-mono text-[10px] text-zinc-400">{quality.availabilityAudit.formula}</p>
            <AuditLine
              label={`Tempo Total do Período (${fmt(quality.availabilityAudit.periodHoursPerMachine)} h × ${quality.availabilityAudit.machineCount} máquina(s))`}
              value={`${fmt(quality.availabilityAudit.periodHours)} h`}
            />
            <AuditLine label="− Horas de Parada (os 6 subtipos)" value={`${fmt(quality.availabilityAudit.downtimeHours)} h`} />
            <AuditLine label="= Horas Disponíveis" value={`${fmt(quality.availabilityAudit.availableHours)} h`} />
            <AuditLine
              label="= Disponibilidade Física"
              value={
                quality.availabilityAudit.availabilityPercent === null
                  ? "—"
                  : `${quality.availabilityAudit.availabilityPercent.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} %`
              }
              strong
            />
            {quality.availabilityAudit.downtimeExceedsPeriod ? (
              <p className="mt-1 rounded-md border border-danger/40 bg-danger/15 px-2 py-1.5 text-[10px] leading-snug text-rose-200">
                Horas de parada superiores às horas-calendário do período. Verifique sobreposição ou duplicidade dos
                registros.
              </p>
            ) : null}
            <p className="text-[10px] leading-snug text-zinc-500">
              Máquina válida conta como disponível 24 h/dia durante todo o período: a base do PC-Factory não tem
              cadastro de entrada em operação/desativação, e inferir isso do primeiro registro seria inseguro.
            </p>

            <p className="pt-3 text-[10px] font-bold uppercase tracking-wide text-zinc-500">
              Decomposição G0134 (fórmula anterior — auditoria da transição)
            </p>
            <p className="font-mono text-[10px] text-zinc-500">{quality.availabilityAudit.g0134Formula}</p>

            <AuditLine label="Tempo Total" value={`${fmt(quality.availabilityAudit.totalHours)} h`} />
            <AuditLine label="− Fora de Turno" value={`${fmt(quality.availabilityAudit.outOfShiftHours)} h`} muted />
            <AuditLine
              label="− Recurso Não Programado"
              value={`${fmt(quality.availabilityAudit.unscheduledResourceHours)} h`}
              muted
            />
            <AuditLine label="= Tempo de Carga" value={`${fmt(quality.availabilityAudit.loadHours)} h`} />

            <AuditLine
              label="− Setup (Parada Planejada I e II)"
              value={`${fmt(quality.availabilityAudit.setupPlannedStopHours)} h`}
              muted
            />
            <AuditLine
              label="= Tempo Operacional (= G0134.LOADTIME)"
              value={`${fmt(quality.availabilityAudit.operationalHours)} h`}
            />

            <AuditLine
              label="− Manutenção (os 6 subtipos)"
              value={`${fmt(quality.availabilityAudit.maintenanceHours)} h`}
            />
            <AuditLine label="Mecânica" value={`${fmt(quality.availabilityAudit.maintenanceMechanicalHours)} h`} muted />
            <AuditLine label="Elétrica" value={`${fmt(quality.availabilityAudit.maintenanceElectricalHours)} h`} muted />
            <AuditLine label="Automação" value={`${fmt(quality.availabilityAudit.maintenanceAutomationHours)} h`} muted />
            <AuditLine label="Planejada" value={`${fmt(quality.availabilityAudit.maintenancePlannedHours)} h`} muted />
            <AuditLine label="Terceiros" value={`${fmt(quality.availabilityAudit.maintenanceThirdPartyHours)} h`} muted />
            <AuditLine
              label="Aguardando Manutenção"
              value={`${fmt(quality.availabilityAudit.maintenanceWaitingHours)} h`}
              muted
            />

            <AuditLine
              label="= Disponibilidade G0134 (não é o indicador do portal)"
              value={
                quality.availabilityAudit.g0134AvailabilityPercent === null
                  ? "—"
                  : `${quality.availabilityAudit.g0134AvailabilityPercent.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} %`
              }
            />

            <p className="pt-2 text-[10px] font-bold uppercase tracking-wide text-zinc-500">
              Ficam DENTRO do Tempo Operacional (não subtraem)
            </p>
            <AuditLine label="Produção" value={`${fmt(quality.availabilityAudit.productiveHours)} h`} muted />
            <AuditLine
              label="Paradas não planejadas (Refeição, Limpeza, Falta de Material, Utilidades…)"
              value={`${fmt(quality.availabilityAudit.unplannedStopHours)} h`}
              muted
            />
            <AuditLine label="Não apontado" value={`${fmt(quality.availabilityAudit.notPointedHours)} h`} muted />
            <p className="text-[10px] leading-snug text-zinc-500">
              No G0134 só o Setup sai do Tempo Operacional. As paradas acima reduzem o Tempo Trabalhado e a Utilização,
              mas não a Disponibilidade — por isso aparecem aqui só para diagnóstico.
            </p>
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
