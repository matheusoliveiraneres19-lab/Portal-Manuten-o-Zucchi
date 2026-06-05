import type { ReactNode } from "react";
import { Toaster } from "sonner";
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
      <Toaster
        position="top-right"
        theme="dark"
        closeButton
        toastOptions={{
          style: {
            background: "#0a0b0b",
            border: "1px solid rgba(196,154,69,0.35)",
            color: "#f5e9d0",
            boxShadow: "0 18px 44px rgba(0,0,0,0.55)"
          }
        }}
      />
    </main>
  );
}
