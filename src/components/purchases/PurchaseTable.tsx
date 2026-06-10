"use client";

import { ChevronLeft, ChevronRight, PackageSearch } from "lucide-react";
import { EmptyState } from "@/components/EmptyState";
import { formatCurrency } from "@/utils/formatters";
import { ITEM_NATURE_LABELS } from "@/utils/purchases-normalizer";
import type { ItemNature, PaginatedPurchases, PurchaseRow } from "@/types/purchases";

type PurchaseTableProps = {
  data: PaginatedPurchases;
  variant: "pending" | "completed";
  onPageChange: (page: number) => void;
};

const STATUS_TONE: Record<string, string> = {
  "Sem pedido": "bg-zinc-200 text-zinc-700",
  Atrasado: "bg-rose-100 text-rose-700",
  "Recebido com atraso": "bg-amber-100 text-amber-800",
  Recebido: "bg-emerald-100 text-emerald-700",
  "MIRO lançada": "bg-emerald-100 text-emerald-700",
  "Pedido em aberto": "bg-sky-100 text-sky-700"
};

export function PurchaseTable({ data, variant, onPageChange }: PurchaseTableProps) {
  const start = (data.page - 1) * data.pageSize;

  return (
    <section className="panel rounded-lg p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-[11px] font-extrabold uppercase tracking-wide text-[#5a3d12]">
          {variant === "pending" ? "Compras pendentes" : "Compras realizadas"}
        </h3>
        <span className="text-[11px] text-zinc-500">
          {data.total.toLocaleString("pt-BR")} registro(s){data.total > 0 ? ` — página ${data.page}/${data.totalPages}` : ""}
        </span>
      </div>

      {data.data.length === 0 ? (
        <EmptyState
          icon={PackageSearch}
          title="Nenhum registro encontrado"
          description="Ajuste os filtros ou importe a planilha de compras."
        />
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1100px] border-collapse text-left text-xs">
              <thead>
                <tr className="border-b border-zinc-200 text-[10px] uppercase tracking-wide text-zinc-500">
                  <th className="px-2 py-2 font-bold">Requisição</th>
                  <th className="px-2 py-2 font-bold">Pedido</th>
                  <th className="px-2 py-2 font-bold">Fornecedor</th>
                  <th className="px-2 py-2 font-bold">Material</th>
                  <th className="px-2 py-2 font-bold">Descrição</th>
                  <th className="px-2 py-2 text-right font-bold">Qtd</th>
                  <th className="px-2 py-2 text-right font-bold">Valor</th>
                  {variant === "pending" ? (
                    <>
                      <th className="px-2 py-2 font-bold">Previsão</th>
                      <th className="px-2 py-2 text-right font-bold">Atraso (d)</th>
                    </>
                  ) : (
                    <>
                      <th className="px-2 py-2 font-bold">Data pedido</th>
                      <th className="px-2 py-2 font-bold">Recebimento</th>
                    </>
                  )}
                  <th className="px-2 py-2 font-bold">Status</th>
                  <th className="px-2 py-2 text-center font-bold">MIGO</th>
                  <th className="px-2 py-2 text-center font-bold">MIRO</th>
                  <th className="px-2 py-2 font-bold">Grupo Comp</th>
                  <th className="px-2 py-2 font-bold">Categoria</th>
                  <th className="px-2 py-2 font-bold">Natureza</th>
                  <th className="px-2 py-2 font-bold">Requisitante</th>
                </tr>
              </thead>
              <tbody>
                {data.data.map((row) => (
                  <Row key={row.id} row={row} variant={variant} />
                ))}
              </tbody>
            </table>
          </div>

          <div className="mt-3 flex items-center justify-between gap-2 border-t border-zinc-200 pt-3 text-xs text-zinc-500">
            <span>
              {start + 1}–{Math.min(start + data.pageSize, data.total)} de {data.total.toLocaleString("pt-BR")}
            </span>
            <div className="flex items-center gap-1">
              <button
                type="button"
                disabled={data.page <= 1}
                onClick={() => onPageChange(data.page - 1)}
                className="inline-flex h-8 items-center gap-1 rounded-md border border-zinc-300 px-2 font-semibold text-zinc-700 transition hover:border-gold/50 disabled:cursor-not-allowed disabled:opacity-40"
              >
                <ChevronLeft className="h-4 w-4" /> Anterior
              </button>
              <button
                type="button"
                disabled={data.page >= data.totalPages}
                onClick={() => onPageChange(data.page + 1)}
                className="inline-flex h-8 items-center gap-1 rounded-md border border-zinc-300 px-2 font-semibold text-zinc-700 transition hover:border-gold/50 disabled:cursor-not-allowed disabled:opacity-40"
              >
                Próxima <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        </>
      )}
    </section>
  );
}

