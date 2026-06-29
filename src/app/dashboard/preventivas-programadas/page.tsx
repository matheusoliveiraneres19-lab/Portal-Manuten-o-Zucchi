import { PreventivasProgramadasPage } from "@/components/preventivas/PreventivasProgramadasPage";

export const dynamic = "force-dynamic";

// Fase 01: apenas a estrutura visual da página. As ordens PL/PV, KPIs, gráficos
// e regras de aderência serão conectados aos dados reais na fase 02.
export default function PreventivasProgramadasRoute() {
  return <PreventivasProgramadasPage />;
}
