"use client";

import { useEffect, useState, useTransition } from "react";
import dynamic from "next/dynamic";
import { usePathname, useRouter } from "next/navigation";
import { toast } from "sonner";
import { BadgeCheck, Boxes, ClipboardCheck, Clock, Receipt, Repeat2, ShoppingCart, Truck, Upload, Wallet } from "lucide-react";
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
import { usePortalDataRefresh } from "@/hooks/usePortalDataRefresh";
import { formatCurrency } from "@/utils/formatters";
import type { CompletedPurchasesPageData } from "@/types/purchases";

const PurchaseMonthlyChart = dynamic(
  () => import("@/components/purchases/PurchaseMonthlyChart").then((m) => m.PurchaseMonthlyChart),
  { ssr: false, loading: () => <ChartSkeleton className="xl:col-span-7" /> }
);
const PurchaseCategoryChart = dynamic(
  () => import("@/components/purchases/PurchaseCategoryChart").then((m) => m.PurchaseCategoryChart),
  { ssr: false, loading: () => <ChartSkeleton className="xl:col-span-5" /> }
);
const PurchaseTypeChart = dynamic(
  () => import("@/components/purchases/PurchaseTypeChart").then((m) => m.PurchaseTypeChart),
  { ssr: false, loading: () => <ChartSkeleton className="xl:col-span-6" /> }
);
const PurchaseNatureChart = dynamic(
  () => import("@/components/purchases/PurchaseNatureChart").then((m) => m.PurchaseNatureChart),
  { ssr: false, loading: () => <ChartSkeleton className="xl:col-span-6" /> }
);
const PurchaseSuppliersChart = dynamic(
  () => import("@/components/purchases/PurchaseSuppliersChart").then((m) => m.PurchaseSuppliersChart),
  { ssr: false, loading: () => <ChartSkeleton className="xl:col-span-7" /> }
);
const PurchaseProcessTimeChart = dynamic(
  () => import("@/components/purchases/PurchaseProcessTimeChart").then((m) => m.PurchaseProcessTimeChart),
  { ssr: false, loading: () => <ChartSkeleton className="xl:col-span-5" /> }
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
    { title: "Valor total comprado", value: formatCurrency(kpis.totalValue), description: "Soma do valor no período", icon: Wallet, tone: "gold" },
    { title: "Pedidos concluídos", value: int(data.purchases.total), description: "Pedido + recebimento + MIRO", icon: ClipboardCheck, tone: "green" },
    { title: "Compras com MIGO", value: int(kpis.completedWithMigo), description: "Entrada de mercadoria lançada", icon: Truck, tone: "blue" },
    { title: "Compras com MIRO", value: int(kpis.completedWithMiro), description: "Fatura lançada (MIRO)", icon: Receipt, tone: "blue" },
    { title: "Regularizações Y04", value: int(kpis.regularizationsY04), description: "Compras de regularização", icon: Repeat2, tone: "red" },
    { title: "Compras normais Y01", value: int(kpis.normalPurchasesY01), description: "Compras planejadas", icon: BadgeCheck, tone: "green" },
    { title: "Serviços realizados", value: int(kpis.totalServices), description: `${int(kpis.totalMaterials)} itens de material`, icon: Boxes, tone: "gold" },
    { title: "Tempo médio total", value: kpis.averageTotalProcessDays !== null ? `${int(kpis.averageTotalProcessDays)} d` : "—", description: "Requisição → MIRO/recebimento", icon: Clock, tone: "blue" }
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
          <h1 className="font-serif text-3xl leading-tight text-white sm:text-4xl">Compras Realizadas</h1>
          <p className="mt-2 max-w-3xl text-sm leading-relaxed text-zinc-300 sm:text-base">
            Analise pedidos concluídos, valores comprados, fornecedores, categorias, regularizações, MIGO e MIRO.
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
            <PurchaseMonthlyChart className="xl:col-span-7" points={data.monthly} />
            <PurchaseCategoryChart className="xl:col-span-5" rows={data.byCategory} />
            <PurchaseTypeChart className="xl:col-span-6" data={data.regularizationVsNormal} />
            <PurchaseNatureChart className="xl:col-span-6" slices={data.natureDistribution} />
            <PurchaseSuppliersChart className="xl:col-span-7" suppliers={data.topSuppliers} />
            <PurchaseProcessTimeChart className="xl:col-span-5" times={data.processTimes} />
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
