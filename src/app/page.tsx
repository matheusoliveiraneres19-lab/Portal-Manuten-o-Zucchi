import { DashboardHome } from "@/components/dashboard/DashboardHome";
import { DashboardShell } from "@/components/DashboardShell";
import { getDashboardData } from "@/services/dashboard.service";

export const dynamic = "force-dynamic";

export default async function Home() {
  const dashboard = await getDashboardData();

  return (
    <DashboardShell>
      <DashboardHome dashboard={dashboard} />
    </DashboardShell>
  );
}
