"use client";

import { useEffect, useMemo, useState } from "react";
import { Clock, Layers, Loader2, Search, Users, Wrench, X } from "lucide-react";
import { CRITICALITY_COLORS } from "@/components/critical-equipments/criticality";
import { EquipmentOrderDetailModal } from "@/components/critical-equipments/EquipmentOrderDetailModal";
import type { CriticalEquipmentDetails, CriticalEquipmentServiceOrder } from "@/types/critical-equipments";
import type { ServiceOrderStatusLabel } from "@/types/service-orders";

type CriticalEquipmentDetailsDrawerProps = {
  open: boolean;
  loading: boolean;
  error: string | null;
  details: CriticalEquipmentDetails | null;
  onClose: () => void;
};

export function CriticalEquipmentDetailsDrawer({
  open,
  loading,
  error,
  details,
  onClose
}: CriticalEquipmentDetailsDrawerProps) {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"TODOS" | ServiceOrderStatusLabel>("TODOS");
  const [selectedOrder, setSelectedOrder] = useState<CriticalEquipmentServiceOrder | null>(null);

  useEffect(() => {
    if (!open) {
      return;
    }
    function handleKey(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onClose();
      }
    }
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [open, onClose]);

  // Reseta filtros internos quando troca o equipamento.
  const equipmentId = details?.item.id;
  useEffect(() => {
    setSearch("");
    setStatusFilter("TODOS");
    setSelectedOrder(null);
  }, [equipmentId]);

  const orders = details?.serviceOrders ?? [];
  const filteredOrders = useMemo(() => {
    const term = search.trim().toLowerCase();
    return orders.filter((order) => {
      const matchesStatus = statusFilter === "TODOS" || order.status === statusFilter;
      if (!matchesStatus) {
        return false;
      }
      if (!term) {
        return true;
      }
      const haystack = [order.osNumber, order.title, order.operation, order.responsibleName]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return haystack.includes(term);
    });
  }, [orders, search, statusFilter]);

  const statusOptions = useMemo(() => details?.statusDistribution.map((slice) => slice.status) ?? [], [details]);

  if (!open) {
    return null;
  }

  const item = details?.item;

  return (
    <div className="fixed inset-0 z-50">
      <button
        type="button"
        aria-label="Fechar detalhes"
        onClick={onClose}
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
      />

      <aside className="absolute right-0 top-0 flex h-full w-full max-w-[540px] flex-col border-l border-gold/25 bg-[#0a0b0b] text-champagne shadow-[0_0_60px_rgba(0,0,0,0.6)]">
        {/* Cabeçalho */}
        <div className="flex items-start justify-between gap-3 border-b border-gold/20 bg-[#070808] px-5 py-4">
          <div className="min-w-0">
            <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-gold">Detalhe do equipamento</p>
            <h2 className="mt-1 truncate font-serif text-xl text-white" title={item?.equipmentName}>
              {item?.equipmentName ?? "Carregando..."}
            </h2>
            {item ? <p className="mt-0.5 text-xs text-zinc-400">{display(item.equipmentCode)}</p> : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar"
            className="grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-gold/20 text-zinc-300 transition hover:border-gold/40 hover:text-white"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          {loading ? (
            <div className="flex h-40 items-center justify-center gap-2 text-sm text-zinc-400">
              <Loader2 className="h-4 w-4 animate-spin text-gold" />
              Carregando detalhes...
            </div>
          ) : error || !details || !item ? (
            <div className="flex h-40 items-center justify-center px-6 text-center text-sm text-zinc-400">
              {error ?? "Não foi possível carregar os detalhes deste equipamento no momento."}
            </div>
          ) : (
            <div className="space-y-5">
              {/* Score */}
              <div
                className="flex items-center justify-between rounded-lg border px-4 py-3"
                style={{ borderColor: `${CRITICALITY_COLORS[item.criticalityLabel]}66` }}
              >
                <div>
                  <p className="text-[11px] uppercase tracking-wide text-zinc-400">Score crítico</p>
                  <p className="text-2xl font-light text-white">{item.criticalityScore}</p>
                </div>
                <span
                  className="rounded-md px-3 py-1 text-xs font-bold uppercase tracking-wide text-white"
                  style={{ backgroundColor: CRITICALITY_COLORS[item.criticalityLabel] }}
                >
                  {item.criticalityLabel}
                </span>
              </div>

              {/* KPIs */}
              <div className="grid grid-cols-2 gap-3">
                <Metric icon={Wrench} label="Total de OS" value={int(item.totalOrders)} />
                <Metric icon={Clock} label="Horas apontadas" value={hours(item.totalWorkedHours)} />
                <Metric icon={Layers} label="OS em aberto" value={int(item.backlogOrders)} />
                <Metric icon={Users} label="Última OS" value={date(item.lastOrderDate)} />
              </div>

              <div className="grid grid-cols-2 gap-x-4 gap-y-1 rounded-lg border border-gold/10 bg-black/20 px-3 py-2 text-xs">
                <InlineInfo label="Grupo principal" value={item.mainPlanningGroup} />
                <InlineInfo label="Responsável principal" value={item.mainResponsible} />
              </div>

              {/* Distribuição por status */}
              <Section title="Distribuição por status">
                <div className="space-y-2">
                  {details.statusDistribution.map((slice) => (
                    <div key={slice.status} className="flex items-center gap-2 text-xs">
                      <span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ backgroundColor: slice.color }} />
                      <span className="flex-1 text-zinc-300">{slice.label}</span>
                      <span className="font-semibold text-champagne">{int(slice.value)}</span>
                    </div>
                  ))}
                </div>
              </Section>

              {/* Responsáveis mais frequentes */}
              <Section title="Responsáveis mais frequentes">
                {details.frequentResponsibles.length ? (
                  <div className="space-y-1.5">
                    {details.frequentResponsibles.map((responsible) => (
                      <div key={responsible.name} className="flex items-center justify-between gap-2 text-xs">
                        <span className="truncate text-zinc-300" title={responsible.name}>
                          {responsible.name}
                        </span>
                        <span className="shrink-0 text-zinc-400">
                          {int(responsible.count)} OS · <span className="text-champagne">{hours(responsible.hours)}</span>
                        </span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-zinc-500">Não informado.</p>
                )}
              </Section>

              {/* Ordens vinculadas */}
              <Section title={`Ordens vinculadas ao equipamento (${orders.length})`}>
                <div className="mb-2 flex flex-col gap-2 sm:flex-row">
                  <div className="relative flex-1">
                    <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-zinc-500" />
                    <input
                      value={search}
                      onChange={(event) => setSearch(event.target.value)}
                      placeholder="Buscar OS, título, operação..."
                      className="h-9 w-full rounded-md border border-gold/15 bg-black/40 pl-8 pr-2 text-xs text-zinc-100 outline-none focus:border-gold/45"
                    />
                  </div>
                  <select
                    value={statusFilter}
                    onChange={(event) => setStatusFilter(event.target.value as "TODOS" | ServiceOrderStatusLabel)}
                    className="h-9 rounded-md border border-gold/15 bg-black/40 px-2 text-xs text-zinc-100 outline-none [color-scheme:dark] focus:border-gold/45"
                  >
                    <option value="TODOS">Todos os status</option>
                    {statusOptions.map((status) => (
                      <option key={status} value={status}>
                        {status}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="max-h-[320px] space-y-2 overflow-y-auto pr-1">
                  {filteredOrders.length ? (
                    filteredOrders.map((order) => (
                      <button
                        key={order.id}
                        type="button"
                        onClick={() => setSelectedOrder(order)}
                        className="block w-full rounded-lg border border-gold/15 bg-black/30 px-3 py-2 text-left transition hover:border-gold/40 hover:bg-gold/[0.08]"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="truncate text-xs font-semibold text-zinc-100" title={order.title}>
                            {order.title}
                          </span>
                          <span className="shrink-0 rounded border border-gold/25 bg-gold/10 px-1.5 py-0.5 text-[10px] font-bold text-champagne">
                            {order.status}
                          </span>
                        </div>
                        <div className="mt-1 flex items-center justify-between text-[11px] text-zinc-500">
                          <span className="text-gold">OS {order.osNumber}</span>
                          <span>
                            {date(order.openedAt)} · {order.workedHours !== null ? hours(order.workedHours) : "—"}
                          </span>
                        </div>
                        <div className="mt-0.5 flex items-center justify-between gap-2 text-[11px] text-zinc-500">
                          <span className="truncate" title={responsible(order.responsibleName)}>
                            {responsible(order.responsibleName)}
                          </span>
                          <span className="shrink-0 truncate" title={text(order.planningGroup)}>
                            {text(order.planningGroup)}
                          </span>
                        </div>
                      </button>
                    ))
                  ) : (
                    <p className="px-1 py-4 text-center text-xs text-zinc-500">
                      Nenhuma ordem encontrada para a busca/filtro.
                    </p>
                  )}
                </div>
              </Section>
            </div>
          )}
        </div>
      </aside>

      <EquipmentOrderDetailModal order={selectedOrder} onClose={() => setSelectedOrder(null)} />
    </div>
  );
}

function Metric({ icon: Icon, label, value }: { icon: typeof Clock; label: string; value: string }) {
  return (
    <div className="rounded-lg border border-gold/15 bg-black/30 p-3">
      <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-wide text-zinc-400">
        <Icon className="h-3.5 w-3.5 text-gold" />
        {label}
      </div>
      <p className="mt-1 truncate text-lg font-light text-white" title={value}>
        {value}
      </p>
    </div>
  );
}

function InlineInfo({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <p className="text-[10px] uppercase tracking-wide text-zinc-500">{label}</p>
      <p className="truncate text-zinc-200" title={value}>
        {value}
      </p>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h3 className="mb-2 text-[11px] font-bold uppercase tracking-[0.18em] text-gold">{title}</h3>
      {children}
    </section>
  );
}

function int(value: number): string {
  return value.toLocaleString("pt-BR");
}

function hours(value: number): string {
  return `${value.toLocaleString("pt-BR", { minimumFractionDigits: 3, maximumFractionDigits: 3 })} H`;
}

function date(value: string | null): string {
  return value ? new Date(value).toLocaleDateString("pt-BR") : "Não informado";
}

function display(value: string): string {
  return value && value !== "SEM CÓDIGO" ? value : "Não informado";
}

function text(value: string | null | undefined): string {
  return (value ?? "").trim() || "Não informado";
}

function responsible(value: string | null | undefined): string {
  return (value ?? "").trim() || "SEM RESPONSÁVEL";
}
