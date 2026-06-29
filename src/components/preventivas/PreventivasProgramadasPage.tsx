"use client";

import { useCallback, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { m } from "framer-motion";
import {
  AlertTriangle,
  BarChart3,
  CalendarClock,
  CheckCircle2,
  ClipboardList,
  Download,
  Droplet,
  FileWarning,
  Gauge,
  Gem,
  HelpCircle,
  Layers,
  LineChart,
  PieChart,
  Siren,
  Target,
  Timer,
  TrendingDown,
  UserX,
  Users,
  XCircle,
  Zap
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import {
  PREVENTIVE_TARGETS,
  type PreventiveManagementStatus,
  type PreventiveOrderRow,
  type PreventivePageData,
  type TargetLevel
} from "@/types/preventive-orders";
import {
  AreaAdherenceChart,
  MonthlyAdherenceChart,
  PlPvChart,
  StatusChart,
  TopMachinesChart
} from "@/components/preventivas/PreventivasCharts";
import { OrderDetailDrawer, RulesModal } from "@/components/preventivas/PreventivasModals";

type AppliedFilters = {
  startDate: string;
  endDate: string;
  type: string;
  area: string;
  statusSap: string;
  mgmt: string;
  resp: string;
  local: string;
  equip: string;
  onlyNotDone: boolean;
  onlyClosedNoExec: boolean;
  onlyLate: boolean;
};

type PreventivasProgramadasPageProps = {
  data: PreventivePageData;
  applied: AppliedFilters;
};

type Tone = "gold" | "blue" | "green" | "red" | "champagne";

const toneChip: Record<Tone, string> = {
  gold: "border-gold/40 bg-gold/15 text-gold",
  blue: "border-sky-400/30 bg-sky-400/10 text-sky-300",
  green: "border-emerald-400/30 bg-emerald-400/10 text-emerald-300",
  red: "border-red-400/30 bg-red-400/10 text-red-300",
  champagne: "border-champagne/30 bg-champagne/10 text-champagne"
};

const LEVEL_DOT: Record<TargetLevel, string> = {
  ok: "bg-emerald-400",
  warn: "bg-yellow-400",
  crit: "bg-red-500"
};
const LEVEL_LABEL: Record<TargetLevel, string> = {
  ok: "Dentro da meta",
  warn: "Atenção",
  crit: "Crítico"
};

const intFmt = new Intl.NumberFormat("pt-BR");
const hoursFmt = (value: number) => `${value.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} h`;
const percentFmt = (value: number | null) =>
  value === null ? "—" : `${value.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`;

function adherenceLevel(value: number | null, target: number): TargetLevel {
  if (value === null) return "warn";
  if (value >= target) return "ok";
  if (value >= target * 0.82) return "warn";
  return "crit";
}

export function PreventivasProgramadasPage({ data, applied }: PreventivasProgramadasPageProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [localDraft, setLocalDraft] = useState(applied.local);
  const [equipDraft, setEquipDraft] = useState(applied.equip);
  const [selectedRow, setSelectedRow] = useState<PreventiveOrderRow | null>(null);
  const [rulesOpen, setRulesOpen] = useState(false);
  const [monthlyMode, setMonthlyMode] = useState<"geral" | "pl" | "pv">("geral");

  const updateParams = useCallback(
    (mutations: Record<string, string | null>) => {
      const next = new URLSearchParams(searchParams.toString());
      for (const [key, value] of Object.entries(mutations)) {
        if (value === null || value === "") next.delete(key);
        else next.set(key, value);
      }
      const query = next.toString();
      router.push(query ? `${pathname}?${query}` : pathname, { scroll: false });
    },
    [pathname, router, searchParams]
  );

  const toggleParam = (key: string, active: boolean) => updateParams({ [key]: active ? null : "1" });

  const { summary, byType, byArea, byStatus, byMachine, monthlyTrend, backlog, byResponsible, criticalAlerts, rows, filterOptions } =
    data;

  const exportHref = `/api/preventivas/export${searchParams.toString() ? `?${searchParams.toString()}` : ""}`;

  const aderenciaLevel = adherenceLevel(summary.aderencia, data.adherenceTarget);

  const kpiCards: Array<{ title: string; value: string; description: string; icon: LucideIcon; tone: Tone; level?: TargetLevel }> = [
    { title: "Total Programadas", value: intFmt.format(summary.total), description: "Total de ordens PL e PV no período.", icon: ClipboardList, tone: "champagne" },
    { title: "Lubrificação PL", value: intFmt.format(summary.totalPL), description: "Ordens de lubrificação programadas.", icon: Droplet, tone: "blue" },
    { title: "Preventiva Elétrica PV", value: intFmt.format(summary.totalPV), description: "Ordens preventivas elétricas programadas.", icon: Zap, tone: "gold" },
    { title: "Realizadas", value: intFmt.format(summary.realizadas), description: "Ordens com trabalho real maior que 0,1 h.", icon: CheckCircle2, tone: "green" },
    { title: "Não Realizadas", value: intFmt.format(summary.naoRealizadas), description: "Ordens com trabalho real igual ou menor que 0,1 h.", icon: XCircle, tone: "red" },
    { title: "Fechadas sem Execução", value: intFmt.format(summary.fechadasSemExecucao), description: "Ordens fechadas sem evidência de execução real.", icon: FileWarning, tone: "red" },
    { title: "Horas Apontadas", value: hoursFmt(summary.horasApontadas), description: "Total de horas apontadas em PL e PV.", icon: Timer, tone: "blue" },
    { title: "Aderência Preventiva", value: percentFmt(summary.aderencia), description: "Percentual de ordens realizadas sobre o total programado.", icon: Gauge, tone: "gold", level: aderenciaLevel }
  ];

  return (
    <section className="relative overflow-hidden rounded-lg border border-gold/20 bg-[#060707] shadow-premium">
      <div className="login-marble-bg absolute inset-0 opacity-90" />
      <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(0,0,0,0.72),rgba(0,0,0,0.42)),radial-gradient(circle_at_84%_12%,rgba(196,154,69,0.16),transparent_24rem)]" />

      <div className="relative z-10 px-4 py-7 sm:px-6 lg:px-8">
        {/* Cabeçalho */}
        <header className="flex flex-wrap items-end justify-between gap-4">
          <div className="max-w-3xl">
            <div className="mb-4 flex items-center gap-3 text-gold">
              <Gem className="h-5 w-5" />
              <span className="text-xs font-bold uppercase tracking-[0.28em] text-champagne/80">
                Portal de Gestão da Manutenção
              </span>
            </div>
            <h1 className="font-serif text-4xl leading-tight text-white sm:text-5xl">Preventivas Programadas</h1>
            <p className="mt-4 text-base leading-relaxed text-zinc-200">
              Acompanhe a execução das ordens PL e PV, horas apontadas, pendências, atrasos e aderência dos planos
              programados.
            </p>
            <p className="mt-2 text-sm leading-relaxed text-zinc-400">
              Use esta visão para identificar se as ordens de lubrificação e preventiva elétrica estão sendo realmente
              executadas ou apenas geradas no SAP.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <a
              href={exportHref}
              className="inline-flex h-10 items-center gap-2 rounded-lg border border-gold/45 bg-gold/15 px-4 text-sm font-semibold text-gold transition hover:bg-gold/25"
            >
              <Download className="h-4 w-4" />
              Exportar análise
            </a>
            <button
              type="button"
              onClick={() => setRulesOpen(true)}
              className="inline-flex h-10 items-center gap-2 rounded-lg border border-gold/25 px-4 text-sm font-medium text-zinc-200 transition hover:border-gold/50 hover:text-white"
            >
              <HelpCircle className="h-4 w-4 text-gold" />
              Como os indicadores são calculados?
            </button>
          </div>
        </header>

        {/* Cards principais */}
        <div className="mt-8 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
          {kpiCards.map((card, index) => {
            const Icon = card.icon;
            return (
              <m.article
                key={card.title}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3, delay: index * 0.04, ease: "easeOut" }}
                className="flex min-h-[116px] items-center gap-4 rounded-lg border border-gold/25 bg-black/45 p-4 shadow-[0_14px_36px_rgba(0,0,0,0.34)] backdrop-blur transition hover:-translate-y-0.5 hover:border-gold/45 hover:shadow-premium"
              >
                <div className={`grid h-14 w-14 shrink-0 place-items-center rounded-full border shadow-[inset_0_1px_0_rgba(255,255,255,0.12)] ${toneChip[card.tone]}`}>
                  <Icon className="h-7 w-7" strokeWidth={1.8} />
                </div>
                <div className="min-w-0">
                  <h3 className="text-[11px] font-extrabold uppercase tracking-wide text-champagne/80">{card.title}</h3>
                  <div className="mt-0.5 flex items-center gap-2">
                    <span className="truncate text-3xl font-light tracking-tight text-white" title={card.value}>
                      {card.value}
                    </span>
                    {card.level ? <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${LEVEL_DOT[card.level]}`} title={LEVEL_LABEL[card.level]} /> : null}
                  </div>
                  <p className="mt-0.5 text-[11px] leading-snug text-zinc-400">{card.description}</p>
                </div>
              </m.article>
            );
          })}
        </div>

        {/* Metas */}
        <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-3">
          <MetaCard
            title="Meta de Aderência"
            target={`≥ ${data.adherenceTarget}%`}
            current={percentFmt(summary.aderencia)}
            level={aderenciaLevel}
          />
          <MetaCard
            title="Fechadas sem Execução"
            target={`Meta ${PREVENTIVE_TARGETS.closedWithoutExecution}`}
            current={intFmt.format(summary.fechadasSemExecucao)}
            level={summary.fechadasSemExecucao === 0 ? "ok" : summary.total > 0 && summary.fechadasSemExecucao / summary.total <= 0.1 ? "warn" : "crit"}
          />
          <MetaCard
            title="Atrasadas"
            target={`Meta ${PREVENTIVE_TARGETS.overdue}`}
            current={criticalAlerts.overdueCount === null ? "n/d" : intFmt.format(criticalAlerts.overdueCount)}
            level={criticalAlerts.overdueCount === null ? "warn" : criticalAlerts.overdueCount === 0 ? "ok" : "crit"}
          />
        </div>

        {/* Filtros */}
        <div className="mt-6 rounded-lg border border-gold/25 bg-black/45 p-5 shadow-[0_14px_36px_rgba(0,0,0,0.3)] backdrop-blur">
          <div className="mb-4 flex items-center gap-2 text-champagne">
            <CalendarClock className="h-4 w-4 text-gold" />
            <h2 className="text-sm font-bold uppercase tracking-[0.2em]">Filtros</h2>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            <Field label="Período">
              <div className="flex items-center gap-2">
                <input type="date" className={inputClass} aria-label="Data inicial" value={applied.startDate} max={applied.endDate || undefined} onChange={(e) => updateParams({ startDate: e.target.value })} />
                <span className="text-zinc-500">–</span>
                <input type="date" className={inputClass} aria-label="Data final" value={applied.endDate} min={applied.startDate || undefined} onChange={(e) => updateParams({ endDate: e.target.value })} />
              </div>
            </Field>

            <Field label="Tipo">
              <select className={inputClass} value={applied.type} onChange={(e) => updateParams({ type: e.target.value })}>
                <option value="">Todos</option>
                <option value="PL">PL — Lubrificação</option>
                <option value="PV">PV — Preventiva Elétrica</option>
              </select>
            </Field>

            <Field label="Área">
              <select className={inputClass} value={applied.area} onChange={(e) => updateParams({ area: e.target.value })}>
                <option value="">Todas</option>
                <option value="Lubrificação">Lubrificação</option>
                <option value="Elétrica">Elétrica</option>
              </select>
            </Field>

            <Field label="Status SAP">
              <select className={inputClass} value={applied.statusSap} onChange={(e) => updateParams({ statusSap: e.target.value })}>
                <option value="">Todos</option>
                {filterOptions.statuses.map((status) => (
                  <option key={status.value} value={status.value}>{status.label}</option>
                ))}
              </select>
            </Field>

            <Field label="Status Gerencial">
              <select className={inputClass} value={applied.mgmt} onChange={(e) => updateParams({ mgmt: e.target.value })}>
                <option value="">Todos</option>
                {filterOptions.managementStatuses.map((status) => (
                  <option key={status} value={status}>{status}</option>
                ))}
              </select>
            </Field>

            <Field label="Responsável">
              <select className={inputClass} value={applied.resp} onChange={(e) => updateParams({ resp: e.target.value })}>
                <option value="">Todos</option>
                {filterOptions.responsibles.map((resp) => (
                  <option key={resp} value={resp}>{resp}</option>
                ))}
              </select>
            </Field>

            <Field label="Local de instalação">
              <input type="text" placeholder="Todos" className={inputClass} value={localDraft} onChange={(e) => setLocalDraft(e.target.value)} onBlur={() => updateParams({ local: localDraft })} onKeyDown={(e) => e.key === "Enter" && updateParams({ local: localDraft })} />
            </Field>

            <Field label="Equipamento">
              <input type="text" placeholder="Todos" className={inputClass} value={equipDraft} onChange={(e) => setEquipDraft(e.target.value)} onBlur={() => updateParams({ equip: equipDraft })} onKeyDown={(e) => e.key === "Enter" && updateParams({ equip: equipDraft })} />
            </Field>
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-gold/15 pt-4">
            <Toggle active={applied.onlyNotDone} onClick={() => toggleParam("nd", applied.onlyNotDone)}>Somente não realizadas</Toggle>
            <Toggle active={applied.onlyClosedNoExec} onClick={() => toggleParam("cne", applied.onlyClosedNoExec)}>Somente fechadas sem execução</Toggle>
            <Toggle active={applied.onlyLate} onClick={() => toggleParam("late", applied.onlyLate)}>Somente atrasadas</Toggle>
            <button
              type="button"
              onClick={() => {
                setLocalDraft("");
                setEquipDraft("");
                router.push(pathname, { scroll: false });
              }}
              className="ml-auto rounded-full border border-gold/25 px-4 py-1.5 text-xs font-medium text-zinc-300 transition hover:border-gold/45 hover:text-white"
            >
              Limpar filtros
            </button>
          </div>
        </div>

        {/* Evolução Mensal da Aderência */}
        <div className="mt-6 rounded-lg border border-gold/25 bg-black/45 p-5 shadow-[0_14px_36px_rgba(0,0,0,0.3)] backdrop-blur">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-champagne">
              <LineChart className="h-4 w-4 text-gold" />
              <h2 className="text-sm font-bold tracking-wide">Evolução Mensal da Aderência</h2>
            </div>
            <div className="flex gap-1">
              {(["geral", "pl", "pv"] as const).map((mode) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => setMonthlyMode(mode)}
                  className={`rounded-full border px-3 py-1 text-xs font-semibold transition ${
                    monthlyMode === mode
                      ? "border-gold/60 bg-gold/20 text-champagne"
                      : "border-gold/20 bg-black/30 text-zinc-400 hover:text-white"
                  }`}
                >
                  {mode === "geral" ? "Geral" : mode.toUpperCase()}
                </button>
              ))}
            </div>
          </div>
          <p className="mt-1 text-xs text-zinc-400">Programadas × realizadas e a linha de aderência (%) por mês.</p>
          <div className="mt-4 h-72 w-full">
            <MonthlyAdherenceChart data={monthlyTrend} mode={monthlyMode} />
          </div>
        </div>

        {/* Gráficos */}
        <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
          <ChartPanel title="PL × PV" hint="Quantidade de ordens realizadas/não realizadas e horas por tipo." icon={BarChart3}>
            <PlPvChart data={byType} />
          </ChartPanel>
          <ChartPanel title="Aderência por Área" hint="Lubrificação × Preventiva Elétrica (meta 80%)." icon={PieChart}>
            <AreaAdherenceChart data={byArea} />
          </ChartPanel>
          <ChartPanel title="OS por Status Gerencial" hint="Distribuição por situação gerencial das ordens." icon={LineChart}>
            <StatusChart data={byStatus} />
          </ChartPanel>
          <ChartPanel title="Top Máquinas com OS Não Realizadas" hint="Locais de instalação com mais PL/PV não executadas." icon={AlertTriangle}>
            <TopMachinesChart data={byMachine} />
          </ChartPanel>
        </div>

        {/* Backlog Preventivo */}
        <div className="mt-6 rounded-lg border border-gold/25 bg-black/45 p-5 shadow-[0_14px_36px_rgba(0,0,0,0.3)] backdrop-blur">
          <div className="flex items-center gap-2 text-champagne">
            <Layers className="h-4 w-4 text-gold" />
            <h2 className="text-sm font-bold uppercase tracking-[0.2em]">Backlog Preventivo</h2>
          </div>
          <p className="mt-1 text-xs text-zinc-400">
            OS abertas/atrasadas ainda não executadas (não inclui as já fechadas). Horas pendentes dependem do trabalho
            planejado, ainda não disponível na base.
          </p>
          <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-[1fr_1.4fr]">
            <div className="grid grid-cols-3 gap-3">
              <BacklogStat label="Total" value={backlog.total} tone="champagne" />
              <BacklogStat label="PL" value={backlog.pl} tone="blue" />
              <BacklogStat label="PV" value={backlog.pv} tone="gold" />
            </div>
            <div className="rounded-lg border border-gold/15 bg-black/30 p-4">
              <p className="text-[11px] font-bold uppercase tracking-wide text-champagne/70">Máquinas com maior backlog</p>
              {backlog.topMachines.length ? (
                <ul className="mt-2 space-y-1.5">
                  {backlog.topMachines.map((machine) => (
                    <li key={machine.name} className="flex items-center justify-between gap-3 text-sm">
                      <span className="truncate text-zinc-200" title={machine.name}>{machine.name}</span>
                      <span className="shrink-0 rounded-full border border-gold/25 px-2 py-0.5 text-xs font-semibold text-gold">{machine.count}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-2 text-sm text-zinc-400">Sem backlog no período selecionado.</p>
              )}
            </div>
          </div>
        </div>

        {/* Ranking de máquinas críticas */}
        <SectionTable
          icon={AlertTriangle}
          title="Máquinas com Mais Preventivas Não Realizadas"
          columns={["Equipamento / Local", "Não realizadas", "PL", "PV", "Horas", "Última OS", "Responsável"]}
          empty="Nenhuma OS não realizada encontrada para os filtros selecionados."
          rows={byMachine.map((machine) => [
            machine.name,
            String(machine.naoRealizadas),
            String(machine.pl),
            String(machine.pv),
            hoursFmt(machine.horas),
            machine.lastOrderNumber ?? "—",
            machine.responsible ?? "—"
          ])}
          highlightCol={1}
        />

        {/* Execução por Responsável */}
        <SectionTable
          icon={Users}
          title="Execução por Responsável"
          columns={["Responsável", "Total", "Realizadas", "Não realizadas", "Fechadas s/ exec", "Horas", "Aderência"]}
          empty="Nenhuma OS PL/PV encontrada para os filtros selecionados."
          rows={byResponsible.slice(0, 20).map((r) => [
            r.name,
            String(r.total),
            String(r.realizadas),
            String(r.naoRealizadas),
            String(r.fechadasSemExecucao),
            hoursFmt(r.horas),
            percentFmt(r.aderencia)
          ])}
          maxHeight
        />

        {/* Tabela principal */}
        <div className="mt-6 rounded-lg border border-gold/25 bg-black/45 shadow-[0_14px_36px_rgba(0,0,0,0.3)] backdrop-blur">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-gold/15 px-5 py-4 text-champagne">
            <div className="flex items-center gap-2">
              <ClipboardList className="h-4 w-4 text-gold" />
              <h2 className="text-sm font-bold tracking-wide">Ordens Programadas PL/PV</h2>
            </div>
            <span className="text-xs text-zinc-400">
              {intFmt.format(data.totalRows)} ordens{data.rowsCapped ? ` • exibindo as primeiras ${intFmt.format(rows.length)}` : ""} • clique para detalhar
            </span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1180px] text-left text-sm">
              <thead>
                <tr className="border-b border-gold/15">
                  {TABLE_COLUMNS.map((col) => (
                    <th key={col} className="whitespace-nowrap px-3 py-3 text-[11px] font-bold uppercase tracking-wide text-champagne/70">{col}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 ? (
                  <tr>
                    <td colSpan={TABLE_COLUMNS.length} className="px-4 py-16 text-center">
                      <div className="flex flex-col items-center gap-3">
                        <div className="grid h-12 w-12 place-items-center rounded-full border border-gold/30 bg-gold/10 text-gold">
                          <ClipboardList className="h-6 w-6" strokeWidth={1.6} />
                        </div>
                        <p className="text-sm text-zinc-300">{emptyTableMessage(data, applied)}</p>
                      </div>
                    </td>
                  </tr>
                ) : (
                  rows.map((row) => <OrderRow key={row.id} row={row} onClick={() => setSelectedRow(row)} />)
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Alertas Críticos */}
        <div className="mt-6">
          <div className="mb-3 flex items-center gap-2 text-champagne">
            <Siren className="h-4 w-4 text-gold" />
            <h2 className="text-sm font-bold uppercase tracking-[0.2em]">Alertas Críticos</h2>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-5">
            <AlertCard icon={FileWarning} tone="red" title="Fechadas sem execução" metric={intFmt.format(criticalAlerts.closedNoExecCount)} description="OS fechadas no SAP com trabalho real ≤ 0,1 h." />
            <AlertCard icon={CalendarClock} tone="gold" title="Atrasadas" metric={criticalAlerts.overdueCount === null ? "n/d" : intFmt.format(criticalAlerts.overdueCount)} description={criticalAlerts.overdueCount === null ? "Sem data de vencimento na base." : "OS abertas vencidas."} />
            <AlertCard icon={TrendingDown} tone="red" title="Máquina reincidente" metric={intFmt.format(criticalAlerts.recurrentMachines.length)} description={criticalAlerts.recurrentMachines.length ? `Ex.: ${criticalAlerts.recurrentMachines[0].name} (${criticalAlerts.recurrentMachines[0].count})` : "Nenhuma máquina com 3+ não realizadas."} />
            <AlertCard icon={Target} tone={criticalAlerts.belowTargetAreas.length ? "champagne" : "green"} title="Área abaixo da meta" metric={criticalAlerts.belowTargetAreas.length ? String(criticalAlerts.belowTargetAreas.length) : "OK"} description={criticalAlerts.belowTargetAreas.length ? criticalAlerts.belowTargetAreas.map((a) => `${a.area} (${percentFmt(a.aderencia)})`).join(" • ") : "Áreas com aderência ≥ 80%."} />
            <AlertCard icon={UserX} tone="gold" title="Sem responsável" metric={intFmt.format(criticalAlerts.withoutResponsibleCount)} description="OS PL/PV sem responsável informado." />
          </div>
        </div>
      </div>

      <OrderDetailDrawer row={selectedRow} onClose={() => setSelectedRow(null)} />
      <RulesModal open={rulesOpen} onClose={() => setRulesOpen(false)} />
    </section>
  );
}

const TABLE_COLUMNS = [
  "Tipo",
  "Área",
  "Nº OS",
  "Título",
  "Local de instalação",
  "Equipamento",
  "Responsável",
  "Status SAP",
  "Status Gerencial",
  "Trabalho Real",
  "Data início",
  "Data fim",
  "Dias em aberto",
  "Situação"
] as const;

const MANAGEMENT_BADGE: Record<PreventiveManagementStatus, string> = {
  "Aberta sem execução": "border-gold/40 bg-gold/10 text-gold",
  "Em andamento": "border-sky-400/40 bg-sky-400/10 text-sky-300",
  Realizada: "border-emerald-400/40 bg-emerald-400/10 text-emerald-300",
  "Fechada sem execução": "border-red-500/60 bg-red-500/20 text-red-200",
  Atrasada: "border-orange-400/50 bg-orange-400/15 text-orange-300",
  "A vencer": "border-yellow-400/50 bg-yellow-400/10 text-yellow-300",
  Cancelada: "border-zinc-500/40 bg-zinc-500/10 text-zinc-300"
};

function OrderRow({ row, onClick }: { row: PreventiveOrderRow; onClick: () => void }) {
  const executionClass = row.executionStatus === "Realizada" ? "text-emerald-300" : "text-red-300";

  return (
    <tr className="cursor-pointer border-b border-white/5 transition hover:bg-white/[0.05]" onClick={onClick} title="Ver detalhes da OS">
      <td className="whitespace-nowrap px-3 py-2.5">
        <span className={`rounded px-1.5 py-0.5 text-[11px] font-bold ${row.type === "PL" ? "bg-sky-400/15 text-sky-300" : "bg-gold/15 text-gold"}`}>{row.type}</span>
      </td>
      <td className="whitespace-nowrap px-3 py-2.5 text-zinc-300">{row.area}</td>
      <td className="whitespace-nowrap px-3 py-2.5 font-medium text-zinc-200">{row.osNumber}</td>
      <td className="max-w-[260px] truncate px-3 py-2.5 text-zinc-200" title={row.title}>{row.title}</td>
      <td className="max-w-[200px] truncate px-3 py-2.5 text-zinc-300" title={row.technicalObject ?? "—"}>{row.technicalObject ?? "—"}</td>
      <td className="max-w-[160px] truncate px-3 py-2.5 text-zinc-400" title={row.equipmentName ?? "—"}>{row.equipmentName ?? "—"}</td>
      <td className="whitespace-nowrap px-3 py-2.5 text-zinc-300">{row.responsibleName ?? "—"}</td>
      <td className="whitespace-nowrap px-3 py-2.5 text-zinc-400">{row.statusSapLabel}</td>
      <td className="whitespace-nowrap px-3 py-2.5">
        <span className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold ${MANAGEMENT_BADGE[row.managementStatus]}`}>{row.managementStatus}</span>
      </td>
      <td className={`whitespace-nowrap px-3 py-2.5 text-right font-semibold tabular-nums ${executionClass}`}>
        {row.workedHours.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })} h
      </td>
      <td className="whitespace-nowrap px-3 py-2.5 text-zinc-400">{formatDate(row.openedAt)}</td>
      <td className="whitespace-nowrap px-3 py-2.5 text-zinc-400">{formatDate(row.closedAt)}</td>
      <td className="whitespace-nowrap px-3 py-2.5 text-right tabular-nums text-zinc-400">{row.daysOpen === null ? "—" : `${row.daysOpen} d`}</td>
      <td className="whitespace-nowrap px-3 py-2.5"><span className={`text-[11px] font-semibold ${executionClass}`}>{row.executionStatus}</span></td>
    </tr>
  );
}

