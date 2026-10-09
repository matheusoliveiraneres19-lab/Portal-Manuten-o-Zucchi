import type { Metadata } from "next";
import { MrpAnalysisView } from "@/components/mrp/MrpAnalysisView";
import { parseMrpTab, type MrpSummaryView } from "@/components/mrp/types";
import { getSession } from "@/lib/auth-guard";
import { parseMrpBuyFilters } from "@/lib/mrp/buy-list";
import { parseMrpTransitFilters } from "@/lib/mrp/transit";
import { parseMrpIdleFilters } from "@/lib/mrp/idle";
import { parseMrpBaseViewFilters } from "@/lib/mrp/base-view";
import { getMrpBaseView } from "@/services/mrp-base-view.service";
import { getCurrentMrpAnalysisSummary } from "@/services/mrp-analysis.service";
import { getMrpAreasSummary, getMrpBuyListing } from "@/services/mrp-listing.service";
import { getActiveMrpBaseVersion, getMrpDefaultDeposit } from "@/services/mrp-persistence.service";

/**
 * ANÁLISE MRP — página do módulo (substitui a antiga tela de Lubrificantes,
 * cuja rota /dashboard/lubrificantes agora redireciona para cá).
 *
 * Abrir a página SÓ consulta a análise vigente (MrpAnalysisRun.isCurrent); o
 * motor roda apenas no "Atualizar tudo".
 */
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Análise MRP | Portal de Gestão da Manutenção Zucchi"
};

type SearchParams = Record<string, string | string[] | undefined>;

const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? null;

export default async function AnaliseMrpRoute({ searchParams = {} }: { searchParams?: SearchParams }) {
  const session = await getSession();
  const canImport = ["ADMIN", "GESTOR"].includes(session?.role ?? "");
  const filters = parseMrpBuyFilters((key) => first(searchParams[key]));

  const current = await getCurrentMrpAnalysisSummary();
  const listing = current ? await getMrpBuyListing(current.runId, filters) : null;
  // Mesmo cache por runId da lista: sem consulta extra.
  const areas = current ? (await getMrpAreasSummary(current.runId)).summary : null;
  const hasActiveBase = canImport ? !!(await getActiveMrpBaseVersion()) : false;
  // Base da aba Base MRP: a da análise vigente (snapshot) ou, sem análise, a ativa.
  const baseView = await getMrpBaseView();
  const defaultDeposit = canImport ? await getMrpDefaultDeposit() : "";

  const summary: MrpSummaryView | null = current
    ? {
        runId: current.runId,
        createdAt: current.createdAt.toISOString(),
        createdBy: current.createdBy,
        depositFilter: current.depositFilter,
        kpis: {
          total: current.kpis.total,
          Comprar: current.kpis.Comprar,
          Verificar: current.kpis.Verificar,
          Comprado: current.kpis.Comprado,
          OK: current.kpis.OK,
          qtd: current.kpis.qtd,
          transit: {
            linhas: current.kpis.purchases.linhas,
            pendentes: current.kpis.purchases.pendentes,
            qtdPendente: current.kpis.purchases.qtdPendente,
            recebidos: current.kpis.purchases.recebidos,
            removedFromMrp: current.kpis.removedFromMrp,
            avoidedQty: current.kpis.avoidedQty
          },
          idle: { total: current.kpis.total, semMov: current.kpis.semMov, parado: current.kpis.parado, qtdParada: current.kpis.qtdParada }
        },
        base: { fileName: current.sources.base.fileName, source: current.sources.base.source, materialCount: current.sources.base.materialCount },
        stock: { fileName: current.sources.stock.fileName, depositInfo: current.sources.stock.depositInfo },
        purchases: { fileName: current.sources.purchases.fileName }
      }
    : null;

  return (
    <MrpAnalysisView
      key={summary?.runId ?? "sem-analise"}
      summary={summary}
      listing={listing}
      areas={areas}
      filters={filters}
      transitFilters={parseMrpTransitFilters((key) => first(searchParams[key]))}
      idleFilters={parseMrpIdleFilters((key) => first(searchParams[key]))}
      baseView={baseView}
      baseFilters={parseMrpBaseViewFilters((key) => first(searchParams[key]))}
      initialTab={parseMrpTab(first(searchParams.tab))}
      canImport={canImport}
      hasActiveBase={hasActiveBase}
      defaultDeposit={defaultDeposit}
    />
  );
}
