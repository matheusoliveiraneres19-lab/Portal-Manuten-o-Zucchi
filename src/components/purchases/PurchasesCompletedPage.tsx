"use client";

import { useEffect, useState, useTransition } from "react";
import dynamic from "next/dynamic";
import { usePathname, useRouter } from "next/navigation";
import { toast } from "sonner";
import { ClipboardCheck, Repeat2, ShoppingCart, Upload, Wallet, Wrench } from "lucide-react";
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
import { goodsGroupsToRank } from "@/components/purchases/PurchaseInsightCharts";
import { usePortalDataRefresh } from "@/hooks/usePortalDataRefresh";
import { formatCurrency } from "@/utils/formatters";
import type { CompletedPurchasesPageData } from "@/types/purchases";

const PurchaseMonthlyCountChart = dynamic(
  () => import("@/components/purchases/PurchaseInsightCharts").then((m) => m.PurchaseMonthlyCountChart),
  { ssr: false, loading: () => <ChartSkeleton className="xl:col-span-6" /> }
);
const PurchaseRankBarChart = dynamic(
  () => import("@/components/purchases/PurchaseInsightCharts").then((m) => m.PurchaseRankBarChart),
  { ssr: false, loading: () => <ChartSkeleton className="xl:col-span-6" /> }
);
const PurchaseProcessTimeChart = dynamic(
  () => import("@/components/purchases/PurchaseProcessTimeChart").then((m) => m.PurchaseProcessTimeChart),
  { ssr: false, loading: () => <ChartSkeleton className="xl:col-span-12" /> }
);

type PurchasesCompletedPageProps = {
  data: CompletedPurchasesPageData;
  appliedFilters: AppliedPurchaseFilters;
};

export function PurchasesCompletedPage({ data, appliedFilters }: PurchasesCompletedPageProps) {
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

  const kpis = data.kpis;
  const cards: PurchaseKpiCard[] = [
    { title: "Materiais Comprados", value: int(kpis.purchased), description: "Y01 com pedido de compra", icon: ShoppingCart, tone: "gold" },
    // "Materiais Entregues" já engloba os recebidos com atraso (kpis.deliveredLate é
    // um subconjunto de kpis.delivered no service) — o card separado de atraso e o de
    // ignorados saíram da tela, mas os dois KPIs seguem calculados para auditoria.
    { title: "Materiais Entregues", value: int(kpis.delivered), description: "Recebimento lançado + Recbconcl “X”", icon: ClipboardCheck, tone: "green" },
    { title: "Regularizações Y04", value: int(kpis.regularizations), description: `${int(kpis.regularizationsDelivered)} já recebidas`, icon: Repeat2, tone: "red" },
    { title: "Serviços (Y0008)", value: int(kpis.services), description: `${int(kpis.servicesDelivered)} já recebidos`, icon: Wrench, tone: "gold" },
    { title: "Valor comprado", value: formatCurrency(kpis.purchasedValue), description: "Total com pedido no período", icon: Wallet, tone: "gold" }
  ];

  // Sem dados por AUSENCIA de importacao ou por FALHA de consulta: a tela e a
  // mesma, mas a mensagem e a acao mudam (ver PageDataSource).
  const isUnavailable = data.source === "unavailable";
  const isEmpty = data.source !== "database";

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
          <h1 className="font-serif text-3xl leading-tight text-white sm:text-4xl">Compras Realizadas</h1>
          <p className="mt-2 max-w-3xl text-sm leading-relaxed text-zinc-300 sm:text-base">
            Itens Y01 com pedido de compra (comprados): entregues, atrasados e em trânsito, por mês,
            fornecedor e grupo de mercadoria. Regularizações Y04, serviços e itens fora do relatório
            ficam separados.
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
        <PurchaseEmptyState onImport={() => setImportOpen(true)} unavailable={isUnavailable} />
      ) : (
        <>
          {/* 5 cards: linha única só a partir de 2xl — abaixo disso a coluna de texto
              fica estreita e títulos longos ("Regularizações Y04") estouram o card. */}
          <PurchaseKpiCards
            cards={cards}
            className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-5"
          />

          <section className="grid grid-cols-1 gap-3 xl:grid-cols-12">
            <PurchaseMonthlyCountChart
              className="xl:col-span-6"
              title="Recebidos por mês"
              subtitle="Itens recebidos pela data de recebimento."
              color="#4ade80"
              points={data.receivedByMonth}
            />
            <PurchaseRankBarChart
              className="xl:col-span-6"
              title="Recebidos por grupo de mercadoria"
              color="#0f4d68"
              items={goodsGroupsToRank(data.receivedByGoodsGroup)}
            />
            <PurchaseRankBarChart
              className="xl:col-span-6"
              title="Regularização Y04 por grupo de mercadoria"
              color="#c084fc"
              items={goodsGroupsToRank(data.regularizationByGoodsGroup)}
            />
            <PurchaseProcessTimeChart className="xl:col-span-6" times={data.processTimes} />
          </section>

          <PurchaseTable data={data.purchases} variant="completed" onPageChange={(page) => navigate(appliedFilters, page)} />
        </>
      )}

      <PurchaseImportModal open={importOpen} onClose={() => setImportOpen(false)} onImported={() => refreshPortalData({ toastMessage: null })} />
    </section>
  );
}

function int(value: number): string {
  return value.toLocaleString("pt-BR");
}
