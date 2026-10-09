"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Boxes, CalendarClock, Database, FileSpreadsheet, PackageSearch, Upload, UserRound, Warehouse } from "lucide-react";
import { MrpAreasTab } from "@/components/mrp/MrpAreasTab";
import { MrpBuyTab } from "@/components/mrp/MrpBuyTab";
import { MrpTransitTab } from "@/components/mrp/MrpTransitTab";
import { MrpIdleTab } from "@/components/mrp/MrpIdleTab";
import { MrpBaseTab } from "@/components/mrp/MrpBaseTab";
import { MrpImportModal } from "@/components/mrp/MrpImportModal";
import { mrpGet } from "@/components/mrp/mrp-api";
import { MRP_TABS, parseMrpTab, type MrpPageProps, type MrpTab } from "@/components/mrp/types";
import { MRP_BUY_DEFAULT_FILTERS, MRP_BUY_INITIAL_LIMIT, parseMrpBuyFilters, type MrpBuyFilters } from "@/lib/mrp/buy-list";
import type { MrpAreaTarget } from "@/lib/mrp/areas";
import type { MrpBuyListing } from "@/services/mrp-listing.service";

/**
 * ANÁLISE MRP — casca da página: cabeçalho, metadados da análise vigente, abas
 * (?tab=buy|areas) e o modal "Planilhas". Comprar e Áreas & Conjuntos são
 * funcionais; as demais entram nas próximas fases.
 *
 * Nenhuma regra do MRP roda aqui: KPIs e cartões vêm do run persistido e a lista
 * de /api/mrp/analysis/current/items. Abas e cliques nos cartões viram entradas
 * no histórico (voltar/avançar/atualizar/copiar link funcionam).
 */
const dateTime = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short", timeZone: "America/Sao_Paulo" });

const FILTER_KEYS = ["q", "status", "area", "family", "sort"] as const;

function urlFor(tab: MrpTab, filters: MrpBuyFilters): string {
  const params = new URLSearchParams(window.location.search);
  params.set("tab", tab);
  for (const key of FILTER_KEYS) {
    const value = filters[key];
    if (value && value !== MRP_BUY_DEFAULT_FILTERS[key]) params.set(key, value);
    else params.delete(key);
  }
  return `${window.location.pathname}?${params.toString()}`;
}

const sameFilters = (a: MrpBuyFilters, b: MrpBuyFilters) => FILTER_KEYS.every((k) => a[k] === b[k]);

