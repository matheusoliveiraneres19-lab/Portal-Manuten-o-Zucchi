"use client";

import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { AlertTriangle, Cog, Database, Download, Loader2, RotateCcw, Search, UploadCloud, Zap } from "lucide-react";
import { fmtMrp } from "@/lib/mrp/format";
import { MRP_BUY_AREAS } from "@/lib/mrp/buy-list";
import {
  MRP_BASE_DEFAULT_FILTERS,
  MRP_BASE_FILTERS,
  MRP_BASE_FILTER_LABELS,
  MRP_BASE_INITIAL_LIMIT,
  MRP_BASE_LIMIT_STEP,
  type MrpBaseFilter,
  type MrpBaseViewFilters
} from "@/lib/mrp/base-view";
import type { MrpFilePreview } from "@/lib/mrp/import-plan";
import type { MrpBaseItem, MrpBaseListing, MrpBaseView } from "@/services/mrp-base-view.service";
import { mrpGet, mrpPost } from "@/components/mrp/mrp-api";

/**
 * Aba BASE MRP — reprodução de renderBase()/baseFiltrada() + envio da planilha
 * do MRP e "Voltar à base embutida" do HTML (aqui: "Restaurar base inicial").
 * Mostra a base da análise vigente (ou a ativa, sem análise). Alterar a base
 * recalcula a análise no servidor (mesmo estoque e compras), tudo ou nada.
 */
type Props = {
  view: MrpBaseView | null;
  initialFilters: MrpBaseViewFilters;
  canImport: boolean;
  hasRun: boolean;
  onChanged: () => void;
};

type Pending = { importId: string; fileName: string; preview: MrpFilePreview };

const SEARCH_DEBOUNCE_MS = 300;
const dateTime = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short", timeZone: "America/Sao_Paulo" });

