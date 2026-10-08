"use client";

import { useEffect, useState } from "react";
import { Cog, Download, Loader2, Search, Truck, Zap } from "lucide-react";
import { dataBR } from "@/lib/mrp/date-parser";
import { fmtMrp } from "@/lib/mrp/format";
import {
  MRP_TRANSIT_DEFAULT_FILTERS,
  MRP_TRANSIT_INITIAL_LIMIT,
  MRP_TRANSIT_LIMIT_STEP,
  MRP_TRANSIT_STATUS_FILTERS,
  MRP_TRANSIT_STATUS_LABELS,
  type MrpTransitFilters,
  type MrpTransitStatusFilter
} from "@/lib/mrp/transit";
import type { MrpTransitItem, MrpTransitListing } from "@/services/mrp-transit.service";
import type { MrpTransitKpisView } from "@/components/mrp/types";
import { mrpGet } from "@/components/mrp/mrp-api";

/**
 * Aba EM TRÂNSITO — reprodução de renderTransito() do HTML: 5 KPIs (os 4 de
 * compras sobre TODOS os códigos da planilha; "Saíram do MRP" sobre os itens da
 * análise com status Comprado), filtros e "Última compra de cada material".
 * Valores prontos do servidor; aqui só há apresentação.
 */
type Props = { kpis: MrpTransitKpisView; initialFilters: MrpTransitFilters; onOpenBought: () => void };

const SEARCH_DEBOUNCE_MS = 300;

