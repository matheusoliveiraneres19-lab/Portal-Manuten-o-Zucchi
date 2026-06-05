import type { ReactNode } from "react";
import { DashboardShell } from "@/components/DashboardShell";
import { resolveDefaultDashboardPeriod } from "@/services/dashboard.service";
import { toInputDate } from "@/utils/period";

export const dynamic = "force-dynamic";

export default async function DashboardLayout({ children }: Readonly<{ children: ReactNode }>) {
  // Período padrão derivado dos dados reais (menor/maior data de abertura das OS),
  // exibido no header quando a URL ainda não traz um período selecionado.
  const period = await resolveDefaultDashboardPeriod();

  return (
    <DashboardShell
      defaultStartDate={toInputDate(period.startDate)}
      defaultEndDate={toInputDate(period.endDate)}
    >
      {children}
    </DashboardShell>
  );
}
