import { redirect } from "next/navigation";

/**
 * ROTA LEGADA: a antiga tela de Lubrificantes virou a Análise MRP, que agora
 * vive em /dashboard/analise-mrp. Este redirect mantém links e favoritos
 * antigos funcionando. Os dados de lubrificação continuam no banco.
 */
export default function LubrificantesLegacyRoute() {
  redirect("/dashboard/analise-mrp");
}
