"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, m } from "framer-motion";
import { ClipboardList, Clock, Gauge, Loader2, Wrench, X } from "lucide-react";
import type { WorkforceMemberDetail } from "@/types/workforce";

type Props = {
  memberKey: string | null;
  startDate: string;
  endDate: string;
  onClose: () => void;
};

/**
 * Painel de detalhe do colaborador.
 *
 * Recebe o MESMO período da tela e o envia para a API, pelo mesmo motivo que levou o
 * painel do PC-Factory a ser corrigido antes: um detalhe que ignora o filtro mostra
 * outro conjunto de números que a linha clicada, e o usuário não tem como saber qual
 * está certo.
 */
export function WorkforceMemberDrawer({ memberKey, startDate, endDate, onClose }: Props) {
  const [detail, setDetail] = useState<WorkforceMemberDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requestRef = useRef(0);

  useEffect(() => {
    if (!memberKey) return;

    const requestId = requestRef.current + 1;
    requestRef.current = requestId;
    setLoading(true);
    setError(null);
    setDetail(null);

    const query = new URLSearchParams({ member: memberKey });
    if (startDate) query.set("startDate", startDate);
    if (endDate) query.set("endDate", endDate);

    fetch(`/api/workforce/member?${query.toString()}`)
      .then(async (response) => {
        if (!response.ok) throw new Error("request failed");
        return (await response.json()) as WorkforceMemberDetail;
      })
      .then((payload) => {
        if (requestRef.current === requestId) setDetail(payload);
      })
      .catch(() => {
        if (requestRef.current === requestId) setError("Não foi possível carregar o detalhe deste colaborador.");
      })
      .finally(() => {
        if (requestRef.current === requestId) setLoading(false);
      });
  }, [memberKey, startDate, endDate]);

  useEffect(() => {
    if (!memberKey) return;
    function handleKey(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [memberKey, onClose]);

  const int = (value: number) => value.toLocaleString("pt-BR");
  const horas = (value: number) => `${value.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} h`;

  return (
    <AnimatePresence>
      {memberKey ? (
        <m.div
          key="workforce-drawer"
          className="fixed inset-0 z-50"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
        >
          <button type="button" aria-label="Fechar detalhes" onClick={onClose} className="absolute inset-0 bg-black/60 backdrop-blur-sm" />

          <m.aside
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ duration: 0.3, ease: [0.22, 0.61, 0.36, 1] }}
            className="absolute right-0 top-0 flex h-full w-full max-w-[560px] flex-col border-l border-gold/25 bg-ink text-champagne shadow-[0_0_60px_rgba(0,0,0,0.6)]"
          >
            <div className="flex items-start justify-between gap-3 border-b border-gold/20 px-5 py-4">
              <div className="min-w-0">
                <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-gold">Detalhe do colaborador</p>
                <h2 className="mt-1 truncate font-serif text-xl text-white">{detail?.member.name ?? "Carregando..."}</h2>
                {detail ? (
                  <>
                    <p className="mt-0.5 text-xs text-zinc-400">
                      {[detail.member.role, detail.member.area, detail.member.shift].filter(Boolean).join(" · ") ||
                        "Não consta no cadastro de colaboradores"}
                    </p>
                    <p className="mt-1 text-[11px] text-zinc-400">
                      Período: <span className="font-semibold text-champagne">{detail.periodLabel}</span>
                    </p>
                  </>
                ) : null}
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
                  <Loader2 className="h-4 w-4 animate-spin text-gold" /> Carregando...
                </div>
              ) : error || !detail ? (
                <div className="flex h-40 items-center justify-center px-6 text-center text-sm text-zinc-400">
                  {error ?? "Sem ordens para este colaborador no período selecionado."}
                </div>
              ) : (
                <div className="space-y-5">
                  <div className="grid grid-cols-2 gap-3">
                    <Metric icon={Clock} label="Horas apontadas" value={horas(detail.member.workedHours)} />
                    <Metric icon={ClipboardList} label="Total de OS" value={int(detail.member.totalOrders)} />
                    <Metric icon={ClipboardList} label="OS abertas" value={int(detail.member.openOrders)} />
                    <Metric icon={ClipboardList} label="OS fechadas" value={int(detail.member.closedOrders)} />
                    <Metric
                      icon={Gauge}
                      label="Média h/OS"
                      value={detail.member.averageHoursPerOrder === null ? "—" : horas(detail.member.averageHoursPerOrder)}
                    />
                  </div>

                  <section>
                    <h3 className="mb-2 text-[11px] font-bold uppercase tracking-[0.18em] text-gold">
                      Top equipamentos atendidos
                    </h3>
                    {detail.topEquipments.length === 0 ? (
                      <p className="text-xs text-zinc-500">Nenhum equipamento informado nas ordens do período.</p>
                    ) : (
                      <div className="space-y-1.5">
                        {detail.topEquipments.map((row) => (
                          <div key={row.equipment} className="flex items-center gap-2 text-[11px]">
                            <span className="flex-1 truncate text-zinc-300" title={row.equipment}>
                              {row.equipment}
                            </span>
                            <span className="shrink-0 tabular-nums text-zinc-400">{int(row.totalOrders)} OS</span>
                            <span className="w-16 shrink-0 text-right font-semibold tabular-nums text-amber-400">
                              {horas(row.workedHours)}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </section>

                  <section>
                    <h3 className="mb-2 text-[11px] font-bold uppercase tracking-[0.18em] text-gold">
                      Ordens ({int(detail.orders.length)} de {int(detail.totalOrders)})
                    </h3>
                    <div className="max-h-[320px] space-y-1.5 overflow-y-auto pr-1">
                      {detail.orders.map((order) => (
                        <div
                          key={order.id}
                          className="rounded-md border border-gold/10 bg-black/25 px-3 py-1.5 text-[11px]"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-mono text-zinc-400">{order.osNumber}</span>
                            <span className="font-semibold text-amber-400">{horas(order.workedHours)}</span>
                          </div>
                          <p className="mt-0.5 truncate text-zinc-300" title={order.title}>
                            {order.title}
                          </p>
                          <p className="truncate text-[10px] text-zinc-500" title={order.equipment}>
                            {order.equipment} · {order.status}
                          </p>
                        </div>
                      ))}
                    </div>
                    {detail.totalOrders > detail.orders.length ? (
                      <p className="mt-2 text-[10px] text-zinc-500">
                        Mostrando as {int(detail.orders.length)} mais recentes. Use a aba Ordens de Serviço filtrada por
                        este responsável para ver a lista completa.
                      </p>
                    ) : null}
                  </section>
                </div>
              )}
            </div>
          </m.aside>
        </m.div>
      ) : null}
    </AnimatePresence>
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
