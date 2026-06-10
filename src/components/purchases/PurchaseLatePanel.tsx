"use client";

import { AlarmClock, CalendarClock } from "lucide-react";
import { EmptyState } from "@/components/EmptyState";
import { formatCurrency } from "@/utils/formatters";
import type { LatePurchaseRow, LatePurchasesResult } from "@/types/purchases";

/** Dois blocos lado a lado: atrasados em aberto e recebidos com atraso (TAREFA 6.A/B). */
export function PurchaseLatePanel({ late }: { late: LatePurchasesResult }) {
  return (
    <section className="grid grid-cols-1 gap-3 xl:grid-cols-2">
      <LateColumn
        title="Atrasados em aberto"
        subtitle="Previsão vencida e ainda sem recebimento/MIGO"
        icon={AlarmClock}
        tone="danger"
        rows={late.lateOpen}
      />
      <LateColumn
        title="Recebidos com atraso"
        subtitle="Recebimento/MIGO posterior à previsão de entrega"
        icon={CalendarClock}
        tone="warning"
        rows={late.lateReceived}
      />
    </section>
  );
}

function LateColumn({
  title,
  subtitle,
  icon: Icon,
  tone,
  rows
}: {
  title: string;
  subtitle: string;
  icon: typeof AlarmClock;
  tone: "danger" | "warning";
  rows: LatePurchaseRow[];
}) {
  const accent = tone === "danger" ? "text-rose-600" : "text-amber-600";

  return (
    <article className="panel rounded-lg p-4">
      <div className="mb-2 flex items-center gap-2">
        <Icon className={`h-4 w-4 ${accent}`} />
        <div>
          <h3 className="text-[11px] font-extrabold uppercase tracking-wide text-[#5a3d12]">{title}</h3>
          <p className="text-[11px] text-zinc-500">{subtitle}</p>
        </div>
        <span className="ml-auto rounded-full bg-zinc-100 px-2 py-0.5 text-[11px] font-bold text-zinc-600">{rows.length}</span>
      </div>

      {rows.length === 0 ? (
        <EmptyState title="Nenhum atraso" description="Sem pedidos nesta condição no período." />
      ) : (
        <ul className="max-h-72 space-y-1.5 overflow-y-auto pr-1">
          {rows.map((row) => (
            <li key={row.id} className="flex items-center justify-between gap-3 rounded-md border border-zinc-100 bg-white/60 px-3 py-2">
              <div className="min-w-0">
                <p className="truncate text-xs font-semibold text-zinc-900" title={row.itemDescription}>
                  {row.itemDescription}
                </p>
                <p className="truncate text-[11px] text-zinc-500">
                  {row.purchaseOrderNumber ? `Pedido ${row.purchaseOrderNumber}` : "Sem pedido"} · {row.supplierName ?? "Fornecedor n/d"}
                </p>
              </div>
              <div className="shrink-0 text-right">
                <p className={`text-xs font-bold ${accent}`}>{row.delayDays !== null ? `${row.delayDays} d` : "—"}</p>
                <p className="text-[11px] text-zinc-500">{row.value !== null ? formatCurrency(row.value) : "—"}</p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </article>
  );
}
