"use client";

import { useCallback, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { m } from "framer-motion";
import {
  AlertTriangle,
  BarChart3,
  CalendarClock,
  CalendarX2,
  CheckCircle2,
  ClipboardList,
  Droplet,
  FileWarning,
  Gauge,
  Gem,
  LineChart,
  PieChart,
  Repeat2,
  Timer,
  TrendingDown,
  XCircle,
  Zap
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type {
  PreventiveManagementStatus,
  PreventiveOrderRow,
  PreventivePageData
} from "@/types/preventive-orders";
import {
  AreaAdherenceChart,
  PlPvChart,
  StatusChart,
  TopMachinesChart
} from "@/components/preventivas/PreventivasCharts";

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

const intFmt = new Intl.NumberFormat("pt-BR");
const hoursFmt = (value: number) => `${value.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} h`;
const percentFmt = (value: number | null) =>
  value === null ? "—" : `${value.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`;

export function PreventivasProgramadasPage({ data, applied }: PreventivasProgramadasPageProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [localDraft, setLocalDraft] = useState(applied.local);
  const [equipDraft, setEquipDraft] = useState(applied.equip);

  // Atualiza search params preservando os demais; valor vazio remove a chave.
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

  const { summary, byType, byArea, byStatus, byMachine, alerts, rows, filterOptions } = data;

  const kpiCards: Array<{ title: string; value: string; description: string; icon: LucideIcon; tone: Tone }> = [
    {
      title: "Total Programadas",
      value: intFmt.format(summary.total),
      description: "Total de ordens PL e PV no período.",
      icon: ClipboardList,
      tone: "champagne"
    },
    {
      title: "Lubrificação PL",
      value: intFmt.format(summary.totalPL),
      description: "Ordens de lubrificação programadas.",
      icon: Droplet,
      tone: "blue"
    },
    {
      title: "Preventiva Elétrica PV",
      value: intFmt.format(summary.totalPV),
      description: "Ordens preventivas elétricas programadas.",
      icon: Zap,
      tone: "gold"
    },
    {
      title: "Realizadas",
      value: intFmt.format(summary.realizadas),
      description: "Ordens com trabalho real maior que 0,1 h.",
      icon: CheckCircle2,
      tone: "green"
    },
    {
      title: "Não Realizadas",
      value: intFmt.format(summary.naoRealizadas),
      description: "Ordens com trabalho real igual ou menor que 0,1 h.",
      icon: XCircle,
      tone: "red"
    },
    {
      title: "Fechadas sem Execução",
      value: intFmt.format(summary.fechadasSemExecucao),
      description: "Ordens fechadas sem evidência de execução real.",
      icon: FileWarning,
      tone: "red"
    },
    {
      title: "Horas Apontadas",
      value: hoursFmt(summary.horasApontadas),
      description: "Total de horas apontadas em PL e PV.",
      icon: Timer,
      tone: "blue"
    },
    {
      title: "Aderência Preventiva",
      value: percentFmt(summary.aderencia),
      description: "Percentual de ordens realizadas sobre o total programado.",
      icon: Gauge,
      tone: "gold"
    }
  ];

  return (
    <section className="relative overflow-hidden rounded-lg border border-gold/20 bg-[#060707] shadow-premium">
      <div className="login-marble-bg absolute inset-0 opacity-90" />
      <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(0,0,0,0.72),rgba(0,0,0,0.42)),radial-gradient(circle_at_84%_12%,rgba(196,154,69,0.16),transparent_24rem)]" />

      <div className="relative z-10 px-4 py-7 sm:px-6 lg:px-8">
        {/* Cabeçalho */}
        <header className="max-w-4xl">
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
                <div
                  className={`grid h-14 w-14 shrink-0 place-items-center rounded-full border shadow-[inset_0_1px_0_rgba(255,255,255,0.12)] ${toneChip[card.tone]}`}
                >
                  <Icon className="h-7 w-7" strokeWidth={1.8} />
                </div>
                <div className="min-w-0">
                  <h3 className="text-[11px] font-extrabold uppercase tracking-wide text-champagne/80">{card.title}</h3>
                  <div className="mt-0.5 truncate text-3xl font-light tracking-tight text-white" title={card.value}>
                    {card.value}
                  </div>
                  <p className="mt-0.5 text-[11px] leading-snug text-zinc-400">{card.description}</p>
                </div>
              </m.article>
            );
          })}
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
                <input
                  type="date"
                  className={inputClass}
                  aria-label="Data inicial"
                  value={applied.startDate}
                  max={applied.endDate || undefined}
                  onChange={(e) => updateParams({ startDate: e.target.value })}
                />
                <span className="text-zinc-500">–</span>
                <input
                  type="date"
                  className={inputClass}
                  aria-label="Data final"
                  value={applied.endDate}
                  min={applied.startDate || undefined}
                  onChange={(e) => updateParams({ endDate: e.target.value })}
                />
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
                  <option key={status.value} value={status.value}>
                    {status.label}
                  </option>
                ))}
              </select>
            </Field>

            <Field label="Status Gerencial">
              <select className={inputClass} value={applied.mgmt} onChange={(e) => updateParams({ mgmt: e.target.value })}>
                <option value="">Todos</option>
                {filterOptions.managementStatuses.map((status) => (
                  <option key={status} value={status}>
                    {status}
                  </option>
                ))}
              </select>
            </Field>

            <Field label="Responsável">
              <select className={inputClass} value={applied.resp} onChange={(e) => updateParams({ resp: e.target.value })}>
                <option value="">Todos</option>
                {filterOptions.responsibles.map((resp) => (
                  <option key={resp} value={resp}>
                    {resp}
                  </option>
                ))}
              </select>
            </Field>

            <Field label="Local de instalação">
              <input
                type="text"
                placeholder="Todos"
                className={inputClass}
                value={localDraft}
                onChange={(e) => setLocalDraft(e.target.value)}
                onBlur={() => updateParams({ local: localDraft })}
                onKeyDown={(e) => e.key === "Enter" && updateParams({ local: localDraft })}
              />
            </Field>

            <Field label="Equipamento">
              <input
                type="text"
                placeholder="Todos"
                className={inputClass}
                value={equipDraft}
                onChange={(e) => setEquipDraft(e.target.value)}
                onBlur={() => updateParams({ equip: equipDraft })}
                onKeyDown={(e) => e.key === "Enter" && updateParams({ equip: equipDraft })}
              />
            </Field>
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-gold/15 pt-4">
            <Toggle active={applied.onlyNotDone} onClick={() => toggleParam("nd", applied.onlyNotDone)}>
              Somente não realizadas
            </Toggle>
            <Toggle active={applied.onlyClosedNoExec} onClick={() => toggleParam("cne", applied.onlyClosedNoExec)}>
              Somente fechadas sem execução
            </Toggle>
            <Toggle active={applied.onlyLate} onClick={() => toggleParam("late", applied.onlyLate)}>
              Somente atrasadas
            </Toggle>
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

        {/* Tabela */}
        <div className="mt-6 rounded-lg border border-gold/25 bg-black/45 shadow-[0_14px_36px_rgba(0,0,0,0.3)] backdrop-blur">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-gold/15 px-5 py-4 text-champagne">
            <div className="flex items-center gap-2">
              <ClipboardList className="h-4 w-4 text-gold" />
              <h2 className="text-sm font-bold tracking-wide">Ordens Programadas PL/PV</h2>
            </div>
            <span className="text-xs text-zinc-400">
              {intFmt.format(data.totalRows)} ordens
              {data.rowsCapped ? ` • exibindo as primeiras ${intFmt.format(rows.length)}` : ""}
            </span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1180px] text-left text-sm">
              <thead>
                <tr className="border-b border-gold/15">
                  {TABLE_COLUMNS.map((col) => (
                    <th
                      key={col}
                      className="whitespace-nowrap px-3 py-3 text-[11px] font-bold uppercase tracking-wide text-champagne/70"
                    >
                      {col}
                    </th>
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
                  rows.map((row) => <OrderRow key={row.id} row={row} />)
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Alertas Gerenciais */}
        <div className="mt-6">
          <div className="mb-3 flex items-center gap-2 text-champagne">
            <AlertTriangle className="h-4 w-4 text-gold" />
            <h2 className="text-sm font-bold uppercase tracking-[0.2em]">Alertas Gerenciais</h2>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <AlertCard
              icon={FileWarning}
              tone="red"
              title="OS fechada sem execução"
              metric={intFmt.format(alerts.closedNoExecCount)}
              description="Ordens encerradas no SAP sem trabalho real apontado."
            />
            <AlertCard
              icon={CalendarX2}
              tone="gold"
              title="Preventiva vencida"
              metric={alerts.overdueCount === null ? "—" : intFmt.format(alerts.overdueCount)}
              description={
                alerts.overdueCount === null
                  ? "Sem data de vencimento na base; atraso não pôde ser calculado."
                  : "Planos PL/PV com data programada vencida e ainda não concluídos."
              }
            />
            <AlertCard
              icon={Repeat2}
              tone="red"
              title="Máquina com recorrência"
              metric={alerts.recurrentMachine ? intFmt.format(alerts.recurrentMachine.count) : "—"}
              description={
                alerts.recurrentMachine
                  ? `${alerts.recurrentMachine.name} — OS não executadas.`
                  : "Nenhuma máquina com recorrência de não execução."
              }
            />
            <AlertCard
              icon={alerts.lowAdherenceAreas.length ? TrendingDown : Gauge}
              tone={alerts.lowAdherenceAreas.length ? "champagne" : "green"}
              title="Área com baixa aderência"
              metric={alerts.lowAdherenceAreas.length ? `${alerts.lowAdherenceAreas.length}` : "OK"}
              description={
                alerts.lowAdherenceAreas.length
                  ? alerts.lowAdherenceAreas.map((a) => `${a.area} (${percentFmt(a.aderencia)})`).join(" • ")
                  : "Todas as áreas com aderência igual ou acima de 80%."
              }
            />
          </div>
        </div>
      </div>
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

function OrderRow({ row }: { row: PreventiveOrderRow }) {
  const executionClass =
    row.executionStatus === "Realizada" ? "text-emerald-300" : "text-red-300";

  return (
    <tr className="border-b border-white/5 transition hover:bg-white/[0.03]">
      <td className="whitespace-nowrap px-3 py-2.5">
        <span
          className={`rounded px-1.5 py-0.5 text-[11px] font-bold ${
            row.type === "PL" ? "bg-sky-400/15 text-sky-300" : "bg-gold/15 text-gold"
          }`}
        >
          {row.type}
        </span>
      </td>
      <td className="whitespace-nowrap px-3 py-2.5 text-zinc-300">{row.area}</td>
      <td className="whitespace-nowrap px-3 py-2.5 font-medium text-zinc-200">{row.osNumber}</td>
      <td className="max-w-[260px] truncate px-3 py-2.5 text-zinc-200" title={row.title}>
        {row.title}
      </td>
      <td className="max-w-[200px] truncate px-3 py-2.5 text-zinc-300" title={row.technicalObject ?? "—"}>
        {row.technicalObject ?? "—"}
      </td>
      <td className="max-w-[160px] truncate px-3 py-2.5 text-zinc-400" title={row.equipmentName ?? "—"}>
        {row.equipmentName ?? "—"}
      </td>
      <td className="whitespace-nowrap px-3 py-2.5 text-zinc-300">{row.responsibleName ?? "—"}</td>
      <td className="whitespace-nowrap px-3 py-2.5 text-zinc-400">{row.statusSapLabel}</td>
      <td className="whitespace-nowrap px-3 py-2.5">
        <span className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold ${MANAGEMENT_BADGE[row.managementStatus]}`}>
          {row.managementStatus}
        </span>
      </td>
      <td className={`whitespace-nowrap px-3 py-2.5 text-right font-semibold tabular-nums ${executionClass}`}>
        {row.workedHours.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })} h
      </td>
      <td className="whitespace-nowrap px-3 py-2.5 text-zinc-400">{formatDate(row.openedAt)}</td>
      <td className="whitespace-nowrap px-3 py-2.5 text-zinc-400">{formatDate(row.closedAt)}</td>
      <td className="whitespace-nowrap px-3 py-2.5 text-right tabular-nums text-zinc-400">
        {row.daysOpen === null ? "—" : `${row.daysOpen} d`}
      </td>
      <td className="whitespace-nowrap px-3 py-2.5">
        <span className={`text-[11px] font-semibold ${executionClass}`}>{row.executionStatus}</span>
      </td>
    </tr>
  );
}

function emptyTableMessage(data: PreventivePageData, applied: AppliedFilters): string {
  if (!data.hasAnyPreventiveInPeriod) {
    return "Nenhuma ordem PL/PV encontrada no período selecionado.";
  }
  if (applied.onlyNotDone || applied.onlyClosedNoExec || applied.onlyLate) {
    return "Nenhuma OS não realizada encontrada para os filtros selecionados.";
  }
  return "Nenhuma ordem PL/PV encontrada para os filtros selecionados.";
}

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  const date = new Date(iso);
  return new Intl.DateTimeFormat("pt-BR", { timeZone: "UTC", day: "2-digit", month: "2-digit", year: "numeric" }).format(date);
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
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`rounded-full border px-4 py-1.5 text-xs font-medium transition ${
        active
          ? "border-gold/60 bg-gold/20 text-champagne shadow-[inset_0_1px_0_rgba(255,255,255,0.12)]"
          : "border-gold/25 bg-black/30 text-zinc-300 hover:border-gold/45 hover:text-white"
      }`}
    >
      {children}
    </button>
  );
}

function ChartPanel({
  title,
  hint,
  icon: Icon,
  children
}: {
  title: string;
  hint: string;
  icon: LucideIcon;
  children: React.ReactNode;
}) {
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

function AlertCard({
  icon: Icon,
  tone,
  title,
  metric,
  description
}: {
  icon: LucideIcon;
  tone: Tone;
  title: string;
  metric: string;
  description: string;
}) {
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
