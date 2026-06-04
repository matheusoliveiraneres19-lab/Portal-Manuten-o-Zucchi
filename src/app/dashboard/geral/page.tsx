import { DashboardHome } from "@/components/dashboard/DashboardHome";
import { getDashboardData } from "@/services/dashboard.service";

export const dynamic = "force-dynamic";

export default async function DashboardGeralPage() {
  const dashboard = await getDashboardData();

  return <DashboardHome dashboard={dashboard} />;
}
