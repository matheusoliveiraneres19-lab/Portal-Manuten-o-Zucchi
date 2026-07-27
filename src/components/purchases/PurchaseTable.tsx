"use client";

import { ChevronLeft, ChevronRight, PackageSearch } from "lucide-react";
import { EmptyState } from "@/components/EmptyState";
import { PurchaseStatusBadge } from "@/components/purchases/PurchaseStatusBadge";
import { formatCurrency } from "@/utils/formatters";
import type { PaginatedPurchases, PurchaseRow } from "@/types/purchases";

type PurchaseTableProps = {
  data: PaginatedPurchases;
  variant: "pending" | "completed";
  onPageChange: (page: number) => void;
};

/** Rótulo do "Tipo" do item (por natureza). */
function kindLabel(row: PurchaseRow): string {
  switch (row.purchaseNature) {
    case "Y0008_SERVICO":
      return "Serviço";
    case "Y04_REGULARIZACAO":
      return "Regularização";
    case "IGNORADO":
      return "Ignorado";
    default:
      return "Material";
  }
}

export function PurchaseTable({ data, variant, onPageChange }: PurchaseTableProps) {
  const start = (data.page - 1) * data.pageSize;
  const isPending = variant === "pending";

  return (
    <section className="panel rounded-lg p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-[11px] font-extrabold uppercase tracking-wide text-[#5a3d12]">
          {isPending ? "Compras pendentes" : "Compras realizadas"}
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
            <table className="w-full min-w-[1120px] border-collapse text-left text-xs">
              <thead>
                <tr className="border-b border-zinc-200 text-[10px] uppercase tracking-wide text-zinc-500">
                  <th className="px-2 py-2 font-bold">Status</th>
                  <th className="px-2 py-2 font-bold">Requisição</th>
                  {isPending ? (
                    <th className="px-2 py-2 font-bold">Data requisição</th>
                  ) : (
                    <>
                      <th className="px-2 py-2 font-bold">Pedido</th>
                      <th className="px-2 py-2 font-bold">Data pedido</th>
                    </>
                  )}
                  <th className="px-2 py-2 font-bold">Previsão</th>
                  {!isPending && (
                    <>
                      <th className="px-2 py-2 font-bold">Recebimento</th>
                      <th className="px-2 py-2 text-right font-bold">Atraso receb. (d)</th>
                    </>
                  )}
                  <th className="px-2 py-2 font-bold">Material</th>
                  <th className="px-2 py-2 font-bold">Descrição</th>
                  <th className="px-2 py-2 text-right font-bold">Qtd</th>
                  {isPending && <th className="px-2 py-2 text-right font-bold">Qtd pend.</th>}
                  <th className="px-2 py-2 font-bold">Fornecedor</th>
                  <th className="px-2 py-2 font-bold">Requisitante</th>
                  <th className="px-2 py-2 font-bold">Grupo Comp</th>
                  <th className="px-2 py-2 font-bold">Grupo Merc</th>
                  {isPending ? (
                    <th className="px-2 py-2 text-right font-bold">Valor pendente</th>
                  ) : (
                    <>
                      <th className="px-2 py-2 text-center font-bold">Recbconcl</th>
                      <th className="px-2 py-2 font-bold">CódElim</th>
                    </>
                  )}
                  <th className="px-2 py-2 font-bold">Tipo</th>
                </tr>
              </thead>
              <tbody>
                {data.data.map((row) => (
                  <Row key={row.id} row={row} isPending={isPending} />
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

function Row({ row, isPending }: { row: PurchaseRow; isPending: boolean }) {
  const showDelay = !isPending && row.operationalStatus === "ENTREGUE";
  return (
    <tr className="border-b border-zinc-100 text-zinc-700 transition hover:bg-gold/5">
      <td className="px-2 py-2" title={row.classificationReason}>
        <PurchaseStatusBadge status={row.operationalStatus} />
      </td>
      <td className="px-2 py-2 font-medium text-zinc-900">{row.requisitionNumber ?? "—"}</td>
      {isPending ? (
        <td className="px-2 py-2">{formatIso(row.requisitionDate)}</td>
      ) : (
        <>
          <td className="px-2 py-2">{row.purchaseOrderNumber ?? <span className="text-rose-600">—</span>}</td>
          <td className="px-2 py-2">{formatIso(row.purchaseOrderDate)}</td>
        </>
      )}
      <td className="px-2 py-2">{formatIso(row.expectedDeliveryDate)}</td>
      {!isPending && (
        <>
          <td className="px-2 py-2">{formatIso(row.receiptDate)}</td>
          <td className="px-2 py-2 text-right tabular-nums">
            {showDelay && row.delayDays !== null ? <span className="font-semibold text-orange-600">{row.delayDays}</span> : "—"}
          </td>
        </>
      )}
      <td className="px-2 py-2">{row.materialCode ?? "—"}</td>
      <td className="px-2 py-2 max-w-[220px] truncate" title={row.itemDescription}>
        {row.itemDescription}
      </td>
      <td className="px-2 py-2 text-right tabular-nums">
        {row.quantity !== null ? `${row.quantity.toLocaleString("pt-BR")}${row.unit ? ` ${row.unit}` : ""}` : "—"}
      </td>
      {isPending && (
        <td className="px-2 py-2 text-right tabular-nums">
          {row.pendingQuantity !== null ? row.pendingQuantity.toLocaleString("pt-BR") : "—"}
        </td>
      )}
      <td className="px-2 py-2 max-w-[160px] truncate" title={row.supplierName ?? undefined}>
        {row.supplierName ?? "—"}
      </td>
      <td className="px-2 py-2 max-w-[120px] truncate" title={row.requester ?? undefined}>
        {row.requester ?? "—"}
      </td>
      <td className="px-2 py-2">{row.purchasingGroup ?? "—"}</td>
      <td className="px-2 py-2 max-w-[140px] truncate" title={row.goodsGroupDescription ?? undefined}>
        {row.goodsGroupDescription ?? row.goodsGroupCode ?? "—"}
      </td>
      {isPending ? (
        <td className="px-2 py-2 text-right tabular-nums font-medium text-zinc-900">
          {row.value !== null ? formatCurrency(row.value) : "—"}
        </td>
      ) : (
        <>
          <td className="px-2 py-2 text-center">
            {row.isReceiptConfirmed ? <span className="font-semibold text-emerald-600">X</span> : "—"}
          </td>
          <td className="px-2 py-2">{row.deletionCode ?? "—"}</td>
        </>
      )}
      <td className="px-2 py-2">{kindLabel(row)}</td>
    </tr>
  );
}

function formatIso(iso: string | null): string {
  if (!iso) {
    return "—";
  }
  return new Date(iso).toLocaleDateString("pt-BR", { timeZone: "UTC" });
}
