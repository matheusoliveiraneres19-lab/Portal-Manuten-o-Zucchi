"use client";

import { useEffect, useRef, useState } from "react";
import { ExternalLink, Loader2, Search, X } from "lucide-react";
import { FOCUS_RING } from "@/constants/interactive";
import { AVAILABILITY_NOTE_LIMITS, type ServiceOrderSearchItem, type ServiceOrderSearchResult } from "@/types/pc-factory-availability-note";

/**
 * ORDENS DE SERVIÇO RELACIONADAS à justificativa de baixa disponibilidade.
 *
 * Só vincula OS que EXISTEM no portal: a lista vem de `/api/service-orders/search`
 * (no máximo 20 por busca, nunca a base inteira), com debounce de 300 ms. A busca
 * começa pela mesma máquina e prioriza o período da justificativa — sem bloquear:
 * uma OS aberta antes da parada é legítima, e "Todas as OS" busca fora da máquina.
 *
 * O componente só edita a LISTA; quem grava é o "Salvar justificativa" do painel,
 * que manda a lista inteira e o servidor sincroniza os vínculos.
 */
export type ServiceOrderChip = {
  osNumber: string;
  title: string | null;
  planningGroupLabel: string | null;
  statusLabel: string | null;
  closed: boolean;
  /** `false` = vínculo antigo cuja OS saiu da base atual. */
  found: boolean;
};

const DEBOUNCE_MS = 300;

/** Detalhe da OS: a aba Ordens de Serviço já filtrada pelo número — a tela que existe. */
export function serviceOrderHref(osNumber: string): string {
  return `/dashboard/ordens-servico?ordem=${encodeURIComponent(osNumber)}`;
}

