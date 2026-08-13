"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, History, Loader2 } from "lucide-react";
import { LUBRICANT_CATEGORY_LABELS } from "@/utils/lubricants-normalizer";
import type { LubricantMovementCategory, LubricantMovementsResult } from "@/types/lubricants";

export type MovementHistoryFilters = {
  startDate: string;
  endDate: string;
  code: string;
  category: string;
  unit: string;
  search: string;
};

type LubricantMovementsHistoryProps = {
  initial: LubricantMovementsResult;
  filters: MovementHistoryFilters;
};

const PAGE_SIZES = [25, 50, 100];

const categoryBadge: Record<LubricantMovementCategory, string> = {
  ENTRADA: "bg-emerald-100 text-emerald-700",
  SAIDA: "bg-rose-100 text-rose-700",
  ESTOQUE_INICIAL: "bg-sky-100 text-sky-700",
  AJUSTE: "bg-amber-100 text-amber-700"
};

export function LubricantMovementsHistory({ initial, filters }: LubricantMovementsHistoryProps) {
  const [result, setResult] = useState(initial);
  const [pageSize, setPageSize] = useState(initial.pageSize);
  const [loading, setLoading] = useState(false);
  const requestRef = useRef(0);
  const filtersSig = JSON.stringify(filters);

  // Quando os filtros (re)aplicados mudam, o servidor entrega um novo "initial".
  useEffect(() => {
    setResult(initial);
    setPageSize(initial.pageSize);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtersSig]);

  function load(nextPage: number, nextSize: number) {
    const requestId = requestRef.current + 1;
    requestRef.current = requestId;
    setLoading(true);

    const params = new URLSearchParams();
    if (filters.startDate) params.set("startDate", filters.startDate);
    if (filters.endDate) params.set("endDate", filters.endDate);
    if (filters.code) params.set("code", filters.code);
    if (filters.category) params.set("category", filters.category);
    if (filters.unit) params.set("unit", filters.unit);
    if (filters.search) params.set("search", filters.search);
    params.set("page", String(nextPage));
    params.set("pageSize", String(nextSize));

    fetch(`/api/lubricants/movements?${params.toString()}`)
      .then((response) => {
        if (!response.ok) {
          throw new Error("request failed");
        }
        return response.json() as Promise<LubricantMovementsResult>;
      })
      .then((data) => {
        if (requestRef.current === requestId) {
          setResult(data);
          setPageSize(data.pageSize);
        }
      })
      .finally(() => {
        if (requestRef.current === requestId) {
          setLoading(false);
        }
      });
  }

  function changePage(next: number) {
    if (next < 1 || next > result.totalPages || next === result.page) {
      return;
    }
    load(next, pageSize);
  }

  function changePageSize(next: number) {
    setPageSize(next);
    load(1, next);
  }

  return (
    <article className="panel overflow-hidden rounded-lg">
      <div className="flex flex-col gap-2 border-b border-[#3e311d1f] px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2 text-[11px] font-extrabold uppercase tracking-wide text-gold-deep">
          <History className="h-4 w-4" />
          Histórico de movimentações
          {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin text-gold" /> : null}
        </div>
        <div className="flex items-center gap-2 text-[11px] text-zinc-600">
          <span>{result.total.toLocaleString("pt-BR")} registros</span>
          <select
            value={pageSize}
            onChange={(event) => changePageSize(Number(event.target.value))}
            className="h-8 rounded-md border border-zinc-300 bg-white px-2 text-xs text-zinc-700 outline-none focus:border-gold"
          >
            {PAGE_SIZES.map((size) => (
              <option key={size} value={size}>
                {size} / página
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="max-h-[560px] overflow-auto">
        <table className="w-full min-w-[920px] border-collapse text-left text-xs">
          <thead className="sticky top-0 z-10 bg-surface text-[10px] uppercase tracking-wide text-gold-deep">
            <tr>
              <Th>Data</Th>
              <Th>Hora</Th>
              <Th>Código</Th>
              <Th>Descrição</Th>
              <Th>Tipo</Th>
              <Th>Texto movimento</Th>
              <Th className="text-right">Qtd.</Th>
              <Th className="text-center">Un.</Th>
              <Th>Centro</Th>
              <Th>Depósito</Th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-200/70">
            {result.data.length === 0 ? (
              <tr>
                <td colSpan={10} className="px-4 py-10 text-center text-zinc-500">
                  Nenhuma movimentação no período/filtro.
                </td>
              </tr>
            ) : (
              result.data.map((movement) => {
                const isOutput = movement.movementCategory === "SAIDA";
                return (
                  <tr
                    key={movement.id}
                    className={`transition hover:bg-gold/[0.06] ${isOutput ? "bg-rose-50/40" : "bg-white/40"}`}
                  >
                    <td className="whitespace-nowrap px-3 py-2 text-zinc-700">{formatDate(movement.movementDate)}</td>
                    <td className="whitespace-nowrap px-3 py-2 text-zinc-500">{movement.movementTime ?? "—"}</td>
                    <td className="px-3 py-2 font-mono text-[11px] font-semibold text-petroleum">{movement.code}</td>
                    <td className="max-w-[200px] truncate px-3 py-2 text-zinc-800" title={movement.description}>
                      {movement.description}
                    </td>
                    <td className="px-3 py-2">
                      <span
                        className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${categoryBadge[movement.movementCategory]}`}
                      >
                        {LUBRICANT_CATEGORY_LABELS[movement.movementCategory]}
                      </span>
                    </td>
                    <td className="max-w-[160px] truncate px-3 py-2 text-zinc-600" title={movement.movementTypeText ?? ""}>
                      {movement.movementTypeCode ? `${movement.movementTypeCode} · ` : ""}
                      {movement.movementTypeText ?? "—"}
                    </td>
                    <td
                      className={`px-3 py-2 text-right tabular-nums font-semibold ${isOutput ? "text-danger" : "text-emerald-700"}`}
                    >
                      {movement.quantity.toLocaleString("pt-BR", { maximumFractionDigits: 2 })}
                    </td>
                    <td className="px-3 py-2 text-center text-zinc-500">{movement.unit}</td>
                    <td className="px-3 py-2 text-zinc-500">{movement.center ?? "—"}</td>
                    <td className="px-3 py-2 text-zinc-500">{movement.storageLocation ?? "—"}</td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between border-t border-[#3e311d1f] px-4 py-2.5 text-[11px] text-zinc-600">
        <span>
          Página {result.page} de {result.totalPages}
        </span>
        <div className="flex items-center gap-1">
          <PageButton disabled={result.page <= 1 || loading} onClick={() => changePage(result.page - 1)}>
            <ChevronLeft className="h-4 w-4" />
          </PageButton>
          <PageButton disabled={result.page >= result.totalPages || loading} onClick={() => changePage(result.page + 1)}>
            <ChevronRight className="h-4 w-4" />
          </PageButton>
        </div>
      </div>
    </article>
  );
}

function Th({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <th className={`whitespace-nowrap px-3 py-2 font-bold ${className}`}>{children}</th>;
}

function PageButton({
  children,
  disabled,
  onClick
}: {
  children: React.ReactNode;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="grid h-8 w-8 place-items-center rounded-md border border-zinc-300 text-zinc-600 transition hover:border-gold hover:text-gold-deep disabled:cursor-not-allowed disabled:opacity-40"
    >
      {children}
    </button>
  );
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("pt-BR", { timeZone: "UTC" });
}