export function MrpAnalysisView(props: MrpPageProps) {
  const router = useRouter();
  const [importOpen, setImportOpen] = useState(false);
  const [tab, setTab] = useState<MrpTab>(props.initialTab);
  // Lista que a aba Comprar recebe ao (re)montar; trocada por clique em cartão ou voltar/avançar.
  const [buy, setBuy] = useState<{ key: number; filters: MrpBuyFilters; listing: MrpBuyListing | null }>({
    key: 0,
    filters: props.filters,
    listing: props.listing
  });
  const [navError, setNavError] = useState<string | null>(null);
  // A aba Em trânsito monta na 1ª visita e fica montada (filtros preservados entre abas).
  const [transitMounted, setTransitMounted] = useState(props.initialTab === "transit");
  const [idleMounted, setIdleMounted] = useState(props.initialTab === "idle");
  const [baseMounted, setBaseMounted] = useState(props.initialTab === "base");
  useEffect(() => {
    if (tab === "transit") setTransitMounted(true);
    if (tab === "idle") setIdleMounted(true);
    if (tab === "base") setBaseMounted(true);
  }, [tab]);
  // Filtros da lista montada (para o voltar/avançar decidir se precisa recarregar).
  const buyFiltersRef = useRef(buy.filters);
  buyFiltersRef.current = buy.filters;
  const { summary } = props;

  // Só a resposta da navegação MAIS RECENTE vale: em voltar/avançar rápidos, uma
  // resposta antiga que chegasse depois deixaria a lista diferente da URL.
  const loadSeq = useRef(0);
  const loadBuy = useCallback(async (filters: MrpBuyFilters) => {
    const seq = ++loadSeq.current;
    const params = new URLSearchParams({ ...filters, limit: String(MRP_BUY_INITIAL_LIMIT) });
    const res = await mrpGet<{ listing: MrpBuyListing | null }>(`/api/mrp/analysis/current/items?${params}`);
    if (seq !== loadSeq.current) return false;
    if (!res.ok) {
      setNavError(res.error);
      return false;
    }
    setNavError(null);
    setBuy((b) => ({ key: b.key + 1, filters, listing: res.data.listing }));
    return true;
  }, []);

  /** Abre a aba Comprar com os filtros atuais da URL + `patch` (nova entrada no histórico). */
  const openBuy = useCallback(
    async (patch: Partial<MrpBuyFilters>) => {
      const current = parseMrpBuyFilters((k) => new URLSearchParams(window.location.search).get(k));
      const filters: MrpBuyFilters = { ...current, ...patch };
      if (await loadBuy(filters)) {
        setTab("buy");
        window.history.pushState(window.history.state, "", urlFor("buy", filters));
        window.scrollTo({ top: 0, behavior: "smooth" });
      }
    },
    [loadBuy]
  );

  const selectTab = (next: MrpTab) => {
    if (next === tab) return;
    setTab(next);
    const filters = parseMrpBuyFilters((k) => new URLSearchParams(window.location.search).get(k));
    window.history.pushState(window.history.state, "", urlFor(next, filters));
  };

  // Voltar/avançar: a URL é a fonte da verdade.
  useEffect(() => {
    const onPop = () => {
      const params = new URLSearchParams(window.location.search);
      setTab(parseMrpTab(params.get("tab")));
      const filters = parseMrpBuyFilters((k) => params.get(k));
      if (!sameFilters(buyFiltersRef.current, filters)) void loadBuy(filters);
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, [loadBuy]);

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

      <nav aria-label="Visões da Análise MRP" className="flex gap-1 overflow-x-auto rounded-lg border border-gold/15 bg-ink/80 p-1" role="tablist">
        {MRP_TABS.map((t) => {
          const active = t.ready && t.key === tab;
          return (
            <button
              key={t.key}
              type="button"
              role="tab"
              aria-selected={active}
              disabled={!t.ready}
              data-tab={t.key}
              onClick={() => t.ready && selectTab(t.key as MrpTab)}
              title={t.ready ? undefined : "Em construção — próxima etapa"}
              className={`shrink-0 rounded-md px-4 py-2 text-sm font-semibold transition ${
                active ? "bg-gold/15 text-gold" : t.ready ? "text-parchment hover:bg-white/5 hover:text-white" : "cursor-not-allowed text-parchment-dim/60"
              }`}
            >
              {t.label}
              {!t.ready ? <span className="ml-2 text-[10px] font-normal uppercase tracking-wide">em breve</span> : null}
            </button>
          );
        })}
      </nav>

      {navError ? <p className="rounded-md border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger-soft">{navError}</p> : null}

      {summary && buy.listing ? (
        <>
          <div hidden={tab !== "buy"}>
            <MrpBuyTab key={`${summary.runId}:${buy.key}`} kpis={summary.kpis} initialListing={buy.listing} initialFilters={buy.filters} />
          </div>
          {tab === "areas" && props.areas ? (
            // filtrarPor(area, fam): status "need" + área/conjunto; busca e ordenação atuais ficam.
            <MrpAreasTab summary={props.areas} onOpen={(t: MrpAreaTarget) => openBuy({ status: "need", area: t.area, family: t.family })} />
          ) : null}
          <div hidden={tab !== "transit"}>
            {transitMounted ? (
              <MrpTransitTab
                key={summary.runId}
                kpis={summary.kpis.transit}
                initialFilters={props.transitFilters}
                // "Saíram do MRP" → Comprar/Comprado. Limpa área, conjunto e busca (pedido da FASE G,
                // para nenhum filtro escondido reduzir a lista; o HTML só trocava o status).
                onOpenBought={() => openBuy({ status: "Comprado", area: "", family: "", q: "" })}
              />
            ) : null}
          </div>
          <div hidden={tab !== "idle"}>
            {idleMounted ? <MrpIdleTab key={summary.runId} kpis={summary.kpis.idle} initialFilters={props.idleFilters} /> : null}
          </div>
        </>
      ) : tab !== "base" ? (
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
      ) : null}

      {/* Base MRP funciona também sem análise vigente (as outras abas ficam no estado vazio). */}
      <div hidden={tab !== "base"}>
        {baseMounted ? (
          <MrpBaseTab
            key={props.baseView?.version.id ?? "sem-base"}
            view={props.baseView}
            initialFilters={props.baseFilters}
            canImport={props.canImport}
            hasRun={!!summary}
            onChanged={() => router.refresh()}
          />
        ) : null}
      </div>

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
