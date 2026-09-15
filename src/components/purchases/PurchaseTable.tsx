"use client";

import { ChevronLeft, ChevronRight, PackageSearch } from "lucide-react";
import { EmptyState } from "@/components/EmptyState";
import { PurchaseStatusBadge } from "@/components/purchases/PurchaseStatusBadge";
import { PurchasePriorityBadge } from "@/components/purchases/PurchasePriorityBadge";
import type { PaginatedPurchases, PurchaseColumnAvailability, PurchaseRow } from "@/types/purchases";

type PurchaseTableProps = {
  data: PaginatedPurchases;
  variant: "pending" | "completed";
  onPageChange: (page: number) => void;
  /**
   * Colunas com dado no recorte (FASE 7). Ausente = mostra tudo, como antes.
   * Ver PurchaseColumnAvailability: em Compras Pendentes várias colunas são
   * estruturalmente vazias e viravam faixas de "—" e "0" na tela.
   */
  columns?: PurchaseColumnAvailability;
};

/** Todas visíveis — usado quando a página não informa disponibilidade. */
const ALL_COLUMNS: PurchaseColumnAvailability = {
  supplier: true,
  expectedDelivery: true,
  purchaseOrder: true,
  quantity: true,
  pendingQuantity: true,
  value: true,
  requisitionLevel: true,
  purchasingGroup: true,
  goodsGroup: true,
  requester: true
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

export function PurchaseTable({ data, variant, onPageChange, columns }: PurchaseTableProps) {
  const start = (data.page - 1) * data.pageSize;
  const isPending = variant === "pending";
  // Só Pendentes esconde coluna: em Realizadas as colunas de pedido/recebimento são
  // o assunto da aba e precisam aparecer mesmo quando um recorte vem sem valor.
  const col = isPending ? (columns ?? ALL_COLUMNS) : ALL_COLUMNS;

  return (
    <section className="panel rounded-lg p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-[11px] font-extrabold uppercase tracking-wide text-gold-deep">
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
            <table
              className={`w-full border-collapse text-left text-xs ${
                isPending ? (col.supplier ? "min-w-[1700px]" : "min-w-[1100px]") : "min-w-[1120px]"
              }`}
            >
              <thead>
                <tr className="border-b border-zinc-200 text-[10px] uppercase tracking-wide text-zinc-500">
                  {/* Prioridade abre a tabela em Compras Pendentes (TAREFA 9): é
                      o critério de fila da aba, então vem antes do status. */}
                  {isPending && <th className="px-2 py-2 font-bold">Prioridade</th>}
                  <th className="px-2 py-2 font-bold">Status</th>
                  <th className="px-2 py-2 font-bold">Requisição</th>
                  {isPending ? (
                    <>
                      <th className="px-2 py-2 font-bold">Data requisição</th>
                      {/* Idade da pendência: sem pedido não há previsão de entrega,
                          então é isto que ordena a fila para a gestão. */}
                      <th className="px-2 py-2 text-right font-bold">Dias em aberto</th>
                      {/* "Data do pedido" só aparece se ALGUMA linha do recorte tiver
                          pedido — pela regra v3.1 normalmente nenhuma tem. */}
                      {col.purchaseOrder && <th className="px-2 py-2 font-bold">Data do pedido</th>}
                    </>
                  ) : (
                    <>
                      <th className="px-2 py-2 font-bold">Pedido</th>
                      <th className="px-2 py-2 font-bold">Data pedido</th>
                    </>
                  )}
                  {col.expectedDelivery && <th className="px-2 py-2 font-bold">Previsão</th>}
                  {!isPending && (
                    <>
                      <th className="px-2 py-2 font-bold">Recebimento</th>
                      <th className="px-2 py-2 text-right font-bold">Atraso receb. (d)</th>
                    </>
                  )}
                  <th className="px-2 py-2 font-bold">Material</th>
                  <th className="px-2 py-2 font-bold">Descrição</th>
                  {col.quantity && <th className="px-2 py-2 text-right font-bold">Qtd</th>}
                  {isPending && col.pendingQuantity && <th className="px-2 py-2 text-right font-bold">Qtd pend.</th>}
                  {isPending && col.supplier && <th className="px-2 py-2 font-bold">Fornecedor</th>}
                  {col.supplier && (
                    <th className="px-2 py-2 font-bold">{isPending ? "Descrição fornecedor" : "Fornecedor"}</th>
                  )}
                  {col.requester && <th className="px-2 py-2 font-bold">Requisitante</th>}
                  {col.purchasingGroup && <th className="px-2 py-2 font-bold">Grupo Comp</th>}
                  {col.goodsGroup && <th className="px-2 py-2 font-bold">Descr grupo Merc</th>}
                  {/* Classificação N1..N4 — só na aba Compras Pendentes. */}
                  {isPending && (
                    <>
                      <th className="px-2 py-2 font-bold">N1</th>
                      <th className="px-2 py-2 font-bold">N2</th>
                      <th className="px-2 py-2 font-bold">N3</th>
                      <th className="px-2 py-2 font-bold">N4</th>
                      {/* Coluna SECUNDÁRIA (TAREFA 9): o valor cru da planilha,
                          para conferir de onde saiu a prioridade exibida. */}
                      {col.requisitionLevel && <th className="px-2 py-2 font-bold">Nível requisição</th>}
                    </>
                  )}
                  {/* "Tipo" só em Realizadas: na regra v3.1 toda pendência é
                      material da base de análise, então a coluna seria constante. */}
                  {!isPending && (
                    <>
                      <th className="px-2 py-2 text-center font-bold">Recbconcl</th>
                      <th className="px-2 py-2 font-bold">CódElim</th>
                      <th className="px-2 py-2 font-bold">Tipo</th>
                    </>
                  )}
                </tr>
              </thead>
              <tbody>
                {data.data.map((row) => (
                  <Row key={row.id} row={row} isPending={isPending} col={col} />
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

function Row({ row, isPending, col }: { row: PurchaseRow; isPending: boolean; col: PurchaseColumnAvailability }) {
  const showDelay = !isPending && row.operationalStatus === "ENTREGUE";
  return (
    <tr className="border-b border-zinc-100 text-zinc-700 transition hover:bg-gold/5">
      {isPending && (
        <td className="px-2 py-2">
          <PurchasePriorityBadge priority={row.priority} rawValue={row.priorityRaw} />
        </td>
      )}
      <td className="px-2 py-2" title={row.classificationReason}>
        <PurchaseStatusBadge status={row.operationalStatus} />
      </td>
      <td className="px-2 py-2 font-medium text-zinc-900">{row.requisitionNumber ?? "—"}</td>
      {isPending ? (
        <>
          <td className="px-2 py-2">{formatIso(row.requisitionDate)}</td>
          <td className="px-2 py-2 text-right tabular-nums">
            {row.daysOpen === null ? "—" : <DaysOpen days={row.daysOpen} />}
          </td>
          {col.purchaseOrder && <td className="px-2 py-2">{formatIso(row.purchaseOrderDate)}</td>}
        </>
      ) : (
        <>
          <td className="px-2 py-2">{row.purchaseOrderNumber ?? <span className="text-rose-600">—</span>}</td>
          <td className="px-2 py-2">{formatIso(row.purchaseOrderDate)}</td>
        </>
      )}
      {col.expectedDelivery && <td className="px-2 py-2">{formatIso(row.expectedDeliveryDate)}</td>}
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
      {col.quantity && (
        <td className="px-2 py-2 text-right tabular-nums">
          {row.quantity !== null ? `${row.quantity.toLocaleString("pt-BR")}${row.unit ? ` ${row.unit}` : ""}` : "—"}
        </td>
      )}
      {isPending && col.pendingQuantity && (
        <td className="px-2 py-2 text-right tabular-nums">
          {row.pendingQuantity !== null ? row.pendingQuantity.toLocaleString("pt-BR") : "—"}
        </td>
      )}
      {isPending && col.supplier && <td className="px-2 py-2">{row.supplierCode ?? "—"}</td>}
      {col.supplier && (
        <td className="px-2 py-2 max-w-[160px] truncate" title={row.supplierName ?? undefined}>
          {row.supplierName ?? "—"}
        </td>
      )}
      {col.requester && (
        <td className="px-2 py-2 max-w-[120px] truncate" title={row.requester ?? undefined}>
          {row.requester ?? "—"}
        </td>
      )}
      {col.purchasingGroup && <td className="px-2 py-2">{row.purchasingGroup ?? "—"}</td>}
      {col.goodsGroup && (
        <td className="px-2 py-2 max-w-[140px] truncate" title={row.goodsGroupDescription ?? undefined}>
          {row.goodsGroupDescription ?? row.goodsGroupCode ?? "—"}
        </td>
      )}
      {isPending && (
        <>
          <ClassificationCell value={row.classificationN1} />
          <ClassificationCell value={row.classificationN2} />
          <ClassificationCell value={row.classificationN3} />
          <ClassificationCell value={row.classificationN4} />
          {col.requisitionLevel && <td className="px-2 py-2 text-zinc-500">{row.priorityRaw ?? "—"}</td>}
        </>
      )}
      {!isPending && (
        <>
          <td className="px-2 py-2 text-center">
            {row.isReceiptConfirmed ? <span className="font-semibold text-emerald-600">X</span> : "—"}
          </td>
          <td className="px-2 py-2">{row.deletionCode ?? "—"}</td>
          <td className="px-2 py-2">{kindLabel(row)}</td>
        </>
      )}
    </tr>
  );
}

/** Célula de um nível de classificação (N1..N4), com truncagem e tooltip. */
/**
 * Idade da pendência. A cor não é enfeite: numa fila sem previsão de entrega, o tempo
 * parado é o único sinal de urgência, e 200 dias precisam saltar de uma tabela de 50
 * linhas. Faixas alinhadas ao uso do setor (1 mês / 3 meses).
 */
function DaysOpen({ days }: { days: number }) {
  const tone =
    days >= 90 ? "text-rose-600 font-bold" : days >= 30 ? "text-orange-600 font-semibold" : "text-zinc-700";
  return (
    <span className={tone} title={`${days.toLocaleString("pt-BR")} dia(s) desde a requisição`}>
      {days.toLocaleString("pt-BR")}
    </span>
  );
}

function ClassificationCell({ value }: { value: string | null }) {
  return (
    <td className="px-2 py-2 max-w-[130px] truncate" title={value ?? undefined}>
      {value ?? <span className="text-zinc-400">—</span>}
    </td>
  );
}

function formatIso(iso: string | null): string {
  if (!iso) {
    return "—";
  }
  return new Date(iso).toLocaleDateString("pt-BR", { timeZone: "UTC" });
}
