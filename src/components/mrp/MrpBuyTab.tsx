"use client";

import { useEffect, useRef, useState } from "react";
import { Cog, Download, Loader2, Search, ShoppingCart, Zap } from "lucide-react";
import {
  MRP_BUY_AREAS,
  MRP_BUY_DEFAULT_FILTERS,
  MRP_BUY_INITIAL_LIMIT,
  MRP_BUY_LIMIT_STEP,
  MRP_BUY_SORTS,
  MRP_BUY_SORT_LABELS,
  MRP_BUY_STATUS_FILTERS,
  MRP_BUY_STATUS_LABELS,
  type MrpBuyFilters,
  type MrpBuyStatusFilter,
  type MrpSituationTone
} from "@/lib/mrp/buy-list";
import { fmtMrp } from "@/lib/mrp/format";
import type { MrpBuyListing, MrpBuyListItem } from "@/services/mrp-listing.service";
import type { MrpKpisView } from "@/components/mrp/types";
import { mrpGet } from "@/components/mrp/mrp-api";

/**
 * Aba COMPRAR — reprodução funcional de renderCompra() do HTML: KPIs
 * (clicáveis como no HTML), filtros, "Lista de compra" e "mostrar mais".
 * Exibe valores já calculados; formata só para leitura (fmt do HTML).
 */
type Props = { kpis: MrpKpisView; initialListing: MrpBuyListing; initialFilters: MrpBuyFilters };

const SEARCH_DEBOUNCE_MS = 300;

