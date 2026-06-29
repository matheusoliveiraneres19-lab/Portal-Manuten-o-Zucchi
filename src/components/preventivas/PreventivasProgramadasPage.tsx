"use client";

import { useState } from "react";
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

type Tone = "gold" | "blue" | "green" | "red" | "champagne";

const toneChip: Record<Tone, string> = {
  gold: "border-gold/40 bg-gold/15 text-gold",
  blue: "border-sky-400/30 bg-sky-400/10 text-sky-300",
  green: "border-emerald-400/30 bg-emerald-400/10 text-emerald-300",
  red: "border-red-400/30 bg-red-400/10 text-red-300",
  champagne: "border-champagne/30 bg-champagne/10 text-champagne"
};

type KpiCard = {
  title: string;
  value: string;
  description: string;
  icon: LucideIcon;
  tone: Tone;
};

// Fase 01: valores zerados/placeholder. Na fase 02 serão substituídos pelos
// cálculos reais sobre as ordens PL/PV importadas do SAP.
const KPI_CARDS: KpiCard[] = [
  {
    title: "Total Programadas",
    value: "0",
    description: "Total de ordens PL e PV no período.",
    icon: ClipboardList,
    tone: "champagne"
  },
  {
    title: "Lubrificação PL",
    value: "0",
    description: "Ordens de lubrificação programadas.",
    icon: Droplet,
    tone: "blue"
  },
  {
    title: "Preventiva Elétrica PV",
    value: "0",
    description: "Ordens preventivas elétricas programadas.",
    icon: Zap,
    tone: "gold"
  },
  {
    title: "Realizadas",
    value: "0",
    description: "Ordens com trabalho real maior que 0,1 h.",
    icon: CheckCircle2,
    tone: "green"
  },
  {
    title: "Não Realizadas",
    value: "0",
    description: "Ordens com trabalho real igual ou menor que 0,1 h.",
    icon: XCircle,
    tone: "red"
  },
  {
    title: "Fechadas sem Execução",
    value: "0",
    description: "Ordens fechadas sem evidência de execução real.",
    icon: FileWarning,
    tone: "red"
  },
  {
    title: "Horas Apontadas",
    value: "0,0 h",
    description: "Total de horas apontadas em PL e PV.",
    icon: Timer,
    tone: "blue"
  },
  {
    title: "Aderência Preventiva",
    value: "—",
    description: "Percentual de ordens realizadas sobre o total programado.",
    icon: Gauge,
    tone: "gold"
  }
];

type ChartBlock = {
  title: string;
  hint: string;
  icon: LucideIcon;
};

const CHART_BLOCKS: ChartBlock[] = [
  {
    title: "PL × PV",
    hint: "Comparação de quantidade de ordens e horas por tipo de plano.",
    icon: BarChart3
  },
  {
    title: "Aderência por Área",
    hint: "Lubrificação × Preventiva Elétrica.",
    icon: PieChart
  },
  {
    title: "OS por Status",
    hint: "Abertas, em andamento, fechadas, fechadas sem execução e atrasadas.",
    icon: LineChart
  },
  {
    title: "Top Máquinas com OS Não Realizadas",
    hint: "Locais de instalação com maior quantidade de PL/PV não executadas.",
    icon: AlertTriangle
  }
];

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

type AlertCard = {
  title: string;
  description: string;
  icon: LucideIcon;
  tone: Tone;
};

const ALERT_CARDS: AlertCard[] = [
  {
    title: "OS fechada sem execução",
    description: "Ordens encerradas no SAP sem trabalho real apontado.",
    icon: FileWarning,
    tone: "red"
  },
  {
    title: "Preventiva vencida",
    description: "Planos PL/PV cuja data programada já passou sem conclusão.",
    icon: CalendarX2,
    tone: "gold"
  },
  {
    title: "Máquina com recorrência de preventivas não executadas",
    description: "Equipamentos que acumulam PL/PV não realizadas em sequência.",
    icon: Repeat2,
    tone: "red"
  },
  {
    title: "Área com baixa aderência",
    description: "Áreas cuja execução fica abaixo da meta de aderência preventiva.",
    icon: TrendingDown,
    tone: "champagne"
  }
];

