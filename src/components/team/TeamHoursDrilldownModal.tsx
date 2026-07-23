"use client";

import { useEffect, useState } from "react";
import { ClipboardList, Loader2, X } from "lucide-react";
import type { CollaboratorHoursOrdersResult, TeamHoursOsType } from "@/types/collaborators";

type DrilldownTarget = { id: string; name: string };

type TeamHoursDrilldownModalProps = {
  target: DrilldownTarget | null;
  startDate: string;
  endDate: string;
  osType: TeamHoursOsType;
  onClose: () => void;
};

const OS_TYPE_TONE: Record<string, string> = {
  PL: "bg-petroleum/20 text-sky-300",
  PV: "bg-gold/20 text-gold",
  Corretiva: "bg-danger/15 text-rose-300"
};

/**
 * Drill-down das horas de um colaborador: lista as Ordens de Manutenção que
 * compõem o total no período (fonte: ServiceOrder). Essencial para auditar por
 * que o colaborador tem aquele total de horas.
 */
export function TeamHoursDrilldownModal({ target, startDate, endDate, osType, onClose }: TeamHoursDrilldownModalProps) {
  const [data, setData] = useState<CollaboratorHoursOrdersResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!target) return;
    let active = true;
    setLoading(true);
    setFailed(false);
    setData(null);

    const params = new URLSearchParams({ collaboratorId: target.id, startDate, endDate, osType });
    fetch(`/api/collaborators/hours/orders?${params.toString()}`)
      .then((response) => {
        if (!response.ok) throw new Error("request failed");
        return response.json() as Promise<CollaboratorHoursOrdersResult>;
      })
      .then((result) => {
        if (active) setData(result);
      })
      .catch(() => {
        if (active) setFailed(true);
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [target, startDate, endDate, osType]);

  if (!target) return null;

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/70 p-4" onClick={onClose}>
      <div
        className="relative flex max-h-[85vh] w-full max-w-4xl flex-col overflow-hidden rounded-lg border border-gold/25 bg-[#0a0b0b] shadow-[0_18px_44px_rgba(0,0,0,0.55)]"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="flex items-start justify-between gap-3 border-b border-white/10 p-4">
          <div>
            <div className="mb-1 flex items-center gap-2 text-gold">
              <ClipboardList className="h-4 w-4" />
              <span className="text-[10px] font-bold uppercase tracking-[0.22em] text-champagne/80">
                Ordens de Manutenção · Fonte oficial das horas
              </span>
            </div>
            <h2 className="font-serif text-xl text-white">{target.name}</h2>
            <p className="mt-1 text-[11px] text-zinc-400">
              {data
                ? `${data.orders.length} OS · ${fmt(data.totalHours)} h no período`
                : "Carregando ordens do período…"}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="grid h-8 w-8 place-items-center rounded-md border border-white/12 text-zinc-400 transition hover:border-gold/40 hover:text-white"
            aria-label="Fechar"
          >
            <X className="h-4 w-4" />
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-auto p-4">
          {loading ? (
            <div className="grid place-items-center gap-2 py-16 text-zinc-400">
              <Loader2 className="h-6 w-6 animate-spin text-gold" />
              <span className="text-sm">Carregando…</span>
            </div>
          ) : failed ? (
            <div className="py-16 text-center text-sm text-rose-300">Não foi possível carregar as ordens.</div>
          ) : !data || data.orders.length === 0 ? (
            <div className="py-16 text-center text-sm text-zinc-500">
              Nenhuma Ordem de Manutenção com horas para este colaborador no período/filtro.
            </div>
          ) : (
            <div className="overflow-x-auto rounded-lg border border-white/8">
              <table className="w-full min-w-[720px] border-collapse text-sm">
                <thead>
                  <tr className="border-b border-white/10 bg-white/[0.03] text-left text-[11px] font-extrabold uppercase tracking-wide text-zinc-400">
                    <th className="px-3 py-2.5">OS</th>
                    <th className="px-3 py-2.5">Título</th>
                    <th className="px-3 py-2.5">Equipamento</th>
                    <th className="px-3 py-2.5">Tipo</th>
                    <th className="px-3 py-2.5">Status</th>
                    <th className="px-3 py-2.5">Abertura</th>
                    <th className="px-3 py-2.5 text-right">Horas</th>
                  </tr>
                </thead>
                <tbody>
                  {data.orders.map((order) => (
                    <tr key={order.id} className="border-b border-white/5 text-zinc-200 last:border-0">
                      <td className="px-3 py-2.5 font-mono text-xs text-zinc-400">{order.osNumber}</td>
                      <td className="px-3 py-2.5">
                        <div className="max-w-[280px] truncate" title={order.title}>
                          {order.title}
                        </div>
                        {order.planningGroup ? (
                          <div className="text-[11px] text-zinc-500">{order.planningGroup}</div>
                        ) : null}
                      </td>
                      <td className="px-3 py-2.5 text-zinc-300">{order.equipmentName ?? "—"}</td>
                      <td className="px-3 py-2.5">
                        <span className={`inline-block rounded-md px-2 py-0.5 text-xs font-bold ${OS_TYPE_TONE[order.osType] ?? "bg-white/10 text-zinc-300"}`}>
                          {order.osType}
                        </span>
                      </td>
                      <td className="px-3 py-2.5 text-xs text-zinc-400">{order.status}</td>
                      <td className="px-3 py-2.5 text-xs text-zinc-400">{fmtDate(order.openedAt)}</td>
                      <td className="px-3 py-2.5 text-right font-semibold tabular-nums text-champagne">{fmt(order.workedHours)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function fmt(value: number): string {
  return value.toLocaleString("pt-BR", { maximumFractionDigits: 1 });
}

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("pt-BR", { timeZone: "UTC" });
}
