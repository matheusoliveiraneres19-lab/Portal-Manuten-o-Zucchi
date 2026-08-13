import { Suspense } from "react";
import { CalendarDays, Search } from "lucide-react";
import { AlertsButton } from "@/components/AlertsButton";
import { AuthUserSummary } from "@/components/AuthUserSummary";
import { LogoutButton } from "@/components/LogoutButton";
import { PeriodFilter } from "@/components/PeriodFilter";
import { formatDatePtBr, getTodayDate } from "@/utils/date";

type HeaderProps = {
  defaultStartDate: string;
  defaultEndDate: string;
};

export function Header({ defaultStartDate, defaultEndDate }: HeaderProps) {
  // Data atual dinâmica: o layout do dashboard é force-dynamic, então isto é
  // recalculado a cada carregamento — nunca fica preso numa data fixa.
  const today = formatDatePtBr(getTodayDate());

  return (
    <header className="sticky top-0 z-30 border-b border-gold/20 bg-ink/95 px-4 py-3 text-white shadow-[0_8px_24px_rgba(0,0,0,0.24)] backdrop-blur sm:px-6 lg:px-7">
      <div className="mx-auto flex max-w-[1780px] flex-wrap items-center gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="font-serif text-xl text-gold sm:text-2xl">
              Portal de Gestão da Manutenção Zucchi
            </h1>
            <span className="rounded-md border border-gold/50 bg-gradient-to-r from-danger to-[#4a1518] px-3 py-1 text-xs font-bold tracking-wider text-champagne shadow">
              FASE 1
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-md border border-gold/20 bg-black/40 px-2.5 py-1 text-xs font-medium text-champagne">
              <CalendarDays className="h-3.5 w-3.5 text-gold" />
              <span className="text-zinc-400">Hoje</span>
              <strong className="font-semibold text-white">{today}</strong>
            </span>
          </div>
        </div>

        <div className="flex min-w-0 flex-1 items-center justify-end gap-3">
          <label className="relative hidden min-w-[260px] max-w-sm flex-1 md:block">
            <Search className="absolute right-3 top-1/2 h-5 w-5 -translate-y-1/2 text-champagne" />
            <input
              className="h-11 w-full rounded-lg border border-gold/20 bg-black/45 px-4 pr-10 text-sm text-zinc-100 outline-none placeholder:text-zinc-500 focus:border-gold/60"
              placeholder="Buscar..."
            />
          </label>
          <Suspense fallback={null}>
            <PeriodFilter defaultStartDate={defaultStartDate} defaultEndDate={defaultEndDate} />
          </Suspense>
          <AlertsButton />
          <AuthUserSummary />
          <LogoutButton />
        </div>
      </div>
    </header>
  );
}
