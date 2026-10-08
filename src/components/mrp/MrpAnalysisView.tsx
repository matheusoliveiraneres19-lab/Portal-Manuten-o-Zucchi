"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Boxes, CalendarClock, Database, FileSpreadsheet, PackageSearch, Upload, UserRound, Warehouse } from "lucide-react";
import { MrpBuyTab } from "@/components/mrp/MrpBuyTab";
import { MrpImportModal } from "@/components/mrp/MrpImportModal";
import type { MrpPageProps } from "@/components/mrp/types";

/**
 * ANÁLISE MRP — casca da página: cabeçalho, metadados da análise vigente, abas
 * e o modal "Planilhas". Só a aba Comprar é funcional nesta fase.
 *
 * Nenhuma regra do MRP roda aqui: KPIs vêm de MrpAnalysisRun.kpis e a lista,
 * de /api/mrp/analysis/current/items (itens já calculados pelo motor).
 */
const TABS = [
  { key: "comprar", label: "Comprar", ready: true },
  { key: "areas", label: "Áreas & Conjuntos", ready: false },
  { key: "transito", label: "Em trânsito", ready: false },
  { key: "parado", label: "Estoque parado", ready: false },
  { key: "base", label: "Base MRP", ready: false }
] as const;

const dateTime = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short", timeZone: "America/Sao_Paulo" });

export function MrpAnalysisView(props: MrpPageProps) {
  const router = useRouter();
  const [importOpen, setImportOpen] = useState(false);
  const { summary } = props;

  return (
    <section className="space-y-4 text-champagne">
      <header className="relative overflow-hidden rounded-lg border border-gold/20 bg-ink p-5 shadow-premium sm:p-6">
        <div className="login-marble-bg absolute inset-0 opacity-80" />
        <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(0,0,0,0.78),rgba(0,0,0,0.44)),radial-gradient(circle_at_88%_8%,rgba(196,154,69,0.15),transparent_22rem)]" />
        <div className="relative z-10 flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="mb-3 flex flex-wrap items-center gap-3 text-gold">
              <PackageSearch className="h-5 w-5" />
              <span className="rounded-md border border-gold/40 bg-gold/10 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.24em] text-champagne/80">
                Gestão de Materiais
              </span>
            </div>
            <h1 className="font-serif text-3xl leading-tight text-white sm:text-4xl">Análise MRP</h1>
            <p className="mt-2 max-w-3xl text-sm leading-relaxed text-zinc-300 sm:text-base">
              Análise de necessidades de materiais, estoque e compras para apoio ao planejamento da manutenção.
            </p>
          </div>
          {props.canImport ? (
            <button
              type="button"
              onClick={() => setImportOpen(true)}
              className="inline-flex h-11 shrink-0 items-center gap-2 rounded-lg border border-gold/55 bg-gold/15 px-5 text-sm font-bold text-gold transition hover:bg-gold/25"
            >
              <Upload className="h-4 w-4" /> Atualizar planilhas
            </button>
          ) : null}
        </div>

        {summary ? (
          <dl className="relative z-10 mt-4 flex flex-wrap gap-x-5 gap-y-1.5 border-t border-gold/15 pt-3 text-[11px] text-parchment-dim">
            <Meta icon={CalendarClock} label="Atualizado em" value={dateTime.format(new Date(summary.createdAt))} />
            <Meta icon={Database} label="Base MRP" value={`${summary.base.fileName} · ${summary.base.materialCount.toLocaleString("pt-BR")} materiais`} />
            <Meta icon={Warehouse} label="Estoque" value={summary.stock.fileName} />
            <Meta icon={FileSpreadsheet} label="Compras" value={summary.purchases.fileName} />
            <Meta icon={Boxes} label="Depósito" value={summary.depositFilter ? summary.depositFilter : "todos"} title={summary.stock.depositInfo} />
            {summary.createdBy ? <Meta icon={UserRound} label="Por" value={summary.createdBy} /> : null}
          </dl>
        ) : null}
      </header>

      <nav aria-label="Visões da Análise MRP" className="flex gap-1 overflow-x-auto rounded-lg border border-gold/15 bg-ink/80 p-1">
        {TABS.map((tab) => (
          <button
            key={tab.key}
            type="button"
            disabled={!tab.ready}
            aria-current={tab.key === "comprar" ? "page" : undefined}
            title={tab.ready ? undefined : "Em construção — próxima etapa"}
            className={`shrink-0 rounded-md px-4 py-2 text-sm font-semibold transition ${
              tab.key === "comprar"
                ? "bg-gold/15 text-gold"
                : "cursor-not-allowed text-parchment-dim/60"
            }`}
          >
            {tab.label}
            {!tab.ready ? <span className="ml-2 text-[10px] font-normal uppercase tracking-wide">em breve</span> : null}
          </button>
        ))}
      </nav>

      {summary && props.listing ? (
        <MrpBuyTab key={summary.runId} kpis={summary.kpis} initialListing={props.listing} initialFilters={props.filters} />
      ) : (
        <div className="relative overflow-hidden rounded-lg border border-gold/20 bg-ink p-10 text-center shadow-premium">
          <div className="login-marble-bg absolute inset-0 opacity-80" />
          <div className="relative z-10 mx-auto flex max-w-xl flex-col items-center gap-4">
            <span className="grid h-16 w-16 place-items-center rounded-full border border-gold/35 bg-gold/10 text-gold">
              <PackageSearch className="h-8 w-8" strokeWidth={1.6} />
            </span>
            <div>
              <h2 className="font-serif text-2xl text-white">Nenhuma análise MRP disponível</h2>
              <p className="mt-1 text-sm leading-relaxed text-parchment">
                Importe as planilhas de estoque e compras e execute &quot;Atualizar tudo&quot; para gerar a análise.
              </p>
            </div>
            {props.canImport ? (
              <button
                type="button"
                onClick={() => setImportOpen(true)}
                className="mt-1 inline-flex h-11 items-center gap-2 rounded-lg border border-gold/55 bg-gold/15 px-5 text-sm font-bold text-gold transition hover:bg-gold/25"
              >
                <Upload className="h-4 w-4" /> Atualizar planilhas
              </button>
            ) : null}
          </div>
        </div>
      )}

      {props.canImport ? (
        <MrpImportModal
          open={importOpen}
          onClose={() => setImportOpen(false)}
          hasActiveBase={props.hasActiveBase}
          defaultDeposit={summary?.depositFilter ?? props.defaultDeposit}
          onUpdated={() => {
            setImportOpen(false);
            router.refresh();
          }}
        />
      ) : null}
    </section>
  );
}

function Meta({ icon: Icon, label, value, title }: { icon: typeof Boxes; label: string; value: string; title?: string }) {
  return (
    <div className="flex min-w-0 items-center gap-1.5" title={title}>
      <Icon className="h-3.5 w-3.5 shrink-0 text-gold" />
      <dt className="shrink-0">{label}:</dt>
      <dd className="truncate font-semibold text-champagne">{value}</dd>
    </div>
  );
}
