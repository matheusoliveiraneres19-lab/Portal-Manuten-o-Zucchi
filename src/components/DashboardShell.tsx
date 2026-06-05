import type { ReactNode } from "react";
import { Header } from "@/components/Header";
import { Sidebar } from "@/components/Sidebar";

type DashboardShellProps = {
  children: ReactNode;
  defaultStartDate: string;
  defaultEndDate: string;
};

export function DashboardShell({ children, defaultStartDate, defaultEndDate }: DashboardShellProps) {
  return (
    <main className="min-h-screen lg:pl-80">
      <Sidebar />
      <Header defaultStartDate={defaultStartDate} defaultEndDate={defaultEndDate} />
      <div className="mx-auto max-w-[1780px] px-4 pb-8 pt-4 sm:px-6 lg:px-7">{children}</div>
    </main>
  );
}
