"use client";

import { useEffect, useState } from "react";
import { Cog, Loader2, PackageX, Search, Zap } from "lucide-react";
import { fmtMrp } from "@/lib/mrp/format";
import { MRP_BUY_AREAS } from "@/lib/mrp/buy-list";
import {
  MRP_IDLE_DEFAULT_FILTERS,
  MRP_IDLE_INITIAL_LIMIT,
  MRP_IDLE_LIMIT_STEP,
  MRP_IDLE_TYPES,
  MRP_IDLE_TYPE_LABELS,
  mrpIdleShareText,
  type MrpIdleFilters,
  type MrpIdleType
} from "@/lib/mrp/idle";
import type { MrpIdleItem, MrpIdleListing } from "@/services/mrp-idle.service";
import type { MrpIdleKpisView } from "@/components/mrp/types";
import { mrpGet } from "@/components/mrp/mrp-api";
import { MrpExportButton } from "@/components/mrp/MrpExportButton";

/**
 * Aba ESTOQUE PARADO — reprodução de renderParado() do HTML: 4 KPIs globais
 * (informativos, como no HTML; vêm do run e não mudam com os filtros), filtros
 * e "Materiais sem movimentação". Só apresentação.
 */
type Props = { kpis: MrpIdleKpisView; initialFilters: MrpIdleFilters };

const SEARCH_DEBOUNCE_MS = 300;

