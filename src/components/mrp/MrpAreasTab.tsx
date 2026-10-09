"use client";

import { Cog, Factory, Layers, Orbit, Zap } from "lucide-react";
import type { MrpAreasCard, MrpAreasSummary, MrpAreaTarget } from "@/lib/mrp/areas";
import { fmtMrp } from "@/lib/mrp/format";
import { MrpExportButton } from "@/components/mrp/MrpExportButton";

/**
 * Aba ÁREAS & CONJUNTOS — reprodução de renderAreas()/cardHTML() do HTML.
 * Os números chegam prontos do servidor (summarizeMrpSubset = contar()); aqui
 * só há apresentação. Cada cartão é um <button> (Enter/Espaço nativos) que
 * abre a lista Comprar filtrada (filtrarPor).
 */
type Props = { summary: MrpAreasSummary; onOpen: (target: MrpAreaTarget) => void };

const AREA_ICON: Record<string, typeof Cog> = { mec: Cog, ele: Zap, total: Factory };

export function MrpAreasTab({ summary, onOpen }: Props) {
  return (
    <div className="space-y-4" data-testid="mrp-areas">
      <section className="rounded-lg border border-gold/20 bg-ink/90 p-4 shadow-premium sm:p-5">
        <h2 className="flex items-center gap-2 font-serif text-xl text-white">
          <Layers className="h-5 w-5 text-gold" /> Mecânica × Elétrica
        </h2>
        <p className="mt-1 text-xs text-parchment-dim">Clique em um cartão para abrir a lista de compra já filtrada.</p>
        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {summary.areas.map((card) => (
            <Card key={card.key} card={card} icon={AREA_ICON[card.key] ?? Factory} onOpen={onOpen} />
          ))}
        </div>
      </section>

      <section className="rounded-lg border border-gold/20 bg-ink/90 p-4 shadow-premium sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="flex items-center gap-2 font-serif text-xl text-white">
              <Orbit className="h-5 w-5 text-gold" /> Satélites &amp; Coroas
            </h2>
            <p className="mt-1 text-xs text-parchment-dim">Recorte dos conjuntos identificados na base do MRP. Clique para filtrar a lista de compra.</p>
          </div>
          <MrpExportButton type="families" label="Excel por conjunto" testId="mrp-export-families" />
        </div>
        {summary.families.length === 0 ? (
          <p className="mt-4 rounded-md border border-gold/15 bg-black/25 px-4 py-4 text-center text-sm text-parchment-dim" data-testid="mrp-no-families">
            Nenhum conjunto identificado na Base MRP atual.
          </p>
        ) : null}
        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {summary.families.map((card) => (
            <Card key={card.key} card={card} icon={Orbit} onOpen={onOpen} showNoParams />
          ))}
          {/* legacy parity behavior: números só dos itens com conjunto, mas o clique abre a lista
              geral (filtrarPor('', '')). O HTML desenha este cartão mesmo sem conjuntos. */}
          <Card card={summary.allFamilies} icon={Layers} onOpen={onOpen} />
        </div>
      </section>
    </div>
  );
}

function Card({ card, icon: Icon, onOpen, showNoParams }: { card: MrpAreasCard; icon: typeof Cog; onOpen: (t: MrpAreaTarget) => void; showNoParams?: boolean }) {
  const s = card.summary;
  return (
    <button
      type="button"
      onClick={() => onOpen(card.target)}
      data-card={card.title}
      className="group relative overflow-hidden rounded-lg border border-gold/15 bg-black/30 p-4 text-left transition hover:border-gold/50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold/70"
    >
      <span className="absolute inset-x-0 top-0 h-1 bg-gold/70" />
      <span className="flex items-center gap-2 font-serif text-lg text-white">
        <Icon className="h-4 w-4 text-gold" /> {card.title}
      </span>
      <span className="mt-0.5 block text-xs text-parchment-dim" data-metric="total">
        {fmtMrp(s.total)} materiais{showNoParams && s.noParams ? ` · ${fmtMrp(s.noParams)} sem mín/máx` : ""}
      </span>
      <dl className="mt-3 space-y-1 text-sm">
        <Metric label="Comprar" value={s.Comprar} tone="text-danger-soft" />
        <Metric label="Verificar" value={s.Verificar} tone="text-warning-soft" />
        <Metric label="Em trânsito" value={s.Comprado} tone="text-petroleum-soft" />
        <Metric label="Qtd. sugerida" value={s.qtd} tone="text-gold-soft" />
      </dl>
      <span className="mt-3 flex h-2 overflow-hidden rounded-full bg-white/10" aria-hidden="true" data-metric="bar">
        <Seg pct={s.bar.Comprar} cls="bg-danger" />
        <Seg pct={s.bar.Verificar} cls="bg-warning" />
        <Seg pct={s.bar.Comprado} cls="bg-petroleum-soft" />
        <Seg pct={s.bar.OK} cls="bg-success" />
      </span>
      <span className="sr-only">
        Composição: {fmtMrp(s.Comprar)} comprar, {fmtMrp(s.Verificar)} verificar, {fmtMrp(s.Comprado)} em trânsito, {fmtMrp(s.OK)} OK
      </span>
    </button>
  );
}

function Metric({ label, value, tone }: { label: string; value: number; tone: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-parchment-dim">{label}</dt>
      <dd className={`font-bold tabular-nums ${tone}`} data-metric={label}>
        {fmtMrp(value)}
      </dd>
    </div>
  );
}

function Seg({ pct, cls }: { pct: number; cls: string }) {
  return pct ? <span className={cls} style={{ width: `${pct}%` }} /> : null;
}
