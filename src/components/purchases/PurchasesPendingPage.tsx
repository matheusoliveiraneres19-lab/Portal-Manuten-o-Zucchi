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
import { ModuleEmptyState } from "@/components/ui/ModuleEmptyState";
import { PurchaseImportModal } from "@/components/purchases/PurchaseImportModal";
import {
  EMPTY_PURCHASE_FILTERS,
  purchaseFiltersToParams,
  type AppliedPurchaseFilters
} from "@/components/purchases/filters";
import {
  classificationToRank,
  goodsGroupsToRank,
  requestersToRank,
  suppliersToRank
} from "@/components/purchases/PurchaseInsightCharts";
import { PurchaseClassificationNotice } from "@/components/purchases/PurchaseClassificationNotice";
import { PurchaseClassificationTree } from "@/components/purchases/PurchaseClassificationTree";
import { usePortalDataRefresh } from "@/hooks/usePortalDataRefresh";
import type { PendingPurchasesPageData } from "@/types/purchases";
import { CHART_SERIES, GOLD } from "@/constants/theme";

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
  // Os QUATRO cards da TAREFA 13, todos sobre o MESMO conjunto `pendente_compra`
  // que alimenta a tabela. Sem "Valor Pendente", "Ignorados", "Atrasados",
  // "Serviços" ou "Regularizações Y04" — nada disso existe nesta regra.
  // `data.pendingValue` continua vindo do service só para auditoria/log.
  const cards: PurchaseKpiCard[] = [
    { title: "Requisições Pendentes", value: int(pendingCount), description: "Sem pedido de compra e sem recebimento", icon: FileX2, tone: "gold" },
    { title: "Materiais Pendentes", value: int(data.materialsPending), description: "Materiais distintos sem pedido", icon: Boxes, tone: "blue" },
    { title: "Requisitantes", value: int(data.requestersPending), description: "Requisitantes com pendências", icon: Users, tone: "blue" },
    { title: "Mais Antiga", value: oldestLabel(data.oldestPendingDate), description: oldestDescription(data.oldestPendingDate), icon: CalendarClock, tone: "red" }
  ];

  // Sem dados por AUSENCIA de importacao ou por FALHA de consulta: a tela e a
  // mesma, mas a mensagem e a acao mudam (ver PageDataSource).
  const isUnavailable = data.source === "unavailable";
  const isEmpty = data.source !== "database";

  return (
    <section className={`space-y-4 text-champagne transition ${isPending || isRefreshing ? "opacity-70" : ""}`}>
      <header className="relative overflow-hidden rounded-lg border border-gold/20 bg-ink p-5 shadow-premium sm:p-6">
        <div className="login-marble-bg absolute inset-0 opacity-80" />
        <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(0,0,0,0.78),rgba(0,0,0,0.44)),radial-gradient(circle_at_88%_8%,rgba(196,154,69,0.15),transparent_22rem)]" />
        <div className="relative z-10">
          <div className="mb-3 flex flex-wrap items-center gap-3 text-gold">
            <ShoppingCart className="h-5 w-5" />
            <span className="rounded-md border border-gold/40 bg-gold/10 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.24em] text-champagne/80">
              Regra oficial v3.1 · planilha SAP/Fiori
            </span>
          </div>
          <h1 className="font-serif text-3xl leading-tight text-white sm:text-4xl">Compras Pendentes</h1>
          <p className="mt-2 max-w-3xl text-sm leading-relaxed text-zinc-300 sm:text-base">
            Base de análise (o que não é serviço nem regularização Y04) <strong>sem Pedido de Compra</strong> e{" "}
            <strong>sem Data de Recebimento</strong>. Serviços são identificados pelo texto de
            &quot;Descr grupo Merc&quot;; Y04 sai antes da análise. Recebidos, em atraso e não entregues
            ficam fora — e não existe categoria &quot;ignorados&quot; nesta regra.
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
        classificationOptions={data.classification.available ? data.classificationOptions : undefined}
        showStatusAndKindFilters={false}
      />

      <PurchaseActiveChips filters={appliedFilters} onRemove={removeChip} />

      {isEmpty ? (
        <ModuleEmptyState
          surface="panel"
          icon={ShoppingCart}
          title="Nenhuma compra importada ainda"
          description='Importe a planilha BASE DE DADOS PORTAL COMPRAS.xlsx (aba "Data") para ver indicadores, gráficos e tabelas.'
          action={{ label: "Importar Excel", onClick: () => setImportOpen(true) }}
          unavailable={isUnavailable}
          unavailableTitle="Dados de compras indisponíveis"
        />
      ) : (
        <>
          <PurchaseKpiCards cards={cards} />

          <section className="grid grid-cols-1 gap-3 xl:grid-cols-12">
            <PurchaseMonthlyCountChart
              className="xl:col-span-7"
              title="Requisições pendentes por mês"
              subtitle="Pela data da requisição."
              color={CHART_SERIES.compras}
              points={data.pendingByMonth}
            />
            <PurchaseRankBarChart
              className="xl:col-span-5"
              title="Top fornecedores pendentes"
              subtitle="Fornecedores com mais requisições sem pedido."
              color={GOLD.deep}
              items={suppliersToRank(data.topPendingSuppliers)}
              emptyDescription="Nenhuma requisição pendente."
            />
            <PurchaseRankBarChart
              className="xl:col-span-6"
              title="Pendências por grupo de mercadoria"
              subtitle="Requisições pendentes por grupo."
              color={CHART_SERIES.ordens}
              items={goodsGroupsToRank(data.pendingByGoodsGroup)}
            />
            <PurchaseRankBarChart
              className="xl:col-span-6"
              title="Requisitantes com mais pendências"
              color={GOLD.deep}
              items={requestersToRank(data.topRequesters)}
            />
          </section>

          {/* Análise por classificação N1 > N2 > N3 > N4 (TAREFAS 5, 6, 7, 9 e 10). */}
          {data.classification.available ? (
            <>
              <ClassificationSummary classification={data.classification} pendingCount={pendingCount} />

              <section className="grid grid-cols-1 gap-3 xl:grid-cols-12">
                <PurchaseRankBarChart
                  className="xl:col-span-6"
                  title="Compras pendentes por N1"
                  subtitle="Requisições sem pedido, agrupadas pelo 1º nível de classificação."
                  color={CHART_SERIES.compras}
                  items={classificationToRank(data.classification.byN1)}
                  emptyDescription="Nenhuma requisição pendente com N1 preenchido."
                />
                <PurchaseRankBarChart
                  className="xl:col-span-6"
                  title="Compras pendentes por N2"
                  subtitle={
                    appliedFilters.classificationsN1.length
                      ? `Restrito a N1: ${appliedFilters.classificationsN1.join(", ")}.`
                      : "Selecione um N1 nos filtros para ver apenas os N2 daquele grupo."
                  }
                  color={CHART_SERIES.ordens}
                  items={classificationToRank(data.classification.byN2)}
                  emptyDescription="Nenhuma requisição pendente com N2 preenchido."
                />
              </section>

              <PurchaseClassificationTree
                nodes={data.classification.tree}
                total={pendingCount}
                unclassified={data.classification.unclassified}
              />
            </>
          ) : (
            <PurchaseClassificationNotice />
          )}

          <PurchaseTable data={data.purchases} variant="pending" onPageChange={(page) => navigate(appliedFilters, page)} />
        </>
      )}

      <PurchaseImportModal open={importOpen} onClose={() => setImportOpen(false)} onImported={() => refreshPortalData({ toastMessage: null })} />
    </section>
  );
}

