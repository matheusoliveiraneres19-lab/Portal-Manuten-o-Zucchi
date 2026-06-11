"use client";

import { m } from "framer-motion";
import {
  Activity,
  AlarmClock,
  CircleGauge,
  Factory,
  Hammer,
  OctagonPause,
  Timer,
  TimerReset,
  TrendingUp,
  Wrench
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { PcFactoryKpis } from "@/types/pc-factory";

type PcFactoryKpiCardsProps = {
  kpis: PcFactoryKpis;
};

type Tone = "blue" | "gold" | "red" | "green";

const toneClass: Record<Tone, string> = {
  blue: "bg-petroleum text-white",
  gold: "bg-gold text-white",
  red: "bg-danger text-white",
  green: "bg-[#3f8f6b] text-white"
};

export function PcFactoryKpiCards({ kpis }: PcFactoryKpiCardsProps) {
  const cards: Array<{ title: string; value: string; description: string; icon: LucideIcon; tone: Tone }> = [
    {
      title: "Máquinas analisadas",
      value: int(kpis.totalResources),
      description: `${int(kpis.totalRecords)} registros operacionais`,
      icon: Factory,
      tone: "blue"
    },
    {
      title: "Linhas de produção",
      value: int(kpis.totalProductionLines),
      description: "Linhas com registros no período",
      icon: Activity,
      tone: "blue"
    },
    {
      title: "Disponibilidade geral",
      value: percent(kpis.availabilityPercent),
      description: "Percentual de tempo disponível no período.",
      icon: CircleGauge,
      tone: "green"
    },
    {
      title: "Utilização produtiva",
      value: percent(kpis.utilizationPercent),
      description: "Tempo em produção sobre o total analisado.",
      icon: TrendingUp,
      tone: "green"
    },
    {
      title: "Horas em produção",
      value: hours(kpis.productionHours),
      description: `${hours(kpis.totalAnalyzedHours)} analisadas no total`,
      icon: Timer,
      tone: "green"
    },
    {
      title: "Horas paradas",
      value: hours(kpis.stoppedHours),
      description: "Parada, aguardando, sem operador, falta de material e inativo.",
      icon: OctagonPause,
      tone: "red"
    },
    {
      title: "Horas em manutenção",
      value: hours(kpis.maintenanceHours),
      description: `Impacto de ${percent(kpis.maintenanceImpactPercent)} no período.`,
      icon: Wrench,
      tone: "gold"
    },
    {
      title: "MTBF",
      value: hoursMetric(kpis.mtbf),
      description: "Tempo médio entre falhas/paradas.",
      icon: TimerReset,
      tone: "blue"
    },
    {
      title: "MTTR",
      value: hoursMetric(kpis.mttr),
      description: "Tempo médio para recuperação/manutenção.",
      icon: AlarmClock,
      tone: "gold"
    },
    {
      title: "MTTF",
      value: hoursMetric(kpis.mttf),
      description: "Tempo médio até falha.",
      icon: Hammer,
      tone: "red"
    }
  ];

  return (
    <section className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-5">
      {cards.map((card, index) => {
        const Icon = card.icon;
        return (
          <m.article
            key={card.title}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, delay: index * 0.04, ease: "easeOut" }}
            className="panel flex min-h-[112px] items-center gap-4 rounded-lg p-4 transition hover:-translate-y-0.5 hover:shadow-premium"
          >
            <div
              className={`grid h-14 w-14 shrink-0 place-items-center rounded-full shadow-[inset_0_1px_0_rgba(255,255,255,0.22)] ${toneClass[card.tone]}`}
            >
              <Icon className="h-7 w-7" strokeWidth={1.8} />
            </div>
            <div className="min-w-0">
              <h3 className="text-[11px] font-extrabold uppercase tracking-wide text-zinc-800">{card.title}</h3>
              <div className="mt-0.5 truncate text-2xl font-light tracking-normal text-zinc-950" title={card.value}>
                {card.value}
              </div>
              <p className="mt-0.5 truncate text-[11px] text-zinc-500" title={card.description}>
                {card.description}
              </p>
            </div>
          </m.article>
        );
      })}
    </section>
  );
}

function int(value: number): string {
  return value.toLocaleString("pt-BR");
}

function hours(value: number): string {
  return `${value.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} h`;
}

/** Métricas que podem ser nulas (MTBF/MTTR/MTTF) — exibem "Dados insuficientes". */
function hoursMetric(value: number | null): string {
  return value === null ? "Dados insuficientes" : `${value.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} h`;
}

function percent(value: number | null): string {
  return value === null ? "Dados insuficientes" : `${value.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`;
}
