"use client";

import { m } from "framer-motion";
import { AlertTriangle, ArrowDownCircle, ArrowUpCircle, Boxes, Crown, FileWarning, Wrench } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { LubricantKpis, LubricantReferencePeriod } from "@/types/lubricants";

type LubricantKpiCardsProps = {
  kpis: LubricantKpis;
  reference: LubricantReferencePeriod;
};

type Tone = "blue" | "gold" | "red" | "green";

const toneClass: Record<Tone, string> = {
  blue: "bg-petroleum text-white",
  gold: "bg-gold text-white",
  red: "bg-danger text-white",
  green: "bg-[#3f8f6b] text-white"
};

export function LubricantKpiCards({ kpis, reference }: LubricantKpiCardsProps) {
  const most = kpis.mostUsedLubricant;

  const cards: Array<{ title: string; value: string; description: string; icon: LucideIcon; tone: Tone }> = [
    {
      title: "Códigos monitorados",
      value: int(kpis.totalLubricants),
      description: `${int(kpis.movementsCount)} movimentações em ${reference.year}`,
      icon: Boxes,
      tone: "blue"
    },
    {
      title: "Saídas no mês",
      value: qty(kpis.totalOutputMonth),
      description: `Consumo em ${reference.monthLabel}`,
      icon: ArrowDownCircle,
      tone: "red"
    },
    {
      title: "Saídas no ano",
      value: qty(kpis.totalOutputYear),
      description: `Consumo acumulado ${reference.year}`,
      icon: ArrowDownCircle,
      tone: "red"
    },
    {
      title: "Entradas no mês",
      value: qty(kpis.totalInputMonth),
      description: `Recebido em ${reference.monthLabel}`,
      icon: ArrowUpCircle,
      tone: "green"
    },
    {
      title: "Entradas no ano",
      value: qty(kpis.totalInputYear),
      description: `Recebido em ${reference.year}`,
      icon: ArrowUpCircle,
      tone: "green"
    },
    {
      title: "Item mais consumido",
      value: most ? most.description : "—",
      description: most ? `${qty(most.quantity)} ${most.unit} no ano` : "Sem saídas no período",
      icon: Crown,
      tone: "gold"
    },
    {
      title: "Itens sem máquina",
      value: int(kpis.itemsWithoutMachineApplication),
      description: "Aplicação ainda não informada",
      icon: Wrench,
      tone: "blue"
    },
    {
      title: "Itens sem ficha técnica",
      value: int(kpis.itemsWithoutTechnicalSheet),
      description: "Ficha técnica pendente",
      icon: FileWarning,
      tone: "gold"
    },
    {
      title: "Itens abaixo do mínimo",
      value: int(kpis.itemsBelowMinimum),
      description: "Saldo abaixo do estoque mínimo",
      icon: AlertTriangle,
      tone: "red"
    }
  ];

  return (
    <section className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
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

function qty(value: number): string {
  return value.toLocaleString("pt-BR", { maximumFractionDigits: 2 });
}
