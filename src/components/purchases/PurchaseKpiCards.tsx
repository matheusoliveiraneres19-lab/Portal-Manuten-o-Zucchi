"use client";

import { m } from "framer-motion";
import type { LucideIcon } from "lucide-react";

export type PurchaseKpiTone = "blue" | "gold" | "red" | "green";

export type PurchaseKpiCard = {
  title: string;
  value: string;
  description: string;
  icon: LucideIcon;
  tone: PurchaseKpiTone;
};

const toneClass: Record<PurchaseKpiTone, string> = {
  blue: "bg-petroleum text-white",
  gold: "bg-gold text-white",
  red: "bg-danger text-white",
  green: "bg-success text-white"
};

/** Colunas padrão da grade (Compras Pendentes e demais consumidores). */
const DEFAULT_GRID = "grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4";

/**
 * Grade de cards KPI premium do módulo de Compras (mesmo padrão dos demais módulos).
 * `className` permite que uma aba com outro número de cards ajuste as colunas sem
 * afetar as demais telas que usam o padrão.
 */
export function PurchaseKpiCards({ cards, className }: { cards: PurchaseKpiCard[]; className?: string }) {
  return (
    <section className={className ?? DEFAULT_GRID}>
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