/**
 * Faixa de apoio da classificação (TAREFA 5). Os "mais recorrentes" ficam AQUI,
 * e não nos cards principais, para a tela não ficar carregada — os quatro cards
 * do topo seguem sendo Requisições, Materiais, Requisitantes e Mais Antiga.
 */
function ClassificationSummary({
  classification,
  pendingCount
}: {
  classification: PendingPurchasesPageData["classification"];
  pendingCount: number;
}) {
  const items = [
    {
      label: "N1 mais recorrente",
      value: classification.topN1?.label ?? "—",
      hint: classification.topN1 ? `${int(classification.topN1.count)} requisição(ões)` : "Sem N1 no recorte"
    },
    {
      label: "N2 mais recorrente",
      value: classification.topN2?.label ?? "—",
      hint: classification.topN2 ? `${int(classification.topN2.count)} requisição(ões)` : "Sem N2 no recorte"
    },
    {
      label: "Cobertura da classificação",
      value: percent(classification.coverage.n1, pendingCount),
      hint: `${int(classification.coverage.n1)} de ${int(pendingCount)} com N1 preenchido`
    },
    {
      label: "Sem classificação",
      value: int(classification.unclassified),
      hint: "Pendências sem nenhum nível N1..N4"
    }
  ];

  return (
    <section className="panel rounded-lg p-4">
      <h3 className="mb-3 text-[11px] font-extrabold uppercase tracking-wide text-gold-deep">
        Resumo da classificação
      </h3>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {items.map((item) => (
          <div key={item.label} className="rounded-lg border border-zinc-200 bg-white/60 px-3 py-2">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500">{item.label}</p>
            <p className="mt-0.5 truncate text-lg font-light text-zinc-950" title={item.value}>
              {item.value}
            </p>
            <p className="text-[10px] text-zinc-500">{item.hint}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

function int(value: number): string {
  return Number.isFinite(value) ? value.toLocaleString("pt-BR") : "0";
}

/** Percentual de uma parte sobre o total — nunca exibe NaN/Infinity. */
function percent(part: number, total: number): string {
  const value = total > 0 ? (part / total) * 100 : 0;
  const safe = Number.isFinite(value) ? value : 0;
  return `${safe.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;
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
