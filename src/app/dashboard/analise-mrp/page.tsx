import type { Metadata } from "next";
import { MrpAnalysisView } from "@/components/mrp/MrpAnalysisView";
import type { MrpSummaryView } from "@/components/mrp/types";
import { getSession } from "@/lib/auth-guard";
import { parseMrpBuyFilters } from "@/lib/mrp/buy-list";
import { getCurrentMrpAnalysisSummary } from "@/services/mrp-analysis.service";
import { getMrpBuyListing } from "@/services/mrp-listing.service";
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
  const hasActiveBase = canImport ? !!(await getActiveMrpBaseVersion()) : false;
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
          qtd: current.kpis.qtd
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
      filters={filters}
      canImport={canImport}
      hasActiveBase={hasActiveBase}
      defaultDeposit={defaultDeposit}
    />
  );
}
