import type { ReactNode } from "react";
import { Header } from "@/components/Header";
import { Sidebar } from "@/components/Sidebar";
import { getSession } from "@/lib/auth-guard";

type DashboardShellProps = {
  children: ReactNode;
  defaultStartDate: string;
  defaultEndDate: string;
};

export async function DashboardShell({ children, defaultStartDate, defaultEndDate }: DashboardShellProps) {
  // O item "Usuários" só aparece para ADMIN (a página também revalida o papel).
  const session = await getSession();
  const canManageUsers = session?.role === "ADMIN";

  return (
    <main className="min-h-screen lg:pl-80">
      <Sidebar canManageUsers={canManageUsers} />
      <Header defaultStartDate={defaultStartDate} defaultEndDate={defaultEndDate} />
      <div className="mx-auto max-w-[1780px] px-4 pb-8 pt-4 sm:px-6 lg:px-7">{children}</div>
    </main>
  );
}