function SectionTable({
  icon: Icon,
  title,
  columns,
  rows,
  empty,
  highlightCol,
  maxHeight = false
}: {
  icon: LucideIcon;
  title: string;
  columns: string[];
  rows: string[][];
  empty: string;
  highlightCol?: number;
  maxHeight?: boolean;
}) {
  return (
    <div className="mt-6 rounded-lg border border-gold/25 bg-black/45 shadow-[0_14px_36px_rgba(0,0,0,0.3)] backdrop-blur">
      <div className="flex items-center gap-2 border-b border-gold/15 px-5 py-4 text-champagne">
        <Icon className="h-4 w-4 text-gold" />
        <h2 className="text-sm font-bold tracking-wide">{title}</h2>
      </div>
      {rows.length === 0 ? (
        <p className="px-5 py-10 text-center text-sm text-zinc-300">{empty}</p>
      ) : (
        <div className={`overflow-x-auto ${maxHeight ? "max-h-[420px] overflow-y-auto" : ""}`}>
          <table className="w-full min-w-[820px] text-left text-sm">
            <thead className="sticky top-0 bg-[#0b0c0c]">
              <tr className="border-b border-gold/15">
                {columns.map((col, index) => (
                  <th key={col} className={`whitespace-nowrap px-4 py-3 text-[11px] font-bold uppercase tracking-wide text-champagne/70 ${index === 0 ? "" : "text-right"}`}>{col}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((cells, rowIndex) => (
                <tr key={rowIndex} className="border-b border-white/5 transition hover:bg-white/[0.03]">
                  {cells.map((cell, colIndex) => (
                    <td
                      key={colIndex}
                      className={`px-4 py-2.5 ${colIndex === 0 ? "max-w-[260px] truncate text-zinc-200" : "whitespace-nowrap text-right tabular-nums"} ${
                        colIndex === highlightCol ? "font-bold text-red-300" : colIndex === 0 ? "" : "text-zinc-300"
                      }`}
                      title={colIndex === 0 ? cell : undefined}
                    >
                      {cell}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function emptyTableMessage(data: PreventivePageData, applied: AppliedFilters): string {
  if (!data.hasAnyPreventiveInPeriod) return "Nenhuma ordem PL/PV encontrada no período selecionado.";
  if (applied.onlyNotDone || applied.onlyClosedNoExec || applied.onlyLate) return "Nenhuma OS não realizada encontrada para os filtros selecionados.";
  return "Nenhuma ordem PL/PV encontrada para os filtros selecionados.";
}

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Intl.DateTimeFormat("pt-BR", { timeZone: "UTC", day: "2-digit", month: "2-digit", year: "numeric" }).format(new Date(iso));
}

const inputClass =
  "h-10 w-full rounded-lg border border-gold/25 bg-black/40 px-3 text-sm text-zinc-100 placeholder:text-zinc-500 outline-none transition focus:border-gold/60 focus:ring-1 focus:ring-gold/40 [color-scheme:dark]";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wide text-champagne/70">{label}</span>
      {children}
    </label>
  );
}

function Toggle({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" onClick={onClick} aria-pressed={active} className={`rounded-full border px-4 py-1.5 text-xs font-medium transition ${active ? "border-gold/60 bg-gold/20 text-champagne shadow-[inset_0_1px_0_rgba(255,255,255,0.12)]" : "border-gold/25 bg-black/30 text-zinc-300 hover:border-gold/45 hover:text-white"}`}>
      {children}
    </button>
  );
}

function ChartPanel({ title, hint, icon: Icon, children }: { title: string; hint: string; icon: LucideIcon; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-gold/25 bg-black/45 p-5 shadow-[0_14px_36px_rgba(0,0,0,0.3)] backdrop-blur">
      <div className="flex items-center gap-2 text-champagne">
        <Icon className="h-4 w-4 text-gold" />
        <h3 className="text-sm font-bold tracking-wide">{title}</h3>
      </div>
      <p className="mt-1 text-xs text-zinc-400">{hint}</p>
      <div className="mt-4 h-64 w-full">{children}</div>
    </div>
  );
}

function MetaCard({ title, target, current, level }: { title: string; target: string; current: string; level: TargetLevel }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border border-gold/25 bg-black/45 p-4 shadow-[0_14px_36px_rgba(0,0,0,0.3)] backdrop-blur">
      <div className="min-w-0">
        <h3 className="text-[11px] font-extrabold uppercase tracking-wide text-champagne/80">{title}</h3>
        <p className="mt-0.5 text-2xl font-light text-white">{current}</p>
        <p className="text-[11px] text-zinc-500">{target}</p>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <span className={`h-2.5 w-2.5 rounded-full ${LEVEL_DOT[level]}`} />
        <span className="text-xs font-semibold text-zinc-300">{LEVEL_LABEL[level]}</span>
      </div>
    </div>
  );
}

function BacklogStat({ label, value, tone }: { label: string; value: number; tone: Tone }) {
  return (
    <div className={`rounded-lg border p-4 text-center ${toneChip[tone]}`}>
      <p className="text-[11px] font-bold uppercase tracking-wide opacity-80">{label}</p>
      <p className="mt-1 text-3xl font-light">{intFmt.format(value)}</p>
    </div>
  );
}

function AlertCard({ icon: Icon, tone, title, metric, description }: { icon: LucideIcon; tone: Tone; title: string; metric: string; description: string }) {
  return (
    <div className="flex gap-3 rounded-lg border border-gold/25 bg-black/45 p-4 shadow-[0_14px_36px_rgba(0,0,0,0.3)] backdrop-blur">
      <div className={`grid h-10 w-10 shrink-0 place-items-center rounded-lg border ${toneChip[tone]}`}>
        <Icon className="h-5 w-5" strokeWidth={1.8} />
      </div>
      <div className="min-w-0">
        <div className="flex items-baseline gap-2">
          <h3 className="text-sm font-semibold text-white">{title}</h3>
          <span className="text-lg font-light text-champagne">{metric}</span>
        </div>
        <p className="mt-1 text-xs leading-snug text-zinc-400">{description}</p>
      </div>
    </div>
  );
}
