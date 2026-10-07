import type { Metadata } from "next";
import { MrpAnalysisPage } from "@/components/mrp/MrpAnalysisPage";

/**
 * ANÁLISE MRP.
 *
 * ROTA LEGADA: `/dashboard/lubrificantes` foi mantida apenas para não quebrar
 * links/favoritos existentes; toda a interface exibe "Análise MRP". Em etapa
 * futura a rota poderá migrar para `/dashboard/analise-mrp` (com redirect desta).
 *
 * A antiga tela de Lubrificantes foi removida da interface. Os dados (Lubricant,
 * LubricantMovement, histórico de importação) permanecem no banco, e as rotas
 * `/api/lubricants/*` e `lubricants.service` foram preservadas.
 */
export const metadata: Metadata = {
  title: "Análise MRP | Portal de Gestão da Manutenção Zucchi"
};

export default function AnaliseMrpPage() {
  return <MrpAnalysisPage />;
}
