"use client";

import { m } from "framer-motion";
import type { LucideIcon } from "lucide-react";

export type KpiTone = "blue" | "gold" | "red" | "green";

export type KpiCardData = {
  title: string;
  /** Texto exibido. Pode ser abreviado — ver `valueTitle`. */
  value: string;
  /**
   * Tooltip do valor. Permite exibir a forma ABREVIADA (que cabe na coluna
   * estreita) sem esconder o número exato de quem precisa conferir.
   */
  valueTitle?: string;
  description: string;
  icon: LucideIcon;
  tone: KpiTone;
};

const toneClass: Record<KpiTone, string> = {
  blue: "bg-petroleum text-white",
  gold: "bg-gold text-white",
  red: "bg-danger text-white",
  green: "bg-success text-white"
};

const DEFAULT_GRID = "grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4";

/**
 * Grade de cards KPI do portal — implementação ÚNICA, compartilhada pelas abas.
 *
 * Nasceu em Compras (`PurchaseKpiCards`) e virou genérica quando Ordens de Serviço
 * precisou da mesma grade: duas cópias divergiriam no primeiro ajuste de contraste, e
 * o portal já tinha esse problema com o MultiSelectFilter. `PurchaseKpiCards` continua
 * existindo como alias, para as abas de Compras não precisarem mudar.
 *
 * `className` deixa uma aba com outro número de cards ajustar as colunas sem afetar
 * as demais telas.
 */
export function KpiGrid({ cards, className }: { cards: KpiCardData[]; className?: string }) {
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
            className="panel flex min-h-[112px] items-center gap-4 rounded-lg p-4 transition duration-200 ease-premium hover:-translate-y-0.5 hover:shadow-premium"
          >
            <div
              className={`grid h-14 w-14 shrink-0 place-items-center rounded-full shadow-[inset_0_1px_0_rgba(255,255,255,0.22)] ${toneClass[card.tone]}`}
            >
              <Icon className="h-7 w-7" strokeWidth={1.8} />
            </div>
            <div className="min-w-0">
              <h3 className="text-[11px] font-extrabold uppercase tracking-wide text-zinc-800">{card.title}</h3>
              <div
                className="mt-0.5 truncate text-2xl font-light tracking-normal text-zinc-950"
                title={card.valueTitle ?? card.value}
              >
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