export function MrpIdleTab({ kpis, initialFilters }: Props) {
  const [filters, setFilters] = useState<MrpIdleFilters>(initialFilters);
  const [query, setQuery] = useState(initialFilters.q);
  const [limit, setLimit] = useState(MRP_IDLE_INITIAL_LIMIT);
  const [listing, setListing] = useState<MrpIdleListing | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (query === filters.q) return;
    const t = setTimeout(() => {
      setLimit(MRP_IDLE_INITIAL_LIMIT);
      setFilters((f) => ({ ...f, q: query }));
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [query, filters.q]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const set = (key: string, value: string, isDefault: boolean) => (isDefault ? params.delete(key) : params.set(key, value));
    set("idleQ", filters.q, !filters.q);
    set("idleType", filters.type, filters.type === MRP_IDLE_DEFAULT_FILTERS.type);
    set("idleArea", filters.area, !filters.area);
    const qs = params.toString();
    window.history.replaceState(window.history.state, "", `${window.location.pathname}${qs ? `?${qs}` : ""}`);
  }, [filters]);

  useEffect(() => {
    if (kpis.semMov === 0) return;
    const controller = new AbortController();
    const params = new URLSearchParams({ idleQ: filters.q, idleType: filters.type, idleArea: filters.area, limit: String(limit) });
    setLoading(true);
    mrpGet<{ listing: MrpIdleListing | null }>(`/api/mrp/analysis/current/idle-stock?${params}`, controller.signal)
      .then((res) => {
        if (!res.ok) return setError(res.error);
        setError(null);
        setListing(res.data.listing);
      })
      .catch(() => undefined)
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [filters, limit, kpis.semMov]);

  const update = (patch: Partial<MrpIdleFilters>) => {
    setLimit(MRP_IDLE_INITIAL_LIMIT);
    setFilters((f) => ({ ...f, ...patch }));
  };

  return (
    <div className="space-y-4" data-testid="mrp-idle">
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <Kpi tone="muted" label="Sem movimentação" value={fmtMrp(kpis.semMov)} hint={mrpIdleShareText(kpis.semMov, kpis.total)} />
        <Kpi tone="attention" label="Com saldo" value={fmtMrp(kpis.parado)} hint="capital parado" />
        <Kpi tone="gold" label="Qtd. parada" value={fmtMrp(kpis.qtdParada)} hint="soma do saldo" />
        <Kpi tone="dead" label="Zerados" value={fmtMrp(kpis.semMov - kpis.parado)} hint="candidatos a inativação" />
      </div>

      <div className="rounded-lg border border-gold/20 bg-ink/90 p-4 shadow-premium sm:p-5">
        <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="flex items-center gap-2 font-serif text-xl text-white">
              <PackageX className="h-5 w-5 text-gold" /> Materiais sem movimentação
            </h2>
            <p className="mt-1 max-w-3xl text-xs text-parchment-dim">
              Mínimo e máximo zerados no MRP ou status de sem saída. Os que têm saldo são capital parado; os zerados são candidatos a inativação.
            </p>
          </div>
          <MrpExportButton type="idle" label="Excel" testId="mrp-export-idle" params={{ idleQ: filters.q, idleType: filters.type, idleArea: filters.area }} />
        </div>

        {kpis.semMov === 0 ? (
          <p className="rounded-md border border-gold/15 bg-black/25 px-4 py-8 text-center text-sm text-parchment-dim" data-testid="mrp-idle-none">
            Nenhum material sem movimentação identificado na análise atual.
          </p>
        ) : (
          <>
            <div className="mb-4 grid grid-cols-1 gap-2 sm:grid-cols-[minmax(14rem,1fr)_auto] lg:grid-cols-[minmax(14rem,1fr)_auto_auto]">
              <label className="relative block">
                <span className="sr-only">Buscar código ou descrição</span>
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-parchment-dim" />
                <input
                  type="search"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Buscar código ou descrição..."
                  className="h-10 w-full rounded-lg border border-gold/15 bg-black/35 pl-9 pr-3 text-sm text-parchment outline-none transition placeholder:text-parchment-dim/70 focus:border-gold/55"
                  data-testid="mrp-idle-search"
                />
              </label>
              <label className="block">
                <span className="sr-only">Tipo de estoque parado</span>
                <select
                  aria-label="Tipo de estoque parado"
                  value={filters.type}
                  onChange={(e) => update({ type: e.target.value as MrpIdleType })}
                  className="h-10 w-full rounded-lg border border-gold/15 bg-black/35 px-3 text-sm text-parchment outline-none transition focus:border-gold/55"
                >
                  {MRP_IDLE_TYPES.map((t) => (
                    <option key={t} value={t} className="bg-ink">
                      {MRP_IDLE_TYPE_LABELS[t]}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block">
                <span className="sr-only">Área do estoque parado</span>
                <select
                  aria-label="Área do estoque parado"
                  value={filters.area}
                  onChange={(e) => update({ area: e.target.value })}
                  className="h-10 w-full rounded-lg border border-gold/15 bg-black/35 px-3 text-sm text-parchment outline-none transition focus:border-gold/55"
                >
                  <option value="" className="bg-ink">
                    Todas as áreas
                  </option>
                  {MRP_BUY_AREAS.map((a) => (
                    <option key={a} value={a} className="bg-ink">
                      {a}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            {error ? <p className="mb-3 rounded-md border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger-soft">{error}</p> : null}

            {!listing ? (
              <div className="flex items-center justify-center gap-2 py-12 text-sm text-parchment-dim">
                <Loader2 className="h-4 w-4 animate-spin text-gold" /> Carregando materiais…
              </div>
            ) : listing.filteredCount === 0 ? (
              <div className="py-12 text-center" data-testid="mrp-idle-empty">
                <p className="font-serif text-lg text-white">Nenhum material neste filtro</p>
                <p className="mt-1 text-sm text-parchment-dim">Ajuste os filtros acima.</p>
              </div>
            ) : (
              <>
                <p className="mb-2 text-xs text-parchment-dim" data-testid="mrp-idle-count">
                  {fmtMrp(listing.filteredCount)} materiais neste filtro
                </p>
                <div className={`max-h-[70vh] overflow-auto rounded-md border border-gold/10 transition ${loading ? "opacity-60" : ""}`}>
                  <table className="w-full min-w-[720px] border-collapse text-sm" data-testid="mrp-idle-table">
                    <thead className="sticky top-0 z-10 bg-ink text-left text-[11px] uppercase tracking-wide text-parchment-dim">
                      <tr className="border-b border-gold/20">
                        <th scope="col" className="px-3 py-2.5 font-semibold">Código</th>
                        <th scope="col" className="px-3 py-2.5 font-semibold">Material</th>
                        <th scope="col" className="px-3 py-2.5 text-right font-semibold">Saldo</th>
                        <th scope="col" className="px-3 py-2.5 font-semibold">Grupo</th>
                        <th scope="col" className="px-3 py-2.5 font-semibold">Situação</th>
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
                      onClick={() => setLimit((l) => l + MRP_IDLE_LIMIT_STEP)}
                      disabled={loading}
                      className="inline-flex h-9 items-center gap-2 rounded-lg border border-gold/30 px-4 font-semibold text-gold transition hover:bg-gold/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-gold/70 disabled:opacity-60"
                    >
                      {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null} mostrar mais
                    </button>
                  </div>
                ) : null}
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function Row({ item: a }: { item: MrpIdleItem }) {
  const capital = a.situation === "Capital parado";
  return (
    <tr className={`border-b border-gold/10 align-top ${capital ? "border-l-2 border-l-warning bg-warning/[0.05]" : "border-l-2 border-l-transparent"}`} data-code={a.code} data-situation={a.situation}>
      <td className="whitespace-nowrap px-3 py-2.5 font-mono text-[13px] font-semibold text-champagne">{a.code}</td>
      <td className="px-3 py-2.5">
        <div className="text-parchment">{a.description}</div>
        <div className="mt-1 flex flex-wrap gap-1">
          <span className="inline-flex items-center gap-1 rounded border border-gold/20 px-1.5 py-0.5 text-[10px] font-semibold text-parchment-dim">
            {a.area === "Mecânica" ? <Cog className="h-3 w-3" /> : <Zap className="h-3 w-3" />}
            {a.area === "Mecânica" ? "Mec" : "Elé"}
          </span>
          {a.family ? <span className="rounded border border-gold/40 bg-gold/10 px-1.5 py-0.5 text-[10px] font-semibold text-gold-soft">{a.family}</span> : null}
        </div>
      </td>
      <td className="whitespace-nowrap px-3 py-2.5 text-right tabular-nums">
        {fmtMrp(a.free)}
        {a.unit ? ` ${a.unit}` : ""}
      </td>
      <td className="px-3 py-2.5 text-parchment-dim">{a.group || "—"}</td>
      <td className="px-3 py-2.5">
        <span
          className={`inline-flex rounded-md border px-2 py-0.5 text-[11px] font-bold ${
            capital ? "border-warning/50 bg-warning/15 text-warning-soft" : "border-neutralized/40 bg-neutralized/15 text-neutralized-soft"
          }`}
        >
          {a.situation}
        </span>
      </td>
    </tr>
  );
}

const KPI_TONE: Record<string, [string, string]> = {
  attention: ["before:bg-warning", "text-warning-soft"],
  gold: ["before:bg-gold", "text-gold-soft"],
  dead: ["before:bg-neutralized", "text-neutralized-soft"],
  muted: ["before:bg-petroleum-soft", "text-parchment"]
};

function Kpi(props: { tone: string; label: string; value: string; hint: string }) {
  const [bar, text] = KPI_TONE[props.tone];
  return (
    <div data-kpi={props.label} className={`relative overflow-hidden rounded-lg border border-gold/15 bg-ink/90 p-4 shadow-premium before:absolute before:inset-x-0 before:top-0 before:h-1 ${bar}`}>
      <span className="text-[11px] font-bold uppercase tracking-wide text-parchment-dim">{props.label}</span>
      <span data-kpi-value className={`mt-1 block font-serif text-3xl leading-none ${text}`}>
        {props.value}
      </span>
      <span data-kpi-hint className="mt-1.5 block text-[11px] text-parchment-dim">
        {props.hint}
      </span>
    </div>
  );
}