export function PcFactoryServiceOrderPicker({
  machine,
  periodStart,
  periodEnd,
  value,
  onChange
}: {
  /** `resourceName` do PC-Factory. */
  machine: string;
  periodStart: string;
  periodEnd: string;
  value: ServiceOrderChip[];
  onChange: (next: ServiceOrderChip[]) => void;
}) {
  const [query, setQuery] = useState("");
  const [scope, setScope] = useState<"machine" | "all">("machine");
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ServiceOrderSearchResult | null>(null);
  const [failed, setFailed] = useState(false);
  /** A máquina tem equipamento SAP correspondente? `null` = ainda não sabemos. */
  const [machineMapped, setMachineMapped] = useState<boolean | null>(null);
  const boxRef = useRef<HTMLDivElement | null>(null);

  const selected = new Set(value.map((chip) => chip.osNumber));
  const full = value.length >= AVAILABILITY_NOTE_LIMITS.serviceOrders;

  // Busca com debounce; a resposta de uma tecla antiga nunca sobrescreve a atual.
  useEffect(() => {
    if (!open) return;
    const term = query.trim();
    if (scope === "all" && term.length < 3) {
      setResult(null);
      setLoading(false);
      return;
    }

    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      setLoading(true);
      setFailed(false);
      const params = new URLSearchParams({ machine, dateFrom: periodStart, dateTo: periodEnd, scope, limit: "10" });
      if (term) params.set("query", term);
      fetch(`/api/service-orders/search?${params.toString()}`, { signal: controller.signal })
        .then(async (response) => {
          const body = (await response.json().catch(() => null)) as ({ ok: boolean } & ServiceOrderSearchResult) | null;
          if (!response.ok || !body?.ok) throw new Error("search failed");
          setResult(body);
          setMachineMapped(body.machineTags.length > 0);
          // Máquina sem correspondência no SAP: passa direto para "todas as OS".
          if (scope === "machine" && body.machineTags.length === 0) setScope("all");
        })
        .catch(() => {
          if (!controller.signal.aborted) setFailed(true);
        })
        .finally(() => {
          if (!controller.signal.aborted) setLoading(false);
        });
    }, DEBOUNCE_MS);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [query, scope, open, machine, periodStart, periodEnd]);

  // Clique fora fecha a lista de sugestões.
  useEffect(() => {
    if (!open) return;
    const onPointer = (event: PointerEvent) => {
      if (boxRef.current && !boxRef.current.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", onPointer);
    return () => document.removeEventListener("pointerdown", onPointer);
  }, [open]);

  function add(item: ServiceOrderSearchItem) {
    if (selected.has(item.osNumber) || full) return;
    onChange([
      ...value,
      {
        osNumber: item.osNumber,
        title: item.title,
        planningGroupLabel: item.planningGroupLabel,
        statusLabel: item.statusLabel,
        closed: item.closed,
        found: true
      }
    ]);
    setQuery("");
    // Fecha a lista: aberta, ela cobria o "Salvar justificativa" logo abaixo.
    setOpen(false);
  }

  const term = query.trim();
  const items = result?.items ?? [];
  const noMachineMatch = machineMapped === false;

  return (
    <div className="space-y-2" ref={boxRef}>
      {value.length ? (
        <ul className="flex flex-wrap gap-2" aria-label="Ordens de Serviço vinculadas">
          {value.map((chip) => (
            <li key={chip.osNumber}>
              <ServiceOrderChipView chip={chip} onRemove={() => onChange(value.filter((item) => item.osNumber !== chip.osNumber))} />
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-[11px] text-parchment-dim">Nenhuma OS vinculada.</p>
      )}

      <div className="relative">
        <div className="flex flex-wrap items-center gap-2">
          <label className="relative min-w-[220px] flex-1">
            <span className="sr-only">Buscar Ordem de Serviço</span>
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-parchment-dim" />
            <input
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
                setOpen(true);
              }}
              onFocus={() => setOpen(true)}
              onKeyDown={(event) => {
                if (event.key === "Escape") setOpen(false);
              }}
              disabled={full}
              placeholder={full ? `Limite de ${AVAILABILITY_NOTE_LIMITS.serviceOrders} OS atingido` : "Buscar por número da OS..."}
              role="combobox"
              aria-autocomplete="list"
              aria-expanded={open}
              aria-controls="pcf-os-suggestions"
              className="h-9 w-full rounded-md border border-gold/25 bg-ink-raised pl-8 pr-8 text-sm text-champagne outline-none transition placeholder:text-parchment-dim/60 focus-visible:border-gold disabled:opacity-60"
            />
            {loading ? <Loader2 className="absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 animate-spin text-gold" /> : null}
          </label>
          <div className="inline-flex rounded-md border border-gold/25 p-0.5" role="group" aria-label="Onde buscar">
            {(["machine", "all"] as const).map((option) => (
              <button
                key={option}
                type="button"
                aria-pressed={scope === option}
                disabled={option === "machine" && machineMapped === false}
                title={option === "machine" && machineMapped === false ? "Máquina sem correspondência automática no SAP" : undefined}
                onClick={() => {
                  setScope(option);
                  setOpen(true);
                }}
                className={`rounded px-2.5 py-1 text-[11px] font-bold transition ${
                  scope === option ? "bg-gold/20 text-gold-soft" : "text-parchment-dim hover:text-white"
                } ${FOCUS_RING}`}
              >
                {option === "machine" ? "Mesma máquina" : "Todas as OS"}
              </button>
            ))}
          </div>
        </div>

        {open ? (
          <div
            id="pcf-os-suggestions"
            className="absolute left-0 right-0 z-30 mt-1 max-h-72 overflow-y-auto rounded-md border border-gold/30 bg-ink shadow-premium"
          >
            {scope === "machine" ? (
              <p className="border-b border-gold/15 px-3 py-1.5 text-[10px] text-parchment-dim">
                OS desta máquina — as do período da justificativa primeiro.
              </p>
            ) : noMachineMatch ? (
              <p className="border-b border-gold/15 px-3 py-1.5 text-[10px] text-amber-200/90">
                Máquina sem correspondência automática no SAP — buscando em todas as OS.
              </p>
            ) : (
              <p className="border-b border-gold/15 px-3 py-1.5 text-[10px] text-parchment-dim">
                Todas as OS — mesma máquina e mesmo período aparecem primeiro.
              </p>
            )}

            {scope === "all" && term.length < 3 ? (
              <p className="px-3 py-3 text-xs text-parchment-dim">Digite ao menos 3 caracteres do número da OS.</p>
            ) : failed ? (
              <p className="px-3 py-3 text-xs text-rose-300">Não foi possível buscar as Ordens de Serviço.</p>
            ) : loading && !result ? (
              <p className="px-3 py-3 text-xs text-parchment-dim">Buscando…</p>
            ) : items.length === 0 ? (
              <p className="px-3 py-3 text-xs text-parchment-dim">
                {term ? "Ordem de Serviço não encontrada na base atual." : "Nenhuma OS desta máquina na base atual."}
              </p>
            ) : (
              <ul>
                {items.map((item) => {
                  const already = selected.has(item.osNumber);
                  return (
                    <li key={item.osNumber}>
                      <button
                        type="button"
                        disabled={already || full}
                        onClick={() => add(item)}
                        className="w-full border-b border-gold/10 px-3 py-2 text-left transition hover:bg-gold/10 disabled:cursor-default disabled:opacity-50"
                      >
                        <span className="flex flex-wrap items-baseline gap-x-2">
                          <strong className="tabular-nums text-white">{item.osNumber}</strong>
                          <span className="text-[11px] text-parchment-dim">
                            {item.planningGroupLabel} · <StatusText closed={item.closed} label={item.statusLabel} />
                            {item.openedAt ? ` · ${new Date(item.openedAt).toLocaleDateString("pt-BR", { timeZone: "UTC" })}` : ""}
                          </span>
                          {item.sameMachine ? <Tag>mesma máquina</Tag> : null}
                          {item.inPeriod ? <Tag>no período</Tag> : null}
                          {already ? <Tag>já vinculada</Tag> : null}
                        </span>
                        <span className="block truncate text-xs text-champagne" title={item.title}>
                          {item.title}
                        </span>
                        <span className="block truncate text-[10px] text-parchment-dim">{item.equipmentLabel}</span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        ) : null}
      </div>
    </div>
  );
}

/** Chip de uma OS vinculada: "OS 45012345 · Mecânica · Fechada", Ver OS e Remover. */
export function ServiceOrderChipView({ chip, onRemove }: { chip: ServiceOrderChip; onRemove?: () => void }) {
  return (
    <span
      className={`inline-flex max-w-full items-center gap-2 rounded-md border px-2 py-1 text-[11px] ${
        chip.found ? "border-gold/30 bg-gold/10 text-champagne" : "border-amber-400/40 bg-amber-400/10 text-amber-100"
      }`}
      title={chip.title ?? undefined}
    >
      <span className="min-w-0">
        <strong className="tabular-nums text-white">OS {chip.osNumber}</strong>
        {chip.found ? (
          <>
            {chip.planningGroupLabel ? ` · ${chip.planningGroupLabel}` : ""} ·{" "}
            <StatusText closed={chip.closed} label={chip.statusLabel ?? "—"} />
          </>
        ) : (
          " · não encontrada na base atual"
        )}
      </span>
      {chip.found ? (
        <a
          href={serviceOrderHref(chip.osNumber)}
          target="_blank"
          rel="noreferrer"
          className={`inline-flex items-center gap-0.5 font-bold text-gold-soft underline-offset-2 hover:underline ${FOCUS_RING}`}
        >
          Ver OS <ExternalLink className="h-3 w-3" />
        </a>
      ) : null}
      {onRemove ? (
        <button
          type="button"
          onClick={onRemove}
          aria-label={`Remover vínculo com a OS ${chip.osNumber}`}
          title="Remover vínculo (a OS não é apagada)"
          className={`rounded p-0.5 text-parchment-dim transition hover:text-white ${FOCUS_RING}`}
        >
          <X className="h-3 w-3" />
        </button>
      ) : null}
    </span>
  );
}

function StatusText({ closed, label }: { closed: boolean; label: string }) {
  return <span className={closed ? "text-emerald-300" : "text-rose-300"}>{label}</span>;
}

function Tag({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded border border-gold/30 px-1 text-[9px] font-bold uppercase tracking-wide text-gold-soft">
      {children}
    </span>
  );
}
