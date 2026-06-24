"use client";

import { m } from "framer-motion";
import { CalendarClock, CircleGauge, Cog, Cpu, Crown, Hammer, Timer, Wrench, Zap } from "lucide-react";
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
  const top = kpis.topMaintenanceResource;

  const cards: Array<{ title: string; value: string; description: string; icon: LucideIcon; tone: Tone }> = [
    {
      title: "Tempo planejado",
      value: hours(kpis.plannedHours),
      description: `Total ${hours(kpis.totalHours)} − fora do planejado ${hours(kpis.excludedHours)}`,
      icon: CalendarClock,
      tone: "blue"
    },
    {
      title: "Horas de manutenção",
      value: hours(kpis.maintenanceHours),
      description: "Mecânica + Elétrica + Automação + Aguardando.",
      icon: Wrench,
      tone: "gold"
    },
    {
      title: "Eventos de manutenção",
      value: int(kpis.maintenanceEvents),
      description: "Registros dos 4 status de manutenção.",
      icon: Hammer,
      tone: "blue"
    },
    // Ocultos da visualização principal a pedido do negócio (jun/2026): MTTR, MTBF,
    // MTTA e % manutenção no planejado. Os cálculos seguem no service (kpis.mttr,
    // kpis.mtbf, kpis.mtta, kpis.maintenancePercentOfPlanned) para uso futuro em
    // relatórios técnicos — só não são renderizados aqui.
    {
      title: "Disponibilidade estimada",
      value: percent(kpis.availabilityPercent),
      description: "(Planejado − paradas) / planejado.",
      icon: CircleGauge,
      tone: "green"
    },
    {
      title: "Manutenção Mecânica",
      value: hours(kpis.mechanicalMaintenanceHours),
      description: `${int(kpis.mechanicalEvents)} eventos no período.`,
      icon: Cog,
      tone: "gold"
    },
    {
      title: "Manutenção Elétrica",
      value: hours(kpis.electricalMaintenanceHours),
      description: `${int(kpis.electricalEvents)} eventos no período.`,
      icon: Zap,
      tone: "blue"
    },
    {
      title: "Manutenção Automação",
      value: hours(kpis.automationMaintenanceHours),
      description: `${int(kpis.automationEvents)} eventos no período.`,
      icon: Cpu,
      tone: "green"
    },
    {
      title: "Aguardando manutenção",
      value: hours(kpis.waitingMaintenanceHours),
      description: `${int(kpis.waitingEvents)} eventos no período.`,
      icon: Timer,
      tone: "red"
    },
    {
      title: "Máquina mais crítica",
      value: top ? top.resourceName : "—",
      description: top ? `${hours(top.hours)} de manutenção` : "Sem manutenção no período",
      icon: Crown,
      tone: "gold"
    }
  ];

  return (
    <section className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
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
            <div className={`grid h-14 w-14 shrink-0 place-items-center rounded-full shadow-[inset_0_1px_0_rgba(255,255,255,0.22)] ${toneClass[card.tone]}`}>
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

function percent(value: number | null): string {
  return value === null ? "Dados insuficientes" : `${value.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`;
}
