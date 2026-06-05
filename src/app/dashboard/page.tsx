import { DashboardHome } from "@/components/dashboard/DashboardHome";
import { getDashboardData, parseDashboardPeriodParams } from "@/services/dashboard.service";

export const dynamic = "force-dynamic";

type DashboardPageProps = {
  searchParams?: Record<string, string | string[] | undefined>;
};

export default async function DashboardPage({ searchParams = {} }: DashboardPageProps) {
  const dashboard = await getDashboardData(parseDashboardPeriodParams(searchParams));

  return <DashboardHome dashboard={dashboard} />;
}
