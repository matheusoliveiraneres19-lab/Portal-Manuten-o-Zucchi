"use client";

import { useEffect, useState, useTransition } from "react";
import dynamic from "next/dynamic";
import { usePathname, useRouter } from "next/navigation";
import { toast } from "sonner";
import { Boxes, CalendarClock, FileX2, ShoppingCart, Upload, Users } from "lucide-react";
import { ChartSkeleton } from "@/components/ChartSkeleton";
import { PurchaseKpiCards, type PurchaseKpiCard } from "@/components/purchases/PurchaseKpiCards";
import { PurchaseFilters } from "@/components/purchases/PurchaseFilters";
import { PurchaseActiveChips } from "@/components/purchases/PurchaseActiveChips";
import { PurchaseTable } from "@/components/purchases/PurchaseTable";
import { PurchaseEmptyState } from "@/components/purchases/PurchaseEmptyState";
import { PurchaseImportModal } from "@/components/purchases/PurchaseImportModal";
import {
  EMPTY_PURCHASE_FILTERS,
  purchaseFiltersToParams,
  type AppliedPurchaseFilters
} from "@/components/purchases/filters";
import { goodsGroupsToRank, requestersToRank, suppliersToRank } from "@/components/purchases/PurchaseInsightCharts";
import { usePortalDataRefresh } from "@/hooks/usePortalDataRefresh";
import type { PendingPurchasesPageData } from "@/types/purchases";

const PurchaseMonthlyCountChart = dynamic(
  () => import("@/components/purchases/PurchaseInsightCharts").then((m) => m.PurchaseMonthlyCountChart),
  { ssr: false, loading: () => <ChartSkeleton className="xl:col-span-7" /> }
);
const PurchaseRankBarChart = dynamic(
  () => import("@/components/purchases/PurchaseInsightCharts").then((m) => m.PurchaseRankBarChart),
  { ssr: false, loading: () => <ChartSkeleton className="xl:col-span-5" /> }
);

type PurchasesPendingPageProps = {
  data: PendingPurchasesPageData;
  appliedFilters: AppliedPurchaseFilters;
};