export function PreventivasProgramadasPage() {
  // Estado visual dos filtros (fase 01). A aplicação real sobre os dados PL/PV
  // entra na fase 02 — por ora os controles apenas refletem a seleção.
  const [type, setType] = useState<"todos" | "pl" | "pv">("todos");
  const [area, setArea] = useState<"todas" | "lubrificacao" | "eletrica">("todas");
  const [onlyNotDone, setOnlyNotDone] = useState(false);
  const [onlyClosedNoExec, setOnlyClosedNoExec] = useState(false);
  const [onlyLate, setOnlyLate] = useState(false);

  return (
    <section className="relative overflow-hidden rounded-lg border border-gold/20 bg-[#060707] shadow-premium">
      <div className="login-marble-bg absolute inset-0 opacity-90" />
      <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(0,0,0,0.72),rgba(0,0,0,0.42)),radial-gradient(circle_at_84%_12%,rgba(196,154,69,0.16),transparent_24rem)]" />

      <div className="relative z-10 px-4 py-7 sm:px-6 lg:px-8">
        {/* TAREFA 2 — Cabeçalho */}
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

        {/* TAREFA 3 — Cards principais */}
        <div className="mt-8 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
          {KPI_CARDS.map((card, index) => {
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

        {/* TAREFA 4 — Filtros */}
        <div className="mt-6 rounded-lg border border-gold/25 bg-black/45 p-5 shadow-[0_14px_36px_rgba(0,0,0,0.3)] backdrop-blur">
          <div className="mb-4 flex items-center gap-2 text-champagne">
            <CalendarClock className="h-4 w-4 text-gold" />
            <h2 className="text-sm font-bold uppercase tracking-[0.2em]">Filtros</h2>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            <Field label="Período">
              <div className="flex items-center gap-2">
                <input type="date" className={inputClass} aria-label="Data inicial" />
                <span className="text-zinc-500">–</span>
                <input type="date" className={inputClass} aria-label="Data final" />
              </div>
            </Field>

            <Field label="Tipo">
              <select className={inputClass} value={type} onChange={(e) => setType(e.target.value as typeof type)}>
                <option value="todos">Todos</option>
                <option value="pl">PL — Lubrificação</option>
                <option value="pv">PV — Preventiva Elétrica</option>
              </select>
            </Field>

            <Field label="Área">
              <select className={inputClass} value={area} onChange={(e) => setArea(e.target.value as typeof area)}>
                <option value="todas">Todas</option>
                <option value="lubrificacao">Lubrificação</option>
                <option value="eletrica">Elétrica</option>
              </select>
            </Field>

            <Field label="Status SAP">
              <select className={inputClass} defaultValue="">
                <option value="">Todos</option>
                <option value="aberta">Aberta</option>
                <option value="andamento">Em andamento</option>
                <option value="fechada">Fechada</option>
              </select>
            </Field>

            <Field label="Status Gerencial">
              <select className={inputClass} defaultValue="">
                <option value="">Todos</option>
                <option value="realizada">Realizada</option>
                <option value="nao-realizada">Não realizada</option>
                <option value="sem-execucao">Fechada sem execução</option>
              </select>
            </Field>

            <Field label="Responsável">
              <input type="text" placeholder="Todos" className={inputClass} />
            </Field>

            <Field label="Local de instalação">
              <input type="text" placeholder="Todos" className={inputClass} />
            </Field>

            <Field label="Equipamento">
              <input type="text" placeholder="Todos" className={inputClass} />
            </Field>
          </div>

          <div className="mt-4 flex flex-wrap gap-2 border-t border-gold/15 pt-4">
            <Toggle active={onlyNotDone} onClick={() => setOnlyNotDone((v) => !v)}>
              Somente não realizadas
            </Toggle>
            <Toggle active={onlyClosedNoExec} onClick={() => setOnlyClosedNoExec((v) => !v)}>
              Somente fechadas sem execução
            </Toggle>
            <Toggle active={onlyLate} onClick={() => setOnlyLate((v) => !v)}>
              Somente atrasadas
            </Toggle>
          </div>
        </div>

        {/* TAREFA 5 — Gráficos */}
        <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
          {CHART_BLOCKS.map((chart) => {
            const Icon = chart.icon;
            return (
              <div
                key={chart.title}
                className="rounded-lg border border-gold/25 bg-black/45 p-5 shadow-[0_14px_36px_rgba(0,0,0,0.3)] backdrop-blur"
              >
                <div className="flex items-center gap-2 text-champagne">
                  <Icon className="h-4 w-4 text-gold" />
                  <h3 className="text-sm font-bold tracking-wide">{chart.title}</h3>
                </div>
                <p className="mt-1 text-xs text-zinc-400">{chart.hint}</p>
                <div className="mt-4 grid h-48 place-items-center rounded-lg border border-dashed border-gold/25 bg-gradient-to-br from-white/[0.04] to-transparent">
                  <div className="flex flex-col items-center gap-2 text-center">
                    <Icon className="h-8 w-8 text-gold/60" strokeWidth={1.4} />
                    <span className="text-xs font-medium text-zinc-400">Gráfico disponível na fase 02</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* TAREFA 6 — Tabela */}
        <div className="mt-6 rounded-lg border border-gold/25 bg-black/45 shadow-[0_14px_36px_rgba(0,0,0,0.3)] backdrop-blur">
          <div className="flex items-center gap-2 border-b border-gold/15 px-5 py-4 text-champagne">
            <ClipboardList className="h-4 w-4 text-gold" />
            <h2 className="text-sm font-bold tracking-wide">Ordens Programadas PL/PV</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1100px] text-left text-sm">
              <thead>
                <tr className="border-b border-gold/15">
                  {TABLE_COLUMNS.map((col) => (
                    <th
                      key={col}
                      className="whitespace-nowrap px-4 py-3 text-[11px] font-bold uppercase tracking-wide text-champagne/70"
                    >
                      {col}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td colSpan={TABLE_COLUMNS.length} className="px-4 py-16 text-center">
                    <div className="flex flex-col items-center gap-3">
                      <div className="grid h-12 w-12 place-items-center rounded-full border border-gold/30 bg-gold/10 text-gold">
                        <ClipboardList className="h-6 w-6" strokeWidth={1.6} />
                      </div>
                      <p className="text-sm text-zinc-300">
                        Nenhuma ordem PL/PV encontrada para os filtros selecionados.
                      </p>
                    </div>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        {/* TAREFA 7 — Alertas Gerenciais */}
        <div className="mt-6">
          <div className="mb-3 flex items-center gap-2 text-champagne">
            <AlertTriangle className="h-4 w-4 text-gold" />
            <h2 className="text-sm font-bold uppercase tracking-[0.2em]">Alertas Gerenciais</h2>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {ALERT_CARDS.map((alert) => {
              const Icon = alert.icon;
              return (
                <div
                  key={alert.title}
                  className="flex gap-3 rounded-lg border border-gold/25 bg-black/45 p-4 shadow-[0_14px_36px_rgba(0,0,0,0.3)] backdrop-blur"
                >
                  <div
                    className={`grid h-10 w-10 shrink-0 place-items-center rounded-lg border ${toneChip[alert.tone]}`}
                  >
                    <Icon className="h-5 w-5" strokeWidth={1.8} />
                  </div>
                  <div className="min-w-0">
                    <h3 className="text-sm font-semibold text-white">{alert.title}</h3>
                    <p className="mt-1 text-xs leading-snug text-zinc-400">{alert.description}</p>
                    <span className="mt-2 inline-block rounded-full border border-gold/20 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-champagne/70">
                      Aguardando dados • fase 02
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
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

function Toggle({
  active,
  onClick,
  children
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
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