export function MrpTransitTab({ kpis, initialFilters, onOpenBought }: Props) {
  const [filters, setFilters] = useState<MrpTransitFilters>(initialFilters);
  const [query, setQuery] = useState(initialFilters.q);
  const [limit, setLimit] = useState(MRP_TRANSIT_INITIAL_LIMIT);
  const [listing, setListing] = useState<MrpTransitListing | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (query === filters.q) return;
    const t = setTimeout(() => {
      setLimit(MRP_TRANSIT_INITIAL_LIMIT);
      setFilters((f) => ({ ...f, q: query }));
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [query, filters.q]);

  // Filtros na URL com nomes próprios (transit*), sem interferir na aba Comprar.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const set = (key: string, value: string, isDefault: boolean) => (isDefault ? params.delete(key) : params.set(key, value));
    set("transitQ", filters.q, !filters.q);
    set("transitStatus", filters.status, filters.status === MRP_TRANSIT_DEFAULT_FILTERS.status);
    set("transitMrp", "1", !filters.onlyMrp);
    const qs = params.toString();
    window.history.replaceState(window.history.state, "", `${window.location.pathname}${qs ? `?${qs}` : ""}`);
  }, [filters]);

  useEffect(() => {
    const controller = new AbortController();
    const params = new URLSearchParams({
      transitQ: filters.q,
      transitStatus: filters.status,
      transitMrp: filters.onlyMrp ? "1" : "0",
      limit: String(limit)
    });
    setLoading(true);
    mrpGet<{ listing: MrpTransitListing | null }>(`/api/mrp/analysis/current/transit?${params}`, controller.signal)
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
  }, [filters, limit]);

  const update = (patch: Partial<MrpTransitFilters>) => {
    setLimit(MRP_TRANSIT_INITIAL_LIMIT);
    setFilters((f) => ({ ...f, ...patch }));
  };

  if (kpis.linhas === 0) {
    return (
      <div className="rounded-lg border border-gold/20 bg-ink/90 p-10 text-center shadow-premium" data-testid="mrp-transit">
        <p className="font-serif text-xl text-white">Nenhuma compra carregada.</p>
        <p className="mt-1 text-sm text-parchment-dim">Anexe a planilha de compras realizadas para ver o que já está comprado.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4" data-testid="mrp-transit">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
        <Kpi tone="muted" label="Linhas de compra" value={fmtMrp(kpis.linhas)} hint="requisições + pedidos" />
        <Kpi tone="info" label="Em trânsito" value={fmtMrp(kpis.pendentes)} hint="sem recebimento" />
        <Kpi tone="gold" label="Qtd. em trânsito" value={fmtMrp(kpis.qtdPendente)} hint="última compra aberta" />
        <Kpi tone="ok" label="Recebidos" value={fmtMrp(kpis.recebidos)} hint="última compra entregue" />
        <Kpi tone="critical" label="Saíram do MRP" value={fmtMrp(kpis.removedFromMrp)} hint={`${fmtMrp(kpis.avoidedQty)} de qtd. evitada`} onClick={onOpenBought} />
      </div>

      <div className="rounded-lg border border-gold/20 bg-ink/90 p-4 shadow-premium sm:p-5">
        <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="flex items-center gap-2 font-serif text-xl text-white">
              <Truck className="h-5 w-5 text-gold" /> Última compra de cada material
            </h2>
            <p className="mt-1 max-w-3xl text-xs text-parchment-dim">
              Com pedido ou requisição e <strong className="text-champagne">sem data de recebimento</strong> = material em trânsito, retirado da lista de compra.
            </p>
          </div>
          <button
            type="button"
            disabled
            title="Exportação em breve (próxima etapa)"
            className="inline-flex h-9 cursor-not-allowed items-center gap-2 rounded-lg border border-gold/15 px-3 text-xs font-semibold text-parchment-dim/70"
          >
            <Download className="h-3.5 w-3.5" /> Excel <span className="text-[10px] uppercase">em breve</span>
          </button>
        </div>

        <div className="mb-4 grid grid-cols-1 gap-2 sm:grid-cols-[minmax(14rem,1fr)_auto] lg:grid-cols-[minmax(14rem,1fr)_auto_auto]">
          <label className="relative block">
            <span className="sr-only">Buscar código, descrição ou fornecedor</span>
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-parchment-dim" />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar código, descrição ou fornecedor..."
              className="h-10 w-full rounded-lg border border-gold/15 bg-black/35 pl-9 pr-3 text-sm text-parchment outline-none transition placeholder:text-parchment-dim/70 focus:border-gold/55"
              data-testid="mrp-transit-search"
            />
          </label>
          <select
            aria-label="Situação da compra"
            value={filters.status}
            onChange={(e) => update({ status: e.target.value as MrpTransitStatusFilter })}
            className="h-10 rounded-lg border border-gold/15 bg-black/35 px-3 text-sm text-parchment outline-none transition focus:border-gold/55"
          >
            {MRP_TRANSIT_STATUS_FILTERS.map((s) => (
              <option key={s} value={s} className="bg-ink">
                {MRP_TRANSIT_STATUS_LABELS[s]}
              </option>
            ))}
          </select>
          <label className="flex h-10 cursor-pointer items-center gap-2 rounded-lg border border-gold/15 bg-black/35 px-3 text-sm text-parchment">
            <input
              type="checkbox"
              checked={filters.onlyMrp}
              onChange={(e) => update({ onlyMrp: e.target.checked })}
              className="h-4 w-4 accent-[#D6AA3A]"
              data-testid="mrp-transit-only-mrp"
            />
            Só materiais da base MRP
          </label>
        </div>

        {error ? <p className="mb-3 rounded-md border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger-soft">{error}</p> : null}

        {!listing ? (
          <div className="flex items-center justify-center gap-2 py-12 text-sm text-parchment-dim">
            <Loader2 className="h-4 w-4 animate-spin text-gold" /> Carregando compras…
          </div>
        ) : listing.filteredCount === 0 ? (
          <div className="py-12 text-center" data-testid="mrp-transit-empty">
            <p className="font-serif text-lg text-white">Nenhuma compra neste filtro</p>
            <p className="mt-1 text-sm text-parchment-dim">Ajuste os filtros acima.</p>
          </div>
        ) : (
          <>
            <p className="mb-2 text-xs text-parchment-dim" data-testid="mrp-transit-count">
              {fmtMrp(listing.filteredCount)} materiais no filtro · {fmtMrp(listing.totalGroups)} códigos na planilha de compras
            </p>
            <div className={`max-h-[70vh] overflow-auto rounded-md border border-gold/10 transition ${loading ? "opacity-60" : ""}`}>
              <table className="w-full min-w-[980px] border-collapse text-sm" data-testid="mrp-transit-table">
                <thead className="sticky top-0 z-10 bg-ink text-left text-[11px] uppercase tracking-wide text-parchment-dim">
                  <tr className="border-b border-gold/20">
                    <th className="px-3 py-2.5 font-semibold">Código</th>
                    <th className="px-3 py-2.5 font-semibold">Material</th>
                    <th className="px-3 py-2.5 text-right font-semibold">Qtd</th>
                    <th className="px-3 py-2.5 font-semibold">Fornecedor</th>
                    <th className="px-3 py-2.5 font-semibold">Pedido / Req.</th>
                    <th className="px-3 py-2.5 font-semibold">Data</th>
                    <th className="px-3 py-2.5 font-semibold">Previsão</th>
                    <th className="px-3 py-2.5 font-semibold">Situação</th>
                  </tr>
                </thead>
                <tbody>
                  {listing.items.map((g) => (
                    <Row key={g.code} item={g} />
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
                  onClick={() => setLimit((l) => l + MRP_TRANSIT_LIMIT_STEP)}
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

const SITUATION_TONE: Record<MrpTransitItem["status"], string> = {
  pend: "border-petroleum-soft/40 bg-petroleum/30 text-petroleum-soft",
  rec: "border-success/40 bg-success/15 text-success-soft",
  sem: "border-neutralized/40 bg-neutralized/15 text-neutralized-soft"
};

function Row({ item: g }: { item: MrpTransitItem }) {
  const dash = (v: string) => v || "—";
  return (
    <tr className={`border-b border-gold/10 align-top ${g.status === "pend" ? "border-l-2 border-l-petroleum-soft bg-petroleum/[0.12]" : "border-l-2 border-l-transparent"}`} data-code={g.code} data-status={g.status}>
      <td className="whitespace-nowrap px-3 py-2.5 font-mono text-[13px] font-semibold text-champagne">{g.code}</td>
      <td className="px-3 py-2.5">
        <div className="text-parchment">{g.description}</div>
        <div className="mt-1 flex flex-wrap gap-1">
          {g.inBase ? (
            <span className="inline-flex items-center gap-1 rounded border border-gold/20 px-1.5 py-0.5 text-[10px] font-semibold text-parchment-dim">
              {g.area === "Mecânica" ? <Cog className="h-3 w-3" /> : <Zap className="h-3 w-3" />}
              {g.area === "Mecânica" ? "Mec" : "Elé"}
            </span>
          ) : (
            <span className="rounded border border-warning/40 bg-warning/10 px-1.5 py-0.5 text-[10px] font-semibold text-warning-soft" data-badge="fora-base">
              fora da base MRP
            </span>
          )}
          {g.count > 1 ? (
            <span className="rounded border border-gold/15 px-1.5 py-0.5 text-[10px] text-parchment-dim" data-badge="compras">
              {g.count} compras
            </span>
          ) : null}
        </div>
      </td>
      <td className="whitespace-nowrap px-3 py-2.5 text-right tabular-nums">{fmtMrp(g.quantity)}</td>
      <td className="px-3 py-2.5 text-parchment-dim">{dash(g.supplier)}</td>
      <td className="whitespace-nowrap px-3 py-2.5 font-mono text-[12px]">{dash(g.reference)}</td>
      <td className="whitespace-nowrap px-3 py-2.5 tabular-nums">{dash(dataBR(g.requisitionDate))}</td>
      <td className="whitespace-nowrap px-3 py-2.5 tabular-nums">{dash(dataBR(g.expectedDeliveryDate))}</td>
      <td className="px-3 py-2.5">
        <span className={`inline-flex rounded-md border px-2 py-0.5 text-[11px] font-bold ${SITUATION_TONE[g.status]}`}>{g.situation}</span>
      </td>
    </tr>
  );
}

const KPI_TONE: Record<string, [string, string]> = {
  critical: ["before:bg-danger", "text-danger-soft"],
  info: ["before:bg-petroleum-soft", "text-petroleum-soft"],
  gold: ["before:bg-gold", "text-gold-soft"],
  ok: ["before:bg-success", "text-success-soft"],
  muted: ["before:bg-neutralized", "text-neutralized-soft"]
};

function Kpi(props: { tone: string; label: string; value: string; hint: string; onClick?: () => void }) {
  const [bar, text] = KPI_TONE[props.tone];
  const content = (
    <>
      <span className="text-[11px] font-bold uppercase tracking-wide text-parchment-dim">{props.label}</span>
      <span data-kpi-value className={`mt-1 block font-serif text-3xl leading-none ${text}`}>
        {props.value}
      </span>
      <span data-kpi-hint className="mt-1.5 block text-[11px] text-parchment-dim">
        {props.hint}
      </span>
    </>
  );
  const cls = `relative overflow-hidden rounded-lg border border-gold/15 bg-ink/90 p-4 text-left shadow-premium before:absolute before:inset-x-0 before:top-0 before:h-1 ${bar}`;
  return props.onClick ? (
    <button type="button" data-kpi={props.label} onClick={props.onClick} className={`${cls} transition hover:border-gold/45`}>
      {content}
    </button>
  ) : (
    <div data-kpi={props.label} className={cls}>
      {content}
    </div>
  );
}