export function PurchasesPendingPage({ data, appliedFilters }: PurchasesPendingPageProps) {
  const router = useRouter();
  const pathname = usePathname();
  const [isPending, startTransition] = useTransition();
  const { refresh: refreshPortalData, isRefreshing } = usePortalDataRefresh();
  const [draft, setDraft] = useState<AppliedPurchaseFilters>(appliedFilters);
  const [importOpen, setImportOpen] = useState(false);

  const appliedSignature = JSON.stringify(appliedFilters);
  useEffect(() => {
    setDraft(appliedFilters);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [appliedSignature]);

  function navigate(filters: AppliedPurchaseFilters, page?: number) {
    const params = purchaseFiltersToParams(filters);
    if (page && page > 1) {
      params.set("page", String(page));
    }
    const query = params.toString();
    startTransition(() => router.push(query ? `${pathname}?${query}` : pathname));
  }

  function updateDraft<Key extends keyof AppliedPurchaseFilters>(key: Key, value: AppliedPurchaseFilters[Key]) {
    setDraft((current) => ({ ...current, [key]: value }));
  }

  function applyFilters() {
    navigate(draft);
    toast.success("Filtros aplicados");
  }

  function clearFilters() {
    setDraft(EMPTY_PURCHASE_FILTERS);
    startTransition(() => router.push(pathname));
    toast("Filtros limpos");
  }

  function removeChip(key: keyof AppliedPurchaseFilters, value?: string) {
    let next: AppliedPurchaseFilters;
    if (key === "startDate") {
      next = { ...appliedFilters, startDate: "", endDate: "" };
    } else if (value !== undefined && Array.isArray(appliedFilters[key])) {
      next = { ...appliedFilters, [key]: (appliedFilters[key] as string[]).filter((item) => item !== value) };
    } else {
      next = { ...appliedFilters, [key]: "" };
    }
    setDraft(next);
    navigate(next);
  }

  const pendingCount = data.purchases.total;
  const cards: PurchaseKpiCard[] = [
    // O card "Valor Pendente" saiu da tela; data.pendingValue continua vindo do
    // service para o log de auditoria e para os KPIs canônicos de compras.
    { title: "Requisições Pendentes", value: int(pendingCount), description: "Requisições Y01 sem pedido de compra", icon: FileX2, tone: "gold" },
    { title: "Materiais Pendentes", value: int(data.materialsPending), description: "Materiais distintos sem pedido", icon: Boxes, tone: "blue" },
    { title: "Requisitantes", value: int(data.requestersPending), description: "Requisitantes com pendências", icon: Users, tone: "blue" },
    { title: "Mais Antiga", value: oldestLabel(data.oldestPendingDate), description: oldestDescription(data.oldestPendingDate), icon: CalendarClock, tone: "red" }
  ];

  const isEmpty = data.source === "empty";

  return (
    <section className={`space-y-4 text-champagne transition ${isPending || isRefreshing ? "opacity-70" : ""}`}>
      <header className="relative overflow-hidden rounded-lg border border-gold/20 bg-[#070808] p-5 shadow-premium sm:p-6">
        <div className="login-marble-bg absolute inset-0 opacity-80" />
        <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(0,0,0,0.78),rgba(0,0,0,0.44)),radial-gradient(circle_at_88%_8%,rgba(196,154,69,0.15),transparent_22rem)]" />
        <div className="relative z-10">
          <div className="mb-3 flex flex-wrap items-center gap-3 text-gold">
            <ShoppingCart className="h-5 w-5" />
            <span className="rounded-md border border-gold/40 bg-gold/10 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.24em] text-champagne/80">
              Dados importados de planilha SAP/Fiori
            </span>
          </div>
          <h1 className="font-serif text-3xl leading-tight text-white sm:text-4xl">Compras Pendentes</h1>
          <p className="mt-2 max-w-3xl text-sm leading-relaxed text-zinc-300 sm:text-base">
            Apenas requisições de compra Y01 que ainda não viraram pedido de compra. Itens com
            pedido, atrasados, serviços (Y0008), regularizações (Y04) e ignorados não aparecem aqui.
          </p>
        </div>
      </header>

      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={() => setImportOpen(true)} className="inline-flex h-10 items-center gap-2 rounded-lg border border-gold/55 bg-gold/15 px-4 text-sm font-bold text-gold transition hover:bg-gold/25">
          <Upload className="h-4 w-4" /> Importar Excel
        </button>
        <button type="button" onClick={() => refreshPortalData({ toastMessage: "Dados atualizados" })} className="inline-flex h-10 items-center gap-2 rounded-lg border border-gold/20 px-4 text-sm font-semibold text-zinc-300 transition hover:border-gold/40 hover:text-white">
          Atualizar dados
        </button>
        <button type="button" onClick={clearFilters} className="inline-flex h-10 items-center gap-2 rounded-lg border border-gold/20 px-4 text-sm font-semibold text-zinc-300 transition hover:border-gold/40 hover:text-white">
          Limpar filtros
        </button>
      </div>

      <PurchaseFilters
        draft={draft}
        options={data.filterOptions}
        isPending={isPending || isRefreshing}
        onChange={updateDraft}
        onApply={applyFilters}
        onClear={clearFilters}
      />

      <PurchaseActiveChips filters={appliedFilters} onRemove={removeChip} />

      {isEmpty ? (
        <PurchaseEmptyState onImport={() => setImportOpen(true)} />
      ) : (
        <>
          <PurchaseKpiCards cards={cards} />

          <section className="grid grid-cols-1 gap-3 xl:grid-cols-12">
            <PurchaseMonthlyCountChart
              className="xl:col-span-7"
              title="Requisições pendentes por mês"
              subtitle="Pela data da requisição."
              color="#c49a45"
              points={data.pendingByMonth}
            />
            <PurchaseRankBarChart
              className="xl:col-span-5"
              title="Top fornecedores pendentes"
              subtitle="Fornecedores com mais requisições sem pedido."
              color="#7b551f"
              items={suppliersToRank(data.topPendingSuppliers)}
              emptyDescription="Nenhuma requisição pendente."
            />
            <PurchaseRankBarChart
              className="xl:col-span-6"
              title="Pendências por grupo de mercadoria"
              subtitle="Requisições pendentes por grupo."
              color="#0f4d68"
              items={goodsGroupsToRank(data.pendingByGoodsGroup)}
            />
            <PurchaseRankBarChart
              className="xl:col-span-6"
              title="Requisitantes com mais pendências"
              color="#7b551f"
              items={requestersToRank(data.topRequesters)}
            />
          </section>

          <PurchaseTable data={data.purchases} variant="pending" onPageChange={(page) => navigate(appliedFilters, page)} />
        </>
      )}

      <PurchaseImportModal open={importOpen} onClose={() => setImportOpen(false)} onImported={() => refreshPortalData({ toastMessage: null })} />
    </section>
  );
}

function int(value: number): string {
  return value.toLocaleString("pt-BR");
}

/** Data (curta) da requisição pendente mais antiga, ou "—". */
function oldestLabel(iso: string | null): string {
  if (!iso) {
    return "—";
  }
  return new Date(iso).toLocaleDateString("pt-BR", { timeZone: "UTC" });
}

/** Descrição do card "Mais Antiga": há quantos dias a requisição está pendente. */
function oldestDescription(iso: string | null): string {
  if (!iso) {
    return "Sem requisições pendentes";
  }
  const days = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000));
  return days === 0 ? "Aberta hoje" : `Aberta há ${days.toLocaleString("pt-BR")} dia(s)`;
}
