import { DashboardHome } from "@/components/dashboard/DashboardHome";
import { DashboardShell } from "@/components/DashboardShell";
import {
  getDashboardData,
  parseDashboardPeriodParams,
  resolveDefaultDashboardPeriod
} from "@/services/dashboard.service";
import { toInputDate } from "@/utils/period";

export const dynamic = "force-dynamic";

type HomeProps = {
  searchParams?: Record<string, string | string[] | undefined>;
};

export default async function Home({ searchParams = {} }: HomeProps) {
  const [dashboard, period] = await Promise.all([
    getDashboardData(parseDashboardPeriodParams(searchParams)),
    resolveDefaultDashboardPeriod()
  ]);

  return (
    <DashboardShell
      defaultStartDate={toInputDate(period.startDate)}
      defaultEndDate={toInputDate(period.endDate)}
    >
      <DashboardHome dashboard={dashboard} />
    </DashboardShell>
  );
}