function Row({ row, variant }: { row: PurchaseRow; variant: "pending" | "completed" }) {
  return (
    <tr className="border-b border-zinc-100 text-zinc-700 transition hover:bg-gold/5">
      <td className="px-2 py-2 font-medium text-zinc-900">{row.requisitionNumber ?? "—"}</td>
      <td className="px-2 py-2">{row.purchaseOrderNumber ?? <span className="text-rose-600">—</span>}</td>
      <td className="px-2 py-2 max-w-[160px] truncate" title={row.supplierName ?? undefined}>
        {row.supplierName ?? "—"}
      </td>
      <td className="px-2 py-2">{row.materialCode ?? "—"}</td>
      <td className="px-2 py-2 max-w-[220px] truncate" title={row.itemDescription}>
        {row.itemDescription}
      </td>
      <td className="px-2 py-2 text-right tabular-nums">
        {row.quantity !== null ? `${row.quantity.toLocaleString("pt-BR")}${row.unit ? ` ${row.unit}` : ""}` : "—"}
      </td>
      <td className="px-2 py-2 text-right tabular-nums font-medium text-zinc-900">
        {row.value !== null ? formatCurrency(row.value) : "—"}
      </td>
      {variant === "pending" ? (
        <>
          <td className="px-2 py-2">{formatIso(row.expectedDeliveryDate)}</td>
          <td className="px-2 py-2 text-right tabular-nums">
            {row.delayDays !== null && (row.isLateOpen || row.isLateReceived) ? (
              <span className="font-semibold text-rose-600">{row.delayDays}</span>
            ) : (
              "—"
            )}
          </td>
        </>
      ) : (
        <>
          <td className="px-2 py-2">{formatIso(row.purchaseOrderDate)}</td>
          <td className="px-2 py-2">{formatIso(row.receiptDate)}</td>
        </>
      )}
      <td className="px-2 py-2">
        <span className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold ${STATUS_TONE[row.statusLabel] ?? "bg-zinc-100 text-zinc-600"}`}>
          {row.statusLabel}
        </span>
      </td>
      <td className="px-2 py-2 text-center">{row.hasMigo ? "✓" : "—"}</td>
      <td className="px-2 py-2 text-center">{row.hasMiro ? "✓" : "—"}</td>
      <td className="px-2 py-2">{row.purchasingGroup ?? "—"}</td>
      <td className="px-2 py-2 max-w-[140px] truncate" title={row.goodsGroupDescription ?? undefined}>
        {row.goodsGroupDescription ?? row.goodsGroupCode ?? "—"}
      </td>
      <td className="px-2 py-2">{ITEM_NATURE_LABELS[row.itemNature as ItemNature]}</td>
      <td className="px-2 py-2 max-w-[120px] truncate" title={row.requester ?? undefined}>
        {row.requester ?? "—"}
      </td>
    </tr>
  );
}

function formatIso(iso: string | null): string {
  if (!iso) {
    return "—";
  }
  return new Date(iso).toLocaleDateString("pt-BR", { timeZone: "UTC" });
}