export function MrpBaseTab({ view, initialFilters, canImport, hasRun, onChanged }: Props) {
  const [filters, setFilters] = useState<MrpBaseViewFilters>(initialFilters);
  const [query, setQuery] = useState(initialFilters.q);
  const [limit, setLimit] = useState(MRP_BASE_INITIAL_LIMIT);
  const [listing, setListing] = useState<MrpBaseListing | null>(null);
  const [loading, setLoading] = useState(!!view);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (query === filters.q) return;
    const t = setTimeout(() => {
      setLimit(MRP_BASE_INITIAL_LIMIT);
      setFilters((f) => ({ ...f, q: query }));
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [query, filters.q]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const set = (key: string, value: string, isDefault: boolean) => (isDefault ? params.delete(key) : params.set(key, value));
    set("baseQ", filters.q, !filters.q);
    set("baseArea", filters.area, !filters.area);
    set("baseFilter", filters.filter, filters.filter === MRP_BASE_DEFAULT_FILTERS.filter);
    const qs = params.toString();
    window.history.replaceState(window.history.state, "", `${window.location.pathname}${qs ? `?${qs}` : ""}`);
  }, [filters]);

  useEffect(() => {
    if (!view) return;
    const controller = new AbortController();
    const params = new URLSearchParams({ baseQ: filters.q, baseArea: filters.area, baseFilter: filters.filter, limit: String(limit) });
    setLoading(true);
    mrpGet<{ listing: MrpBaseListing | null }>(`/api/mrp/base/current/items?${params}`, controller.signal)
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
  }, [filters, limit, view]);

  const update = (patch: Partial<MrpBaseViewFilters>) => {
    setLimit(MRP_BASE_INITIAL_LIMIT);
    setFilters((f) => ({ ...f, ...patch }));
  };

  return (
    <div className="space-y-4" data-testid="mrp-base">
      <section className="rounded-lg border border-gold/20 bg-ink/90 p-4 shadow-premium sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="max-w-3xl">
            <h2 className="flex items-center gap-2 font-serif text-xl text-white">
              <Database className="h-5 w-5 text-gold" /> Base de materiais do MRP
            </h2>
            <p className="mt-1 text-xs text-parchment-dim">
              Envie a planilha do MRP com código, descrição e estoque mínimo/máximo. As abas de <strong className="text-champagne">Mecânica</strong> e{" "}
              <strong className="text-champagne">Elétrica</strong> são importadas juntas; abas de Uso Geral / Gyan / Automático são ignoradas.
            </p>
          </div>
          {canImport ? <RestoreButton hasRun={hasRun} isSeed={view?.version.source === "SEED_HTML" && !view.activeDiffers} onChanged={onChanged} /> : null}
        </div>
        {view?.activeDiffers ? (
          <p className="mt-3 flex items-start gap-2 rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-xs text-warning-soft" data-testid="mrp-base-mismatch">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            Existe uma Base MRP ativa diferente da utilizada pela análise atual. Esta aba mostra a base da análise atual.
          </p>
        ) : null}
        {canImport ? <BaseUpload hasRun={hasRun} onChanged={onChanged} /> : null}
      </section>

      <section className="rounded-lg border border-gold/20 bg-ink/90 p-4 shadow-premium sm:p-5">
        <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="font-serif text-xl text-white">Materiais cadastrados</h2>
            {view ? <BaseSummary view={view} /> : null}
          </div>
          <button
            type="button"
            disabled
            title="Exportação em breve (próxima etapa)"
            className="inline-flex h-9 cursor-not-allowed items-center gap-2 rounded-lg border border-gold/15 px-3 text-xs font-semibold text-parchment-dim/70"
          >
            <Download className="h-3.5 w-3.5" /> Excel da base <span className="text-[10px] uppercase">em breve</span>
          </button>
        </div>

        {!view ? (
          <p className="rounded-md border border-gold/15 bg-black/25 px-4 py-8 text-center text-sm text-parchment-dim">Nenhuma Base MRP cadastrada.</p>
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
                  data-testid="mrp-base-search"
                />
              </label>
              <select aria-label="Área da base" value={filters.area} onChange={(e) => update({ area: e.target.value })} className="h-10 rounded-lg border border-gold/15 bg-black/35 px-3 text-sm text-parchment outline-none focus:border-gold/55">
                <option value="" className="bg-ink">Todas as áreas</option>
                {MRP_BUY_AREAS.map((a) => (
                  <option key={a} value={a} className="bg-ink">
                    {a}
                  </option>
                ))}
              </select>
              <select aria-label="Filtro da base" value={filters.filter} onChange={(e) => update({ filter: e.target.value as MrpBaseFilter })} className="h-10 rounded-lg border border-gold/15 bg-black/35 px-3 text-sm text-parchment outline-none focus:border-gold/55">
                {MRP_BASE_FILTERS.map((f) => (
                  <option key={f} value={f} className="bg-ink">
                    {MRP_BASE_FILTER_LABELS[f]}
                  </option>
                ))}
              </select>
            </div>

            {error ? <p className="mb-3 rounded-md border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger-soft">{error}</p> : null}

            {!listing ? (
              <div className="flex items-center justify-center gap-2 py-12 text-sm text-parchment-dim">
                <Loader2 className="h-4 w-4 animate-spin text-gold" /> Carregando materiais…
              </div>
            ) : listing.filteredCount === 0 ? (
              <div className="py-12 text-center" data-testid="mrp-base-empty">
                <p className="font-serif text-lg text-white">Nenhum material neste filtro</p>
                <p className="mt-1 text-sm text-parchment-dim">Ajuste os filtros acima.</p>
              </div>
            ) : (
              <>
                <p className="mb-2 text-xs text-parchment-dim" data-testid="mrp-base-count">
                  {fmtMrp(listing.filteredCount)} materiais neste filtro
                </p>
                <div className={`max-h-[70vh] overflow-auto rounded-md border border-gold/10 transition ${loading ? "opacity-60" : ""}`}>
                  <table className="w-full min-w-[820px] border-collapse text-sm" data-testid="mrp-base-table">
                    <thead className="sticky top-0 z-10 bg-ink text-left text-[11px] uppercase tracking-wide text-parchment-dim">
                      <tr className="border-b border-gold/20">
                        <th scope="col" className="px-3 py-2.5 font-semibold">Código</th>
                        <th scope="col" className="px-3 py-2.5 font-semibold">Material</th>
                        <th scope="col" className="px-3 py-2.5 text-right font-semibold">Mín</th>
                        <th scope="col" className="px-3 py-2.5 text-right font-semibold">Máx</th>
                        <th scope="col" className="px-3 py-2.5 font-semibold">Grupo</th>
                        <th scope="col" className="px-3 py-2.5 font-semibold">Status MRP</th>
                      </tr>
                    </thead>
                    <tbody>
                      {listing.items.map((m) => (
                        <Row key={m.code} item={m} />
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
                      onClick={() => setLimit((l) => l + MRP_BASE_LIMIT_STEP)}
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
      </section>
    </div>
  );
}

function BaseSummary({ view }: { view: MrpBaseView }) {
  const s = view.summary;
  const v = view.version;
  return (
    <div className="mt-1 space-y-0.5 text-xs text-parchment-dim" data-testid="mrp-base-summary">
      <p>
        <strong className="text-champagne">{v.source === "SEED_HTML" ? "Base inicial do sistema" : `Planilha enviada: ${v.fileName}`}</strong> ·{" "}
        <span data-metric="total">{fmtMrp(s.total)} materiais</span> (<span data-metric="mec">Mecânica {fmtMrp(s.mechanical)}</span> ·{" "}
        <span data-metric="ele">Elétrica {fmtMrp(s.electrical)}</span>) · <span data-metric="semparam">{fmtMrp(s.noParams)} sem mín/máx</span> ·{" "}
        <span data-metric="conj">{fmtMrp(s.inFamilies)} em satélites/coroas</span>
      </p>
      <p className="text-[11px]">
        Versão {v.id.slice(-8)} · gravada em {dateTime.format(new Date(v.createdAt))}
        {v.createdBy ? ` por ${v.createdBy}` : ""} · {view.origin === "run" ? "usada pela análise atual" : "base ativa (sem análise vigente)"}
      </p>
    </div>
  );
}

function Row({ item: m }: { item: MrpBaseItem }) {
  return (
    <tr className="border-b border-gold/10 align-top" data-code={m.code}>
      <td className="whitespace-nowrap px-3 py-2.5 font-mono text-[13px] font-semibold text-champagne">{m.code}</td>
      <td className="px-3 py-2.5">
        <div className="text-parchment">{m.description}</div>
        <div className="mt-1 flex flex-wrap gap-1">
          <span className="inline-flex items-center gap-1 rounded border border-gold/20 px-1.5 py-0.5 text-[10px] font-semibold text-parchment-dim">
            {m.area === "Mecânica" ? <Cog className="h-3 w-3" /> : <Zap className="h-3 w-3" />}
            {m.area === "Mecânica" ? "Mec" : "Elé"}
          </span>
          {m.family ? <span className="rounded border border-gold/40 bg-gold/10 px-1.5 py-0.5 text-[10px] font-semibold text-gold-soft">{m.family}</span> : null}
          {m.noParams ? (
            <span className="rounded border border-neutralized/40 bg-neutralized/15 px-1.5 py-0.5 text-[10px] font-semibold text-neutralized-soft" data-badge="semparam">
              sem mín/máx
            </span>
          ) : null}
        </div>
      </td>
      <td className="whitespace-nowrap px-3 py-2.5 text-right tabular-nums">{fmtMrp(m.min)}</td>
      <td className="whitespace-nowrap px-3 py-2.5 text-right tabular-nums">{fmtMrp(m.max)}</td>
      <td className="px-3 py-2.5 text-parchment-dim">{m.group || "—"}</td>
      <td className="px-3 py-2.5 text-[12px] text-parchment-dim">{m.statusMrp || "—"}</td>
    </tr>
  );
}

const CONFIRM_TEXT = "A alteração da Base MRP recalculará a análise atual usando o mesmo estoque e as mesmas compras. Deseja continuar?";

function ConfirmBox(props: { text: string; busy: boolean; onConfirm: () => void; onCancel: () => void; confirmLabel: string }) {
  return (
    <div role="alertdialog" aria-label="Confirmar alteração da Base MRP" className="mt-3 rounded-md border border-gold/40 bg-gold/10 p-3 text-sm text-champagne" data-testid="mrp-base-confirm">
      <p>{props.text}</p>
      <div className="mt-2 flex gap-2">
        <button type="button" onClick={props.onConfirm} disabled={props.busy} className="inline-flex h-9 items-center gap-2 rounded-lg border border-gold/55 bg-gold/20 px-4 text-xs font-bold text-gold disabled:opacity-60">
          {props.busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null} {props.confirmLabel}
        </button>
        <button type="button" onClick={props.onCancel} disabled={props.busy} className="inline-flex h-9 items-center rounded-lg border border-gold/20 px-4 text-xs font-semibold text-parchment">
          Cancelar
        </button>
      </div>
    </div>
  );
}

function RestoreButton({ hasRun, isSeed, onChanged }: { hasRun: boolean; isSeed: boolean; onChanged: () => void }) {
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const run = async () => {
    setBusy(true);
    const res = await mrpPost<{ message: string; unchanged?: boolean }>("/api/mrp/base/restore", {});
    setBusy(false);
    setConfirming(false);
    if (!res.ok) return toast.error(`${res.error}`);
    toast.success(res.data.message);
    if (!res.data.unchanged) onChanged();
  };
  return (
    <div className="flex flex-col items-end">
      <button
        type="button"
        onClick={() => setConfirming(true)}
        disabled={busy || isSeed}
        title={isSeed ? "A base inicial já está em uso" : undefined}
        className="inline-flex h-9 items-center gap-2 rounded-lg border border-gold/30 px-3 text-xs font-semibold text-gold transition hover:bg-gold/10 disabled:cursor-not-allowed disabled:opacity-50"
        data-testid="mrp-base-restore"
      >
        <RotateCcw className="h-3.5 w-3.5" /> Restaurar base inicial
      </button>
      {confirming ? (
        <ConfirmBox
          text={hasRun ? CONFIRM_TEXT : "A base inicial do sistema voltará a ser a Base MRP ativa. Deseja continuar?"}
          busy={busy}
          confirmLabel="Restaurar"
          onConfirm={run}
          onCancel={() => setConfirming(false)}
        />
      ) : null}
    </div>
  );
}

function BaseUpload({ hasRun, onChanged }: { hasRun: boolean; onChanged: () => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [defaultArea, setDefaultArea] = useState("Mecânica");
  const [pending, setPending] = useState<Pending | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [dragging, setDragging] = useState(false);

  async function receive(file: File) {
    setError(null);
    setConfirming(false);
    try {
      if (pending) await mrpPost("/api/mrp/import/cancel", { importIds: [pending.importId] });
      setPending(null);
      setBusy("Enviando a planilha…");
      const signed = await mrpPost<{ uploadUrl: string; path: string; bucket: string; contentType: string; apiKey: string }>("/api/mrp/import/upload-url", { fileName: file.name });
      if (!signed.ok) throw new Error(signed.error);
      const put = await fetch(signed.data.uploadUrl, { method: "PUT", headers: { "content-type": signed.data.contentType, apikey: signed.data.apiKey, "x-upsert": "false" }, body: file });
      if (!put.ok) throw new Error(`Falha ao enviar ${file.name} para o armazenamento (HTTP ${put.status}).`);
      setBusy("Lendo a planilha do MRP…");
      const ins = await mrpPost<{ slots: Record<string, { importId: string; kind: string; preview: MrpFilePreview } | null>; rejected: { reason: string }[] }>("/api/mrp/import/inspect", {
        files: [{ fileName: file.name, filePath: signed.data.path, bucket: signed.data.bucket, fileSize: file.size, mimeType: signed.data.contentType }],
        defaultArea
      });
      if (!ins.ok) throw new Error(ins.error);
      const slot = Object.values(ins.data.slots).find(Boolean);
      if (!slot) throw new Error(ins.data.rejected[0]?.reason ?? `Não foi possível ler ${file.name}`);
      // O envio por esta aba é sempre a planilha do MRP (como o campo próprio do HTML).
      const prev = await mrpPost<{ preview: MrpFilePreview }>("/api/mrp/import/preview", { importId: slot.importId, kind: "base", defaultArea });
      if (!prev.ok) throw new Error(prev.error);
      setPending({ importId: slot.importId, fileName: file.name, preview: prev.data.preview });
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(null);
    }
  }

  useEffect(() => {
    if (!pending || pending.preview.base?.defaultArea === defaultArea) return;
    void mrpPost<{ preview: MrpFilePreview }>("/api/mrp/import/preview", { importId: pending.importId, kind: "base", defaultArea }).then((res) => {
      if (res.ok) setPending((p) => (p && p.importId === pending.importId ? { ...p, preview: res.data.preview } : p));
    });
  }, [defaultArea, pending]);

  async function apply() {
    if (!pending) return;
    setBusy(hasRun ? "Atualizando a Base MRP e recalculando a análise…" : "Atualizando a Base MRP…");
    const res = await mrpPost<{ message: string }>("/api/mrp/base/replace", { importId: pending.importId, sheet: pending.preview.sheet, defaultArea });
    setBusy(null);
    setConfirming(false);
    if (!res.ok) {
      setError(`${res.error} A base e a análise anteriores continuam vigentes.`);
      return;
    }
    toast.success(res.data.message);
    setPending(null);
    onChanged();
  }

  const b = pending?.preview.base;
  return (
    <div className="mt-4 space-y-3">
      <div
        role="button"
        tabIndex={0}
        onClick={() => !busy && inputRef.current?.click()}
        onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && !busy && inputRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          if (!busy && e.dataTransfer.files[0]) void receive(e.dataTransfer.files[0]);
        }}
        className={`flex cursor-pointer flex-col items-center gap-1.5 rounded-lg border-2 border-dashed px-4 py-5 text-center transition ${dragging ? "border-gold bg-gold/10" : "border-gold/30 hover:border-gold/60"}`}
      >
        <UploadCloud className="h-6 w-6 text-gold" />
        <span className="text-sm font-semibold text-champagne">Clique ou arraste a planilha do MRP</span>
        <span className="text-xs text-parchment-dim">.xlsx · .xls · .csv — colunas: Material, Descrição, Estoque mínimo, Estoque máximo (opcionais: Status MRP, Grupo, UM)</span>
        <input
          ref={inputRef}
          type="file"
          accept=".xlsx,.xls,.csv"
          className="hidden"
          data-testid="mrp-base-file"
          onChange={(e) => {
            if (e.target.files?.[0]) void receive(e.target.files[0]);
            e.target.value = "";
          }}
        />
      </div>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-parchment-dim">
        <label className="flex items-center gap-2">
          Área quando o nome da aba não indicar:
          <select aria-label="Área padrão da base" value={defaultArea} onChange={(e) => setDefaultArea(e.target.value)} className="h-8 rounded-md border border-gold/15 bg-black/35 px-2 text-xs text-parchment">
            <option value="Mecânica">Mecânica</option>
            <option value="Elétrica">Elétrica</option>
          </select>
        </label>
        <span>O conjunto (satélites/coroas) é identificado pelo Status MRP, como na planilha do SAP.</span>
      </div>
      {busy ? (
        <p className="flex items-center gap-2 text-sm text-parchment">
          <Loader2 className="h-4 w-4 animate-spin text-gold" /> {busy}
        </p>
      ) : null}
      {error ? (
        <p className="rounded-md border border-danger/45 bg-danger/10 px-3 py-2 text-sm text-danger-soft" role="alert">
          {error}
        </p>
      ) : null}
      {pending && b ? (
        <div className="rounded-md border border-gold/20 bg-black/25 p-3 text-xs text-parchment" data-testid="mrp-base-pending">
          <p>
            <strong>{pending.fileName}</strong>{" "}
            {b.error ? <span className="text-danger-soft">— {b.error}</span> : <>— ~{fmtMrp(b.estimatedMaterials)} materiais de {b.compatibleSheets.map((s) => `${s.name} (${s.area})`).join(", ")}</>}
            {b.ignoredSheets.length ? <span className="text-parchment-dim"> · ignoradas: {b.ignoredSheets.join(", ")}</span> : null}
          </p>
          {!b.error && !confirming ? (
            <button type="button" onClick={() => setConfirming(true)} disabled={!!busy} className="mt-2 inline-flex h-9 items-center gap-2 rounded-lg border border-gold/55 bg-gold/15 px-4 text-xs font-bold text-gold" data-testid="mrp-base-apply">
              Atualizar Base MRP
            </button>
          ) : null}
          {confirming ? (
            <ConfirmBox
              text={hasRun ? CONFIRM_TEXT : "A nova planilha passará a ser a Base MRP ativa. Deseja continuar?"}
              busy={!!busy}
              confirmLabel="Atualizar Base MRP"
              onConfirm={apply}
              onCancel={() => setConfirming(false)}
            />
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