export function MrpBuyTab({ kpis, initialListing, initialFilters }: Props) {
  const [filters, setFilters] = useState<MrpBuyFilters>(initialFilters);
  const [query, setQuery] = useState(initialFilters.q);
  const [limit, setLimit] = useState(MRP_BUY_INITIAL_LIMIT);
  const [listing, setListing] = useState<MrpBuyListing>(initialListing);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const first = useRef(true);

  // Busca com debounce (não dispara uma requisição por tecla).
  useEffect(() => {
    if (query === filters.q) return;
    const t = setTimeout(() => {
      setLimit(MRP_BUY_INITIAL_LIMIT);
      setFilters((f) => ({ ...f, q: query }));
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [query, filters.q]);

  // Filtros refletidos na URL (sem navegação nem reload).
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    for (const key of ["q", "status", "area", "family", "sort"] as const) {
      const value = filters[key];
      if (value && value !== MRP_BUY_DEFAULT_FILTERS[key]) params.set(key, value);
      else params.delete(key);
    }
    const qs = params.toString();
    window.history.replaceState(window.history.state, "", `${window.location.pathname}${qs ? `?${qs}` : ""}`);
  }, [filters]);

  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    const controller = new AbortController();
    const params = new URLSearchParams({ ...filters, limit: String(limit) });
    setLoading(true);
    mrpGet<{ listing: MrpBuyListing | null }>(`/api/mrp/analysis/current/items?${params}`, controller.signal)
      .then((res) => {
        if (!res.ok) return setError(res.error);
        setError(null);
        if (res.data.listing) setListing(res.data.listing);
      })
      .catch(() => undefined)
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [filters, limit]);

  const update = (patch: Partial<MrpBuyFilters>) => {
    setLimit(MRP_BUY_INITIAL_LIMIT);
    setFilters((f) => ({ ...f, ...patch }));
  };
  const setStatus = (status: MrpBuyStatusFilter) => update({ status });

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <Kpi tone="critical" label="Comprar" value={kpis.Comprar} hint="materiais zerados" selected={filters.status === "Comprar"} onClick={() => setStatus("Comprar")} />
        <Kpi tone="attention" label="Verificar" value={kpis.Verificar} hint="abaixo do mínimo" selected={filters.status === "Verificar"} onClick={() => setStatus("Verificar")} />
        <Kpi tone="info" label="Em trânsito" value={kpis.Comprado} hint="já comprados" selected={filters.status === "Comprado"} onClick={() => setStatus("Comprado")} />
        <Kpi tone="gold" label="Qtd. sugerida" value={kpis.qtd} hint="soma da reposição" />
        <Kpi tone="ok" label="Sem necessidade" value={kpis.OK} hint="estoque dentro do mínimo" selected={filters.status === "OK"} onClick={() => setStatus("OK")} />
        <Kpi tone="muted" label="Analisados" value={kpis.total} hint="Mecânica + Elétrica" />
      </div>

      <div className="rounded-lg border border-gold/20 bg-ink/90 p-4 shadow-premium sm:p-5">
        <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="flex items-center gap-2 font-serif text-xl text-white">
              <ShoppingCart className="h-5 w-5 text-gold" /> Lista de compra
            </h2>
            <p className="mt-1 text-xs text-parchment-dim" data-testid="mrp-buy-subtitle">
              {fmtMrp(listing.filteredCount)} materiais no filtro · quantidade total sugerida{" "}
              <strong className="text-champagne">{fmtMrp(listing.suggestedFiltered)}</strong>
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {["Excel da lista", "Por área (abas)"].map((label) => (
              <button
                key={label}
                type="button"
                disabled
                title="Exportação em breve (próxima etapa)"
                className="inline-flex h-9 cursor-not-allowed items-center gap-2 rounded-lg border border-gold/15 px-3 text-xs font-semibold text-parchment-dim/70"
              >
                <Download className="h-3.5 w-3.5" /> {label} <span className="text-[10px] uppercase">em breve</span>
              </button>
            ))}
          </div>
        </div>

        <div className="mb-4 grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-[minmax(14rem,1fr)_repeat(4,auto)]">
          <label className="relative block">
            <span className="sr-only">Buscar código ou descrição</span>
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-parchment-dim" />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar código ou descrição..."
              className="h-10 w-full rounded-lg border border-gold/15 bg-black/35 pl-9 pr-3 text-sm text-parchment outline-none transition placeholder:text-parchment-dim/70 focus:border-gold/55"
            />
          </label>
          <Select label="Status" value={filters.status} onChange={(v) => update({ status: v as MrpBuyStatusFilter })} options={MRP_BUY_STATUS_FILTERS.map((s) => [s, MRP_BUY_STATUS_LABELS[s]])} />
          <Select label="Área" value={filters.area} onChange={(v) => update({ area: v })} options={[["", "Todas as áreas"], ...MRP_BUY_AREAS.map((a) => [a, a] as [string, string])]} />
          <Select label="Conjunto" value={filters.family} onChange={(v) => update({ family: v })} options={[["", "Todos os conjuntos"], ...listing.families.map((f) => [f, f] as [string, string])]} />
          <Select label="Ordenação" value={filters.sort} onChange={(v) => update({ sort: v as MrpBuyFilters["sort"] })} options={MRP_BUY_SORTS.map((s) => [s, MRP_BUY_SORT_LABELS[s]])} />
        </div>

        {error ? <p className="mb-3 rounded-md border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger-soft">{error}</p> : null}

        {listing.filteredCount === 0 ? (
          <div className="py-12 text-center">
            <p className="font-serif text-lg text-white">Nenhum material neste filtro</p>
            <p className="mt-1 text-sm text-parchment-dim">Ajuste os filtros acima.</p>
          </div>
        ) : (
          <>
            <div className={`max-h-[70vh] overflow-auto rounded-md border border-gold/10 transition ${loading ? "opacity-60" : ""}`}>
              <table className="w-full min-w-[860px] border-collapse text-sm" data-testid="mrp-buy-table">
                <thead className="sticky top-0 z-10 bg-ink text-left text-[11px] uppercase tracking-wide text-parchment-dim">
                  <tr className="border-b border-gold/20">
                    <th className="px-3 py-2.5 font-semibold">Código</th>
                    <th className="px-3 py-2.5 font-semibold">Material</th>
                    <th className="px-3 py-2.5 text-right font-semibold">Saldo</th>
                    <th className="px-3 py-2.5 text-right font-semibold">Mín</th>
                    <th className="px-3 py-2.5 text-right font-semibold">Máx</th>
                    <th className="px-3 py-2.5 text-right font-semibold">Comprar</th>
                    <th className="px-3 py-2.5 font-semibold">Situação</th>
                  </tr>
                </thead>
                <tbody>
                  {listing.items.map((a) => (
                    <Row key={a.code} item={a} />
                  ))}
                </tbody>
              </table>
            </div>
            {listing.hasMore ? (
              <div className="mt-3 flex flex-wrap items-center justify-center gap-3 text-xs text-parchment-dim">
                <span>
                  Mostrando {fmtMrp(listing.items.length)} de {fmtMrp(listing.filteredCount)}
                </span>
                <button
                  type="button"
                  onClick={() => setLimit((l) => l + MRP_BUY_LIMIT_STEP)}
                  disabled={loading}
                  className="inline-flex h-9 items-center gap-2 rounded-lg border border-gold/30 px-4 font-semibold text-gold transition hover:bg-gold/10 disabled:opacity-60"
                >
                  {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null} mostrar mais
                </button>
              </div>
            ) : null}
          </>
        )}
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */

const ROW_TONE: Record<MrpSituationTone, string> = {
  critical: "border-l-2 border-l-danger bg-danger/[0.07]",
  attention: "border-l-2 border-l-warning bg-warning/[0.06]",
  info: "border-l-2 border-l-petroleum-soft bg-petroleum/[0.12]",
  muted: "border-l-2 border-l-transparent",
  ok: "border-l-2 border-l-transparent"
};

const BADGE_TONE: Record<MrpSituationTone, string> = {
  critical: "border-danger/50 bg-danger/20 text-danger-soft",
  attention: "border-warning/50 bg-warning/15 text-warning-soft",
  info: "border-petroleum-soft/40 bg-petroleum/30 text-petroleum-soft",
  muted: "border-neutralized/40 bg-neutralized/15 text-neutralized-soft",
  ok: "border-success/40 bg-success/15 text-success-soft"
};

function Row({ item: a }: { item: MrpBuyListItem }) {
  return (
    <tr className={`border-b border-gold/10 align-top ${ROW_TONE[a.tone]}`} data-code={a.code} data-status={a.status}>
      <td className="whitespace-nowrap px-3 py-2.5 font-mono text-[13px] font-semibold text-champagne">{a.code}</td>
      <td className="px-3 py-2.5">
        <div className="text-parchment">{a.description}</div>
        <div className="mt-1 flex flex-wrap gap-1">
          <span className="inline-flex items-center gap-1 rounded border border-gold/20 px-1.5 py-0.5 text-[10px] font-semibold text-parchment-dim">
            {a.area === "Mecânica" ? <Cog className="h-3 w-3" /> : <Zap className="h-3 w-3" />}
            {a.area === "Mecânica" ? "Mec" : "Elé"}
          </span>
          {a.family ? (
            <span className="rounded border border-gold/40 bg-gold/10 px-1.5 py-0.5 text-[10px] font-semibold text-gold-soft">{a.family}</span>
          ) : null}
          {a.group ? <span className="rounded border border-gold/15 px-1.5 py-0.5 text-[10px] text-parchment-dim">{a.group}</span> : null}
        </div>
      </td>
      <td className="whitespace-nowrap px-3 py-2.5 text-right tabular-nums" title={a.unit || undefined}>
        {fmtMrp(a.free)}
      </td>
      <td className="whitespace-nowrap px-3 py-2.5 text-right tabular-nums text-parchment-dim">{fmtMrp(a.min)}</td>
      <td className="whitespace-nowrap px-3 py-2.5 text-right tabular-nums text-parchment-dim">{fmtMrp(a.max)}</td>
      <td className={`whitespace-nowrap px-3 py-2.5 text-right tabular-nums ${a.suggested > 0 ? "font-bold text-white" : "text-parchment-dim"}`}>
        {a.suggested > 0 ? `${fmtMrp(a.suggested)}${a.unit ? ` ${a.unit}` : ""}` : "—"}
      </td>
      <td className="min-w-[13rem] px-3 py-2.5">
        <span className={`inline-flex rounded-md border px-2 py-0.5 text-[11px] font-bold ${BADGE_TONE[a.tone]}`}>{a.situation}</span>
        {a.observation ? <div className="mt-1 text-[11px] leading-snug text-parchment-dim">{a.observation}</div> : null}
      </td>
    </tr>
  );
}

const KPI_TONE: Record<string, string> = {
  critical: "before:bg-danger text-danger-soft",
  attention: "before:bg-warning text-warning-soft",
  info: "before:bg-petroleum-soft text-petroleum-soft",
  gold: "before:bg-gold text-gold-soft",
  ok: "before:bg-success text-success-soft",
  muted: "before:bg-neutralized text-neutralized-soft"
};

function Kpi(props: { tone: string; label: string; value: number; hint: string; selected?: boolean; onClick?: () => void }) {
  const clickable = !!props.onClick;
  const content = (
    <>
      <span className="text-[11px] font-bold uppercase tracking-wide text-parchment-dim">{props.label}</span>
      <span data-kpi-value className={`mt-1 block font-serif text-3xl leading-none ${KPI_TONE[props.tone].split(" ")[1]}`}>{fmtMrp(props.value)}</span>
      <span className="mt-1.5 block text-[11px] text-parchment-dim">{props.hint}</span>
    </>
  );
  const cls = `relative overflow-hidden rounded-lg border bg-ink/90 p-4 text-left shadow-premium before:absolute before:inset-x-0 before:top-0 before:h-1 ${
    KPI_TONE[props.tone].split(" ")[0]
  } ${props.selected ? "border-gold/60 ring-1 ring-gold/40" : "border-gold/15"}`;
  return clickable ? (
    <button type="button" data-kpi={props.label} onClick={props.onClick} aria-pressed={props.selected} className={`${cls} transition hover:border-gold/45`}>
      {content}
    </button>
  ) : (
    <div data-kpi={props.label} className={cls}>{content}</div>
  );
}

function Select(props: { label: string; value: string; onChange: (v: string) => void; options: (readonly [string, string])[] }) {
  return (
    <label className="block">
      <span className="sr-only">{props.label}</span>
      <select
        aria-label={props.label}
        value={props.value}
        onChange={(e) => props.onChange(e.target.value)}
        className="h-10 w-full rounded-lg border border-gold/15 bg-black/35 px-3 text-sm text-parchment outline-none transition focus:border-gold/55"
      >
        {props.options.map(([value, label]) => (
          <option key={value} value={value} className="bg-ink">
            {label}
          </option>
        ))}
      </select>
    </label>
  );
}
