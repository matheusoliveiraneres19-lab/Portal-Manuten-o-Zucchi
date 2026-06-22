import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

type DashboardGeralPageProps = {
  searchParams?: Record<string, string | string[] | undefined>;
};

/**
 * "Dashboard Geral" foi unificado na aba "Início" (mesmo conteúdo de DashboardHome).
 * A rota é mantida para não quebrar links antigos, mas redireciona para /dashboard
 * preservando o período selecionado (startDate/endDate) na URL.
 */
export default function DashboardGeralPage({ searchParams = {} }: DashboardGeralPageProps) {
  const params = new URLSearchParams();

  for (const [key, value] of Object.entries(searchParams)) {
    const raw = Array.isArray(value) ? value[0] : value;
    if (raw) {
      params.set(key, raw);
    }
  }

  const query = params.toString();
  redirect(query ? `/dashboard?${query}` : "/dashboard");
}
