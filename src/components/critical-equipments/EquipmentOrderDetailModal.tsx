"use client";

import { useEffect } from "react";
import { AnimatePresence, m } from "framer-motion";
import { X } from "lucide-react";
import type { CriticalEquipmentServiceOrder } from "@/types/critical-equipments";

type EquipmentOrderDetailModalProps = {
  order: CriticalEquipmentServiceOrder | null;
  onClose: () => void;
};

export function EquipmentOrderDetailModal({ order, onClose }: EquipmentOrderDetailModalProps) {
  useEffect(() => {
    if (!order) {
      return;
    }
    function handleKey(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onClose();
      }
    }
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [order, onClose]);

  return (
    <AnimatePresence>
      {order ? (
        <m.div
          key="order-modal"
          className="fixed inset-0 z-[60] flex items-center justify-center p-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18 }}
        >
          <button
            type="button"
            aria-label="Fechar ordem"
            onClick={onClose}
            className="absolute inset-0 bg-black/70 backdrop-blur-sm"
          />

          <m.div
            initial={{ opacity: 0, scale: 0.96, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.97, y: 6 }}
            transition={{ duration: 0.2, ease: "easeOut" }}
            className="relative flex max-h-[88vh] w-full max-w-2xl flex-col overflow-hidden rounded-lg border border-gold/30 bg-[#0a0b0b] text-champagne shadow-[0_0_60px_rgba(0,0,0,0.7)]"
          >
        <div className="flex items-start justify-between gap-3 border-b border-gold/20 bg-[#070808] px-5 py-4">
          <div className="min-w-0">
            <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-gold">
              Ordem de manutenção · {order.osNumber}
            </p>
            <h2 className="mt-1 truncate font-serif text-lg text-white" title={order.title}>
              {order.title}
            </h2>
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

        <div className="grid grid-cols-1 gap-x-6 gap-y-3 overflow-y-auto px-5 py-4 sm:grid-cols-2">
          <Field label="Número da ordem" value={order.osNumber} />
          <Field label="Status" value={order.status} />
          <Field label="Data de abertura" value={date(order.openedAt)} />
          <Field label="Data de fechamento" value={date(order.closedAt)} />
          <Field label="Responsável" value={responsible(order.responsibleName)} />
          <Field label="Grupo de planejamento" value={text(order.planningGroup)} />
          <Field label="Equipamento" value={text(order.equipmentName)} />
          <Field label="Código técnico" value={text(order.equipmentCode)} />
          <Field label="Objeto técnico" value={text(order.technicalObjectRaw)} className="sm:col-span-2" />
          <Field label="Operação" value={text(order.operation)} />
          <Field label="Horas apontadas" value={hours(order.workedHours)} />
          <Field label="Fonte dos dados" value={text(order.source)} />
          <Field label="Lote de importação" value={text(order.importBatch)} />
          <Field label="Descrição" value={text(order.description)} className="sm:col-span-2" />
          <Field label="Causa" value={text(order.failureCause)} className="sm:col-span-2" />
          <Field label="Solução" value={text(order.solution)} className="sm:col-span-2" />
            </div>
          </m.div>
        </m.div>
      ) : null}
    </AnimatePresence>
  );
}

function Field({ label, value, className = "" }: { label: string; value: string; className?: string }) {
  return (
    <div className={className}>
      <p className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500">{label}</p>
      <p className="mt-0.5 text-sm text-zinc-100">{value}</p>
    </div>
  );
}

function text(value: string | null | undefined): string {
  const clean = (value ?? "").trim();
  return clean || "Não informado";
}

function responsible(value: string | null | undefined): string {
  return (value ?? "").trim() || "SEM RESPONSÁVEL";
}

function date(value: string | null): string {
  return value ? new Date(value).toLocaleDateString("pt-BR", { timeZone: "UTC" }) : "Não informado";
}

function hours(value: number | null): string {
  if (value === null || value === undefined) {
    return "Não informado";
  }
  return `${value.toLocaleString("pt-BR", { minimumFractionDigits: 3, maximumFractionDigits: 3 })} H`;
}
